import {Provider} from "@nestjs/common";
import {CsvDocumentProcessorApi} from "./csv-document-processor.api";
import {CsvDocumentProcessor} from "./csv-document-processor";
import {csvDocumentApi} from "../csv-document";
import {batchPredictorApi} from "../batch-predictor";

export * from './csv-document-processor.api'

let _instance: CsvDocumentProcessor
export const csvDocumentProcessor = () => {
    if (_instance) {
        return _instance
    }

    return _instance = new CsvDocumentProcessor(
        csvDocumentApi(),
        batchPredictorApi()
    )
}

csvDocumentProcessor()

export const csvDocumentProcessorProvider: Provider = {
    provide: CsvDocumentProcessorApi,
    useFactory: csvDocumentProcessor
}
