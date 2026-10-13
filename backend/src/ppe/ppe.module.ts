import { Module } from '@nestjs/common';
import { PpeController } from './ppe.controller';
import { PpeService } from './ppe.service';
import { PpeImportService } from './ppe-import.service';

@Module({ controllers: [PpeController], providers: [PpeService, PpeImportService], exports: [PpeService] })
export class PpeModule {}
