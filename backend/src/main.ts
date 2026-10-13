import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

function assertSecrets() {
  const weak = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter((k) => !process.env[k] || process.env[k]!.length < 32 || process.env[k]!.includes('CHANGE_ME'));
  if (weak.length && process.env.NODE_ENV === 'production') {
    throw new Error(`Не заданы надёжные секреты: ${weak.join(', ')} (минимум 32 символа)`);
  }
  if (weak.length) new Logger('Bootstrap').warn(`Слабые секреты: ${weak.join(', ')} — недопустимо в production`);
}

async function bootstrap() {
  assertSecrets();
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  configureApp(app);
  if (process.env.SWAGGER_ENABLED !== 'false') {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder()
      .setTitle('Охрана труда — API')
      .setDescription('REST API системы «Охрана труда». Авторизация: Bearer access-токен, обновление — POST /api/auth/refresh (httpOnly cookie).')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build());
    SwaggerModule.setup('api/docs', app, doc);
  }
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API: http://localhost:${port}/api, документация: /api/docs`);
}
bootstrap();
