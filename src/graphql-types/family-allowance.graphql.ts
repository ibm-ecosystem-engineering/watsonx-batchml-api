import {FamilyAllowanceModel, FamilyAllowanceStatus, FamilyAllowanceStatusFilter, FamilyAllowanceType} from "../models";
import {Field, ID, ObjectType, registerEnumType} from "@nestjs/graphql";

registerEnumType(FamilyAllowanceStatus, {name: 'FamilyAllowanceStatus', description: 'Family allowance case statuses'})
registerEnumType(FamilyAllowanceStatusFilter, {name: 'FamilyAllowanceStatusFilter', description: 'Family allowance case statuses for filtering query'})
registerEnumType(FamilyAllowanceType, {name: 'FamilyAllowanceType', description: 'Family allowance case types'})

@ObjectType({description: 'Family allowance case'})
export class FamilyAllowance implements FamilyAllowanceModel {
    @Field(() => ID)
    id: string;
    @Field()
    firstName: string;
    @Field()
    lastName: string;
    @Field(() => FamilyAllowanceStatus)
    status: FamilyAllowanceStatus;
    @Field(() => FamilyAllowanceType)
    type: FamilyAllowanceType;
}
