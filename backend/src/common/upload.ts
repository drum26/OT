import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

const maxMb = () => Number(process.env.UPLOAD_MAX_MB ?? 10);

/** Разрешённые типы вложений: расширение → сигнатура (magic bytes) */
export const ALLOWED_ATTACHMENTS: Record<string, { mime: string; magic: number[][] | 'text' }> = {
  pdf: { mime: 'application/pdf', magic: [[0x25, 0x50, 0x44, 0x46]] },
  png: { mime: 'image/png', magic: [[0x89, 0x50, 0x4e, 0x47]] },
  jpg: { mime: 'image/jpeg', magic: [[0xff, 0xd8, 0xff]] },
  jpeg: { mime: 'image/jpeg', magic: [[0xff, 0xd8, 0xff]] },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: [[0x50, 0x4b, 0x03, 0x04]] },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: [[0x50, 0x4b, 0x03, 0x04]] },
  csv: { mime: 'text/csv', magic: 'text' },
  txt: { mime: 'text/plain', magic: 'text' },
};

export const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

/** Проверка содержимого файла по сигнатуре (а не только по расширению/заявленному MIME) */
export function verifyFileContent(buf: Buffer, ext: string): boolean {
  const def = ALLOWED_ATTACHMENTS[ext];
  if (!def) return false;
  if (def.magic === 'text') {
    const sample = buf.subarray(0, 8192);
    return !sample.includes(0x00);
  }
  return def.magic.some((m) => m.every((b, i) => buf[i] === b));
}

export function uploadOptions(allowedExt: string[]): MulterOptions {
  return {
    storage: memoryStorage(),
    limits: { fileSize: maxMb() * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      // multer декодирует имя как latin1 — восстанавливаем UTF-8
      file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const ext = extOf(file.originalname);
      if (!allowedExt.includes(ext)) return cb(new BadRequestException(`Недопустимый тип файла. Разрешены: ${allowedExt.join(', ')}`), false);
      cb(null, true);
    },
  };
}

export function assertValidUpload(file: Express.Multer.File | undefined) {
  if (!file) throw new BadRequestException('Файл не передан');
  if (!verifyFileContent(file.buffer, extOf(file.originalname))) throw new BadRequestException('Содержимое файла не соответствует его типу');
}
