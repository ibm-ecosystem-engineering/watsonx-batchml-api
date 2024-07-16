import {Provider} from "@nestjs/common";

import {CsvDocumentProcessorApi} from "./csv-document-processor.api";
import {CsvDocumentProcessor} from "./csv-document-processor";
import {aiModelApi} from "../ai-model";
import {batchPredictorApi} from "../batch-predictor";
import {csvDocumentApi} from "../csv-document";

export * from './csv-document-processor.api'

let _instance: Promise<CsvDocumentProcessorApi>
export const csvDocumentProcessor = async (): Promise<CsvDocumentProcessorApi> => {
    if (_instance) {
        return _instance
    }

    return _instance = new Promise<CsvDocumentProcessorApi>(async (resolve, reject) => {
        const documentApi = await csvDocumentApi()
        const batchApi = await batchPredictorApi()
        const aiModel = await aiModelApi()

        try {
            resolve(new CsvDocumentProcessor(documentApi, batchApi, aiModel,))
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
