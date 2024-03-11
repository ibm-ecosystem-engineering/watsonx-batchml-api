import {WatsonxMl} from "./watsonx-ml";
import {watsonxConfig} from "../../backends";

export * from './watsonx-ml'

let _instance: WatsonxMl;
export const buildMl = (): WatsonxMl => {
    if (_instance) {
        return _instance
    }

    const config = watsonxConfig()

    if (!config) {
        throw new Error('watsonx config not provided!!!!')
    }

    return _instance = new WatsonxMl(config)
}
