import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { BriefingsModule } from '../briefings/briefings.module';
import { ChecksModule } from '../checks/checks.module';
import { PpeModule } from '../ppe/ppe.module';

@Module({ imports: [BriefingsModule, ChecksModule, PpeModule], controllers: [ReportsController], providers: [ReportsService], exports: [ReportsService] })
export class ReportsModule {}
