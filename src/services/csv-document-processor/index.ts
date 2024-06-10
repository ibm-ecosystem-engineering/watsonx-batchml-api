import {Provider} from "@nestjs/common";
import {CsvDocumentProcessorApi} from "./csv-document-processor.api";
import {CsvDocumentProcessor} from "./csv-document-processor";
import {csvDocumentApi} from "../csv-document";
import {batchPredictorApi} from "../batch-predictor";
import {aiModelApi} from "../ai-model";

export * from './csv-document-processor.api'

let _instance: Promise<CsvDocumentProcessor>
export const csvDocumentProcessor = async (): Promise<CsvDocumentProcessor> => {
    if (_instance) {
        return _instance
    }

    return _instance = new Promise(async (resolve, reject) => {
        try {
            resolve(new CsvDocumentProcessor(
                await csvDocumentApi(),
                await batchPredictorApi(),
                await aiModelApi(),
            ))
        } catch (err) {
            reject(err)
        }
    })
}

csvDocumentProcessor()
    .catch((err) => console.log('Error creating csvDocumentProcessor', err))

export const csvDocumentProcessorProvider: Provider = {
    provide: CsvDocumentProcessorApi,
    useFactory: csvDocumentProcessor
}
