import {
    Body,
    Controller,
    Get,
    HttpException,
    HttpStatus,
    Param,
    Post,
    UploadedFile,
    UseInterceptors
} from "@nestjs/common";
import {ApiOkResponse, ApiOperation, ApiParam, ApiTags} from "@nestjs/swagger";
import {FileInterceptor} from "@nestjs/platform-express";

import {CsvDocumentInput} from "./csv-document.apitypes";
import {CsvDocument} from "../../graphql-types";
import {CsvDocumentApi, isDocumentNotFound} from "../../services";
import {CsvDocumentModel} from "../../models";

@Controller('csv-document')
@ApiTags('csv-document')
export class CsvDocumentController {
    constructor(private readonly service: CsvDocumentApi) {}

    @Post()
    @ApiOperation({
        operationId: 'submit-csv-document',
        summary: 'Add csv document',
        description: 'Add a csv document'
    })
    @UseInterceptors(FileInterceptor('file'))
    @ApiOkResponse({
        type: CsvDocument,
        description: "Returns new document"
    })
    async submitCsvDocument(@Body() input: CsvDocumentInput, @UploadedFile() file?: Express.Multer.File): Promise<CsvDocumentModel> {

        return this.service.addCsvDocument(input, file)
            .catch(err => {
                throw new HttpException('Error adding case', HttpStatus.INTERNAL_SERVER_ERROR)
            })
    }

    @Get(':id')
    @ApiOperation({
        operationId: 'get-csv-document',
        summary: 'Get csv document',
        description: 'Get the csv document'
    })
    @ApiParam({
        name: 'id',
        description: 'The id of the document'
    })
    @ApiOkResponse({
        type: CsvDocument,
        description: "Returns selected document"
    })
    async getCsvDocument(@Param('id') id: string): Promise<CsvDocumentModel> {
        console.log('Getting csv document: ' + id);

        return this.service.getCvsDocument(id)
            .catch(err => {
                throw isDocumentNotFound(err)
                    ? new HttpException(err.message, HttpStatus.NOT_FOUND)
                    : new HttpException(`Error retrieving case: ${id}`, HttpStatus.INTERNAL_SERVER_ERROR)
            })

    }
}
