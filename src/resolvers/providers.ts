import {Provider} from "@nestjs/common";

import {CsvDocumentResolver} from "./csv-document";
import {AiModelsResolver} from "./ai-models";

export * from './csv-document'

export const providers: Provider[] = [
    CsvDocumentResolver,
    AiModelsResolver,
]
