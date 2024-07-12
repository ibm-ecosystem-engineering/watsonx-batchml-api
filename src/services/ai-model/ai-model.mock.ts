import {AiModelApi} from "./ai-model.api";
import {AIModelModel, getAIModelInputValue, InputField, isMatchingAIModelInputModel} from "../../models";
import {first} from "../../util";
import {fullDescriptionUniqueFormatter} from "./ai-model.support";

const _models: AIModelModel[] = [{
    id: '2',
    name: 'tax_withholding_v6a',
    deploymentId: 'tax_withholding_v6a',
    default: true,
    inputs: [
        "MCO_NO",
        "MCO_CMP_NO",
        "CTRY_NO",
        {name: "SERVICE_PERFORMED_IN", aliases: ["COUNTRY_WHERE_SERVICE_WAS_PERF"]},
        {name: "NEC_DESCRIPTION", aliases: ["MATERIAL DESCRIPTION"]},
        {name: "NEC_CODE", aliases: ["IC MATERIAL"]},
        {name: "MARKETING_LEGAL_ENTITY_NAME", aliases: ["CC_NAME"]},
        {name: "PERFORMING_LEGAL_ENTITY_NAME", aliases: ["TP_NAME"]},
        {
            name: "Full_Description_Unique",
            formatter: fullDescriptionUniqueFormatter,
            formatterName: 'fullDescriptionUniqueFormatter'
        }
    ],
    label: "WHT_PER"
}]

let _id: number = _models.length
const nextId = (): string => {
    const id = _id = _id + 1

    return '' + id
}

export class AiModelMock implements AiModelApi {
    async getDefaultModel(): Promise<AIModelModel> {
        return first(_models.filter(val => val.default))
            .or(() => first(_models))
            .orElseThrow(() => new Error('No default AI model found'));
    }

    async addAIModels(inputs: Omit<AIModelModel, "id">[]): Promise<AIModelModel[]> {
        return Promise.all(
            inputs.map(model => this.addAIModel(model))
        )
    }

    async findAIModel(name: string): Promise<AIModelModel> {
        return first(_models.filter(val => val.name === name)).orElse(undefined);
    }

    async addAIModel(input: Omit<AIModelModel, "id">): Promise<AIModelModel> {
        const model = Object.assign({}, input, {id: nextId()})

        _models.push(model)

        return model;
    }

    async getAIModel(id: string): Promise<AIModelModel> {
        return first(_models.filter(val => val.id === id || val.name === id)).orElse(undefined);
    }

    async listAIModels(): Promise<AIModelModel[]> {
        return _models;
    }

}