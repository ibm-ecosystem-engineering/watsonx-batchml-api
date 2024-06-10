import {WatsonxMl} from "./watsonx-ml";
import {watsonxConfig} from "../../backends";
import {aiModelApi} from "../../services";

export * from './watsonx-ml'

let _instance: Promise<WatsonxMl>;
export const buildMl = (): Promise<WatsonxMl> => {
    if (_instance) {
        return _instance
    }

    const config = watsonxConfig()

    if (!config) {
        throw new Error('watsonx config not provided!!!!')
    }

    return _instance = new Promise(async resolve => {
        resolve(new WatsonxMl(await aiModelApi(), config))
    })
}
