import {extname, parse as parsePath} from 'path';
import {Observable} from "rxjs";
import {Collection, Db, GridFSBucket, ObjectId, OptionalId, WithId} from "mongodb";

import {CsvDocumentApi, CsvDocumentPredictionResult, CsvPredictionRecordOptionsModel} from "./csv-document.api";
import {
    bufferToStream,
    CompareFn,
    defaultCompareFn,
    EventManager,
    FileInfo,
    parseDocumentRows,
    parsePredictionRows,
    PerformanceSummary,
} from "./csv-document.support";
import {
    CsvDocumentEventAction,
    CsvDocumentEventModel,
    CsvDocumentInputModel,
    CsvDocumentModel,
    CsvDocumentRecordModel,
    CsvDocumentStatus,
    CsvPredictionCorrectionModel,
    CsvPredictionModel,
    CsvPredictionRecordFilter,
    CsvPredictionResultModel,
    CsvUpdatedDocumentInputModel,
    PerformanceSummaryModel
} from "../../models";
import {first, streamToBuffer} from "../../util";
import {BatchPredictionValue} from "../batch-predictor";
import {buildOriginalUrl, buildPredictionUrl} from "./csv-document.config";

interface InternalCsvDocumentModel extends CsvDocumentInputModel {
    id: string;
    status: CsvDocumentStatus;
    originalUrl: string;
}

const confidenceThreshold: number = 0.8

const documentEvents: EventManager<CsvDocumentModel> = new EventManager<CsvDocumentModel>()
const predictionEvents: EventManager<CsvPredictionModel> = new EventManager<CsvPredictionModel>()

type MongodbCsvPredictionModel = OptionalId<Omit<CsvPredictionModel, 'id | predictions | performanceSummary | date'> & {date: Date}>
type MongodbCsvPredictionResultModel = OptionalId<CsvPredictionResultModel>

export class CsvDocumentMongodb implements CsvDocumentApi {
    private readonly documents: Collection<CsvDocumentModel>;
    private readonly documentRecords: Collection<CsvDocumentRecordModel>;
    private readonly predictions: Collection<CsvPredictionModel>;
    private readonly predictionRecords: Collection<CsvPredictionResultModel>;
    private readonly predictionCorrectionRecords: Collection<CsvPredictionCorrectionModel>;
    private readonly bucket: GridFSBucket;

    constructor(db: Db) {
        this.documents = db.collection<CsvDocumentModel>('documents')
        this.documentRecords = db.collection<CsvDocumentRecordModel>('documentRecords')

        this.predictions = db.collection<CsvPredictionModel>('predictions')
        this.predictionRecords = db.collection<CsvPredictionResultModel>('predictionResults')
        this.predictionCorrectionRecords = db.collection<CsvPredictionCorrectionModel>('predictionCorrectionResults')

        this.bucket = new GridFSBucket(db, {bucketName: 'documents'})
    }

    async addCsvDocument(input: CsvDocumentInputModel, file: { filename: string; buffer: Buffer; }): Promise<CsvDocumentModel> {

        // insert document
        const document: CsvDocumentModel = await this.insertCsvDocument(Object.assign(input, {status: CsvDocumentStatus.InProgress}));

        // upload file
        console.log('Uploading file to database')
        const filename = await this.uploadDocumentFile(file, document);

        // insert records
        console.log('Parsing rows from doc')
        const rows: CsvDocumentRecordModel[] = await parseDocumentRows(document.id, {filename: document.name, buffer: file.buffer})

        console.log('Inserting csv rows: ' + rows.length)
        await this.documentRecords.insertMany(rows)

        return documentEvents.add(document)
    }

    async addCorrectedCsvDocument(input: CsvUpdatedDocumentInputModel, file: FileInfo): Promise<CsvDocumentModel> {
        console.log('Uploading updated CSV file to database')
        const filename = await this.uploadUpdatedCsvFile(file, input);

        const rows: CsvPredictionCorrectionModel[] = await parsePredictionRows(input, file)

        const originalPredictionRecords: CsvPredictionResultModel[] = await this.listPredictionRecords(input.predictionId)

        const changedRows: CsvPredictionCorrectionModel[] = rows.filter((row: CsvPredictionCorrectionModel) => {
            const originalRecord = first(originalPredictionRecords.filter(record => record.id === row.predictionRecordId))

            if (!originalRecord) {
                console.log('  Unable to find original prediction record: ' + row.predictionRecordId)
                return false
            }

            return !defaultCompareFn(originalRecord.predictionValue, row.predictionValue)
        })

        if (changedRows.length === 0) {
            console.log('  No changed rows found! Nothing to store')
            return undefined
        } else {
            console.log('  Found changed rows: ' + changedRows.length)
        }

        await this.predictionCorrectionRecords.insertMany(changedRows)

        return undefined
    }

    private uploadDocumentFile(file: { filename: string; buffer: Buffer }, document: CsvDocumentModel): Promise<string | undefined> {
        console.log('Getting extension for filename: ' + document.name)
        const extension = extname(document.name)

        return new Promise<string | undefined>((resolve, reject) => {
            const filename = `${document.id}-original${extension}`

            bufferToStream(file.buffer)
                .pipe(this.bucket.openUploadStream(filename, {
                    chunkSizeBytes: 1048576,
                    metadata: {
                        documentId: document.id,
                        name: document.name,
                        extension,
                    }
                }))
                .on('finish', () => resolve(filename))
                .on('error', err => reject(err))
        })
    }

    private uploadUpdatedCsvFile(file: { filename: string; buffer: Buffer }, document: CsvUpdatedDocumentInputModel): Promise<string | undefined> {
        return new Promise<string | undefined>((resolve, reject) => {
            const filename = `${document.documentId}-${document.predictionId}-update.csv`

            bufferToStream(file.buffer)
                .pipe(this.bucket.openUploadStream(filename, {
                    chunkSizeBytes: 1048576,
                    metadata: {
                        documentId: document.documentId,
                        predictionId: document.predictionId,
                        name: document.name,
                    }
                }))
                .on('finish', () => resolve(filename))
                .on('error', err => reject(err))
        })
    }

    private async insertCsvDocument(input: CsvDocumentInputModel): Promise<CsvDocumentModel> {
        const document: InternalCsvDocumentModel = Object.assign(
            {},
            input,
            {
                status: CsvDocumentStatus.InProgress,
                originalUrl: '',
                id: undefined,
            })

        const result = await this.documents.insertOne(document, {ignoreUndefined: true})

        const documentId = result.insertedId;

        return Object.assign(
            {},
            document,
            {
                id: documentId.toString(),
                originalUrl: buildOriginalUrl(documentId.toString(), document.name)
            });
    }

    async listCsvDocumentRecords(documentId: string): Promise<CsvDocumentRecordModel[]> {

        return this.documentRecords
            .find({documentId})
            .map(record => Object.assign({}, record, {id: record._id.toString()}))
            .toArray()
    }

    async addCsvDocumentPrediction(documentId: string, prediction: CsvDocumentPredictionResult): Promise<CsvPredictionModel> {
        const csvPrediction = await this.insertCsvPrediction(prediction, documentId);

        const result = predictionResultsToMongodbPredictionResults(prediction.results, documentId, csvPrediction.id)
        if (result.length > 0) {
            await this.predictionRecords.insertMany(result)
        } else {
            console.log('No prediction results')
        }

        await this.documents
            .updateOne({_id: new ObjectId(documentId)}, {$set: {status: CsvDocumentStatus.Completed}})
            .then(() => documentEvents.update({id: documentId}))

        return predictionEvents.add(csvPrediction);
    }

    private async insertCsvPrediction(prediction: CsvDocumentPredictionResult, documentId: string): Promise<CsvPredictionModel> {
        const mongoPrediction: MongodbCsvPredictionModel = predictionToMongodbPrediction(prediction, documentId)

        const result = await this.predictions.insertOne(mongoPrediction)

        const predictionId = result.insertedId.toString()

        return Object.assign(
            {},
            mongoPrediction,
            {
                id: predictionId
            }
        );
    }

    async getOriginalCsvDocument(id: string): Promise<{filename: string, buffer: Buffer}> {
        const document = await this.documents.findOne(new ObjectId(id))

        const fileId = `${document._id}-original.csv`

        const buffer = await streamToBuffer(this.bucket.openDownloadStreamByName(fileId))

        return {filename: document.name, buffer}
    }

    async getPredictionPerformanceSummary(predictionId: string): Promise<PerformanceSummaryModel> {
        const rows = await this.predictionRecords
            .find({
                predictionId
            })
            .toArray()

        const corrections = await this.predictionCorrectionRecords
            .find({
                predictionId
            })
            .toArray()

        return predictionRecordsToPerformanceSummary(rows, corrections)
    }

    async listCsvDocuments(status?: CsvDocumentStatus): Promise<CsvDocumentModel[]> {

        const query = status ? {status} : {}

        const result = this.documents
            .find(query)
            .map((doc: WithId<CsvDocumentModel>) => Object.assign({}, doc, {id: doc._id}))

        return result.toArray()
    }

    async getCsvDocument(id: string): Promise<CsvDocumentModel> {

        const result = await this.documents.findOne(new ObjectId(id))

        return Object.assign(
            {},
            result,
            {
                id: result._id,
                originalUrl: buildOriginalUrl(id, result.name)
            })
    }

    async deleteCsvDocument(id: string): Promise<{id: string}> {
        const result = await this.documents
            .updateOne(new ObjectId(id), {$set: {status: CsvDocumentStatus.Deleted}})

        return documentEvents.delete({id: result.upsertedId.toString()})
    }

    observeCsvDocumentUpdates(): Observable<CsvDocumentEventModel> {
        return documentEvents.observable();
    }

    async listPredictionRecords(predictionId: string, {filter}: CsvPredictionRecordOptionsModel = {}): Promise<CsvPredictionResultModel[]> {

        const query: Partial<{[k in keyof CsvPredictionResultModel]: unknown}> = {predictionId}

        if (filter === CsvPredictionRecordFilter.DisagreeBelowConfidence || filter === CsvPredictionRecordFilter.AllBelowConfidence) {
            query['confidence'] = {$lt: confidenceThreshold}
        }
        if (filter === CsvPredictionRecordFilter.AllDisagree || filter === CsvPredictionRecordFilter.DisagreeBelowConfidence) {
            query['agree'] = false
        }

        console.log('Querying prediction records: ', {filter, query})

        return this.predictionRecords
            .find(query)
            .map((predictionResult: WithId<CsvPredictionResultModel>) => Object.assign({}, predictionResult, {id: predictionResult._id.toString()}))
            .toArray()
    }

    async listCsvPredictions(documentId: string): Promise<CsvPredictionModel[]> {

        return this.findPredictions(documentId)
            .then(results => this.populatePredictionRecords(documentId, results))
            .then(results => this.populateCorrectionRecords(results))
            .then(results => this.populatePerformanceSummary(results))
    }

    async getCsvPrediction(predictionId: string): Promise<CsvPredictionModel> {
        const result = await this.predictions.findOne(new ObjectId(predictionId))

        return Object.assign({}, result, {id: result._id})
    }

    async getPredictionDocument(id: string, predictionId: string): Promise<{buffer: Buffer, filename: string}> {
        const document = await this.getCsvDocument(id)
        const prediction = await this.getCsvPrediction(predictionId)
        // TODO optimize query
        const documentRecords = await this.listCsvDocumentRecords(id)
        const predictionRecords = await this.listPredictionRecords(predictionId)

        const values = predictionRecords.map(val => {
            const docRecord: CsvDocumentRecordModel | undefined = first(documentRecords.filter(doc => doc.id === val.csvRecordId))

            if (!docRecord) {
                console.log('Unable to find matching document record: ' + val.csvRecordId)
                return undefined
            }

            return Object.assign({}, JSON.parse(docRecord.data), {predictionValue: val.predictionValue, confidence: val.confidence, id: val.id, predictionId: val.predictionId, agree: val.agree})
        })

        const name = parsePath(document.name).name
        const filename = `${name}-${prediction.model}.csv`

        if (values.length === 0) {
            return {filename, buffer: Buffer.from('')}
        }

        const keys: string[] = Object.keys(values[0])

        const buffer = values.reduce((result: Buffer, current: any) => {
            const row: Buffer = Buffer.from(keys.map(key => '"' + current[key] + '"').join(',') + '\n');

            return Buffer.concat([result, row])
        }, Buffer.from(keys.map(val => '"' + val + '"').join(',') + '\n'))

        return {buffer, filename}
    }

    private async findPredictions(documentId: string): Promise<CsvPredictionModel[]> {

        const predictionResult = this.predictions
            .find({documentId})
            .map((prediction: WithId<MongodbCsvPredictionModel>) => Object.assign(
                {},
                prediction,
                {
                    id: prediction._id.toString(),
                    date: prediction.date.toISOString(),
                    predictionUrl: buildPredictionUrl(documentId, prediction._id.toString()),
                    predictions: []
                })
            )

        return await predictionResult.toArray()
    }

    private async populatePredictionRecords(documentId: string, predictions: CsvPredictionModel[]): Promise<CsvPredictionModel[]> {

        const predictionMap: {[id: string]: CsvPredictionModel} = predictions
            .reduce((result: {[id: string]: CsvPredictionModel}, current: CsvPredictionModel) => {
                result[current.id] = current

                return result
            }, {})

        const predictionRecordResult = this.predictionRecords
            .find({documentId})
            .map((predictionResult: WithId<CsvPredictionResultModel>) => Object.assign({}, predictionResult, {id: predictionResult._id.toString()}))

        const predictionRecords: CsvPredictionResultModel[] = await predictionRecordResult.toArray()

        predictionRecords.forEach(record => {
            const prediction: CsvPredictionModel = predictionMap[record.predictionId]

            if (!prediction) {
                console.log(`Prediction not found: ` + record.predictionId)
                return
            }

            prediction.predictions.push(record)
        })

        return predictions
    }

    private async populateCorrectionRecords(predictions: CsvPredictionModel[]): Promise<CsvPredictionModel[]> {
        const correctionRecords: CsvPredictionCorrectionModel[] = await this.predictionCorrectionRecords
            .find({
                predictionId: {$in: predictions.map(val => val.id)}
            })
            .toArray()
            .then(results => results.map(val => Object.assign({}, val, {id: val._id})))

        return predictions.map(prediction => {
            const corrections = correctionRecords.filter(c => c.predictionId === prediction.id)

            return Object.assign({}, prediction, {corrections})
        })
    }

    private async populatePerformanceSummary(predictions: CsvPredictionModel[]): Promise<CsvPredictionModel[]> {
        return predictions.map(p => Object.assign(
            {},
            p,
            {
                performanceSummary: predictionRecordsToPerformanceSummary(p.predictions, p.corrections)
            }
        ))
    }

    observeCsvPredictionUpdates(): Observable<{action: CsvDocumentEventAction, target: CsvPredictionModel}> {
        return predictionEvents.observable();
    }
}

const predictionToMongodbPrediction = (prediction: CsvDocumentPredictionResult, documentId: string): MongodbCsvPredictionModel => {
    const result: MongodbCsvPredictionModel & CsvDocumentPredictionResult = Object.assign(
        {},
        prediction,
        {
            documentId,
            date: prediction.date ? new Date(prediction.date) : new Date(),
            id: undefined,
            predictions: undefined,
            performanceSummary: undefined
        }) as any

    delete result.id
    delete result.predictions
    delete result.performanceSummary
    delete result.results

    return result
}

const predictionResultsToMongodbPredictionResults = (results: BatchPredictionValue[], documentId: string, predictionId: string, compareFn?: CompareFn): MongodbCsvPredictionResultModel[] => {
    return results.map(predictionResultToMongodbPredictionResult(documentId, predictionId, compareFn))
}

const predictionResultToMongodbPredictionResult = (documentId: string, predictionId: string, compareFn: CompareFn = defaultCompareFn) => {

    console.log('Preparing predictions for mongodb')
    return (result: BatchPredictionValue): MongodbCsvPredictionResultModel => ({
        predictionValue: result.prediction,
        confidence: result.confidence,
        providedValue: result.providedValue,
        agree: compareFn(result.prediction, result.providedValue),
        csvRecordId: result.csvRecordId,
        documentId,
        predictionId,
        id: undefined
    })
}

const predictionRecordsToPerformanceSummary = (records: CsvPredictionResultModel[], corrections: CsvPredictionCorrectionModel[] = []): PerformanceSummaryModel => {
    return records
        .reduce((result: PerformanceSummary, current: CsvPredictionResultModel) => {
            return result.addPrediction(current)
        }, new PerformanceSummary({confidenceThreshold, correctedRecords: corrections.length}))
        .toModel()
}