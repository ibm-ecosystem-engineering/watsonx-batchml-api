import {Args, ID, Mutation, Query, Resolver, Subscription} from "@nestjs/graphql";
import {
    CsvDocument,
    CsvDocumentRecord,
    CsvPrediction,
    CsvPredictionRecordOptions,
    CsvPredictionResult,
    PaginatedCsvDocumentRecords,
    PaginatedCsvDocuments,
    PaginatedCsvPredictionResults,
    PaginationInput,
    Record
} from "../../graphql-types";
import {
    CsvDocumentEventAction,
    CsvDocumentEventModel,
    CsvDocumentModel,
    CsvDocumentRecordModel,
    CsvDocumentStatus,
    CsvDocumentStatusFilter,
    CsvPredictionModel,
    CsvPredictionResultModel,
    mapDocumentFilterStatus, PaginationInputBuilder, PaginationInputModel, PaginationResultModel
} from "../../models";
import {CsvDocumentApi, CsvDocumentProcessorApi, CsvPredictionRecordOptionsModel} from "../../services";
import {PubSub} from "graphql-subscriptions";

const pubSub = new PubSub();

@Resolver(of => CsvDocument)
export class CsvDocumentResolver {

    constructor(
        private readonly service: CsvDocumentApi,
        private readonly processor: CsvDocumentProcessorApi,
    ) {
        service.observeCsvDocumentUpdates()
            .subscribe({
                next: (val: CsvDocumentEventModel) => {
                    return pubSub.publish('csvDocuments', val);
                }
            })
        service.observeCsvPredictionUpdates()
            .subscribe({
                next: (val: {action: CsvDocumentEventAction, target: CsvPredictionModel}) => {
                    return pubSub.publish('csvPredictions', val)
                }
            })
    }

    @Query(returns => PaginatedCsvDocuments)
    async listCsvDocuments(
        @Args('pagination', {nullable: true, type: () => PaginationInput}) pagination?: PaginationInputModel,
        @Args('status', { nullable: true, type: () => CsvDocumentStatusFilter }) status?: CsvDocumentStatusFilter
    ): Promise<PaginationResultModel<CsvDocumentModel>> {
        const filterStatus: CsvDocumentStatus | undefined = mapDocumentFilterStatus(status)

        return this.service.listCsvDocuments(PaginationInputBuilder(pagination), filterStatus);
    }

    @Query(returns => CsvDocument)
    async getCsvDocument(
        @Args('id', { type: () => ID }) id: string
    ): Promise<CsvDocumentModel> {
        return this.service.getCsvDocument(id)
    }

    @Query(returns =>  PaginatedCsvDocumentRecords)
    async listCsvDocumentRecords(
        @Args('id', { type: () => ID }) id: string,
        @Args('pagination', { type: () => PaginationInput, nullable: true }) pagination?: PaginationInputModel,
    ): Promise<PaginationResultModel<CsvDocumentRecordModel>> {
        return this.service.listCsvDocumentRecords(id, PaginationInputBuilder(pagination))
    }

    @Query(returns =>  PaginatedCsvPredictionResults)
    async listCsvPredictionRecords(
        @Args('id', { type: () => ID }) id: string,
        @Args('pagination', { type: () => PaginationInput, nullable: true }) pagination?: PaginationInputModel,
        @Args('options', {type: () => CsvPredictionRecordOptions, nullable: true}) options?: CsvPredictionRecordOptionsModel
    ): Promise<PaginationResultModel<CsvPredictionResultModel>> {
        return this.service.listPredictionRecords(id, PaginationInputBuilder(pagination), options)
    }

    @Query(returns =>  [CsvPrediction])
    async listCsvPredictions(
        @Args('id', { type: () => ID }) id: string
    ): Promise<CsvPredictionModel[]> {
        return this.service.listCsvPredictions(id)
    }

    @Mutation(returns => Record)
    async deleteCsvDocument(
        @Args('id', { type: () => ID }) id: string
    ): Promise<{id: string}> {
        return this.service.deleteCsvDocument(id)
    }

    @Mutation(returns => CsvPrediction)
    async createCsvPrediction(
        @Args('id', { type: () => ID }) id: string,
        @Args('model', {type: () => String, nullable: true}) model?: string,
    ): Promise<CsvPredictionModel> {
        return this.processor.createCsvPrediction(id, model)
    }

    @Query(returns =>  [CsvPrediction])
    async getCsvPrediction(
        @Args('id', {type: () => ID }) id: string
    ): Promise<CsvPredictionModel> {
        return this.service.getCsvPrediction(id);
    }

    @Subscription(() => CsvDocument)
    observeCsvDocumentUpdates() {
        return pubSub.asyncIterator('csvDocuments')
    }

    @Subscription(() => CsvPrediction)
    observeCsvPredictionUpdates() {
        return pubSub.asyncIterator('csvPredictions')
    }
}
