import {CsvPredictionModel} from "../../models";

export abstract class CsvDocumentProcessorApi {
    abstract createCsvPrediction(id: string, model?: string): Promise<CsvPredictionModel>
}
