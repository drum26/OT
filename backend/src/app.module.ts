import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.service';
import { CoreModule } from './core/core.module';
import { AuditInterceptor } from './core/audit.interceptor';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, PermissionsGuard } from './auth/guards';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { OrgModule } from './org/org.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthController } from './health.controller';
import { ComplianceModule } from './compliance/compliance.module';
import { SafetyRefsModule } from './safety-refs/safety-refs.module';
import { BriefingsModule } from './briefings/briefings.module';
import { ChecksModule } from './checks/checks.module';
import { PpeModule } from './ppe/ppe.module';
import { TasksModule } from './tasks/tasks.module';
import { CalendarModule } from './calendar/calendar.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { TemplatesModule } from './templates/templates.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 600 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    CoreModule,
    AuthModule,
    UsersModule,
    AdminModule,
    OrgModule,
    EmployeesModule,
    ComplianceModule,
    SafetyRefsModule,
    BriefingsModule,
    ChecksModule,
    PpeModule,
    TasksModule,
    CalendarModule,
    NotificationsModule,
    AttachmentsModule,
    TemplatesModule,
    ReportsModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
