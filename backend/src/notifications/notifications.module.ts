import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailChannel, InAppChannel } from './channels';

@Module({ controllers: [NotificationsController], providers: [NotificationsService, InAppChannel, EmailChannel], exports: [NotificationsService] })
export class NotificationsModule {}
