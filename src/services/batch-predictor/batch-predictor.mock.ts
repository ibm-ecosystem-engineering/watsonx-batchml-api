import { CsvDocumentRecordModel, CsvDocumentEventModel } from "src/models";
import {BatchPredictionResult, BatchPredictorApi} from "./batch-predictor.api";

export class BatchPredictorMock implements BatchPredictorApi {
    predictValues(data: CsvDocumentRecordModel[], model?: string): Promise<BatchPredictionResult> {
        throw new Error("Method not implemented.");
    }

}