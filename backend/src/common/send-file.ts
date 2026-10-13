import { StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { EXPORT_MIME, ExportFormat } from '../core/export.service';

export function fileResponse(res: Response, buf: Buffer, baseName: string, format: ExportFormat) {
  const name = `${baseName}.${format}`;
  res.set({
    'Content-Type': EXPORT_MIME[format],
    'Content-Disposition': format === 'html' ? 'inline' : `attachment; filename="export.${format}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Cache-Control': 'no-store',
  });
  return new StreamableFile(buf);
}
