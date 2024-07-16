import {BatchPredictionResult, BatchPredictionValue, BatchPredictorApi} from "../batch-predictor";
import {CsvDocumentApi} from "../csv-document";
import {
    AIModelModel,
    CsvDocumentEventAction,
    CsvDocumentEventModel,
    CsvDocumentRecordModel,
    CsvPredictionModel, PaginationResultModel
} from "../../models";
import {CsvDocumentProcessorApi} from "./csv-document-processor.api";
import {AiModelApi} from "../ai-model";

export class CsvDocumentProcessor implements CsvDocumentProcessorApi {
    constructor(
        private readonly service: CsvDocumentApi,
        private readonly predictorService: BatchPredictorApi,
        private readonly modelService: AiModelApi,
    ) {
        console.log('Subscribing to CSV Document updates')
        service.observeCsvDocumentUpdates()
            .subscribe({
                next: event => this.handleDocumentEvent(event)
            })
    }

    async handleDocumentEvent(event: CsvDocumentEventModel): Promise<boolean> {
        console.log('Got event: ', event)
        if (event.action !== CsvDocumentEventAction.Add) {
            return false
        }

        const models: string[] = await this.modelService.getDefaultModel()
            .then((result: AIModelModel) => result.name)
            .then((name: string) => [name])

        console.log(`   *** Processing new CSV Document: ${event.target.id}, ${models} ***`)
        return Promise.all(models.map((model: string) => this.createCsvPrediction(event.target.id, model).then(() => true)))
            .then((result: boolean[]) => result.some(val => val))
    }

    async createCsvPrediction(documentId: string, model?: string): Promise<CsvPredictionModel> {
        const date = new Date();
        // TODO use a universal constant here
        const pageSize = 30000;

        const createPredictions = async (docId: string, model: string, page: number, pageSize: number): Promise<{predictions: BatchPredictionValue[], hasMore: boolean, predictionField: string}> => {
            console.log('Listing csv document records: ', {page, pageSize})
            const data: PaginationResultModel<CsvDocumentRecordModel> = await this.service.listCsvDocumentRecords(documentId, {page, pageSize})

            console.log('  Predicting values: ', data.metadata)
            const prediction: BatchPredictionResult = await this.predictorService.predictValues(data.data, model)

            return {predictions: prediction.results, hasMore: data.metadata.hasMore, predictionField: prediction.predictionField}
        }

        let more = true
        let page = 1
        let retryCount = 0
        let results: BatchPredictionValue[] = []
        let predictionField = ''
        while (more) {
            try {
                const {predictions, hasMore, predictionField:label} = await createPredictions(documentId, model, page, pageSize)

                more = hasMore
                page = page + 1
                results = results.concat(predictions)
                predictionField = label
                retryCount = 0
            } catch (err) {
                if (retryCount < 3) {
                    retryCount = retryCount + 1
                    console.log(`Error getting predictions. Attempting retry ${retryCount}`)
                } else {
                    console.log(`Error getting predictions. No more retries.`)
                    more = true
                    page = page + 1
                    retryCount = 0
                }
            }
        }

        return this.service.addCsvDocumentPrediction(documentId, {date, model, results, predictionField})
    }
}
