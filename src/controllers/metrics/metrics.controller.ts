import {Controller, Get} from "@nestjs/common";
import {ApiTags} from "@nestjs/swagger";

import {MetricsApi} from "../../services";

@Controller('metrics')
@ApiTags('metrics')
export class MetricsController {
    constructor(private readonly service: MetricsApi) {}

    @Get('memory-usage')
    async getMemoryUsage() {
        return this.service.getMemoryUsage()
    }
}
