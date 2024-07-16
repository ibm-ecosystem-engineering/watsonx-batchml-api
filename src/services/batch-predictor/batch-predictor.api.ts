import {CsvDocumentEventModel, CsvDocumentRecordModel, CsvPredictionResultModel} from "../../models";

export interface BatchPredictionResult {
    date: Date;
    model: string;
    predictionField: string;
    results: BatchPredictionValue[];
}

export interface BatchPredictionValue {
    csvRecordId: string;
    providedValue?: string;
    prediction: string;
    confidence: number;
    skipValue?: string;
}

export abstract class BatchPredictorApi {
    abstract predictValues(data: CsvDocumentRecordModel[], model?: string): Promise<BatchPredictionResult>;
}
