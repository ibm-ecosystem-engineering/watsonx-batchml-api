import {Observable} from "rxjs";
import {
    CsvDocumentEventAction,
    CsvDocumentEventModel,
    CsvDocumentInputModel,
    CsvDocumentModel,
    CsvDocumentRecordModel,
    CsvDocumentStatus,
    CsvPredictionModel,
    CsvPredictionRecordFilter,
    CsvPredictionResultModel,
    CsvUpdatedDocumentInputModel,
    PaginationInputModel, PaginationResultModel,
    PerformanceSummaryModel
} from "../../models";
import {BatchPredictionValue} from "../batch-predictor";
import {Stream} from "stream";

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
    predictionField: string;
}

export interface CsvPredictionRecordOptionsModel {
    filter?: CsvPredictionRecordFilter
}

export abstract class CsvDocumentApi {
    abstract addCsvDocument(input: CsvDocumentInputModel, file: {filename: string, buffer: Buffer}): Promise<CsvDocumentModel>
    abstract addCorrectedCsvDocument(input: CsvUpdatedDocumentInputModel, file: {filename: string, buffer: Buffer}): Promise<CsvDocumentModel>

    abstract listCsvDocuments(pagination: PaginationInputModel, status?: CsvDocumentStatus): Promise<PaginationResultModel<CsvDocumentModel>>
    abstract getCsvDocument(id: string): Promise<CsvDocumentModel>
    abstract deleteCsvDocument(id: string): Promise<{id: string}>
    abstract getOriginalCsvDocument(id: string): Promise<{filename: string, stream: Stream}>

    abstract listCsvDocumentRecords(documentId: string, paginationOptions: PaginationInputModel): Promise<PaginationResultModel<CsvDocumentRecordModel>>

    abstract addCsvDocumentPrediction(documentId: string, prediction: CsvDocumentPredictionResult): Promise<CsvPredictionModel>
    abstract listCsvPredictions(documentId: string): Promise<CsvPredictionModel[]>
    abstract getPredictionPerformanceSummary(predictionId: string): Promise<PerformanceSummaryModel>
    abstract listPredictionRecords(predictionId: string, paginationOptions: PaginationInputModel, options?: CsvPredictionRecordOptionsModel): Promise<PaginationResultModel<CsvPredictionResultModel>>
    abstract getPredictionDocument(id: string, predictionId: string, name: string): Promise<{stream: Stream, filename: string}>
    abstract getCsvPrediction(predictionId: string): Promise<CsvPredictionModel>

    abstract observeCsvDocumentUpdates(): Observable<CsvDocumentEventModel>
    abstract observeCsvPredictionUpdates(): Observable<{action: CsvDocumentEventAction, target: CsvPredictionModel}>
}
