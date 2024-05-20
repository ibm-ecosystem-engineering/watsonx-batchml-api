import {parse, Parser} from 'csv-parse';
import {extname} from 'path';
import {PassThrough, Stream} from 'stream';
import {Observable, Subject} from "rxjs";
import {read as readXls, utils as xlsUtils} from "xlsx";

import {
    CsvDocumentEventAction, CsvDocumentModel,
    CsvDocumentRecordModel,
    CsvPredictionCorrectionModel,
    CsvPredictionResultModel,
    PerformanceSummaryModel,
    PredictionPerformanceSummaryModel
} from "../../models";

export type FileInfo = {filename: string, buffer: Buffer}
export type FileMetadata = {sheetName: string, start: number}
type FileHandler = (file: FileInfo, metadata?: FileMetadata) => Promise<CsvDocumentRecordModel[]>

const excelFileHandler = async ({filename, buffer}: FileInfo, inputMetadata?: FileMetadata): Promise<CsvDocumentRecordModel[]> => {

    const workbook = readXls(buffer)

    const {sheetName, start}: FileMetadata = inputMetadata || {sheetName: '', start: 0}

    if (!sheetName) {
        console.log('Unable to identify worksheet for file: ' + filename)
        throw new Error('Unable to identify worksheet for file: ' + filename)
    }

    console.log('Getting data from sheet: ' + sheetName)
    const worksheet = workbook.Sheets[sheetName]

    let csvValues: string = xlsUtils.sheet_to_csv(worksheet)

    csvValues = csvValues.split('\n').slice(start).join('\n')

    console.log('Headers: ', csvValues.split('\n')[0])

    return await parseCsv(Buffer.from(csvValues))
}

const fileHandlers: {[key: string]: FileHandler} = {
    '.csv': async (file: FileInfo): Promise<CsvDocumentRecordModel[]> => parseCsv(file.buffer),
    '.xlsx': excelFileHandler,
    '.xlsb': excelFileHandler,
    '.xlsm': excelFileHandler,
}

export const parseDocumentRows = async (document: CsvDocumentModel, file: FileInfo): Promise<CsvDocumentRecordModel[]> => {

    const extension = extname(file.filename)

    const fileHandler: FileHandler | undefined = fileHandlers[extension]

    if (!fileHandler) {
        console.log('Unable to find file handler for extension: ' + extension)
        throw new Error('Unknown file extension: ' + extension)
    }

    const metadata: FileMetadata = {sheetName: document.worksheetName || '', start: parseInt(document.worksheetStartRow) || 0}

    // parse csv file
    const documentRows: CsvDocumentRecordModel[] = await fileHandler(file, metadata)

    return documentRows.map(row => {
        row.documentId = document.id;
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

export type StatAggregation = {predictionId: string, stat: keyof PerformanceSummaryModel, count: number}

export class PerformanceSummary implements PredictionPerformanceSummaryModel {
    totalCount: number = 0;
    agreeAboveThreshold: number = 0;
    agreeBelowThreshold: number = 0;
    disagreeAboveThreshold: number = 0;
    disagreeBelowThreshold: number = 0;
    confidenceThreshold: number = 0;
    correctedRecords: number = 0;
    predictionId: string;

    constructor({predictionId, confidenceThreshold, totalCount, agreeAboveThreshold, agreeBelowThreshold, disagreeBelowThreshold, disagreeAboveThreshold, correctedRecords}: Partial<PredictionPerformanceSummaryModel> = {}) {
        this.totalCount = totalCount || 0;
        this.agreeBelowThreshold = agreeAboveThreshold || 0;
        this.agreeBelowThreshold = agreeBelowThreshold || 0;
        this.disagreeAboveThreshold = disagreeAboveThreshold || 0;
        this.disagreeBelowThreshold = disagreeBelowThreshold || 0;
        this.confidenceThreshold = confidenceThreshold || 0.8;
        this.correctedRecords = correctedRecords || 0;
        this.predictionId = predictionId;
    }

    addStat(stat: StatAggregation): PerformanceSummary {
        this[stat.stat] = this[stat.stat] + stat.count

        return this;
    }

    addPrediction({agree, providedValue, predictionValue, confidence}: {providedValue: string, predictionValue?: string, confidence?: number, agree: boolean}): PerformanceSummary {
        let fieldName: keyof PerformanceSummaryModel

        if (agree || defaultCompareFn(predictionValue, providedValue)) {
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

    toModel(): PredictionPerformanceSummaryModel {
        return {
            totalCount: this.totalCount,
            agreeBelowThreshold: this.agreeBelowThreshold,
            agreeAboveThreshold: this.agreeAboveThreshold,
            disagreeBelowThreshold: this.disagreeBelowThreshold,
            disagreeAboveThreshold: this.disagreeAboveThreshold,
            confidenceThreshold: this.confidenceThreshold,
            correctedRecords: this.correctedRecords,
            predictionId: this.predictionId,
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

export type CompareFn = (prediction: unknown, provided: unknown) => boolean

export const convertValue = (value: unknown): unknown => {
    const num = parseFloat(value as string)

    if (isNaN(num)) {
        return value
    }

    return num.valueOf()
}

export const defaultCompareFn: CompareFn = (prediction: unknown, provided: unknown): boolean => {
    const result = convertValue(prediction) == convertValue(provided)

    const buildReport = (value: unknown) => {
        const convertedValue = convertValue(value)
        return {
            type: typeof value,
            convertedType: typeof convertedValue,
            value,
            convertedValue
        }
    }

    return result
}
