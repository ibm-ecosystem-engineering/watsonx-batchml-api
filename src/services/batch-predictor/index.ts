import {BatchPredictorApi} from "./batch-predictor.api";
import {Provider} from "@nestjs/common";
import {watsonxConfig} from "../../backends";
import {BatchPredictorMock} from "./batch-predictor.mock";
import {BatchPredictorWatsonx} from "./batch-predictor.watsonx";
import {buildMl, WatsonxMl} from "../../watsonx";
import {aiModelApi} from "../ai-model";

export * from './batch-predictor.api'

let _instance: Promise<BatchPredictorApi>;
export const batchPredictorApi = (): Promise<BatchPredictorApi> => {
    if (_instance) {
        return _instance
    }

    const config = watsonxConfig()
    if (!config) {
        console.log('  ** BatchPredictorApi: BatchPredictorMock')
        return _instance = Promise.resolve(new BatchPredictorMock())
    }

    console.log('  ** BatchPredictorApi: BatchPredictorWatsonx')
    return _instance = new Promise(async (resolve, reject) => {
        buildMl()
            .then(service => resolve(new BatchPredictorWatsonx(service)))
            .catch(err => reject(err))
    })
}

export const batchPredictorProvider: Provider = {
    provide: BatchPredictorApi,
    useFactory: batchPredictorApi
}
