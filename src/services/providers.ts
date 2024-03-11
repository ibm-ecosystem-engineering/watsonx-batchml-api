import {Provider} from "@nestjs/common";

import {batchPredictorProvider} from "./batch-predictor";
import {csvDocumentProvider} from "./csv-document";
import {provider as helloWorldProvider} from "./hello-world";
import {csvDocumentProcessorProvider} from "./csv-document-processor";

export * from './hello-world';
export * from './family-allowance';
export * from './csv-document';
export * from './batch-predictor';
export * from './csv-document-processor';

export const providers: Provider[] = [
    helloWorldProvider,
    csvDocumentProvider,
    batchPredictorProvider,
    csvDocumentProcessorProvider,
];
