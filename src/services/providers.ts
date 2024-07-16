import {Provider} from "@nestjs/common";

import {batchPredictorProvider} from "./batch-predictor";
import {csvDocumentProvider} from "./csv-document";
import {csvDocumentProcessorProvider} from "./csv-document-processor";
import {aiModelProvider} from "./ai-model";
import {metricsApiProvider} from "./metrics";
import {pubSubProvider} from "./pub-sub";

export * from './csv-document';
export * from './batch-predictor';
export * from './csv-document-processor';
export * from './ai-model';
export * from './metrics';
export * from './pub-sub';

export const providers: Provider[] = [
    csvDocumentProvider,
    batchPredictorProvider,
    csvDocumentProcessorProvider,
    aiModelProvider,
    metricsApiProvider,
    pubSubProvider,
];
