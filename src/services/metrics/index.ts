import {MetricsApi} from "./metrics.api";
import {MetricsDefault} from "./metrics.default";
import {Provider} from "@nestjs/common";

export * from './metrics.api'

let _instance: MetricsApi
export const metricsApi = (): MetricsApi => {
    if (_instance) {
        return _instance
    }

    return _instance = new MetricsDefault()
}

export const metricsApiProvider: Provider = {
    provide: MetricsApi,
    useFactory: metricsApi
}
