import {BatchPredictionResult, BatchPredictorApi} from "./batch-predictor.api";
import {WatsonxConfig} from "../../backends";
import {CsvDocumentRecordModel} from "../../models";
import {WatsonxMl} from "../../watsonx";


export class BatchPredictorWatsonx implements BatchPredictorApi {
    private readonly service: WatsonxMl;

    constructor(config: WatsonxConfig) {
        this.service = new WatsonxMl(config)
    }

    async predictValues(data: CsvDocumentRecordModel[], model?: string): Promise<BatchPredictionResult> {
        return this.service
            .predict({data}, model)
            .then(result => {
                const results = result.results
                    .map(((val, index) => Object.assign(
                        {},
                        val,
                        {
                            providedValue: data[index].providedValue,
                            csvRecordId: data[index].id,
                        }
                    )))

                return Object.assign({}, result, {results})
            })
    }

}