import {Provider} from "@nestjs/common";
import {CsvDocumentProcessorApi} from "./csv-document-processor.api";
import {CsvDocumentProcessor} from "./csv-document-processor";
import {csvDocumentApi} from "../csv-document";
import {batchPredictorApi} from "../batch-predictor";
import {aiModelApi} from "../ai-model";

export * from './csv-document-processor.api'

let _instance: CsvDocumentProcessor
export const csvDocumentProcessor = async (): Promise<CsvDocumentProcessor> => {
    if (_instance) {
        return _instance
    }

    return _instance = new CsvDocumentProcessor(
        await csvDocumentApi(),
        batchPredictorApi(),
        aiModelApi(),
    )
}

csvDocumentProcessor()

export const csvDocumentProcessorProvider: Provider = {
    provide: CsvDocumentProcessorApi,
    useFactory: csvDocumentProcessor
}
