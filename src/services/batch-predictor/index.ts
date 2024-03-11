import {BatchPredictorApi} from "./batch-predictor.api";
import {Provider} from "@nestjs/common";
import {watsonxConfig} from "../../backends";
import {BatchPredictorMock} from "./batch-predictor.mock";
import {BatchPredictorWatsonx} from "./batch-predictor.watsonx";

export * from './batch-predictor.api'

let _instance: BatchPredictorApi;
export const batchPredictorApi = (): BatchPredictorApi => {
    if (_instance) {
        return _instance
    }

    const config = watsonxConfig()
    if (!config) {
        console.log('  ** BatchPredictorApi: BatchPredictorMock')
        return _instance = new BatchPredictorMock()
    }

    console.log('  ** BatchPredictorApi: BatchPredictorWatsonx')
    return _instance = new BatchPredictorWatsonx(config)
}

export const batchPredictorProvider: Provider = {
    provide: BatchPredictorApi,
    useFactory: batchPredictorApi
}
