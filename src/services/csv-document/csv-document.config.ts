
export const basePathCsvDocument = 'csv-document'

export const pathPostOriginalDocument = 'original'
export const pathPostCorrectedPredictionDocument = 'corrected'

export const pathGetCsvDocument = ':id/:name'
export const buildOriginalUrl = (documentId: string, name: string): string => {
    return `/${basePathCsvDocument}/${documentId}/${name}`
}

export const pathGetCsvPredictionDocument = ':id/prediction/:predictionId/:name'
export const buildPredictionUrl = (documentId: string, predictionId: string): string => {
    return `/${basePathCsvDocument}/${documentId}/prediction/${predictionId}/result.csv`
}
