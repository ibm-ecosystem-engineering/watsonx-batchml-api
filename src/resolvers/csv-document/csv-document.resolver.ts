import {Args, ID, Mutation, Query, Resolver, Subscription} from "@nestjs/graphql";
import {CsvDocument, CsvDocumentRecord, CsvPrediction, PerformanceSummary, Record} from "../../graphql-types";
import {
    CsvDocumentEventAction,
    CsvDocumentEventModel,
    CsvDocumentModel,
    CsvDocumentRecordModel,
    CsvDocumentStatus,
    CsvDocumentStatusFilter, CsvPredictionModel,
    mapDocumentFilterStatus,
    PerformanceSummaryModel
} from "../../models";
import {CsvDocumentApi, CsvDocumentProcessorApi} from "../../services";
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

    @Query(returns => [CsvDocument])
    async listCsvDocuments(
        @Args('status', { nullable: true, type: () => CsvDocumentStatusFilter }) status?: CsvDocumentStatusFilter
    ): Promise<CsvDocumentModel[]> {
        const filterStatus: CsvDocumentStatus | undefined = mapDocumentFilterStatus(status)

        return this.service.listCsvDocuments(filterStatus);
    }

    @Query(returns => CsvDocument)
    async getCvsDocument(
        @Args('id', { type: () => ID }) id: string
    ): Promise<CsvDocumentModel> {
        return this.service.getCvsDocument(id)
    }

    @Query(returns =>  CsvDocumentRecord)
    async listCsvDocumentRecords(
        @Args('id', { type: () => ID }) id: string
    ): Promise<CsvDocumentRecordModel[]> {
        return this.service.listCsvDocumentRecords(id)
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

    @Subscription(() => CsvDocument)
    observeCsvDocumentUpdates() {
        return pubSub.asyncIterator('csvDocuments')
    }

    @Subscription(() => CsvPrediction)
    observeCsvPredictionUpdates() {
        return pubSub.asyncIterator('csvPredictions')
    }
}
