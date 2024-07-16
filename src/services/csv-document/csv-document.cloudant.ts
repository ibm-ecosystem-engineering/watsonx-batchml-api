import {Observable} from "rxjs";
import {Stream} from "stream";
import {CloudantV1} from "@ibm-cloud/cloudant";

import {CsvDocumentApi, CsvDocumentPredictionResult, CsvPredictionRecordOptionsModel} from "./csv-document.api";
import {CloudantBackendConfig, cloudantClient} from "../../backends";
import {
    CsvDocumentEventAction,
    CsvDocumentEventModel,
    CsvDocumentInputModel,
    CsvDocumentModel,
    CsvDocumentRecordModel,
    CsvDocumentStatus,
    CsvPredictionCorrectionModel,
    CsvPredictionModel,
    CsvPredictionResultModel,
    CsvUpdatedDocumentInputModel,
    PaginationInputModel,
    PaginationResultModel,
    PerformanceSummaryModel
} from "../../models";
import {CsvDocumentAbstract} from "./csv-document.abstract";
import {PubSubApi} from "../pub-sub";
import {buildOriginalUrl} from "./csv-document.config";

const databases = {};

const documentsDb: string = 'documents';
const documentRecordsDb: string = 'documentRecords';
const predictionsDb: string = 'predictions';
const predictionRecordsDb: string = 'predictionRecords';
const predictionCorrectionRecordsDb: string = 'predictionCorrectionRecords';

const asObject = <T extends {id: string, _rev: string} = any> (response: CloudantV1.Response<CloudantV1.Document>): T => {
    return Object.assign(
        {},
        response.result,
        {
            id: response.result._id,
            _rev: response.result._rev
        }) as T
}

const asCloudantDoc = <T extends {id: string, _rev?: string}, R extends (Omit<T, 'id'> & {_id: string})> (input: T): R => {
    const _id = input.id;

    delete input.id

    return Object.assign({}, input, {_id}) as any
}

export class CsvDocumentCloudant extends CsvDocumentAbstract<CsvDocumentCloudant> implements CsvDocumentApi {
    private readonly client: CloudantV1;

    constructor(config: CloudantBackendConfig, pubSubApi: PubSubApi) {
        super(pubSubApi)

        this.client = cloudantClient(config);
    }

    async init(): Promise<CsvDocumentCloudant> {
        return this
    }

    async getDatabase(db: string): Promise<string> {
        if (databases[db]) {
            return db;
        }

        return this.client
            .putDatabase({db})
            .then(() => {
                // TODO create design document

                databases[db] = true;
                return db;
            })
            .catch(err => {
                if (err.code === 412) {
                    databases[db] = true;
                    return db;
                }

                console.error('Error creating database: ', {err});

                throw err;
            })
    }

    async listCsvDocuments({page, pageSize}: PaginationInputModel, status?: CsvDocumentStatus): Promise<PaginationResultModel<CsvDocumentModel>> {

        const db: string = await this.getDatabase(documentsDb)

        return this.client
            .postAllDocs({
                db,
                includeDocs: true,
                limit: pageSize,
                skip: (page - 1) * pageSize,
            })
            .then((response: CloudantV1.Response<CloudantV1.AllDocsResult>) => ({
                data: response.result.rows.map(val => Object.assign({}, val.doc, {id: val.id}) as CsvDocumentModel),
                totalCount: response.result.totalRows,
            })
            )
            .then(({data, totalCount}: {data: CsvDocumentModel[], totalCount: number}): PaginationResultModel<CsvDocumentModel> => ({
                metadata: {
                    totalCount,
                    hasMore: hasMore(page, pageSize, totalCount),
                    pageSize,
                    page
                },
                data,
            }))
    }

    async getCsvDocument(docId: string): Promise<CsvDocumentModel> {

        const db = await this.getDatabase(documentsDb);

        return this.client
            .getDocument({
                db,
                docId
            })
            .then(asObject)
    }

    async deleteCsvDocument(docId: string): Promise<{ id: string; }> {

        const db = await this.getDatabase(documentsDb);

        const document = await this.getCsvDocument(docId);

        const updatedCase = await this.client
            .postDocument({
                db,
                document: asCloudantDoc(Object.assign({}, document, {status: CsvDocumentStatus.Deleted}))
            })
            .catch(err => {
                console.error('Error updating case: ', {err, document, cloudantDocument: asCloudantDoc(document)});

                throw err;
            });

        return {id: document.id};
    }


    async listCsvDocumentRecords(documentId: string, {page, pageSize}: PaginationInputModel): Promise<PaginationResultModel<CsvDocumentRecordModel>> {
        page = page > 0 ? page : 1
        pageSize = pageSize !== -1 ? pageSize : Number.MAX_SAFE_INTEGER

        const db = await this.getDatabase(documentRecordsDb)

        return this.client
            .postAllDocs({
                db,
                includeDocs: true,
                limit: pageSize,
                skip: (page - 1) * pageSize,
            })
            .then((response: CloudantV1.Response<CloudantV1.AllDocsResult>) => ({
                    data: response.result.rows.map(val => Object.assign({}, val.doc, {id: val.id}) as CsvDocumentRecordModel),
                    totalCount: response.result.totalRows,
                })
            )
            .then(({data, totalCount}: {data: CsvDocumentRecordModel[], totalCount: number}): PaginationResultModel<CsvDocumentRecordModel> => ({
                metadata: {
                    totalCount,
                    hasMore: hasMore(page, pageSize, totalCount),
                    pageSize,
                    page
                },
                data,
            }))
    }

    async addCsvDocumentPrediction(documentId: string, prediction: CsvDocumentPredictionResult): Promise<CsvPredictionModel> {
        throw new Error("Method not implemented.");
    }
    async listCsvPredictions(documentId: string): Promise<CsvPredictionModel[]> {
        throw new Error("Method not implemented.");
    }
    async getPredictionPerformanceSummary(predictionId: string): Promise<PerformanceSummaryModel> {
        throw new Error("Method not implemented.");
    }
    async listPredictionRecords(predictionId: string, {page, pageSize}: PaginationInputModel, {filter}: CsvPredictionRecordOptionsModel = {}): Promise<PaginationResultModel<CsvPredictionResultModel>> {
        throw new Error("Method not implemented.");
    }
    async getPredictionDocument(id: string, predictionId: string, name: string): Promise<{ stream: Stream; filename: string; }> {
        throw new Error("Method not implemented.");
    }
    async getCsvPrediction(predictionId: string): Promise<CsvPredictionModel> {
        throw new Error("Method not implemented.");
    }

    async getOriginalCsvDocument(id: string): Promise<{ filename: string; stream: Stream; }> {
        throw new Error("Method not implemented.");
    }

    observeCsvDocumentUpdates(): Observable<CsvDocumentEventModel<{ id: string; }>> {
        throw new Error("Method not implemented.");
    }
    observeCsvPredictionUpdates(): Observable<{ action: CsvDocumentEventAction; target: CsvPredictionModel; }> {
        throw new Error("Method not implemented.");
    }

    async insertCsvDocument(input: CsvDocumentInputModel): Promise<CsvDocumentModel> {

        const db = await this.getDatabase(documentsDb)

        const document = Object.assign(
            {},
            input,
            {
                status: CsvDocumentStatus.InProgress,
                originalUrl: '',
                id: undefined,
            }
        )

        const result: CsvDocumentModel = await this.client
            .postDocument({
                db,
                document
            })
            .then(response => {
                const result = response.result;

                if (result.ok) {
                    return Object.assign({}, document, {id: result.id})
                }

                throw new Error('Error creating case: ' + result.error);
            })

        return Object.assign(
            {},
            document,
            {
                id: result.id,
                originalUrl: buildOriginalUrl(result.id, document.name)
            });

    }

    async uploadDocumentFile(file: { filename: string; buffer: Buffer; }, document: CsvDocumentModel): Promise<{ stream: Stream; filename: string; }> {
        throw new Error("Method not implemented.");
    }
    async uploadUpdatedCsvFile(file: { filename: string; buffer: Buffer; }, document: CsvUpdatedDocumentInputModel): Promise<string> {
        throw new Error("Method not implemented.");
    }
    async insertCsvDocumentRecords(records: CsvDocumentRecordModel[]): Promise<string[]> {
        throw new Error("Method not implemented.");
    }
    async insertCsvPredictionRecords(records: CsvPredictionCorrectionModel[]): Promise<string[]> {
        throw new Error("Method not implemented.");
    }

}


const hasMore = (page: number, pageSize: number, totalCount: number): boolean => {
    return page * pageSize < totalCount;
}
