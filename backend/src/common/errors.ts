import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

export const notFound = (what = 'Запись') => new NotFoundException(`${what} не найдена`);
export const badRequest = (msg: string) => new BadRequestException(msg);
export const conflict = (msg: string) => new ConflictException(msg);
export const forbidden = (msg = 'Недостаточно прав') => new ForbiddenException(msg);
