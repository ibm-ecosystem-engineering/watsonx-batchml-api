import {extname, parse as parsePath} from 'path';
import {Observable} from "rxjs";
import {Collection, Db, Document, GridFSBucket, ObjectId, OptionalId, WithId} from "mongodb";
import {Stream} from "stream";
import {format} from '@fast-csv/format';

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
    StatAggregation,
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
    PaginationInputModel,
    PaginationResultModel,
    PerformanceSummaryModel,
    PredictionPerformanceSummaryModel
} from "../../models";
import {first} from "../../util";
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

const aggregateStats = (stat: keyof PerformanceSummaryModel) => {
    return (docs: Document[]): StatAggregation[] => docs.map(doc => ({predictionId: doc._id, count: doc.count, stat}))
}

const summaryPipeline = (ids: string[], match: Partial<{[key in keyof CsvPredictionResultModel]: unknown}> = {}) => {
    return [
        {$match: {predictionId: {$in: ids}}},
        {$group: {_id: "$predictionId", count: {$sum: 1}}}
    ]
}

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

    async init(): Promise<CsvDocumentMongodb> {
        console.log('Creating indexes')

        await this.documentRecords.createIndex({documentId: 1}, {name: 'documentRecords-documentId'})
            .catch(err => console.log('Error creating index: documentRecords-documentId', err))

        await this.predictions.createIndex({documentId: 1}, {name: 'predictions-documentId'})
            .catch(err => console.log('Error creating index: predictions-documentId', err))

        await this.predictionRecords.createIndex({predictionId: 1}, {name: 'predictionRecords-predictionId'})
            .catch(err => console.log('Error creating index: predictionRecords-predictionId', err))
        await this.predictionRecords.createIndex({predictionId: 1, agree: 1}, {name: 'predictionRecords-predictionId-agree'})
            .catch(err => console.log('Error creating index: predictionRecords-predictionId-agree', err))
        await this.predictionRecords.createIndex({predictionId: 1, confidence: -1}, {name: 'predictionRecords-predictionId-confidence'})
            .catch(err => console.log('Error creating index: predictionRecords-predictionId-confidence', err))
        await this.predictionRecords.createIndex({agree: 1, confidence: -1}, {name: 'predictionRecords-agree-confidence'})
            .catch(err => console.log('Error creating index: predictionRecords-agree-confidence', err))
        await this.predictionRecords.createIndex({predictionId: 1, agree: 1, confidence: -1}, {name: 'predictionRecords-predictionId-agree-confidence'})
            .catch(err => console.log('Error creating index: predictionRecords-predictionId-agree-confidence', err))

        await this.predictionCorrectionRecords.createIndex({documentId: 1}, {name: 'predictionCorrectionRecords-documentId'})
            .catch(err => console.log('Error creating index: predictionRecords-documentId', err))
        await this.predictionCorrectionRecords.createIndex({predictionId: 1}, {name: 'predictionCorrectionRecords-predictionId'})
            .catch(err => console.log('Error creating index: predictionRecords-predictionId', err))

        return this
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

        const originalPredictionRecords: PaginationResultModel<CsvPredictionResultModel> = await this.listPredictionRecords(input.predictionId, {page: 1, pageSize: -1})

        const changedRows: CsvPredictionCorrectionModel[] = rows.filter((row: CsvPredictionCorrectionModel) => {
            const originalRecord = first(originalPredictionRecords.data.filter(record => record.id === row.predictionRecordId))

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

    async listCsvDocumentRecords(documentId: string, {page, pageSize}: PaginationInputModel): Promise<PaginationResultModel<CsvDocumentRecordModel>> {
        const dataFilter = pageSize === -1
            ? [{$skip: (page - 1) * pageSize}]
            : [{$skip: (page - 1) * pageSize}, {$limit: pageSize}]

        const result: Document[] = await this.documentRecords
            .aggregate([
                {
                    $match: {documentId}
                },
                {
                    $facet: {
                        metadata: [{$count: 'totalCount'}],
                        data: dataFilter,
                    },
                }
            ])
            .toArray()

        return {
            metadata: {totalCount: result[0].metadata[0].totalCount, page, pageSize},
            data: result[0].data.map(val => Object.assign({}, val, {id: val._id})),
        }
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

    async getOriginalCsvDocument(id: string): Promise<{filename: string, stream: Stream}> {
        const document = await this.documents.findOne(new ObjectId(id))

        const extension = extname(document.name)
        const fileId = `${document._id}-original${extension}`

        return {stream: this.bucket.openDownloadStreamByName(fileId), filename: document.name}
    }

    async getPredictionPerformanceSummary(predictionId: string): Promise<PredictionPerformanceSummaryModel> {
        const result = await this.getPredictionPerformanceSummaries([predictionId])

        if (result.length === 0) {
            throw new Error('Performance summary missing!')
        }

        return result[0]
    }

    async getPredictionPerformanceSummaries(predictionIds: string[]): Promise<PredictionPerformanceSummaryModel[]> {
        return await this.calculateSummaryMatrix(predictionIds)
    }

    private async calculateSummaryMatrix(predictionIds: string[]): Promise<PredictionPerformanceSummaryModel[]> {
        // {$match: {predictionId: {$in: ids}}},
        // {$group: {_id: "$predictionId", count: {$sum: 1}}}

        const result = first(await this.predictionRecords
            .aggregate([
                {
                    $match: {predictionId: {$in: predictionIds}}
                },
                {
                    $facet: {
                        totalCount: [
                            {$group: {_id: "$predictionId", count: {$sum: 1}}}
                        ],
                        agreeAboveThreshold: [
                            {$match: {agree: true, confidence: {$gte: confidenceThreshold}}},
                            {$group: {_id: "$predictionId", count: {$sum: 1}}}
                        ],
                        agreeBelowThreshold: [
                            {$match: {agree: true, confidence: {$lt: confidenceThreshold}}},
                            {$group: {_id: "$predictionId", count: {$sum: 1}}}
                        ],
                        disagreeAboveThreshold: [
                            {$match: {agree: false, confidence: {$gte: confidenceThreshold}}},
                            {$group: {_id: "$predictionId", count: {$sum: 1}}}
                        ],
                        disagreeBelowThreshold: [
                            {$match: {agree: false, confidence: {$lt: confidenceThreshold}}},
                            {$group: {_id: "$predictionId", count: {$sum: 1}}}
                        ]
                    }
                }
            ])
            .toArray())

        const correctedRecords: StatAggregation[] = await this.predictionCorrectionRecords
            .aggregate(summaryPipeline(predictionIds))
            .toArray()
            .then(aggregateStats('correctedRecords'));

        return Object.keys(result)
            .flatMap((stat: keyof PerformanceSummaryModel): StatAggregation => {
                return result[stat].map((val: Document): StatAggregation => ({predictionId: val._id, count: val.count, stat}))
            })
            .concat(correctedRecords)
            .reduce((result: PerformanceSummary[], current: StatAggregation) => {
                let currentSummary: PerformanceSummary = first(result.filter(val => val.predictionId === current.predictionId))
                if (!currentSummary) {
                    currentSummary = new PerformanceSummary({predictionId: current.predictionId, confidenceThreshold})

                    result.push(currentSummary)
                }

                currentSummary.addStat(current)

                return result
            }, [])
    }

    async listCsvDocuments({page, pageSize}: PaginationInputModel, status?: CsvDocumentStatus): Promise<PaginationResultModel<CsvDocumentModel>> {

        const pipeline = []

        if (status) {
            pipeline.push({$match: {status}})
        }

        const dataFilter = pageSize === -1
            ? [{$skip: (page - 1) * pageSize}]
            : [{$skip: (page - 1) * pageSize}, {$limit: pageSize}]

        pipeline.push({
            $facet: {
                metadata: [{$count: 'totalCount'}],
                data: dataFilter,
            },
        })

        const results: Document[] = await this.documents
            .aggregate(pipeline)
            .toArray()

        return {
            metadata: {totalCount: results[0].metadata[0].totalCount, page, pageSize},
            data: results[0].data.map(val => Object.assign({}, val, {id: val._id})),
        }

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

    async listPredictionRecords(predictionId: string, {page, pageSize}: PaginationInputModel, {filter}: CsvPredictionRecordOptionsModel = {}): Promise<PaginationResultModel<CsvPredictionResultModel>> {

        const query: Partial<{[k in keyof CsvPredictionResultModel]: unknown}> = {predictionId}

        if (filter === CsvPredictionRecordFilter.DisagreeBelowConfidence || filter === CsvPredictionRecordFilter.AllBelowConfidence) {
            query['confidence'] = {$lt: confidenceThreshold}
        }
        if (filter === CsvPredictionRecordFilter.AllDisagree || filter === CsvPredictionRecordFilter.DisagreeBelowConfidence) {
            query['agree'] = false
        }

        console.log('Querying prediction records: ', {filter, query, page, pageSize})

        const dataFilter = pageSize === -1
            ? [{$skip: (page - 1) * pageSize}]
            : [{$skip: (page - 1) * pageSize}, {$limit: pageSize}]

        const results = await this.predictionRecords
            .aggregate([
                {
                    $match: query
                },
                {
                    $addFields: {
                        recordId: { $toObjectId: '$csvRecordId' },
                        id: { $toString: '$_id' },
                    }
                },
                {
                    $lookup: {
                        from: 'documentRecords',
                        localField: 'recordId',
                        foreignField: '_id',
                        as: 'csvRecord'
                    }
                },
                {
                    $replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ "$csvRecord", 0 ] }, "$$ROOT" ] } }
                },
                {
                    $facet: {
                        metadata: [{$count: 'totalCount'}],
                        data: dataFilter,
                    },
                }
            ])
            .toArray()

        return {
            metadata: {totalCount: results[0].metadata[0].totalCount, page, pageSize},
            data: results[0].data,
        }
    }

    async listCsvPredictions(documentId: string): Promise<CsvPredictionModel[]> {

        return this.findPredictions(documentId)
            .then(async results => {
                const summaries = await this.getPredictionPerformanceSummaries(results.map(val => val.id))

                return results.map(val => {
                    val.performanceSummary = first(summaries.filter(s => val.id === s.predictionId))

                    return val
                })
            })
            // .then(results => this.populatePredictionRecords(documentId, results))
            // .then(results => this.populateCorrectionRecords(results))
            // .then(results => this.populatePerformanceSummary(results))
    }

    async getCsvPrediction(predictionId: string): Promise<CsvPredictionModel> {
        const result = await this.predictions.findOne(new ObjectId(predictionId))

        return Object.assign({}, result, {id: result._id})
    }

    async getPredictionDocument(id: string, predictionId: string): Promise<{stream: Stream, filename: string}> {
        const document = await this.getCsvDocument(id)
        const prediction = await this.getCsvPrediction(predictionId)

        const name = parsePath(document.name).name
        const filename = `${name}-${prediction.model}.csv`

        console.log('Creating stream')
        const stream = format({ headers: true })

        console.log('Getting prediction records')
        this.predictionRecords
            .aggregate([
                {
                    $match: {predictionId}
                },
                {
                    $addFields: {
                        recordId: { $toObjectId: '$csvRecordId' },
                        id: { $toString: '$_id' },
                    }
                },
                {
                    $lookup: {
                        from: 'documentRecords',
                        localField: 'recordId',
                        foreignField: '_id',
                        as: 'csvRecord'
                    }
                },
                {
                    $replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ "$csvRecord", 0 ] }, "$$ROOT" ] } }
                },
                {
                    $unset: ['data', 'csvRecord', '_id', 'csvRecordId', 'recordId', 'predictionId', 'documentId']
                },
            ])
            .stream()
            .pipe(stream)

        return {stream, filename}
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
