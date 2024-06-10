import {BatchPredictionResult, BatchPredictorApi} from "./batch-predictor.api";
import {CsvDocumentRecordModel} from "../../models";
import {PredictionValue, WatsonxMl} from "../../watsonx";


export class BatchPredictorWatsonx implements BatchPredictorApi {
    constructor(private readonly service: WatsonxMl) {
    }

    async predictValues(data: CsvDocumentRecordModel[], model?: string): Promise<BatchPredictionResult> {
        if (!data || data.length === 0) {
            return {
                date: new Date(),
                model,
                predictionField: '',
                results: []
            }
        }

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
    }

}