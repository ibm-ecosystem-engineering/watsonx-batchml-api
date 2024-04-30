import {BatchPredictionResult, BatchPredictorApi} from "../batch-predictor";
import {CsvDocumentApi} from "../csv-document";
import {CsvDocumentEventAction, CsvDocumentEventModel, CsvDocumentRecordModel, CsvPredictionModel} from "../../models";
import {CsvDocumentProcessorApi} from "./csv-document-processor.api";

export class CsvDocumentProcessor implements CsvDocumentProcessorApi {
    constructor(
        private readonly service: CsvDocumentApi,
        private readonly predictorService: BatchPredictorApi,
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

        console.log(`   *** Processing new CSV Document: ${event.target.id} ***`)
        return this.createCsvPrediction(event.target.id)
            .then(() => true)
    }

    async createCsvPrediction(documentId: string, model?: string): Promise<CsvPredictionModel> {
        const data: CsvDocumentRecordModel[] = await this.service.listCsvDocumentRecords(documentId)

        const prediction: BatchPredictionResult = await this.predictorService.predictValues(data, model)

        return this.service
            .addCsvDocumentPrediction(documentId, prediction)
    }
}
