import { CloudantV1 } from "@ibm-cloud/cloudant";
import {IamAuthenticator} from "ibm-cloud-sdk-core";

export interface CloudantBackendConfig {
    url: string;
    apikey: string;
}

export const cloudantBackend = (): Partial<CloudantBackendConfig> => {
    return {
        apikey: process.env.CLOUDANT_API_KEY,
        url: process.env.CLOUDANT_URL,
    }
}

let _instance: CloudantV1;
export const cloudantClient = ({apikey, url}: CloudantBackendConfig): CloudantV1 => {
    if (_instance) {
        return _instance;
    }

    const authenticator = new IamAuthenticator({apikey})

    const instance = new CloudantV1({
        authenticator,
    });
    instance.setServiceUrl(url);

    return _instance = instance;
}
