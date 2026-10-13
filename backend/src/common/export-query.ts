import { IsIn, IsOptional } from 'class-validator';
import { ExportFormat } from '../core/export.service';

export class ExportQuery {
  @IsOptional() @IsIn(['xlsx', 'csv', 'pdf', 'html'])
  format?: ExportFormat = 'xlsx';
}
