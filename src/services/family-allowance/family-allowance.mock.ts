import {FamilyAllowanceApi, FamilyAllowanceCaseNotFound} from "./family-allowance.api";
import {FamilyAllowanceModel, FamilyAllowanceStatus, FamilyAllowanceType} from "../../models";
import * as console from "console";


let familyAllowanceCases: FamilyAllowanceModel[] = [{
    id: '1',
    firstName: 'John',
    lastName: 'Doe',
    status: FamilyAllowanceStatus.Pending,
    type: FamilyAllowanceType.Birth,
}];
let nextId = 2;

const generateId = (): string => {
    return '' + (nextId++)
}

export class FamilyAllowanceMock implements FamilyAllowanceApi {
    async addFamilyAllowanceCase(newCase: Omit<FamilyAllowanceModel, "id">): Promise<FamilyAllowanceModel> {
        const id = generateId();

        const caseData = Object.assign({}, newCase, {id});

        familyAllowanceCases.push(caseData)

        return caseData;
    }

    async deleteFamilyAllowanceCase(id: string): Promise<boolean> {

        const initialLength = familyAllowanceCases.length

        familyAllowanceCases = familyAllowanceCases.filter(val => val.id !== id)

        return familyAllowanceCases.length !== initialLength;
    }

    async getFamilyAllowanceCase(id: string): Promise<FamilyAllowanceModel> {

        const filteredCases: FamilyAllowanceModel[] = familyAllowanceCases.filter(val => val.id === id)

        if (filteredCases.length === 0) {
            throw new FamilyAllowanceCaseNotFound(id)
        } else if (filteredCases.length > 1) {
            console.log(`WARNING: Multiple cases with same id: ${id}`)
        }

        return filteredCases[0]
    }

    async listFamilyAllowanceCases(status?: FamilyAllowanceStatus): Promise<FamilyAllowanceModel[]> {
        if (status) {
            return familyAllowanceCases.filter(val => val.status === status)
        }

        return familyAllowanceCases
    }

    async updateFamilyAllowanceCase(id: string, updatedCase: FamilyAllowanceModel): Promise<FamilyAllowanceModel> {

        const existingCase = await this.getFamilyAllowanceCase(id)

        return Object.assign(existingCase, updatedCase, {id})
    }

    async updateFamilyAllowanceStatus(id: string, status: FamilyAllowanceStatus): Promise<FamilyAllowanceModel> {

        const existingCase = await this.getFamilyAllowanceCase(id)

        return Object.assign(existingCase, {status})
    }
}
