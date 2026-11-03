import {
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { RequireAuthorization } from '../auth/decorators/require-authorization.decorator.js';
import type { SecurityRequest } from '../auth/interfaces/security-request.js';
import { ValidatedImageDto } from './dto/validated-image.dto.js';
import { UploadBoundaryInterceptor } from './interceptors/upload-boundary.interceptor.js';
import { SteganographyService } from './steganography.service.js';

@ApiTags('Steganography')
@Controller('steganography')
export class SteganographyController {
  constructor(
    @Inject(SteganographyService)
    private readonly service: SteganographyService,
  ) {}

  @Post('analyze')
  @HttpCode(200)
  @RequireAuthorization('steganography.analyze')
  @UseInterceptors(UploadBoundaryInterceptor, FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload and validate a supported image',
    description:
      'Validates image integrity and processing limits. Detection and persistent analysis results are not implemented yet.',
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
  @ApiOkResponse({ type: ValidatedImageDto })
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
    return this.service.validateImage(file, request.subject!);
  }
}
