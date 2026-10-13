import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { BackupService } from './backup.service';

@Module({ controllers: [AdminController], providers: [BackupService], exports: [BackupService] })
export class AdminModule {}
