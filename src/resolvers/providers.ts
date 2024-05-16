import {Provider} from "@nestjs/common";

import {CsvDocumentResolver} from "./csv-document";

export * from './csv-document'

export const providers: Provider[] = [
    CsvDocumentResolver
]
