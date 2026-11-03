import {
  Controller,
  Get,
  Param,
  HttpCode,
  Inject,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AnalysisResultsService } from './services/analysis-results.service.js';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiParam,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { RequireAuthorization } from '../auth/decorators/require-authorization.decorator.js';
import type { SecurityRequest } from '../auth/interfaces/security-request.js';
import { AnalysisResultDto } from './dto/analysis-result.dto.js';
import { UploadBoundaryInterceptor } from './interceptors/upload-boundary.interceptor.js';
import { SteganographyService } from './steganography.service.js';

@ApiTags('Steganography')
@Controller('steganography')
export class SteganographyController {
  constructor(
    @Inject(SteganographyService)
    private readonly service: SteganographyService,
    @Inject(AnalysisResultsService)
    private readonly results: AnalysisResultsService,
  ) {}

  @Post('analyze')
  @HttpCode(200)
  @RequireAuthorization('steganography.analyze')
  @UseInterceptors(UploadBoundaryInterceptor, FileInterceptor('file'))
  @ApiOperation({
    summary: 'Analyze a supported image for statistical LSB indicators',
    description:
      'Validates the image and runs statistical LSB analysis. Results are indicative, not proof of hidden data. Results and applied policies are persisted. Original files are retained only when the applied policy selects quarantine.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      additionalProperties: false,
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: AnalysisResultDto })
  @ApiBadRequestResponse({
    description: 'Missing, corrupt, inconsistent or malformed image upload.',
  })
  @ApiPayloadTooLargeResponse({
    description: 'File size, image dimensions or processing limits exceeded.',
  })
  @ApiUnsupportedMediaTypeResponse({
    description: 'Unsupported request type, image format or encoding.',
  })
  analyze(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: SecurityRequest,
  ) {
    return this.service.analyzeImage(
      file,
      request.subject!,
      request.requestId ?? randomUUID(),
    );
  }
  @Get('results/:id')
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'Persisted analysis identifier.',
  })
  @ApiBadRequestResponse({ description: 'A valid analysis UUID is required.' })
  @RequireAuthorization('steganography.results.read', 'id')
  @ApiOperation({
    summary:
      'Read a persisted analysis under current authorization and ownership rules',
  })
  @ApiOkResponse({ type: AnalysisResultDto })
  @ApiNotFoundResponse({
    description: 'The authorized analysis does not exist.',
  })
  result(@Param('id') id: string, @Req() request: SecurityRequest) {
    return this.results.find(
      id,
      request.subject!,
      request.authorizationGrant!,
      request.requestId ?? randomUUID(),
    );
  }
}
