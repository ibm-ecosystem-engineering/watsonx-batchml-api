import {parse, Parser} from 'csv-parse';
import {PassThrough, Stream} from 'stream';
import {Observable, Subject} from "rxjs";

import {
    CsvDocumentEventAction,
    CsvDocumentRecordModel, CsvPredictionCorrectionModel,
    CsvPredictionResultModel,
    PerformanceSummaryModel
} from "../../models";

export const parseDocumentRows = async (documentId: string, file: {filename: string, buffer: Buffer}): Promise<CsvDocumentRecordModel[]> => {

    // parse csv file
    const documentRows: CsvDocumentRecordModel[] = await parseCsv(file.buffer)

    return documentRows.map(row => {
        row.documentId = documentId;
        row.data = JSON.stringify(row);

        return row;
    });
}

export const parsePredictionRows = async (metadata: {documentId: string, predictionId: string}, file: {filename: string, buffer: Buffer}): Promise<CsvPredictionCorrectionModel[]> => {

    // parse csv file
    const documentRows: CsvPredictionResultModel[] = await parseCsv(file.buffer)

    return documentRows.map(row => {
        return Object.assign(row, metadata, {predictionRecordId: row.id, id: undefined});
    });
}

export const parseCsv = async <T>(csvContents: Buffer): Promise<T[]> => {
    const parser = parse({
        delimiter: ',',
        columns: (headers: string[]) => headers.map(val => val.trim()),
        skip_empty_lines: true,
    });

    return parseCsvStream<T>(parser, bufferToStream(csvContents))
}

export const bufferToStream = (buffer: Buffer): Stream => {
    const bufferStream = new PassThrough();

    bufferStream.end(buffer);

    return bufferStream;
}

const parseCsvStream = async <T = any>(parser: Parser, stream: Stream): Promise<T[]> => {
    return new Promise<T[]>((resolve, reject) => {
        const records: T[] = []

        parser.on('readable', function(){
            let record;
            while ((record = parser.read()) !== null) {
                records.push(record);
            }
        });

        parser.on('error', function(err){
            reject(err)
        });

        parser.on('end', function(){
            console.log('End csv parser')
            resolve(records)
        });

        parser.on('finish', function(){
            console.log('Finish csv parser')
            resolve(records)
        });

        stream.pipe(parser);
    })
}

export class PerformanceSummary implements PerformanceSummaryModel {
    totalCount: number = 0;
    agreeAboveThreshold: number = 0;
    agreeBelowThreshold: number = 0;
    disagreeAboveThreshold: number = 0;
    disagreeBelowThreshold: number = 0;
    confidenceThreshold: number;
    correctedRecords: number;

    constructor({confidenceThreshold, totalCount, agreeAboveThreshold, agreeBelowThreshold, disagreeBelowThreshold, disagreeAboveThreshold, correctedRecords}: Partial<PerformanceSummaryModel> = {}) {
        this.totalCount = totalCount || 0;
        this.agreeBelowThreshold = agreeAboveThreshold || 0;
        this.agreeBelowThreshold = agreeBelowThreshold || 0;
        this.disagreeAboveThreshold = disagreeAboveThreshold || 0;
        this.disagreeBelowThreshold = disagreeBelowThreshold || 0;
        this.confidenceThreshold = confidenceThreshold || 0.8;
        this.correctedRecords = correctedRecords || 0;
    }

    addPrediction({providedValue, predictionValue, confidence}: {providedValue: string, predictionValue?: string, confidence?: number}): PerformanceSummary {
        let fieldName: keyof PerformanceSummaryModel

        if (providedValue === predictionValue) {
            if (confidence >= this.confidenceThreshold) {
                fieldName = 'agreeAboveThreshold'
            } else {
                fieldName = 'agreeBelowThreshold'
            }
        } else {
            if (confidence >= this.confidenceThreshold) {
                fieldName = 'disagreeAboveThreshold'
            } else {
                fieldName = 'disagreeBelowThreshold'
            }
        }

        this.totalCount = this.totalCount + 1
        this[fieldName] = this[fieldName] + 1

        return this;
    }

    toModel(): PerformanceSummaryModel {
        return {
            totalCount: this.totalCount,
            agreeBelowThreshold: this.agreeBelowThreshold,
            agreeAboveThreshold: this.agreeAboveThreshold,
            disagreeBelowThreshold: this.disagreeBelowThreshold,
            disagreeAboveThreshold: this.disagreeAboveThreshold,
            confidenceThreshold: this.confidenceThreshold,
            correctedRecords: this.correctedRecords,
        }
    }
}

export class EventManager<T extends {id: string}> {
    private readonly subject: Subject<{action: CsvDocumentEventAction, target: T}>

    constructor() {
        this.subject = new Subject()
    }

    add(target: T): T {
        return this.next(CsvDocumentEventAction.Add, target)
    }

    update(target: {id: string}): {id: string} {
        return this.next(CsvDocumentEventAction.Update, target as T)
    }

    delete(target: {id: string}): {id: string} {
        return this.next(CsvDocumentEventAction.Delete, target as T)
    }

    next(action: CsvDocumentEventAction, target: T): T {
        this.subject.next({action, target})

        return target
    }

    observable(): Observable<{action: CsvDocumentEventAction, target: T}> {
        return this.subject
    }
}