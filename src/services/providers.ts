import {Provider} from "@nestjs/common";

import {batchPredictorProvider} from "./batch-predictor";
import {csvDocumentProvider} from "./csv-document";
import {csvDocumentProcessorProvider} from "./csv-document-processor";
import {aiModelProvider} from "./ai-model";

export * from './csv-document';
export * from './batch-predictor';
export * from './csv-document-processor';
export * from './ai-model';

export const providers: Provider[] = [
    csvDocumentProvider,
    batchPredictorProvider,
    csvDocumentProcessorProvider,
    aiModelProvider,
];
