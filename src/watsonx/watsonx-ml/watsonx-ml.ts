import Axios, {AxiosInstance} from 'axios';
import {IamTokenManager} from "ibm-cloud-sdk-core";

import {WatsonxConfig} from "../../backends";
import {delay, first, pThrottle} from "../../util";

const throttle = pThrottle({
    limit: 2,
    interval: 1000,
})

export interface PredictionInput<T = any> {
    data: T[];
}

export interface PredictionValue {
    prediction: string;
    confidence: number;
}

export interface PredictionResponse<T = any> {
    model: string;
    date: Date;
    results: PredictionValue[];
}

interface DeploymentConfig {
    deploymentId: string;
    deploymentFields: string[];
}

interface PredictionPayload {
    input_data: PredictionPayloadData[];
}

interface PredictionPayloadData {
    fields: string[];
    values: string[][];
}

export class WatsonxMl {

    constructor(private readonly config: WatsonxConfig) {}

    private async getClient(): Promise<AxiosInstance> {
        // TODO can any of this be cached?

        const accessToken = await new IamTokenManager({
            apikey: this.config.apiKey,
            url: this.config.identityUrl,
        }).getToken()

        return Axios.create({
            baseURL: this.config.endpoint,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": 'application/json',
                Accept: 'application/json',
            },
        })
    }

    async predict<T>(input: PredictionInput<T>, deployment?: string): Promise<PredictionResponse<T>> {
        const {deploymentId, deploymentFields} = await this.getDeployment(deployment)

        const client = await this.getClient()

        return client
            .post<PredictionPayloadData>(this.buildUrl(deploymentId), this.buildPayload(input, deploymentFields))
            .then(result => {
                return result.data
            })
            .then((data: PredictionPayloadData) => {
                return {
                    model: deploymentId,
                    date: new Date(),
                    results: data.values
                        .map<PredictionValue>((val: string[]) => ({
                            prediction: val[0],
                            confidence: calculateConfidence(val[1] as unknown as number[])
                        }))
                }
            })
    }

    private buildUrl(deploymentId: string): string {
        return `${this.config.endpoint}/ml/v4/deployments/${deploymentId}/predictions?version=${this.config.version}`
    }

    private async getDeployment(deployment?: string): Promise<DeploymentConfig> {
        return {
            deploymentId: this.config.defaultDeploymentId,
            deploymentFields: this.config.defaultDeploymentFields,
        }
    }

    private buildPayload<T>(input: PredictionInput<T>, fields: string[]): PredictionPayload {
        return {
            input_data: [{
                fields,
                values: input.data.map(flatten(fields))
            }]
        }
    }
}

const flatten = <T>(fields: string[]) => {
    return (val: T): string[] => {
        return fields.map(key => val[key])
    }
}

const calculateConfidence = (probability: number[]): number => {
    return first(probability.sort((a, b) => b - a))
}
