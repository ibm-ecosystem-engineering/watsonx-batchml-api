import {MachineLearningResultModel} from "./machine-learning-result.model";

export interface CsvDocumentInputModel {
    name: string;
    description?: string;
    worksheetName?: string;
    worksheetStartRow?: string;
}

export interface CsvUpdatedDocumentInputModel {
    name: string;
    documentId: string;
    predictionId: string;
    description?: string;
}

export interface CsvDocumentModel extends CsvDocumentInputModel {
    id: string;
    status: CsvDocumentStatus;
    originalUrl: string;
}

export const isCsvDocumentModel = (val: unknown): val is CsvDocumentModel => {
    return !!val
        && !!(val as CsvDocumentModel).id
        && !!(val as CsvDocumentModel).name
        && !!(val as CsvDocumentModel).status
}

export interface CsvDocumentRecordModel {
    id: string;
    documentId: string;
    data: string;
}

export enum CsvDocumentStatus {
    InProgress = 'InProgress',
    Completed = 'Completed',
    Error = 'Error',
    Deleted = 'Deleted'
}

export enum CsvDocumentStatusFilter {
    All = 'All',
    InProgress = 'InProgress',
    Completed = 'Completed',
    Error = 'Error',
    Deleted = 'Deleted'
}

export const mapDocumentFilterStatus = (status?: CsvDocumentStatusFilter): CsvDocumentStatus | undefined => {
    if (!status) {
        return
    }

    switch (status) {
        case CsvDocumentStatusFilter.Completed:
            return CsvDocumentStatus.Completed
        case CsvDocumentStatusFilter.Deleted:
            return CsvDocumentStatus.Deleted
        case CsvDocumentStatusFilter.Error:
            return CsvDocumentStatus.Error
        case CsvDocumentStatusFilter.InProgress:
            return CsvDocumentStatus.InProgress
        case CsvDocumentStatusFilter.All:
            return
        default:
            console.log(`WARNING: Unknown status: ${status}`)
            return
    }
}

export interface CsvPredictionModel {
    id: string;
    documentId: string;
    model: string;
    date: string;
    predictionUrl: string;
    predictionField?: string;
    predictions: CsvPredictionResultModel[];
    corrections?: CsvPredictionCorrectionModel[];
    performanceSummary?: PerformanceSummaryModel;
}

export interface CsvPredictionResultModel {
    id: string;
    documentId: string;
    predictionId: string;
    csvRecordId: string;
    providedValue?: string;
    predictionValue: string;
    skip?: boolean;
    agree: boolean;
    confidence: number;
    data?: string;
}

export interface CsvPredictionCorrectionModel {
    id: string;
    documentId: string;
    predictionId: string;
    predictionRecordId: string;
    providedValue?: string;
    predictionValue: string;
    agree: boolean;
    confidence: number;
}

// performance summary (e.g. number of agree/disagree, above/below confidence threshold
export interface PerformanceSummaryModel {
    totalCount: number;
    grandTotal: number;
    confidenceThreshold: number;
    agreeAboveThreshold: number;
    agreeBelowThreshold: number;
    disagreeAboveThreshold: number;
    disagreeBelowThreshold: number;
    correctedRecords: number;
}

export interface PredictionPerformanceSummaryModel extends PerformanceSummaryModel {
    predictionId: string;
}

export interface CsvDocumentRowModel {
    [key: string]: unknown
}

export interface ProcessedCsvDocumentRowModel extends CsvDocumentRowModel, MachineLearningResultModel {
}

export enum CsvDocumentEventAction {
    Add = 'Add',
    Update = 'Update',
    Delete = 'Delete'
}

export interface CsvDocumentEventModel<T extends {id: string} = {id: string}> {
    target: T;
    action: CsvDocumentEventAction;
}

export enum CsvPredictionRecordFilter {
    All = 'All',
    AllDisagree = 'AllDisagree',
    AllBelowConfidence = 'AllBelowConfidence',
    AgreeBelowConfidence = 'AgreeBelowConfidence',
    DisagreeAboveConfidence = 'DisagreeAboveConfidence',
    DisagreeBelowConfidence = 'DisagreeBelowConfidence'
}
