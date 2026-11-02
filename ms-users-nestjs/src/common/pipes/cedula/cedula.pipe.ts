import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

@Injectable()
export class CedulaPipe implements PipeTransform<string, string> {
  transform(value: string, _metadata: ArgumentMetadata): string {
    if (!/^[0-9]{10}$/.test(value)) {
      throw new BadRequestException(
        'La cédula debe contener exactamente 10 dígitos',
      );
    }

    return value;
  }
}
