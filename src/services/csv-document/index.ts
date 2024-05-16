import {Provider} from "@nestjs/common";

import {CsvDocumentApi} from "./csv-document.api";
import {CsvDocumentMongodb} from "./csv-document.mongodb";
import {mongodbClient, MongodbConfig, mongodbConfig} from "../../backends";
import {aiModelApi} from "../ai-model";

export * from './csv-document.api'
export * from './csv-document.config'

const config: MongodbConfig | undefined = mongodbConfig()

let _instance: Promise<CsvDocumentApi>;
export const csvDocumentApi = async (): Promise<CsvDocumentApi> => {
    if (_instance) {
        return _instance
    }

    if (!config) {
        console.log('!!! MongoDB config missing')
        throw new Error('MongoDB config missing')
    }

    console.log('  ** CsvDocumentApi: CsvDocumentMongodb')
    return _instance = new CsvDocumentMongodb(await mongodbClient(), aiModelApi()).init()
}

export const csvDocumentProvider: Provider = {
    provide: CsvDocumentApi,
    useFactory: csvDocumentApi
}
