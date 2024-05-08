import {BatchPredictionResult, BatchPredictorApi} from "./batch-predictor.api";
import {WatsonxConfig} from "../../backends";
import {CsvDocumentRecordModel} from "../../models";
import {PredictionValue, WatsonxMl} from "../../watsonx";
import {aiModelApi} from "../ai-model";


export class BatchPredictorWatsonx implements BatchPredictorApi {
    private readonly service: WatsonxMl;

    constructor(config: WatsonxConfig) {
        this.service = new WatsonxMl(aiModelApi(), config)
    }

    async predictValues(data: CsvDocumentRecordModel[], model?: string): Promise<BatchPredictionResult> {
        return this.service
            .predict({data}, model)
            .then(result => {
                const results = result.results
                    .map(((val: PredictionValue, index) => Object.assign(
                        {},
                        val,
                        {
                            csvRecordId: data[index].id,
                        }
                    )))

                return Object.assign({}, result, {results})
            })
            .catch(err => {
                console.log('Error calculating predictions: ', err)

                return {
                    date: new Date(),
                    model,
                    results: []
                }
            })
    }

}