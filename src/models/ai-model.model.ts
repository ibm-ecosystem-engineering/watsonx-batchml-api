import {first} from "../util";

export type InputField = string | AIModelInputModel

export interface AIModelModel {
    id: string;
    name: string;
    deploymentId: string;
    description?: string;
    inputs: InputField[]
    label: string
}

export type AIModelInputFormatter = <T> (data: T, fields: InputField[], currentField: InputField) => string

export interface AIModelInputModel {
    name: string;
    aliases?: string[],
    formatter?: AIModelInputFormatter
}

export const isAIModelInputModel = (value: unknown): value is AIModelInputModel => {
    return !!value && !!((value as AIModelInputModel).name)
}

export const isMatchingAIModelInputModel = (a: InputField, b: InputField): boolean => {
    const aName = isAIModelInputModel(a) ? a.name : a
    const bName = isAIModelInputModel(b) ? b.name : b

    return a === b
}

export const getAIModelInputValue = <T> (val: T) => {
    return (field: InputField, idx: number, fields: InputField[]): string => {
        const formatter: AIModelInputFormatter | undefined = isAIModelInputModel(field) ? field.formatter : undefined
        if (formatter) {
            return formatter(val, fields, field)
        }

        const keys: string[] = isAIModelInputModel(field) ? [field.name].concat(field.aliases || []) : [field]

        return first(keys.map(k => val[k]).filter(v => !!v)).orElse('(blank)')
    }
}
