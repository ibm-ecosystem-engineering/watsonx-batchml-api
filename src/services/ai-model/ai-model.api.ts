import {AIModelModel} from "../../models";

export abstract class AiModelApi {
    abstract addAIModel(input: Omit<AIModelModel, 'id'>): Promise<AIModelModel>
    abstract addAIModels(input: Array<Omit<AIModelModel, 'id'>>): Promise<AIModelModel[]>
    abstract listAIModels(): Promise<AIModelModel[]>
    abstract findAIModel(name: string): Promise<AIModelModel>
    abstract getAIModel(id: string): Promise<AIModelModel>
    abstract getDefaultModel(): Promise<AIModelModel>
}
