import {FamilyAllowanceModel, FamilyAllowanceStatus} from "../../models";

export abstract class FamilyAllowanceApi {
    abstract listFamilyAllowanceCases(status?: FamilyAllowanceStatus): Promise<FamilyAllowanceModel[]>;
    abstract addFamilyAllowanceCase(newCase: Omit<FamilyAllowanceModel, 'id'>, file?: Buffer): Promise<FamilyAllowanceModel>;
    abstract getFamilyAllowanceCase(id: string): Promise<FamilyAllowanceModel>;
    abstract updateFamilyAllowanceCase(id: string, updatedCase: Omit<FamilyAllowanceModel, 'id'>, file?: Buffer): Promise<FamilyAllowanceModel>;
    abstract updateFamilyAllowanceStatus(id: string, status: FamilyAllowanceStatus): Promise<FamilyAllowanceModel>;
    abstract deleteFamilyAllowanceCase(id: string): Promise<boolean>;
}

export const isFamilyAllowanceCaseNotFound = (err: Error): err is FamilyAllowanceCaseNotFound => {
    return err && (err as FamilyAllowanceCaseNotFound)._type === 'FamilyAllowanceCaseNotFound'
}

export class FamilyAllowanceCaseNotFound extends Error {
    readonly _type = 'FamilyAllowanceCaseNotFound'

    constructor(public readonly id: string) {
        super(`Unable to find case: ${id}`);
    }
}
