import {Collection, Db, InsertManyResult, ObjectId, OptionalId, WithId} from "mongodb";

import {AiModelApi} from "./ai-model.api";
import {AiModelMock} from "./ai-model.mock";
import {AIModelModel, InputField} from "../../models";
import {first} from "../../util";
import {lookupFormatter, lookupFormatterName} from "./ai-model.support";

interface AIModelInternal {
    id: string;
    name: string;
    deploymentId: string;
    description?: string;
    default?: boolean;
    inputs: InputFieldInternal[]
    label: string
}

type InputFieldInternal = string | AIModelInputInternal

interface AIModelInputInternal {
    name: string;
    aliases?: string[],
    formatterName?: string
}

export class AiModelMongodb implements AiModelApi {
    private readonly models: Collection<AIModelInternal>;

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

        console.log('AI Models: ', await this.listAIModels())

        return this;
    }

    async addAIModels(inputs: Omit<AIModelModel, "id">[]): Promise<AIModelModel[]> {
        const newModels: OptionalId<AIModelInternal>[] = inputs.map(aiModelToInternal);

        const results: InsertManyResult<AIModelModel> = await this.models.insertMany(newModels)

        return newModels
            .map((val: Omit<AIModelModel, "id">, index: number) => Object.assign(
                {},
                val,
                {id: results.insertedIds[index].toString()}
            ))
    }

    async addAIModel(input: Omit<AIModelModel, "id">): Promise<AIModelModel> {
        const aiModel: OptionalId<AIModelInternal> = aiModelToInternal(input)

        const result = await this.models.insertOne(aiModel, {ignoreUndefined: true});

        return Object.assign(
            {},
            aiModel,
            {
                id: result.insertedId.toString()
            });
    }

    async findAIModel(name: string): Promise<AIModelModel> {
        console.log('  Finding AIModel: ' + name);

        return this.models
            .findOne({ $or: [{ name }, { deploymentId: name }] })
            .then(aiModelInternalToModel)
    }

    async listAIModels(): Promise<AIModelModel[]> {
        return this.models
            .find()
            .map(aiModelInternalToModel)
            .toArray()
    }

    async getAIModel(id: string): Promise<AIModelModel> {
        return this.models
            .findOne(new ObjectId(id))
            .then(aiModelInternalToModel)
    }

    async getDefaultModel(): Promise<AIModelModel> {
        const allModels = await this.listAIModels()

        return first(allModels.filter(val => val.default))
            .or(() => first(allModels))
            .orElseThrow(() => new Error('No default AI model found'));
    }
}

const aiModelInternalToModel = (input: WithId<AIModelInternal>): AIModelModel => {
    return Object.assign({}, input, {id: input._id.toString(), inputs: aiModelInputsInternalToModel(input.inputs)})
}

const aiModelInputsInternalToModel = (input: InputFieldInternal[] = []): InputField[] => {
    return input.map(aiModelInputInternalToModel)
}

const aiModelInputInternalToModel = (input: InputFieldInternal): InputField => {
    if (typeof input === 'string') {
        return input
    }

    const formatter = lookupFormatter(input.formatterName)

    return Object.assign(
        {name: input.name},
        input.aliases ? {aliases: input.aliases} : {},
        formatter ? {formatter} : {}
    )
}

const aiModelToInternal = (input: Omit<AIModelModel, "id">): OptionalId<AIModelInternal> => {
    return Object.assign({}, input, {id: undefined, inputs: aiModelInputsToInternal(input.inputs)})
}

const aiModelInputsToInternal = (inputs: InputField[]): InputFieldInternal[] => {
    return inputs.map(aiModelInputToInternal)
}

const aiModelInputToInternal = (input: InputField): InputFieldInternal => {
    if (typeof input === 'string') {
        return input
    }

    const formatterName = lookupFormatterName(input.formatter)

    return Object.assign(
        {name: input.name},
        input.aliases ? {aliases: input.aliases} : {},
        formatterName ? {formatterName} : {},
    )
}