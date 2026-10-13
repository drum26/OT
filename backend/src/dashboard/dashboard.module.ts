import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { ReportsModule } from '../reports/reports.module';
import { PpeModule } from '../ppe/ppe.module';

@Module({ imports: [ReportsModule, PpeModule], controllers: [DashboardController] })
export class DashboardModule {}
