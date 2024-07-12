import {AIModelInputFormatter, getAIModelInputValue, InputField, isMatchingAIModelInputModel} from "../../models";
import {first, Optional} from "../../util";

export const fullDescriptionUniqueFormatter: AIModelInputFormatter = <T> (data: T, fields: InputField[], currentField: InputField): string => {
    return fields.filter(field => !isMatchingAIModelInputModel(field, currentField))
        .map(getAIModelInputValue(data))
        .join(' ')
}

export const formatters = {
    fullDescriptionUniqueFormatter
}

export const lookupFormatter = (formatterName?: string): AIModelInputFormatter | undefined => {
    if (!formatterName) return undefined

    return Optional.ofNullable(formatters[formatterName])
        .ifNotPresent(() => console.log('Unable to find formatter: ' + formatterName))
        .orElse(undefined)
}

export const lookupFormatterName = (formatter: AIModelInputFormatter): string | undefined => {
    return first(Object.keys(formatters).filter(key => formatters[key] === formatter))
        .ifNotPresent(() => console.log('Unable to find formatter name'))
        .orElse(undefined)
}