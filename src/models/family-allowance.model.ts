
export enum FamilyAllowanceStatus {
    Pending = 'Pending',
    NeedsInfo = 'NeedsInfo',
    Approved = 'Approved',
    Denied = 'Denied'
}

export enum FamilyAllowanceStatusFilter {
    All = 'All',
    Pending = 'Pending',
    NeedsInfo = 'NeedsInfo',
    Approved = 'Approved',
    Denied = 'Denied'
}

export const mapFilterStatus = (status?: FamilyAllowanceStatusFilter): FamilyAllowanceStatus | undefined => {
    if (!status) {
        return
    }

    switch (status) {
        case FamilyAllowanceStatusFilter.Approved:
            return FamilyAllowanceStatus.Approved
        case FamilyAllowanceStatusFilter.Denied:
            return FamilyAllowanceStatus.Denied
        case FamilyAllowanceStatusFilter.NeedsInfo:
            return FamilyAllowanceStatus.NeedsInfo
        case FamilyAllowanceStatusFilter.Pending:
            return FamilyAllowanceStatus.Pending
        case FamilyAllowanceStatusFilter.All:
            return
        default:
            console.log(`WARNING: Unknown status: ${status}`)
            return
    }
}

export enum FamilyAllowanceType {
    Birth = 'Birth',
    Adoption = 'Adoption',
    ChildAllowance = 'Child Allowance',
    TrainingAllowance = 'Training Allowance'
}

export interface FamilyAllowanceModel {
    id: string;
    firstName: string;
    lastName: string;
    type: FamilyAllowanceType;
    status: FamilyAllowanceStatus;
}
