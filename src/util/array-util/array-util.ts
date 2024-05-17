
export const notEmpty = <T> (arr: T[]): boolean => {
    return !!arr && arr.length > 0
}

export const isEmpty = <T> (arr: T[]): boolean => {
    return !arr || arr.length === 0
}
