import { setTimeout } from 'node:timers/promises';
import { Yakugen, type YakugenOptions } from '../src/yakugen';

function fibbonaci(n: number): number {
    if (n <= 1) {
        return n;
    }

    return fibbonaci(n - 1) + fibbonaci(n - 2);
}

async function simulateTask(): Promise<number> {
    await setTimeout(200);
    return fibbonaci(30);
}

async function runWithYakugen(tasks: Array<() => Promise<number>>, options?: YakugenOptions): Promise<number> {
    const start = Date.now();
    await Yakugen.all(tasks, options);
    const end = Date.now();
    return end - start;
}

async function runTest() {
    const numTasks = 10_000;
    const tasks = Array.from({ length: numTasks }, () => async () => simulateTask());

    await runWithYakugen(tasks, {
        onProgress: (_, metricsSnapshot, concurrency) => {
            console.log({ concurrency, ...metricsSnapshot });
        },
    });
}

runTest().catch(console.error);
