import {Provider} from "@nestjs/common";

import {AiModelApi} from "./ai-model.api";
import {AiModelMock} from "./ai-model.mock";
import {mongodbClient, mongodbConfig, MongodbConfig} from "../../backends";
import {AiModelMongodb} from "./ai-model.mongodb";

export * from './ai-model.api'

const config: MongodbConfig | undefined = mongodbConfig()

let _instance: Promise<AiModelApi>;
export const aiModelApi = async (): Promise<AiModelApi> => {
    if (_instance) {
        return _instance
    }

    if (!config) {
        console.log('!!! MongoDB config missing')
        console.log('  ** AiModelApi: AiModelMock')
        return _instance = Promise.resolve(new AiModelMock())
    }

    console.log('  ** AiModelApi: AiModelMongodb')
    return _instance = new Promise(async (resolve) => {
        const val = new AiModelMongodb(await mongodbClient());

        resolve(val.init())
    })
}

export const aiModelProvider: Provider = {
    provide: AiModelApi,
    useFactory: aiModelApi
}
