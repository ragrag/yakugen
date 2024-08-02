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
