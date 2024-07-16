import {Provider} from "@nestjs/common";
import {PubSubApi} from "./pub-sub.api";
import {PubSubLocal} from "./pub-sub.local";

export * from './pub-sub.api'

let _instance: Promise<PubSubApi>
export const pubSubApi = () => {
    if (_instance) {
        return _instance;
    }

    return _instance = Promise.resolve(new PubSubLocal())
}

export const pubSubProvider: Provider = {
    provide: PubSubApi,
    useFactory: pubSubApi
}
