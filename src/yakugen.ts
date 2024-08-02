import { Sampler } from '@dnlup/doc';

declare module '@dnlup/doc' {
    interface SamplerOptions {
        autoStart?: boolean;
    }
}

export type YakugenOptions = {
    minConcurrency?: number;
    maxConcurrency?: number;
    targetMetrics?: TargetMetrics;
    isHealthy?: (status: MetricsSnapshot, concurrency: number) => boolean;
};

export type TargetMetrics = {
    eventLoopDelayMs: number;
    eventLoopUtilization: number;
    cpuUtilization: number;
};

export type MetricsSnapshot = {
    eventLoopDelayMs: number;
    eventLoopUtilization: number;
    cpuUtilization: number;
};

const DefaultOptions = {
    minConcurrency: 1,
    maxConcurrency: 500,
};

const DefaultTargetMetrics = {
    eventLoopDelayMs: 15,
    eventLoopUtilization: 75,
    cpuUtilization: 75,
};

class WatchDog {
    private sniffer: Sampler;
    private targetMetrics: TargetMetrics;

    [Symbol.dispose]() {
        this.stop();
    }

    constructor(options?: { targetMetrics?: TargetMetrics }) {
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

    public snapshot(): MetricsSnapshot {
        return {
            eventLoopDelayMs: this.sniffer.eventLoopDelay?.computed ?? 0,
            eventLoopUtilization: (this.sniffer.eventLoopUtilization?.raw.utilization ?? 0) * 100,
            cpuUtilization: this.sniffer.cpu?.usage ?? 0,
        };
    }

    public isHealthy(snapshot: MetricsSnapshot) {
        return (
            snapshot.cpuUtilization < this.targetMetrics.cpuUtilization &&
            snapshot.eventLoopUtilization < this.targetMetrics.eventLoopUtilization &&
            snapshot.eventLoopDelayMs < this.targetMetrics.eventLoopDelayMs
        );
    }
}

export class Yakugen {
    static async all<T>(promises: Array<() => Promise<T>>, options?: YakugenOptions): Promise<Array<T>> {
        const minConcurrency = options?.minConcurrency ? Math.min(options.minConcurrency, 1) : DefaultOptions.minConcurrency;
        const maxConcurrency = options?.maxConcurrency ?? DefaultOptions.maxConcurrency;

        if (maxConcurrency < minConcurrency) {
            throw new Error('maxConcurrency should be greater than or equal to minConcurrency');
        }

        const clonedPromises = [...promises];
        using watchDog = new WatchDog({ targetMetrics: options?.targetMetrics });

        let concurrency = minConcurrency;
        const stepFactor = 0.3;
        const results: T[] = [];
        while (clonedPromises.length) {
            const res = await Promise.all(clonedPromises.splice(0, concurrency).map(promise => promise()));
            const metricsSnapshot = watchDog.snapshot();
            const inc = Math.max(1, Math.round(concurrency * stepFactor));

            if (options?.isHealthy ? options.isHealthy(metricsSnapshot, concurrency) : watchDog.isHealthy(metricsSnapshot)) {
                concurrency = Math.min(maxConcurrency, concurrency + inc);
            } else {
                concurrency = Math.max(minConcurrency, concurrency - inc);
            }
            results.push(...res);
        }

        return results;
    }

    static async allSettled<T>(promises: Array<() => Promise<T>>, options?: YakugenOptions): Promise<PromiseSettledResult<Awaited<T>>[]> {
        const minConcurrency = options?.minConcurrency ? Math.min(options.minConcurrency, 1) : DefaultOptions.minConcurrency;
        const maxConcurrency = options?.maxConcurrency ?? DefaultOptions.maxConcurrency;

        const clonedPromises = [...promises];
        using watchDog = new WatchDog({ targetMetrics: options?.targetMetrics });

        let concurrency = minConcurrency;
        const stepFactor = 0.3;
        const results: PromiseSettledResult<Awaited<T>>[] = [];

        while (clonedPromises.length) {
            const res = await Promise.allSettled(clonedPromises.splice(0, concurrency).map(promise => promise()));
            const metricsSnapshot = watchDog.snapshot();
            const inc = Math.max(1, Math.round(concurrency * stepFactor));

            if (options?.isHealthy ? options.isHealthy(metricsSnapshot, concurrency) : watchDog.isHealthy(metricsSnapshot)) {
                concurrency = Math.min(maxConcurrency, concurrency + inc);
            } else {
                concurrency = Math.max(minConcurrency, concurrency - inc);
            }
            results.push(...res);
        }

        return results;
    }
}
