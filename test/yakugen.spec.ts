import { setTimeout } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { Yakugen } from '../src/yakugen.js';

describe('Yakugen', () => {
    it('all', async () => {
        const arr = new Array(100).fill(Math.random());
        const tasks = arr.map(v => async () => {
            return v;
        });

        const res = await Yakugen.all(tasks);

        expect(res).to.deep.eq(arr);
    });

    it('all - customMetrics', async () => {
        const arr = new Array(1_000).fill(Math.random());
        const tasks = arr.map(v => async () => {
            await setTimeout(0);
            return v;
        });

        const concurrencies: number[] = [];

        await Yakugen.all(tasks, {
            targetMetrics: {
                custom: {
                    connPool: {
                        current: () => 10,
                        target: 10,
                    },
                },
            },
            onProgress: (_, __, currentConcurrency) => {
                concurrencies.push(currentConcurrency);
            },
        });

        expect(concurrencies).to.deep.eq(new Array(1_000).fill(1));
    });

    it('allSettled', async () => {
        const arr = new Array(100).fill(0).map((_, idx) => idx + 1);
        const tasks = arr.map(v => async () => {
            if (v % 2 === 0) {
                throw new Error('Even number');
            }
            return v;
        });

        const res = await Yakugen.allSettled(tasks);

        expect(res).to.deep.eq(
            arr.map(v => {
                if (v % 2 === 0) {
                    return { status: 'rejected', reason: new Error('Even number') };
                }
                return { status: 'fulfilled', value: v };
            }),
        );
    });
});
