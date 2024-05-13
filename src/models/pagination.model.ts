
export const defaultPageSize: number = 20

export interface PaginationInputModel {
    pageSize: number
    page: number
}

export const PaginationInputBuilder = ({page, pageSize}: Partial<PaginationInputModel> = {}): PaginationInputModel => {
    return {
        page: page || 1,
        pageSize: pageSize || defaultPageSize
    }
}

export interface PaginationMetadataModel extends PaginationInputModel {
    totalCount: number
}

export interface PaginationResultModel<T> {
    metadata: PaginationMetadataModel
    data: Array<T>
}
