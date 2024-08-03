import { setTimeout } from 'timers/promises';
import { Yakugen, type YakugenOptions } from '../src/yakugen';

async function simulateTask(id: number): Promise<number> {
    const start = process.hrtime.bigint();
    const baseDelay = 50;
    const variableDelay = Math.random() * 100;
    await setTimeout(baseDelay + variableDelay);

    let result = 0;
    for (let i = 0; i < 5_000_000; i++) {
        result += Math.sqrt(i);
    }

    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e6;
    return duration;
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
    const tasks = Array.from({ length: numTasks }, (_, i) => () => simulateTask(i));

    console.log(`Running ${numTasks} tasks...`);

    const batchSizes = [500, 1000, 1500];
    for (const batchSize of batchSizes) {
        const duration = await runWithFixedBatchSize(tasks, batchSize);
        console.log(`Fixed batch size ${batchSize}: ${duration}ms`);
    }

    const yakugenDuration = await runWithYakugen(tasks);
    console.log(`Yakugen: ${yakugenDuration}ms`);
}

runTest().catch(console.error);
