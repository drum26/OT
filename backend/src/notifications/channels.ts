import { Injectable, Logger } from '@nestjs/common';

export interface OutgoingNotification {
  id: string;
  title: string;
  message: string;
  link: string | null;
  user: { id: string; email: string | null; fullName: string };
}

/** Канал доставки уведомлений. Для подключения e-mail или корпоративного мессенджера реализуйте этот интерфейс. */
export interface NotificationChannel {
  readonly name: string;
  isConfigured(): boolean;
  send(n: OutgoingNotification): Promise<void>;
}

/** Уведомления внутри приложения: запись в БД уже является доставкой */
@Injectable()
export class InAppChannel implements NotificationChannel {
  readonly name = 'IN_APP';
  isConfigured() { return true; }
  async send() { /* доставлено при создании записи */ }
}

/**
 * Заготовка канала электронной почты. Отправка не реализована в текущей версии:
 * при включении канала в правилах доставки получают статус SKIPPED с пояснением.
 */
@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly name = 'EMAIL';
  private readonly logger = new Logger('EmailChannel');
  isConfigured() { return false; }
  async send(n: OutgoingNotification) {
    this.logger.warn(`E-mail канал не настроен, уведомление ${n.id} не отправлено`);
    throw new Error('Канал e-mail не настроен');
  }
}
