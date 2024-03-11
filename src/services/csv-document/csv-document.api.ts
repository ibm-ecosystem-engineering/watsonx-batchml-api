import {Observable} from "rxjs";
import {
    CsvDocumentEventAction,
    CsvDocumentEventModel,
    CsvDocumentInputModel,
    CsvDocumentModel, CsvDocumentRecordModel,
    CsvDocumentStatus, CsvPredictionModel,
    PerformanceSummaryModel
} from "../../models";
import {BatchPredictionValue} from "../batch-predictor";

export class DocumentNotFound extends Error {
    errType = 'DocumentNotFound'

    constructor(public readonly id: string) {
        super(`Document not found: ${id}`);
    }
}

export const isDocumentNotFound = (err: Error): err is DocumentNotFound => {
    return !!err && (err as DocumentNotFound).errType === 'DocumentNotFound'
}

export interface CsvDocumentPredictionResult {
    model: string;
    date: Date;
    results: BatchPredictionValue[];
}

export abstract class CsvDocumentApi {
    abstract addCsvDocument(input: CsvDocumentInputModel, file: {filename: string, buffer: Buffer}): Promise<CsvDocumentModel>
    abstract listCsvDocuments(status?: CsvDocumentStatus): Promise<CsvDocumentModel[]>
    abstract getCvsDocument(id: string): Promise<CsvDocumentModel>
    abstract deleteCsvDocument(id: string): Promise<{id: string}>
    abstract getOriginalCsvDocument(id: string): Promise<{filename: string, buffer: Buffer}>

    abstract getCsvDocumentRecords(documentId: string): Promise<CsvDocumentRecordModel[]>

    abstract addCsvDocumentPrediction(documentId: string, prediction: CsvDocumentPredictionResult): Promise<CsvPredictionModel>
    abstract listCsvPredictions(documentId: string): Promise<CsvPredictionModel[]>
    abstract getPredictionPerformanceSummary(predictionId: string): Promise<PerformanceSummaryModel>

    abstract observeCsvDocumentUpdates(): Observable<CsvDocumentEventModel>
    abstract observeCsvPredictionUpdates(): Observable<{action: CsvDocumentEventAction, target: CsvPredictionModel}>
}
