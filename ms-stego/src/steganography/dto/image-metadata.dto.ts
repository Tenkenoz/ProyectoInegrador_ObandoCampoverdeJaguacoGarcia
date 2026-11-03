import { ApiProperty } from '@nestjs/swagger';
import type { ImageFormat } from '../interfaces/image.js';

export class ImageMetadataDto {
  @ApiProperty({ format: 'uuid' })
  upload_id!: string;

  @ApiProperty({ format: 'uuid' })
  user_id!: string;

  @ApiProperty()
  filename!: string;

  @ApiProperty({ type: 'string', nullable: true })
  original_filename!: string | null;

  @ApiProperty({ minLength: 64, maxLength: 64 })
  sha256!: string;

  @ApiProperty({ enum: ['png', 'bmp'], nullable: true })
  format!: ImageFormat | null;

  @ApiProperty({ type: 'number', minimum: 1, nullable: true })
  size_bytes!: number | null;

  @ApiProperty({ type: 'number', minimum: 1, nullable: true })
  width!: number | null;

  @ApiProperty({ type: 'number', minimum: 1, nullable: true })
  height!: number | null;
}
