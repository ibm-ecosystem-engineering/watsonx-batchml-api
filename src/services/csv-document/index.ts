import {Provider} from "@nestjs/common";

import {CsvDocumentApi} from "./csv-document.api";
import {CsvDocumentMongodb} from "./csv-document.mongodb";
import {mongodbClient, MongodbConfig, mongodbConfig} from "../../backends";

export * from './csv-document.api'

const config: MongodbConfig | undefined = mongodbConfig()

let _instance: CsvDocumentApi;
export const csvDocumentApi = (): CsvDocumentApi => {
    if (_instance) {
        return _instance
    }

    if (!config) {
        console.log('!!! MongoDB config missing')
        throw new Error('MongoDB config missing')
    }

    console.log('  ** CsvDocumentApi: CsvDocumentMongodb')
    return _instance = new CsvDocumentMongodb(mongodbClient())
}

export const csvDocumentProvider: Provider = {
    provide: CsvDocumentApi,
    useFactory: csvDocumentApi
}
