import {BatchPredictionResult, BatchPredictorApi} from "../batch-predictor";
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
        if (event.action !== CsvDocumentEventAction.Add) {
            return false
        }

        const models: string[] = await this.modelService.listAIModels()
            .then((result: AIModelModel[]) => result.map(val => val.name))

        console.log(`   *** Processing new CSV Document: ${event.target.id}, ${models} ***`)
        return Promise.all(models.map((model: string) => this.createCsvPrediction(event.target.id, model).then(() => true)))
            .then((result: boolean[]) => result.some(val => val))
    }

    async createCsvPrediction(documentId: string, model?: string): Promise<CsvPredictionModel> {
        const data: PaginationResultModel<CsvDocumentRecordModel> = await this.service.listCsvDocumentRecords(documentId, {page: 1, pageSize: -1})

        const prediction: BatchPredictionResult = await this.predictorService.predictValues(data.data, model)

        return this.service.addCsvDocumentPrediction(documentId, prediction)
    }
}
