import {extname, parse as parsePath} from 'path';
import {Observable} from "rxjs";
import {Collection, Db, Document, GridFSBucket, ObjectId, OptionalId, WithId} from "mongodb";
import {PassThrough, Stream} from "stream";
import {format} from '@fast-csv/format';
import {read as readXls, WorkBook, WorkSheet, write as writeXls} from "xlsx";

import {CsvDocumentApi, CsvDocumentPredictionResult, CsvPredictionRecordOptionsModel} from "./csv-document.api";
import {
    bufferToStream,
    CompareFn,
    defaultCompareFn,
    PerformanceSummary,
    StatAggregation,
} from "./csv-document.support";
import {buildOriginalUrl, buildPredictionUrl} from "./csv-document.config";
import {AiModelApi} from "../ai-model";
import {BatchPredictionValue} from "../batch-predictor";
import {
    AIModelModel,
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
    PaginationMetadataModel,
    PaginationResultModel,
    PerformanceSummaryModel,
    PredictionPerformanceSummaryModel
} from "../../models";
import {first, notEmpty, Optional, streamToBuffer} from "../../util";
import {MetricsApi} from "../metrics";
import {PubSubApi} from "../pub-sub";
import {CsvDocumentAbstract} from "./csv-document.abstract";

interface InternalCsvDocumentModel extends CsvDocumentInputModel {
    id: string;
    status: CsvDocumentStatus;
    originalUrl: string;
}

const confidenceThreshold: number = 0.75

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

interface SummaryFacet {
    totalCount: number[],
    agreeAboveThreshold: number[],
    agreeBelowThreshold: number[],
    disagreeAboveThreshold: number[],
    disagreeBelowThreshold: number[]
}

const buildPaginationMetadata = ({totalCount, page, pageSize}: {totalCount: number, page: number, pageSize: number}): PaginationMetadataModel => {
    return {
        totalCount,
        page,
        pageSize,
        hasMore: (page * pageSize) < totalCount
    }
}

export class CsvDocumentMongodb extends CsvDocumentAbstract<CsvDocumentMongodb> implements CsvDocumentApi {
    private readonly documents: Collection<CsvDocumentModel>;
    private readonly documentRecords: Collection<CsvDocumentRecordModel>;
    private readonly predictions: Collection<CsvPredictionModel>;
    private readonly predictionRecords: Collection<CsvPredictionResultModel>;
    private readonly predictionCorrectionRecords: Collection<CsvPredictionCorrectionModel>;
    private readonly bucket: GridFSBucket;

    constructor(db: Db, private readonly aiModelApi: AiModelApi, private readonly metricsApi: MetricsApi, pubSubApi: PubSubApi) {
        super(pubSubApi)

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

    async insertCsvDocumentRecords(records: CsvDocumentRecordModel[]): Promise<string[]> {
        const result = await this.documentRecords.insertMany(records)

        return Object.values(result.insertedIds).map(id => id.toString())
    }

    async insertCsvPredictionRecords(records: CsvPredictionCorrectionModel[]): Promise<string[]> {
        const result = await this.predictionCorrectionRecords.insertMany(records)

        return Object.values(result.insertedIds).map(id => id.toString())
    }

    async uploadDocumentFile(file: { filename: string; buffer: Buffer }, document: CsvDocumentModel): Promise<{stream: Stream, filename: string}> {
        console.log('Getting extension for filename: ' + document.name)
        const extension = extname(document.name)

        const fileId = await new Promise<string | undefined>((resolve, reject) => {
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

        return {stream: this.bucket.openDownloadStreamByName(fileId), filename: document.name}
    }

    async uploadUpdatedCsvFile(file: { filename: string; buffer: Buffer }, document: CsvUpdatedDocumentInputModel): Promise<string | undefined> {
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

    async insertCsvDocument(input: CsvDocumentInputModel): Promise<CsvDocumentModel> {
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
        page = page > 0 ? page : 1
        pageSize = pageSize !== -1 ? pageSize : Number.MAX_SAFE_INTEGER

        const totalCount = await this.documentRecords.countDocuments({documentId})
        const result: Document[] = await this.documentRecords
            .aggregate([
                {
                    $match: {documentId}
                },
                {
                    $skip: (page - 1) * pageSize
                },
                {
                    $limit: pageSize
                }
            ])
            .toArray()

        console.log('  Results length: ' + result.length)

        return {
            metadata: buildPaginationMetadata({totalCount, page, pageSize}),
            data: result.map(val => Object.assign({}, val, {id: val._id})) as any,
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
            .then(() => this.documentEvents.update({id: documentId}))

        return this.predictionEvents.add(csvPrediction);
    }

    async insertCsvPrediction(prediction: CsvDocumentPredictionResult, documentId: string): Promise<CsvPredictionModel> {
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

    async calculateSummaryMatrix(predictionIds: string[]): Promise<PredictionPerformanceSummaryModel[]> {
        // {$match: {predictionId: {$in: ids}}},
        // {$group: {_id: "$predictionId", count: {$sum: 1}}}

        let page: number = 0;
        const limit: number = 50000;
        let results: StatAggregation[] = []
        let more: boolean = true
        while (more) {
            const {stats, more: _more} = await this.getPredictionSummaryDocument(predictionIds, page, limit)

            more = _more
            page = page + 1
            results = results.concat(stats)
        }

        const correctedRecords: StatAggregation[] = await this.predictionCorrectionRecords
            .aggregate(summaryPipeline(predictionIds))
            .toArray()
            .then(aggregateStats('correctedRecords'));

        return results
            .concat(correctedRecords)
            .reduce((result: PerformanceSummary[], current: StatAggregation) => {
                const currentSummary: PerformanceSummary = first(result.filter(val => val.predictionId === current.predictionId))
                    .orElseGet(() => {
                        const value = new PerformanceSummary({predictionId: current.predictionId, confidenceThreshold})

                        result.push(value)

                        return value
                    })

                currentSummary.addStat(current)

                return result
            }, [])
            .map(val => val.toModel())
    }

    async getPredictionSummaryDocument(predictionIds: string[], page: number, limit: number): Promise<{stats: StatAggregation[], more: boolean}> {
        console.log('Getting prediction summary document: ', {predictionIds, page, limit})

        const result: SummaryFacet = first(await this.predictionRecords
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
            .map(val => val as SummaryFacet)
            .orElseThrow(() => new Error('Performance summary results missing'))

        console.log('Summary result: ', result)

        const stats: StatAggregation[] = Object.keys(result)
            .flatMap((stat: keyof PerformanceSummaryModel): StatAggregation => {
                return result[stat].map((val: Document): StatAggregation => ({predictionId: val._id, count: val.count, stat}))
            })

        const totalCount: number = stats
            .filter(val => val.stat === 'totalCount')
            .reduce((result: number, current: StatAggregation) => {
                return result + current.count
            }, 0)

        return {
            stats,
            more: false,
        }
    }

    async listCsvDocuments({page, pageSize}: PaginationInputModel, status?: CsvDocumentStatus): Promise<PaginationResultModel<CsvDocumentModel>> {

        const pipeline = []

        if (status) {
            pipeline.push({$match: {status}})
        } else {
            pipeline.push({$match: {status: {$ne: CsvDocumentStatus.Deleted}}})
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

        type MetadataType = {totalCount: number}

        const result: Optional<Document> = Optional
            .ofNullable(await this.documents.aggregate(pipeline).toArray())
            .filter(notEmpty)
            .flatMap(first)

        const totalCount: number = result
            .walk<MetadataType[]>('metadata')
            .filter(notEmpty)
            .flatMap<MetadataType>(first)
            .walk<number>('totalCount')
            .orElse(0)

        const data: WithId<CsvDocumentModel>[] = result
            .walk<WithId<CsvDocumentModel>[]>('data')
            .orElse([])

        return {
            metadata: buildPaginationMetadata({totalCount, page, pageSize}),
            data: data.map(val => Object.assign({}, val, {id: val._id})),
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

        return this.documentEvents.delete({id: result.upsertedId.toString()})
    }

    observeCsvDocumentUpdates(): Observable<CsvDocumentEventModel> {
        return this.documentEvents.observable();
    }

    async listPredictionRecords(predictionId: string, {page, pageSize}: PaginationInputModel, {filter}: CsvPredictionRecordOptionsModel = {}): Promise<PaginationResultModel<CsvPredictionResultModel>> {

        const query: Partial<{[k in keyof CsvPredictionResultModel]: unknown}> = {predictionId}

        if (filter === CsvPredictionRecordFilter.DisagreeBelowConfidence || filter === CsvPredictionRecordFilter.AllBelowConfidence) {
            query['confidence'] = {$lt: confidenceThreshold}
        } else if (filter === CsvPredictionRecordFilter.DisagreeAboveConfidence) {
            query['confidence'] = {$gte: confidenceThreshold}
        }

        if (filter === CsvPredictionRecordFilter.AllDisagree || filter === CsvPredictionRecordFilter.DisagreeBelowConfidence || filter === CsvPredictionRecordFilter.DisagreeAboveConfidence) {
            query['agree'] = false
        }

        console.log('Querying prediction records: ', {filter, query, page, pageSize})

        const results = await this.predictionRecords
            .aggregate([
                {
                    $match: query,
                },
                {
                    $facet: {
                        metadata: [
                            {
                                $count: 'totalCount',
                            }
                        ],
                        data: [
                            {
                                $skip: (page -1 ) * pageSize,
                            },
                            {
                                $limit: pageSize === -1 ? Number.MAX_SAFE_INTEGER : pageSize,
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
                        ]
                    }
                }
            ])
            .toArray()

        return {
            metadata: buildPaginationMetadata({totalCount: results[0].metadata[0].totalCount, page, pageSize}),
            data: results[0].data,
        }
    }

    async listCsvPredictions(documentId: string): Promise<CsvPredictionModel[]> {

        return this.findPredictions(documentId)
            .then(async results => {
                const summaries = await this.getPredictionPerformanceSummaries(results.map(val => val.id))

                return results.map(val => {
                    val.performanceSummary = first(summaries.filter(s => val.id === s.predictionId))
                        .orElse(undefined)

                    return val
                })
            })
    }

    async getCsvPrediction(predictionId: string): Promise<CsvPredictionModel> {
        const result = await this.predictions.findOne(new ObjectId(predictionId))

        return Object.assign({}, result, {id: result._id})
    }

    async getPredictionDocument(id: string, predictionId: string): Promise<{stream: Stream, filename: string}> {
        const document: CsvDocumentModel = await this.getCsvDocument(id)
        const prediction: CsvPredictionModel = await this.getCsvPrediction(predictionId)

        const extension = extname(document.name)

        if (extension === '.csv') {
            return this.getPredictionCsvDocument(document, prediction)
        } else {
            return this.getPredictionExcelDocument(document, prediction)
        }
    }

    private async getPredictionCsvDocument(document: CsvDocumentModel, prediction: CsvPredictionModel): Promise<{stream: Stream, filename: string}> {
        const name = parsePath(document.name).name

        const filename = `${name}-${prediction.model}.csv`

        console.log('Creating CSV stream')
        const stream = format({ headers: true })

        console.log('Getting prediction records for CSV file: ', prediction)
        this.predictionRecords
            .aggregate([
                {
                    $match: { predictionId: prediction.id.toString() }
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

    private async getPredictionExcelDocument(document: CsvDocumentModel, prediction: CsvPredictionModel): Promise<{stream: Stream, filename: string}> {
        const modelConfig: AIModelModel = await this.aiModelApi.findAIModel(prediction.model)

        const name = parsePath(document.name).name
        const extension = extname(document.name).replace(/^[.]/, '')

        const filename = `${name}-${prediction.model}.${extension}`

        console.log('Creating stream')
        const stream = new PassThrough()

        this.streamPredictionDocument(document, prediction, modelConfig, extension, stream)
            .then(result => console.log('Prediction document streaming completed: ', {filename, result}))
            .catch(err => {
                console.log('Error streaming prediction document: ', err)
                stream.end()
            })

        return {stream, filename}
    }

    private async streamPredictionDocument(document: CsvDocumentModel, prediction: CsvPredictionModel, modelConfig: AIModelModel, extension: string, stream: PassThrough): Promise<boolean> {

        // get original document stream
        console.log('Getting original document stream')
        const {stream : inStream} = await this.getOriginalCsvDocument(document.id)

        console.log('Reading original xls')
        const workbook: WorkBook = readXls(await streamToBuffer(inStream), {type: 'buffer'})

        console.log('Getting prediction records')
        const results: Document[] = await this.predictionRecords
            .aggregate([
                {
                    $match: { predictionId: prediction.id.toString() }
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
            .toArray()

        console.log('Getting worksheet: ' + document.worksheetName)
        const sheet: WorkSheet = workbook.Sheets[document.worksheetName]
        console.log('Getting start row: ' + document.worksheetStartRow)
        const startRow = parseInt(document.worksheetStartRow || '0')

        type CellMetadata = {column: string, row: number, key: string}

        console.log('Processing cells')

        const rowCellRegEx = /([A-Za-z]+)([0-9]+)/
        const cells: CellMetadata[] = Object.keys(sheet)
            .map(key => {
                if (key.startsWith('!')) {
                    return undefined
                }

                const match = rowCellRegEx.exec(key)

                if (match.length < 3) {
                    console.log('Match not found: ' + key)
                    return undefined
                }

                if (!match[2] || isNaN(parseInt(match[2]))) {
                    console.log('Row value could not be parsed as an int: ' + match[2])
                    return undefined
                }

                return {
                    column: match[1],
                    row: parseInt(match[2]) - 1,
                    key,
                }
            })
            .filter(val => !!val)

        console.log('Finding column name: ', {cells: cells})

        type CellValue = {t: string, v: string, w: string, f: string}
        const labelCell: CellMetadata = first(cells
            .filter(cell => {
                const value: CellValue = sheet[cell.key]

                const match = value.v === modelConfig.label
                if (match) {
                    console.log('Found matching cell: ', {cell, value, match})
                }

                return match
            }))
            .orElse(undefined)

        if (!labelCell) {
            console.log('Unable to find column for label: ' + modelConfig.label)
            throw new Error('Unable to find column for label: ' + modelConfig.label)
        }

        console.log('Set prediction values on worksheet')
        let currentRow = labelCell.row + 1;
        results.forEach((result: Document) => {
            const rowIndex = currentRow++

            const rowLabel = '' + (rowIndex + 1)
            const key = labelCell.column + rowLabel

            if (!key) {
                console.log('Unable to find matching cell: ' + labelCell.column + (rowIndex + 1))
                return
            }

            const cell: CellValue = sheet[key] || {t: 's', v: '', w: ''}

            cell.v = result.predictionValue
        })

        console.log('Writing buffer to stream')
        bufferToStream(writeXls(workbook, {type: 'buffer', bookType: extension as any})).pipe(stream)

        return true
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
        return this.predictionEvents.observable();
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
