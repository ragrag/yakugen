import { setTimeout } from 'timers/promises';
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

async function runWithFixedBatchSize(tasks: Array<() => Promise<number>>, batchSize: number): Promise<number> {
    const start = Date.now();
    const results: number[] = [];

    for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(task => task()));
        results.push(...batchResults);
    }

    const end = Date.now();
    return end - start;
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

    console.log(`Running ${numTasks} tasks...`);

    const batchSizes = [500, 1000, 1500];
    for (const batchSize of batchSizes) {
        const duration = await runWithFixedBatchSize(tasks, batchSize);
        console.log(`Fixed batch size ${batchSize}: ${duration}ms`);
    }

    const yakugenDuration = await runWithYakugen(tasks, {
        onProgress: (_, metricsSnapshot, concurrency) => {
            console.log(concurrency, metricsSnapshot);
        },
    });
    console.log(`Yakugen: ${yakugenDuration}ms`);
}

runTest().catch(console.error);
