import {Provider} from "@nestjs/common";
import {HelloWorldResolver} from "./hello-world";
import {CsvDocumentResolver} from "./csv-document";

export * from './csv-document'
export * from './hello-world'

export const providers: Provider[] = [
    HelloWorldResolver,
    CsvDocumentResolver
]
