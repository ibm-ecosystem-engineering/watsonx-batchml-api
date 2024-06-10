import {Collection, Db, InsertManyResult, ObjectId, WithId} from "mongodb";

import {AiModelApi} from "./ai-model.api";
import { AIModelModel } from "src/models";
import {AiModelMock} from "./ai-model.mock";

export class AiModelMongodb implements AiModelApi {
    private readonly models: Collection<AIModelModel>;

    constructor(db: Db) {
        this.models = db.collection("aiModels");
    }

    async init(): Promise<AiModelMongodb> {
        await this.models.createIndex({name: 1}, {name: 'aiModels.name'});
        await this.models.createIndex({deploymentId: 1}, {name: 'aiModels.deploymentId'});

        const aiModelCount = await this.models.countDocuments();
        if (aiModelCount === 0) {
            const mock = new AiModelMock();

            await this.addAIModels(await mock.listAIModels())
        }

        console.log('AI Model: ', await this.findAIModel('tax_withholding_v5'))

        return this;
    }

    async addAIModels(inputs: Omit<AIModelModel, "id">[]): Promise<AIModelModel[]> {
        const newModels = inputs.map(val => Object.assign({}, val, {id: undefined}));

        const results: InsertManyResult<AIModelModel> = await this.models.insertMany(newModels)

        return newModels
            .map((val: Omit<AIModelModel, "id">, index: number) => Object.assign(
                {},
                val,
                {id: results.insertedIds[index].toString()}
            ))
    }

    async findAIModel(name: string): Promise<AIModelModel> {
        console.log('  Finding AIModel: ' + name);

        return this.models
            .findOne({ $or: [{ name }, { deploymentId: name }] })
            .then(model => Object.assign(
                {},
                model,
                {id: model._id.toString()}
            ))
    }

    async addAIModel(input: Omit<AIModelModel, "id">): Promise<AIModelModel> {
        const aiModel = Object.assign(
            {},
            input,
            {
                id: undefined
            });

        const result = await this.models.insertOne(aiModel, {ignoreUndefined: true});

        return Object.assign(
            {},
            aiModel,
            {
                id: result.insertedId.toString()
            });
    }

    async listAIModels(): Promise<AIModelModel[]> {
        return this.models
            .find()
            .map((model: WithId<AIModelModel>) => Object.assign(
                {},
                model,
                {
                    id: model._id.toString()
                }
            ))
            .toArray()
    }

    async getAIModel(id: string): Promise<AIModelModel> {
        return this.models
            .findOne(new ObjectId(id))
            .then((model: WithId<AIModelModel>) => Object.assign(
                {},
                model,
                {id: model._id.toString()}
            ))
    }
}
