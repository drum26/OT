import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/** Перевод ошибок Prisma в понятные HTTP-ответы без раскрытия деталей БД */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Prisma');
  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Ошибка базы данных';
    switch (e.code) {
      case 'P2002':
        status = HttpStatus.CONFLICT;
        message = `Запись с такими значениями уже существует (${(e.meta?.target as string[] | undefined)?.join(', ') ?? 'уникальное поле'})`;
        break;
      case 'P2003':
        status = HttpStatus.CONFLICT;
        message = 'Операция невозможна: на запись есть ссылки или указана несуществующая связанная запись';
        break;
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        message = 'Запись не найдена';
        break;
      default:
        this.logger.error(`${e.code}: ${e.message}`);
    }
    res.status(status).json({ statusCode: status, message });
  }
}
