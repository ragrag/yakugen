import { Sampler } from '@dnlup/doc';

declare module '@dnlup/doc' {
    interface SamplerOptions {
        autoStart?: boolean;
    }
}

export type YakugenOptions<TCustomMetricsTargets extends Record<string, CustomMetric> = {}> = {
    minConcurrency?: number;
    maxConcurrency?: number;
    targets?: Partial<MetricsTargets<TCustomMetricsTargets>>;
    onProgress?: (processed: number, metrics: MetricsSnapshot<Record<keyof TCustomMetricsTargets, number>>, currentConcurrency: number) => void;
};

export type CustomMetric = {
    current: () => number;
    target: number;
};

export type MetricsTargets<TCustomMetricsTargets extends Record<string, CustomMetric> = {}> = {
    eventLoopDelayMs: number;
    eventLoopUtilization: number;
    cpuUtilization: number;
    custom?: TCustomMetricsTargets;
};

export type MetricsSnapshot<TCustomMetricsTargets extends Record<string, number> = {}> = {
    eventLoopDelayMs: number;
    eventLoopUtilization: number;
    cpuUtilization: number;
} & {
    custom?: Partial<Record<keyof TCustomMetricsTargets, number>>;
};

const DefaultOptions = {
    minConcurrency: 1,
    maxConcurrency: 500,
};

const Defaulttargets = {
    eventLoopDelayMs: 150,
    eventLoopUtilization: 75,
    cpuUtilization: 75,
};

class WatchDog<TCustomMetricsTargets extends Record<string, CustomMetric> = {}> {
    private sniffer: Sampler;
    private targets: MetricsTargets<TCustomMetricsTargets>;

    [Symbol.dispose]() {
        this.stop();
    }

    constructor(options?: { targets?: Partial<MetricsTargets<TCustomMetricsTargets>> }) {
        this.sniffer = new Sampler({
            autoStart: true,
            collect: { cpu: true, eventLoopUtilization: true, eventLoopDelay: true, memory: false, activeHandles: false, gc: false, resourceUsage: false },
            unref: true,
        });
        this.targets = {
            ...Defaulttargets,
            ...options?.targets,
        };
    }

    public stop() {
        this.sniffer.stop();
    }

    public snapshot(): MetricsSnapshot<Record<keyof TCustomMetricsTargets, number>> {
        const snapshot = {
            eventLoopDelayMs: this.sniffer.eventLoopDelay?.computed ?? 0,
            eventLoopUtilization: (this.sniffer.eventLoopUtilization?.raw.utilization ?? 0) * 100,
            cpuUtilization: this.sniffer.cpu?.usage ?? 0,
        } as MetricsSnapshot<Record<keyof TCustomMetricsTargets, number>>;

        if (this.targets.custom) {
            for (const [key, metric] of Object.entries(this.targets.custom)) {
                (snapshot as any)[key] = metric.current();
            }
        }

        return snapshot;
    }

    public getAdjustmentDelta(snapshot: MetricsSnapshot): number {
        const errorCPU = this.targets.cpuUtilization - snapshot.cpuUtilization;
        const errorELU = this.targets.eventLoopUtilization - snapshot.eventLoopUtilization;
        const errorELD = this.targets.eventLoopDelayMs - snapshot.eventLoopDelayMs;

        // Scale to [1, 100]
        const scaledErrorCPU = 1 + (errorCPU / this.targets.cpuUtilization) * 99;
        const scaledErrorELU = 1 + (errorELU / this.targets.eventLoopUtilization) * 99;
        const scaledErrorELD = 1 + (errorELD / this.targets.eventLoopDelayMs) * 99;
        const scaledErrorCustom = this.targets?.custom
            ? Object.values(this.targets.custom).map(c => {
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
    static async all<T, TCustomMetricsTargets extends Record<string, CustomMetric> = {}>(
        promises: Array<() => Promise<T>>,
        options?: YakugenOptions<TCustomMetricsTargets>,
    ): Promise<Array<T>> {
        const minConcurrency = options?.minConcurrency ? Math.min(options.minConcurrency, 1) : DefaultOptions.minConcurrency;
        const maxConcurrency = options?.maxConcurrency ?? DefaultOptions.maxConcurrency;

        if (maxConcurrency < minConcurrency) {
            throw new Error('maxConcurrency should be greater than or equal to minConcurrency');
        }

        const clonedPromises = [...promises];
        using watchDog = new WatchDog({ targets: options?.targets });

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
        using watchDog = new WatchDog({ targets: options?.targets });

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
