import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { formatRu } from '../common/dates';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require('pdfmake');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vfs: Record<string, string> = require('pdfmake/build/vfs_fonts.js');

export interface TableColumn {
  key: string;
  title: string;
  width?: number;
  type?: 'text' | 'date' | 'number';
}

export interface TableData {
  title: string;
  subtitle?: string;
  columns: TableColumn[];
  rows: Record<string, unknown>[];
}

export type ExportFormat = 'xlsx' | 'csv' | 'pdf' | 'html';

export const EXPORT_MIME: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
  html: 'text/html; charset=utf-8',
};

export function cellText(v: unknown, type?: TableColumn['type']): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return formatRu(v);
  if (type === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)}`;
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  return String(v);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Защита от CSV/Excel-инъекций формул */
function safeCell(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

@Injectable()
export class ExportService {
  private printer = new PdfPrinter({
    Roboto: {
      normal: Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'),
      bold: Buffer.from(vfs['Roboto-Medium.ttf'], 'base64'),
      italics: Buffer.from(vfs['Roboto-Italic.ttf'], 'base64'),
      bolditalics: Buffer.from(vfs['Roboto-MediumItalic.ttf'], 'base64'),
    },
  });

  async export(data: TableData, format: ExportFormat): Promise<Buffer> {
    switch (format) {
      case 'xlsx': return this.toXlsx(data);
      case 'csv': return this.toCsv(data);
      case 'pdf': return this.toPdf(data);
      case 'html': return Buffer.from(this.toHtml(data), 'utf-8');
    }
  }

  async toXlsx(data: TableData): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Охрана труда';
    const ws = wb.addWorksheet(data.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    ws.addRow([data.title]).font = { bold: true, size: 13 };
    if (data.subtitle) ws.addRow([data.subtitle]);
    ws.addRow([]);
    const header = ws.addRow(data.columns.map((c) => c.title));
    header.font = { bold: true };
    header.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF5' } };
      c.border = { bottom: { style: 'thin' } };
    });
    for (const r of data.rows) {
      ws.addRow(data.columns.map((c) => {
        const v = r[c.key];
        if (c.type === 'number' && typeof v === 'number') return v;
        return safeCell(cellText(v, c.type));
      }));
    }
    data.columns.forEach((c, i) => (ws.getColumn(i + 1).width = c.width ?? Math.min(50, Math.max(10, c.title.length + 2))));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  toCsv(data: TableData): Buffer {
    const esc = (s: string) => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [data.columns.map((c) => esc(c.title)).join(';')];
    for (const r of data.rows) lines.push(data.columns.map((c) => esc(safeCell(cellText(r[c.key], c.type)))).join(';'));
    return Buffer.from('﻿' + lines.join('\r\n'), 'utf-8');
  }

  toPdf(data: TableData): Promise<Buffer> {
    const body = [
      data.columns.map((c) => ({ text: c.title, bold: true, fillColor: '#e8eef5' })),
      ...data.rows.map((r) => data.columns.map((c) => ({ text: cellText(r[c.key], c.type) }))),
    ];
    const doc = {
      pageOrientation: data.columns.length > 6 ? 'landscape' : 'portrait',
      pageMargins: [20, 30, 20, 30],
      defaultStyle: { font: 'Roboto', fontSize: 8 },
      content: [
        { text: data.title, fontSize: 13, bold: true, margin: [0, 0, 0, 4] },
        ...(data.subtitle ? [{ text: data.subtitle, margin: [0, 0, 0, 8] }] : []),
        { table: { headerRows: 1, widths: data.columns.map(() => '*'), body }, layout: 'lightHorizontalLines' },
        { text: `Сформировано: ${new Date().toLocaleString('ru-RU', { timeZone: process.env.APP_TIMEZONE || 'Europe/Minsk' })}`, margin: [0, 8, 0, 0], fontSize: 7, color: '#666' },
      ],
    };
    return new Promise((resolve, reject) => {
      const pdf = this.printer.createPdfKitDocument(doc);
      const chunks: Buffer[] = [];
      pdf.on('data', (c: Buffer) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
      pdf.end();
    });
  }

  toHtml(data: TableData): string {
    const th = data.columns.map((c) => `<th>${escapeHtml(c.title)}</th>`).join('');
    const trs = data.rows.map((r) => `<tr>${data.columns.map((c) => `<td>${escapeHtml(cellText(r[c.key], c.type))}</td>`).join('')}</tr>`).join('\n');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(data.title)}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:16px}h1{font-size:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eef}@media print{button{display:none}}</style>
</head><body><h1>${escapeHtml(data.title)}</h1>${data.subtitle ? `<p>${escapeHtml(data.subtitle)}</p>` : ''}
<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table><p style="color:#666;font-size:10px">Записей: ${data.rows.length}</p></body></html>`;
  }
}
