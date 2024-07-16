import {AIModelInputFormatter, AIModelInputModel, AIModelModel, InputField} from "../models";
import {Field, ID, ObjectType} from "@nestjs/graphql";

@ObjectType({description: 'AI Model'})
export class AiModel implements AIModelModel {
    @Field(() => ID)
    id: string;
    @Field()
    name: string;
    @Field()
    deploymentId: string;
    @Field({nullable: true})
    description?: string;
    @Field({nullable: true})
    default?: boolean;
    @Field()
    label: string;
    @Field(() => [AIModelInput])
    inputs: AIModelInputModel[];
}

@ObjectType({description: 'AI Model input'})
export class AIModelInput implements AIModelInputModel {
    @Field()
    name: string;
    @Field(() => [String], {nullable: true})
    aliases?: string[];
    @Field({nullable: true})
    formatterName?: string;
}
