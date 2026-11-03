import { ApiProperty } from '@nestjs/swagger';
import type { ImageFormat } from '../interfaces/image.js';

export class ImageMetadataDto {
  @ApiProperty({ format: 'uuid' })
  upload_id!: string;

  @ApiProperty({ format: 'uuid' })
  user_id!: string;

  @ApiProperty()
  filename!: string;

  @ApiProperty()
  original_filename!: string;

  @ApiProperty({ minLength: 64, maxLength: 64 })
  sha256!: string;

  @ApiProperty({ enum: ['png', 'bmp'] })
  format!: ImageFormat;

  @ApiProperty({ minimum: 1 })
  size_bytes!: number;

  @ApiProperty({ minimum: 1 })
  width!: number;

  @ApiProperty({ minimum: 1 })
  height!: number;
}
