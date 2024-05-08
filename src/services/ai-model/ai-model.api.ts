import {AIModelModel} from "../../models";

export abstract class AiModelApi {
    abstract addAIModel(input: Omit<AIModelModel, 'id'>): Promise<AIModelModel>
    abstract listAIModels(): Promise<AIModelModel[]>
    abstract getAIModel(id: string): Promise<AIModelModel>
}
