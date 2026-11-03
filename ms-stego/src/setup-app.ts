import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  const config = new DocumentBuilder()
    .setTitle('STEGO API')
    .setDescription(
      'Independent steganography service with authorized PNG/BMP upload validation. LSB detection is pending.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, config),
  );
  app.enableShutdownHooks();
}
