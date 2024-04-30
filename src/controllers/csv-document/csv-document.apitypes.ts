import {ApiProperty, ApiPropertyOptional} from "@nestjs/swagger";

import {CsvDocumentInputModel, CsvDocumentModel, CsvDocumentStatus, PerformanceSummaryModel} from "../../models";

export class CsvDocumentInput implements CsvDocumentInputModel {
    @ApiProperty()
    name: string;
    @ApiProperty({nullable: true})
    description?: string;
    @ApiProperty()
    predictField: string;
}

export class CsvDocument implements CsvDocumentModel {
    @ApiProperty()
    id: string;
    @ApiProperty({enum: CsvDocumentStatus})
    status: CsvDocumentStatus;
    @ApiProperty()
    originalUrl: string;
    @ApiPropertyOptional()
    processedUrl?: string;
    @ApiPropertyOptional({type: () => PerformanceSummary})
    performance?: PerformanceSummaryModel;
    @ApiProperty()
    name: string;
    @ApiProperty()
    description: string;
    @ApiProperty()
    predictField: string;
}

export class PerformanceSummary implements PerformanceSummaryModel {
    @ApiProperty()
    agreeAboveThreshold: number;
    @ApiProperty()
    totalCount: number;
    @ApiProperty()
    agreeBelowThreshold: number;
    @ApiProperty()
    disagreeAboveThreshold: number;
    @ApiProperty()
    disagreeBelowThreshold: number;
    @ApiProperty()
    confidenceThreshold: number;
}