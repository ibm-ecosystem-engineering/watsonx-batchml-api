
export interface MemoryUsage {
    rss: string,
    heapTotal: string,
    heapUsed: string,
    external: string,
}

export abstract class MetricsApi {
    abstract getMemoryUsage(): Promise<MemoryUsage>
}
