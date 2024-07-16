import {Stream} from "stream";

import {CsvDocumentApi, TOPIC_CSV_DOCUMENT, TOPIC_PREDICTION} from "./csv-document.api";
import {
    defaultCompareFn,
    EventManager,
    FileInfo,
    parsePredictionRows,
    streamDocumentRows
} from "./csv-document.support";
import {
    CsvDocumentInputModel,
    CsvDocumentModel,
    CsvDocumentRecordModel,
    CsvDocumentStatus,
    CsvPredictionCorrectionModel,
    CsvPredictionModel,
    CsvPredictionResultModel,
    CsvUpdatedDocumentInputModel,
    PaginationResultModel
} from "../../models";
import {PubSubApi} from "../pub-sub";
import {first} from "../../util";

export abstract class CsvDocumentAbstract<T> extends CsvDocumentApi {

    readonly documentEvents: EventManager<CsvDocumentModel>
    readonly predictionEvents: EventManager<CsvPredictionModel>

    protected constructor(private readonly pubSubApi: PubSubApi) {
        super();

        this.documentEvents = new EventManager<CsvDocumentModel>(pubSubApi, TOPIC_CSV_DOCUMENT)
        this.predictionEvents = new EventManager<CsvPredictionModel>(pubSubApi, TOPIC_PREDICTION)
    }

    abstract init(): Promise<T>;

    async addCsvDocument(input: CsvDocumentInputModel, file: { filename: string; buffer: Buffer }): Promise<CsvDocumentModel> {

        // insert document
        const document: CsvDocumentModel = await this.insertCsvDocument(Object.assign(input, {status: CsvDocumentStatus.InProgress}));

        // upload file
        const {stream} = await this.uploadDocumentFile(file, document);

        // insert records
        console.log('Parsing rows from doc')
        const documentRowStream = await streamDocumentRows(document, {filename: document.name, stream})

        const rowsBatchSize: number = 30000
        let rows: CsvDocumentRecordModel[] = []

        documentRowStream.on('readable', () => {
            let row;
            while((row = (documentRowStream as any).read()) !== null) {
                rows.push(row)

                if (rows.length >= rowsBatchSize) {
                    console.log('Inserting records: ', rows.length)
                    this.insertCsvDocumentRecords(rows.slice())
                    rows = []
                }
            }
        })
        documentRowStream.on('end', async () => {
            console.log('End of document record stream')
            if (rows.length > 0) {
                console.log('Inserting records: ', rows.length)
                await this.insertCsvDocumentRecords(rows.slice())
            }

            this.documentEvents.add(document)
        })
        documentRowStream.on('error', err => console.log('Error inserting rows', err))

        return document
    }

    async addCorrectedCsvDocument(input: CsvUpdatedDocumentInputModel, file: FileInfo): Promise<CsvDocumentModel> {
        console.log('Uploading updated CSV file to database')
        const filename = await this.uploadUpdatedCsvFile(file, input);

        const rows: CsvPredictionCorrectionModel[] = await parsePredictionRows(input, file)

        const originalPredictionRecords: PaginationResultModel<CsvPredictionResultModel> = await this.listPredictionRecords(input.predictionId, {page: 1, pageSize: -1})

        const changedRows: CsvPredictionCorrectionModel[] = rows.filter((row: CsvPredictionCorrectionModel) => {
            const originalRecord = first(originalPredictionRecords.data.filter(record => record.id === row.predictionRecordId))

            if (originalRecord.notPresent()) {
                console.log('  Unable to find original prediction record: ' + row.predictionRecordId)
                return false
            }

            return !defaultCompareFn(originalRecord.map(val => val.predictionValue).get(), row.predictionValue)
        })

        if (changedRows.length === 0) {
            console.log('  No changed rows found! Nothing to store')
            return undefined
        } else {
            console.log('  Found changed rows: ' + changedRows.length)
        }

        await this.insertCsvPredictionRecords(changedRows)

        return undefined
    }

    abstract insertCsvDocument(input: CsvDocumentInputModel): Promise<CsvDocumentModel>
    abstract uploadDocumentFile(file: { filename: string; buffer: Buffer }, document: CsvDocumentModel): Promise<{stream: Stream, filename: string}>
    abstract uploadUpdatedCsvFile(file: { filename: string; buffer: Buffer }, document: CsvUpdatedDocumentInputModel): Promise<string | undefined>
    abstract insertCsvDocumentRecords(records: CsvDocumentRecordModel[]): Promise<string[]>
    abstract insertCsvPredictionRecords(records: CsvPredictionCorrectionModel[]): Promise<string[]>
}