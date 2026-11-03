export type ImageFormat = 'png' | 'bmp';

export interface ImageUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface DecodedImage extends ImageDimensions {
  format: ImageFormat;
  pixels: Uint8Array;
}
