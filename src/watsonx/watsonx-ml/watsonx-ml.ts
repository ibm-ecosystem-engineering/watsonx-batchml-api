import Axios, {AxiosInstance} from 'axios';
import {IamTokenManager} from "ibm-cloud-sdk-core";

import {WatsonxConfig} from "../../backends";
import {AIModelInputModel, AIModelModel} from "../../models";
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
    skipValue?: string;
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
    skipField?: string;
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
        const {deploymentId, deploymentFields, label, skipField} = await this.getDeployment(deployment)

        console.log('Predicting values from model: ', {deploymentId, deploymentFields, label, skipField})

        const client = await this.getClient()

        return client
            .post<PredictionsResult>(this.buildUrl(deploymentId), this.buildPayload(input, deploymentFields))
            .then(result => {
                return result.data.predictions
            })
            .then(predictionResultToPredictionValues(input, label, skipField))
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

        const deploymentFromAIModel = (result: AIModelModel): DeploymentConfig => ({
            deploymentId: result.deploymentId,
            deploymentFields: result.inputs,
            label: result.label,
            skipField: result.skipField,
        })

        if (deployment) {
            try {
                return await this.service.findAIModel(deployment)
                    .then(deploymentFromAIModel)
            } catch (err) {
                console.error('Error getting model: ' + deployment, err)
            }
        }

        return this.service.getDefaultModel()
            .then(deploymentFromAIModel);
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

const predictionResultToPredictionValues = <T> (input: PredictionInput<T>, label: string, skipField?: string) => {

    return (payload: PredictionPayloadData[]): PredictionValue[] => {
        return payload.reduce((result: PredictionValue[], current: PredictionPayloadData) => {

            const values: PredictionValue[] = current.values.map((val: string[], currentIndex: number) => {
                if (currentIndex === 0) {
                    console.log('Processing result: ', {fields: Object.keys(input.data[currentIndex]), skipField})
                }

                return {
                    providedValue: input.data[currentIndex][label],
                    skipValue: skipField ? input.data[currentIndex][skipField] : undefined,
                    prediction: val[0],
                    confidence: calculateConfidence(val[1] as unknown as number[])
                }
            })

            return result.concat(values)
        }, [])
    }
}
