import {Query, Resolver} from "@nestjs/graphql";

import {AiModel} from "../../graphql-types";
import {AiModelApi} from "../../services";
import {AIModelInputFormatter, AIModelInputModel, AIModelModel, InputField} from "../../models";

@Resolver(of => AiModel)
export class AiModelsResolver {

    constructor(private readonly service: AiModelApi) {}

    @Query(returns => [AiModel])
    async listAiModels(): Promise<AIModelModel[]> {
        const models = await this.service.listAIModels()

        return models.map(mapAiModel)
    }
}

const mapAiModel = (model: AIModelModel): AIModelModel => {
    return Object.assign({}, model, {inputs: mapInputs(model.inputs)})
}

const mapInputs = (inputs: InputField[]): AIModelInputModel[] => {
    return inputs.map(mapInput)
}

const mapInput = (input: InputField): AIModelInputModel => {
    if (typeof input === 'string') {
        return {name: input}
    }

    return input
}