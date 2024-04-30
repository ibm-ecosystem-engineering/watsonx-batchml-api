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
import {CsvDocumentModel} from "../../models";
import {CsvDocumentApi, isDocumentNotFound} from "../../services";

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

        console.log('Received CSV document')

        return this.service.addCsvDocument(input, file)
            .then((result) => {
                console.log('Document upload complete')
                return result
            })
            .catch(err => {
                console.error('Error adding CSV document: ', err)
                throw new HttpException('Error adding CSV document', HttpStatus.INTERNAL_SERVER_ERROR)
            })
    }

    @Get(':id/:name')
    @ApiOperation({
        operationId: 'get-csv-document',
        summary: 'Get csv document',
        description: 'Get the csv document'
    })
    @ApiParam({
        name: 'id',
        description: 'The id of the document'
    })
    @ApiParam({
        name: 'name',
        description: 'The name of the document'
    })
    @ApiOkResponse({
        type: CsvDocument,
        description: "Returns selected document"
    })
    async getCsvDocument(@Param('id') id: string, @Param('name') name: string): Promise<CsvDocumentModel> {
        console.log('Getting csv document: ' + id);

        return this.service.getCsvDocument(id)
            .catch(err => {
                throw isDocumentNotFound(err)
                    ? new HttpException(err.message, HttpStatus.NOT_FOUND)
                    : new HttpException(`Error retrieving case: ${id}`, HttpStatus.INTERNAL_SERVER_ERROR)
            })

    }


    @Get(':id/prediction/:predictionId/:name')
    @ApiOperation({
        operationId: 'get-csv-prediction-document',
        summary: 'Get csv prediction document',
        description: 'Get the csv prediction document'
    })
    @ApiParam({
        name: 'id',
        description: 'The id of the document'
    })
    @ApiParam({
        name: 'predictionId',
        description: 'The id of the prediction'
    })
    @ApiParam({
        name: 'name',
        description: 'The name of the document'
    })
    @ApiOkResponse({
        type: CsvDocument,
        description: "Returns selected document"
    })
    async getCsvPredictionDocument(@Param('id') id: string, @Param('predictionId') predictionId: string, @Param('name') name: string): Promise<CsvDocumentModel> {
        console.log('Getting csv prediction document: ' + id + ', ' + predictionId);

        return this.service.getCsvDocument(id)
            .catch(err => {
                throw isDocumentNotFound(err)
                    ? new HttpException(err.message, HttpStatus.NOT_FOUND)
                    : new HttpException(`Error retrieving case: ${id}`, HttpStatus.INTERNAL_SERVER_ERROR)
            })

    }
}
