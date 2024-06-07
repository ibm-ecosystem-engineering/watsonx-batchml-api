import Axios, {AxiosInstance} from 'axios';
import {IamTokenManager} from "ibm-cloud-sdk-core";

import {WatsonxConfig} from "../../backends";
import {AIModelModel} from "../../models";
import {AiModelApi} from "../../services";
import {first, pThrottle} from "../../util";

const throttle = pThrottle({
    limit: 1,
    interval: 1000,
})

export interface PredictionInput<T = any> {
    data: T[];
}

export interface PredictionValue {
    providedValue?: string;
    prediction: string;
    confidence: number;
}

export interface PredictionResponse<T = any> {
    model: string;
    date: Date;
    predictionField: string;
    results: PredictionValue[];
}

type DeploymentFieldType = string | DeploymentField

type DeploymentFieldFormatter = (data: unknown, fields: DeploymentFieldType[], currentField: DeploymentFieldType) => string

interface DeploymentField {
    name: string;
    aliases?: string[]
    formatter?: DeploymentFieldFormatter
}

interface DeploymentConfig {
    deploymentId: string;
    deploymentFields: DeploymentFieldType[];
    label: string;
}

const isDeploymentField = (value: unknown): value is DeploymentField => {
    return !!value && !!((value as DeploymentField).name)
}

interface PredictionPayload {
    input_data: PredictionPayloadData[];
}

interface PredictionsResult {
    predictions: PredictionPayloadData[]
}

interface PredictionPayloadData {
    fields: string[];
    values: string[][];
}

export class WatsonxMl {

    constructor(private readonly service: AiModelApi, private readonly config: WatsonxConfig) {}

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
        const {deploymentId, deploymentFields, label} = await this.getDeployment(deployment)

        const client = await this.getClient()

        return client
            .post<PredictionsResult>(this.buildUrl(deploymentId), this.buildPayload(input, deploymentFields))
            .then(result => {
                return result.data.predictions
            })
            .then(predictionResultToPredictionValues(input, label))
            .then((data: PredictionValue[]) => {
                return {
                    model: deploymentId,
                    date: new Date(),
                    results: data,
                    predictionField: label
                }
            })
    }

    private buildUrl(deploymentId: string): string {
        return `${this.config.endpoint}/ml/v4/deployments/${deploymentId}/predictions?version=${this.config.version}`
    }

    private async getDeployment(deployment?: string): Promise<DeploymentConfig> {
        const defaultConfig = {
            deploymentId: this.config.defaultDeploymentId,
            deploymentFields: this.config.defaultDeploymentFields,
            label: this.config.defaultLabel,
        }

        if (deployment) {
            try {
                return await this.service.getAIModel(deployment)
                    .then((result: AIModelModel) => ({
                        deploymentId: result.deploymentId,
                        deploymentFields: result.inputs,
                        label: result.label
                    }))
            } catch (err) {
                console.error('Error getting model: ' + deployment, err)
            }
        }

        return defaultConfig;
    }

    private buildPayload<T>(input: PredictionInput<T>, fields: Array<string | DeploymentField>): PredictionPayload {
        const payload = {
            input_data: [{
                fields: fields.map(val => isDeploymentField(val) ? val.name : val),
                values: input.data.map(flatten(fields))
            }]
        }

        console.log('Payload: ', {fields: payload.input_data[0].fields, values: first(payload.input_data[0].values).orElse([])})

        return payload
    }
}

const flatten = <T>(fields: Array<string | DeploymentField>) => {
    return (val: T): string[] => {
        return fields.map(getDeploymentFieldValue(val))
    }
}

const getDeploymentFieldValue = <T> (val: T) => {
    return (field: DeploymentFieldType, idx: number, fields: DeploymentFieldType[]): string => {
        const formatter: DeploymentFieldFormatter | undefined = isDeploymentField(field) ? field.formatter : undefined
        if (formatter) {
            return formatter(val, fields, field)
        }

        const keys: string[] = isDeploymentField(field) ? [field.name].concat(field.aliases || []) : [field]

        return first(keys.map(k => val[k]).filter(v => !!v)).orElse('(blank)')
    }
}

const calculateConfidence = (probability: number[]): number => {
    return first(probability.sort((a, b) => b - a)).orElse(0)
}

const predictionResultToPredictionValues = <T> (input: PredictionInput<T>, label: string) => {

    return (payload: PredictionPayloadData[]): PredictionValue[] => {
        return payload.reduce((result: PredictionValue[], current: PredictionPayloadData) => {

            const values: PredictionValue[] = current.values.map((val: string[], currentIndex: number) => ({
                providedValue: input.data[currentIndex][label],
                prediction: val[0],
                confidence: calculateConfidence(val[1] as unknown as number[])
            }))

            return result.concat(values)
        }, [])
    }
}
