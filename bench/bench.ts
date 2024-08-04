import { setTimeout } from 'node:timers/promises';
import { Yakugen } from '../src/yakugen';

function fibbonaci(n: number): number {
    if (n <= 1) {
        return n;
    }

    return fibbonaci(n - 1) + fibbonaci(n - 2);
}

async function task(): Promise<number> {
    await setTimeout(200);
    return fibbonaci(30);
}

async function run() {
    const numTasks = 10_000;
    const tasks = Array.from({ length: numTasks }, () => async () => task());

    await Yakugen.all(tasks, {
        onProgress: (_, metricsSnapshot, concurrency) => {
            console.log({ concurrency, ...metricsSnapshot });
        },
    });
}

run();
