import {Provider} from "@nestjs/common";

import {AiModelApi} from "./ai-model.api";
import {AiModelMock} from "./ai-model.mock";

export * from './ai-model.api'

let _instance: AiModelApi;
export const aiModelApi = (): AiModelApi => {
    if (_instance) {
        return _instance
    }

    return _instance = new AiModelMock()
}

export const aiModelProvider: Provider = {
    provide: AiModelApi,
    useFactory: aiModelApi
}
