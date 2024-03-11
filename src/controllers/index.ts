import { HelloWorldController } from './hello-world';
import {CsvDocumentController} from "./csv-document";

export * from './hello-world';
export * from './csv-document'

export const controllers = [
    HelloWorldController,
    CsvDocumentController
];
