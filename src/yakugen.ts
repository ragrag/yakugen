import { Sampler } from '@dnlup/doc';

declare module '@dnlup/doc' {
    interface SamplerOptions {
        autoStart?: boolean;
    }
}

export type YakugenOptions<TCustomMetrics extends Record<string, CustomMetric> = {}> = {
    minConcurrency?: number;
    maxConcurrency?: number;
    targetMetrics?: Partial<TargetMetrics<TCustomMetrics>>;
    onProgress?: (processed: number, metrics: MetricsSnapshot<Record<keyof TCustomMetrics, number>>, currentConcurrency: number) => void;
};

export type CustomMetric = {
    current: () => number;
    target: number;
};

export type TargetMetrics<TCustomMetrics extends Record<string, CustomMetric> = {}> = {
    eventLoopDelayMs: number;
    eventLoopUtilization: number;
    cpuUtilization: number;
    custom?: TCustomMetrics;
};

export type MetricsSnapshot<TCustomMetrics extends Record<string, number> = {}> = {
    eventLoopDelayMs: number;
    eventLoopUtilization: number;
    cpuUtilization: number;
} & {
    custom?: Partial<Record<keyof TCustomMetrics, number>>;
};

const DefaultOptions = {
    minConcurrency: 1,
    maxConcurrency: 500,
};

const DefaultTargetMetrics = {
    eventLoopDelayMs: 150,
    eventLoopUtilization: 75,
    cpuUtilization: 75,
};

class WatchDog<TCustomMetrics extends Record<string, CustomMetric> = {}> {
    private sniffer: Sampler;
    private targetMetrics: TargetMetrics<TCustomMetrics>;

    [Symbol.dispose]() {
        this.stop();
    }

    constructor(options?: { targetMetrics?: Partial<TargetMetrics<TCustomMetrics>> }) {
        this.sniffer = new Sampler({
            autoStart: true,
            collect: { cpu: true, eventLoopUtilization: true, eventLoopDelay: true, memory: false, activeHandles: false, gc: false, resourceUsage: false },
            unref: true,
        });
        this.targetMetrics = {
            ...DefaultTargetMetrics,
            ...options?.targetMetrics,
        };
    }

    public stop() {
        this.sniffer.stop();
    }

    public snapshot(): MetricsSnapshot<Record<keyof TCustomMetrics, number>> {
        const snapshot = {
            eventLoopDelayMs: this.sniffer.eventLoopDelay?.computed ?? 0,
            eventLoopUtilization: (this.sniffer.eventLoopUtilization?.raw.utilization ?? 0) * 100,
            cpuUtilization: this.sniffer.cpu?.usage ?? 0,
        } as MetricsSnapshot<Record<keyof TCustomMetrics, number>>;

        if (this.targetMetrics.custom) {
            for (const [key, metric] of Object.entries(this.targetMetrics.custom)) {
                (snapshot as any)[key] = metric.current();
            }
        }

        return snapshot;
    }

    public getAdjustmentDelta(snapshot: MetricsSnapshot): number {
        const errorCPU = this.targetMetrics.cpuUtilization - snapshot.cpuUtilization;
        const errorELU = this.targetMetrics.eventLoopUtilization - snapshot.eventLoopUtilization;
        const errorELD = this.targetMetrics.eventLoopDelayMs - snapshot.eventLoopDelayMs;

        // Scale to [1, 100]
        const scaledErrorCPU = 1 + (errorCPU / this.targetMetrics.cpuUtilization) * 99;
        const scaledErrorELU = 1 + (errorELU / this.targetMetrics.eventLoopUtilization) * 99;
        const scaledErrorELD = 1 + (errorELD / this.targetMetrics.eventLoopDelayMs) * 99;
        const scaledErrorCustom = this.targetMetrics?.custom
            ? Object.values(this.targetMetrics.custom).map(c => {
                  const error = c.target - c.current();
                  return 1 + (error / c.target) * 99;
              })
            : [];

        const minError = Math.min(...[scaledErrorCPU, scaledErrorELU, scaledErrorELD, ...scaledErrorCustom]);

        const adjustmentFactor = 0.1;
        return adjustmentFactor * minError;
    }
}

export class Yakugen {
    static async all<T, TCustomMetrics extends Record<string, CustomMetric> = {}>(
        promises: Array<() => Promise<T>>,
        options?: YakugenOptions<TCustomMetrics>,
    ): Promise<Array<T>> {
        const minConcurrency = options?.minConcurrency ? Math.min(options.minConcurrency, 1) : DefaultOptions.minConcurrency;
        const maxConcurrency = options?.maxConcurrency ?? DefaultOptions.maxConcurrency;

        if (maxConcurrency < minConcurrency) {
            throw new Error('maxConcurrency should be greater than or equal to minConcurrency');
        }

        const clonedPromises = [...promises];
        using watchDog = new WatchDog({ targetMetrics: options?.targetMetrics });

        let concurrency = minConcurrency;
        let processed = 0;
        const results: T[] = [];

        while (clonedPromises.length) {
            const res = await Promise.all(clonedPromises.splice(0, concurrency).map(promise => promise()));
            const metricsSnapshot = watchDog.snapshot();

            const delta = watchDog.getAdjustmentDelta(metricsSnapshot);

            if (options?.onProgress) {
                processed += concurrency;
                options?.onProgress(processed, metricsSnapshot, concurrency);
            }

            if (delta > 0) {
                concurrency = Math.round(Math.min(maxConcurrency, concurrency + delta));
            } else {
                concurrency = Math.round(Math.max(minConcurrency, concurrency + delta));
            }

            results.push(...res);
        }

        return results;
    }

    static async allSettled<T>(promises: Array<() => Promise<T>>, options?: YakugenOptions): Promise<PromiseSettledResult<Awaited<T>>[]> {
        const minConcurrency = options?.minConcurrency ? Math.min(options.minConcurrency, 1) : DefaultOptions.minConcurrency;
        const maxConcurrency = options?.maxConcurrency ?? DefaultOptions.maxConcurrency;

        if (maxConcurrency < minConcurrency) {
            throw new Error('maxConcurrency should be greater than or equal to minConcurrency');
        }

        const clonedPromises = [...promises];
        using watchDog = new WatchDog({ targetMetrics: options?.targetMetrics });

        let concurrency = minConcurrency;
        let processed = 0;
        const results: PromiseSettledResult<Awaited<T>>[] = [];

        while (clonedPromises.length) {
            const res = await Promise.allSettled(clonedPromises.splice(0, concurrency).map(promise => promise()));
            const metricsSnapshot = watchDog.snapshot();

            const delta = watchDog.getAdjustmentDelta(metricsSnapshot);

            if (options?.onProgress) {
                processed += concurrency;
                options?.onProgress(processed, metricsSnapshot, concurrency);
            }

            if (delta > 0) {
                concurrency = Math.round(Math.min(maxConcurrency, concurrency + delta));
            } else {
                concurrency = Math.round(Math.max(minConcurrency, concurrency + delta));
            }

            results.push(...res);
        }

        return results;
    }
}
