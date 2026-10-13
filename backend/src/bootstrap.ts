import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** Общая настройка приложения (используется в main.ts и e2e-тестах) */
export function configureApp(app: INestApplication) {
  const exp = app as NestExpressApplication;
  exp.set('trust proxy', 1);
  exp.disable('x-powered-by');
  app.setGlobalPrefix('api');
  // API отдаёт только JSON/файлы — максимально строгая CSP; для Swagger UI — политика, допускающая собственные скрипты
  const apiHelmet = helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } });
  const docsHelmet = helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], frameAncestors: ["'none'"] } } });
  app.use((req: any, res: any, next: any) => (req.path.startsWith('/api/docs') ? docsHelmet : apiHelmet)(req, res, next));
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    stopAtFirstError: false,
  }));
  const origins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : false, credentials: true });
  app.enableShutdownHooks();
}
