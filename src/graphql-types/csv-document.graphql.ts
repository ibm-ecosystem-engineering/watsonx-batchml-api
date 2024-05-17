import {Field, ID, InputType, ObjectType, registerEnumType} from "@nestjs/graphql";

import {
    CsvDocumentModel,
    CsvDocumentRecordModel,
    CsvDocumentStatus,
    CsvDocumentStatusFilter, CsvPredictionCorrectionModel,
    CsvPredictionModel,
    CsvPredictionRecordFilter,
    CsvPredictionResultModel, PaginationInputModel, PaginationMetadataModel, PaginationResultModel,
    PerformanceSummaryModel
} from "../models";
import {CsvPredictionRecordOptionsModel} from "../services";

registerEnumType(CsvDocumentStatus, {name: 'CsvDocumentStatus', description: 'Csv document statuses'})
registerEnumType(CsvDocumentStatusFilter, {name: 'CsvDocumentStatusFilter', description: 'Csv document statuses'})
registerEnumType(CsvPredictionRecordFilter, {name: 'CsvPredictionRecordFilter', description: 'Filter for csv prediction records'})

@ObjectType({description: 'CSV Document'})
export class CsvDocument implements CsvDocumentModel {
    @Field(() => ID)
    id: string;

    @Field(() => CsvDocumentStatus)
    status: CsvDocumentStatus;

    @Field()
    originalUrl: string;

    @Field()
    name: string;

    @Field({nullable: true})
    description: string;
}

@ObjectType({description: 'Csv Document Record'})
export class CsvDocumentRecord implements CsvDocumentRecordModel {
    @Field()
    id: string;

    @Field()
    documentId: string;

    @Field({nullable: true})
    providedValue?: string;

    @Field({nullable: true})
    predictionValue?: string;

    @Field({nullable: true})
    confidence?: number;

    @Field()
    data: string;
}

@ObjectType({description: 'Performance Summary'})
export class PerformanceSummary implements PerformanceSummaryModel {
    @Field(() => Number)
    totalCount: number;

    @Field(() => Number)
    confidenceThreshold: number;

    @Field(() => Number)
    agreeAboveThreshold: number;

    @Field(() => Number)
    agreeBelowThreshold: number;

    @Field(() => Number)
    disagreeAboveThreshold: number;

    @Field(() => Number)
    disagreeBelowThreshold: number;

    @Field(() => Number)
    correctedRecords: number;
}

@ObjectType({description: 'Record'})
export class Record {
    @Field(() => ID)
    id: string;
}

@ObjectType({description: 'Csv prediction correction'})
export class CsvPredictionCorrection implements CsvPredictionCorrectionModel {
    @Field(() => ID)
    id: string;
    @Field(() => Boolean)
    agree: boolean;
    @Field()
    documentId: string;
    @Field()
    predictionId: string;
    @Field(() => [Number])
    confidence: number;
    @Field()
    predictionRecordId: string;
    @Field()
    predictionValue: string;
    @Field()
    providedValue: string;
}

@ObjectType({description: 'CSV Prediction'})
export class CsvPrediction implements CsvPredictionModel {
    @Field(() => ID)
    id: string;
    @Field()
    documentId: string;
    @Field()
    model: string;
    @Field()
    date: string;
    @Field()
    predictionUrl: string;
    @Field(() => [CsvPredictionResult])
    predictions: CsvPredictionResultModel[];
    @Field(() => PerformanceSummary, {nullable: true})
    performanceSummary?: PerformanceSummaryModel;
    @Field(() => [CsvPredictionCorrection], {nullable: true})
    corrections?: CsvPredictionCorrectionModel[];
}

@ObjectType({description: 'CSV Prediction Result'})
export class CsvPredictionResult implements CsvPredictionResultModel {
    @Field(() => ID)
    id: string;
    @Field()
    documentId: string;
    @Field()
    predictionId: string;
    @Field()
    csvRecordId: string;
    @Field()
    providedValue: string;
    @Field()
    predictionValue: string;
    @Field(() => Boolean, {nullable: true})
    agree: boolean;
    @Field(() => Number)
    confidence: number;
    @Field({nullable: true})
    data?: string;
}

@InputType({description: 'CSV Prediction Result'})
export class CsvPredictionRecordOptions implements CsvPredictionRecordOptionsModel {
    @Field(() => CsvPredictionRecordFilter)
    filter?: CsvPredictionRecordFilter
}

@InputType({description: 'Pagination input'})
export class PaginationInput implements PaginationInputModel {
    @Field(() => Number)
    page: number;
    @Field(() => Number)
    pageSize: number;
}

@ObjectType({description: 'Pagination metadata'})
export class PaginationMetadata implements PaginationMetadataModel {
    @Field(() => Number)
    page: number;
    @Field(() => Number)
    pageSize: number;
    @Field(() => Number)
    totalCount: number;
}

@ObjectType({description: 'Paginated CsvDocumentRecords'})
export class PaginatedCsvDocumentRecords implements PaginationResultModel<CsvDocumentRecordModel> {
    @Field(() => [CsvDocumentRecord])
    data: CsvDocumentRecordModel[];
    @Field(() => PaginationMetadata)
    metadata: PaginationMetadataModel;
}

@ObjectType({description: 'Paginated CsvPredictionResults'})
export class PaginatedCsvPredictionResults implements PaginationResultModel<CsvPredictionResultModel> {
    @Field(() => [CsvPredictionResult])
    data: Array<CsvPredictionResultModel>;
    @Field(() => PaginationMetadata)
    metadata: PaginationMetadataModel;
}

@ObjectType({description: 'Paginated CsvDocumentModel'})
export class PaginatedCsvDocuments implements PaginationResultModel<CsvDocumentModel> {
    @Field(() => PaginationMetadata)
    metadata: PaginationMetadataModel;
    @Field(() => [CsvDocument])
    data: Array<CsvDocumentModel>;
}