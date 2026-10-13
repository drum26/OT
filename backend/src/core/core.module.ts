import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { SettingsService } from './settings.service';
import { UnitTreeService } from './unit-tree.service';
import { ExportService } from './export.service';

@Global()
@Module({
  providers: [AuditService, SettingsService, UnitTreeService, ExportService],
  exports: [AuditService, SettingsService, UnitTreeService, ExportService],
})
export class CoreModule {}
