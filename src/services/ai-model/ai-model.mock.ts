import {AiModelApi} from "./ai-model.api";
import {
    AIModelModel,
    getAIModelInputValue,
    InputField,
    isAIModelInputModel,
    isMatchingAIModelInputModel
} from "../../models";
import {first} from "../../util";

const _models: AIModelModel[] = [{
    id: '1',
    name: 'tax_withholding_v4',
    deploymentId: 'tax_withholding_v4',
    inputs: [
        "MCO_NO",
        "MCO_CMP_NO",
        "CTRY_NO",
        "SERVICE_PERFORMED_IN",
        "NEC_DESCRIPTION",
        "NEC_CODE",
        "MARKETING_LEGAL_ENTITY_NAME",
        "PERFORMING_LEGAL_ENTITY_NAME",
        {
            name: "Full_Description_Unique",
            formatter: <T> (data: T, fields: InputField[], currentField: InputField): string => {
                return fields.filter(field => !isMatchingAIModelInputModel(field, currentField))
                    .map(getAIModelInputValue(data))
                    .join(' ')
            }
        }
    ],
    label: "WHT_PER"
// }, {
//     id: '2',
//     name: 'tax_withholding_v2',
//     deploymentId: 'tax_withholding_v2',
//     inputs: [
//         "MCO_NO",
//         "MCO_CMP_NO",
//         "CTRY_NO",
//         "SERVICE_PERFORMED_IN",
//         {name: "NEC_DESCRIPTION_Cleaned", aliases: ["NEC_DESCRIPTION"]},
//         "NEC_CODE",
//         "MARKETING_LEGAL_ENTITY_NAME",
//         "PERFORMING_LEGAL_ENTITY_NAME"
//     ],
//     label: "WHT_PER"
}]

let _id: number = _models.length
const nextId = (): string => {
    const id = _id = _id + 1

    return '' + id
}

export class AiModelMock implements AiModelApi {
    async addAIModel(input: Omit<AIModelModel, "id">): Promise<AIModelModel> {
        const model = Object.assign({}, input, {id: nextId()})

        _models.push(model)

        return model;
    }

    async getAIModel(id: string): Promise<AIModelModel> {
        return first(_models.filter(val => val.id === id || val.name === id));
    }

    async listAIModels(): Promise<AIModelModel[]> {
        return _models;
    }

}