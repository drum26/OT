import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { BriefingsModule } from '../briefings/briefings.module';
import { ChecksModule } from '../checks/checks.module';
import { PpeModule } from '../ppe/ppe.module';
import { EmployeesModule } from '../employees/employees.module';

@Module({ imports: [BriefingsModule, ChecksModule, PpeModule, EmployeesModule], controllers: [TemplatesController] })
export class TemplatesModule {}
