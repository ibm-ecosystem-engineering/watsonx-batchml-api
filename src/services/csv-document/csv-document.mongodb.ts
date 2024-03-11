import {Observable} from "rxjs";
import {Collection, Db, GridFSBucket, ObjectId, OptionalId, WithId} from "mongodb";

import {CsvDocumentApi, CsvDocumentPredictionResult} from "./csv-document.api";
import {
    bufferToStream,
    buildOriginalUrl,
    EventManager,
    parseDocumentRows,
    PerformanceSummary,
} from "./csv-document.support";
import {
    CsvDocumentEventAction,
    CsvDocumentEventModel,
    CsvDocumentInputModel,
    CsvDocumentModel,
    CsvDocumentRecordModel,
    CsvDocumentStatus,
    CsvPredictionModel,
    CsvPredictionResultModel,
    PerformanceSummaryModel
} from "../../models";
import {streamToBuffer} from "../../util";
import {BatchPredictionValue} from "../batch-predictor";

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
    private readonly bucket: GridFSBucket;

    constructor(db: Db) {
        this.documents = db.collection<CsvDocumentModel>('csvDocuments')
        this.documentRecords = db.collection<CsvDocumentRecordModel>('csvDocumentRecords')

        this.predictions = db.collection<CsvPredictionModel>('csvPredictions')
        this.predictionRecords = db.collection<CsvPredictionResultModel>('csvPredictionResults')

        this.bucket = new GridFSBucket(db, {bucketName: 'csvDocuments'})
    }

    async addCsvDocument(input: CsvDocumentInputModel, file: { filename: string; buffer: Buffer; }): Promise<CsvDocumentModel> {

        // insert document
        const document: CsvDocumentModel = await this.insertCsvDocument(input);

        // upload file
        await this.uploadCsvFile(file, document);

        // insert records
        const rows: CsvDocumentRecordModel[] = await parseDocumentRows(
            document.id,
            document.predictField,
            file)
        await this.documentRecords.insertMany(rows)

        return documentEvents.add(document)
    }

    private uploadCsvFile(file: { filename: string; buffer: Buffer }, document: CsvDocumentModel) {
        return new Promise<boolean>((resolve, reject) => {
            bufferToStream(file.buffer)
                .pipe(this.bucket.openUploadStream(`${document.id}-original.csv`, {
                    chunkSizeBytes: 1048576,
                    metadata: {
                        documentId: document.id,
                        name: document.name,
                    }
                }))
                .on('end', () => resolve(true))
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

    async getCsvDocumentRecords(documentId: string): Promise<CsvDocumentRecordModel[]> {
        return await this.documentRecords
            .find({documentId})
            .toArray()
    }

    async addCsvDocumentPrediction(documentId: string, prediction: CsvDocumentPredictionResult): Promise<CsvPredictionModel> {
        const csvPrediction = await this.insertCsvPrediction(prediction, documentId);

        await this.predictionRecords.insertMany(
            predictionResultsToMongodbPredictionResults(prediction.results, documentId, csvPrediction.id)
        )

        documentEvents.update({id: documentId})

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

        const fileId = `${document._id}-${document.name}`

        const buffer = await streamToBuffer(this.bucket.openDownloadStreamByName(fileId))

        return {filename: document.name, buffer}
    }

    async getPredictionPerformanceSummary(predictionId: string): Promise<PerformanceSummaryModel> {
        const rows = await this.predictionRecords
            .find({
                predictionId
            })
            .toArray()

        return predictionRecordsToPerformanceSummary(rows)
    }

    async listCsvDocuments(status?: CsvDocumentStatus): Promise<CsvDocumentModel[]> {

        const query = status ? {status} : {}

        const result = this.documents
            .find(query)
            .map((doc: WithId<CsvDocumentModel>) => Object.assign({}, doc, {id: doc._id}))

        return result.toArray()
    }

    async getCvsDocument(id: string): Promise<CsvDocumentModel> {

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

    async listCsvPredictions(documentId: string): Promise<CsvPredictionModel[]> {

        return this.findPredictions(documentId)
            .then(results => this.populatePredictionRecords(documentId, results))
            .then(results => this.populatePerformanceSummary(results))
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

    private async populatePerformanceSummary(predictions: CsvPredictionModel[]): Promise<CsvPredictionModel[]> {
        return predictions.map(p => Object.assign(
            {},
            p,
            {
                performanceSummary: predictionRecordsToPerformanceSummary(p.predictions)
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

const predictionResultsToMongodbPredictionResults = (results: BatchPredictionValue[], documentId: string, predictionId: string): MongodbCsvPredictionResultModel[] => {
    return results.map(predictionResultToMongodbPredictionResult(documentId, predictionId))
}

const predictionResultToMongodbPredictionResult = (documentId: string, predictionId: string) => {
    return (result: BatchPredictionValue): MongodbCsvPredictionResultModel => ({
        predictionValue: result.prediction,
        confidence: result.confidence,
        providedValue: result.providedValue,
        csvRecordId: result.csvRecordId,
        documentId,
        predictionId,
        id: undefined
    })
}

const predictionRecordsToPerformanceSummary = (records: CsvPredictionResultModel[]): PerformanceSummaryModel => {
    return records
        .reduce((result: PerformanceSummary, current: CsvPredictionResultModel) => {
            return result.addPrediction(current)
        }, new PerformanceSummary({confidenceThreshold}))
        .toModel()
}