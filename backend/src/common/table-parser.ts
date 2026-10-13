import ExcelJS from 'exceljs';
import { badRequest } from './errors';

export type RawCell = string | number | Date | boolean | null;
export interface ParsedTable { headers: string[]; rows: { rowNumber: number; cells: Record<string, RawCell> }[] }

export const normalizeHeader = (h: string) => h.toLowerCase().replace(/ё/g, 'е').replace(/[*"'.,:;()№#]/g, ' ').replace(/\s+/g, ' ').trim();

function cellValue(v: ExcelJS.CellValue): RawCell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return String((v as ExcelJS.CellHyperlinkValue).text);
    return null;
  }
  return v as RawCell;
}

/** Простой разбор CSV (разделитель ; или , — определяется по заголовку; поддержка кавычек) */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/** Чтение первой таблицы файла XLSX/CSV; первая непустая строка — заголовки */
export async function parseTableFile(buffer: Buffer, fileName: string, maxRows = 20000): Promise<ParsedTable> {
  const lower = fileName.toLowerCase();
  let matrix: { rowNumber: number; values: RawCell[] }[] = [];
  if (lower.endsWith('.csv')) {
    matrix = parseCsv(buffer.toString('utf-8')).map((values, i) => ({ rowNumber: i + 1, values }));
  } else if (lower.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as any);
    } catch {
      throw badRequest('Не удалось прочитать файл Excel. Поддерживается формат .xlsx');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw badRequest('В файле нет листов');
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values: RawCell[] = [];
      for (let c = 1; c <= row.cellCount; c++) values.push(cellValue(row.getCell(c).value));
      matrix.push({ rowNumber, values });
    });
  } else {
    throw badRequest('Поддерживаются файлы .xlsx и .csv');
  }
  matrix = matrix.filter((r) => r.values.some((v) => v !== null && String(v).trim() !== ''));
  if (!matrix.length) throw badRequest('Файл не содержит данных');
  if (matrix.length - 1 > maxRows) throw badRequest(`Слишком много строк (максимум ${maxRows})`);
  const headers = matrix[0].values.map((h) => normalizeHeader(String(h ?? '')));
  const rows = matrix.slice(1).map((r) => {
    const cells: Record<string, RawCell> = {};
    headers.forEach((h, i) => { if (h) cells[h] = r.values[i] ?? null; });
    return { rowNumber: r.rowNumber, cells };
  });
  return { headers, rows };
}

/** Разбор даты из ячейки: Date, ДД.ММ.ГГГГ, ГГГГ-ММ-ДД, серийный номер Excel */
export function parseCellDate(v: RawCell): Date | null | 'invalid' {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return 'invalid';
    // ExcelJS возвращает даты в UTC; округляем до календарной даты
    const t = new Date(v.getTime() + 12 * 3600000);
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  }
  if (typeof v === 'number') {
    if (v < 1 || v > 80000) return 'invalid';
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  let y: number, mo: number, d: number;
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else return 'invalid';
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return 'invalid';
  if (y < 1900 || y > 2200) return 'invalid';
  return dt;
}

export function cellStr(v: RawCell): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && Number.isInteger(v)) return String(v);
  return String(v).trim();
}

/** Поиск значения по одному из вариантов заголовка */
export function pick(cells: Record<string, RawCell>, aliases: string[]): RawCell {
  for (const a of aliases) {
    const k = normalizeHeader(a);
    if (k in cells) return cells[k];
  }
  return null;
}
