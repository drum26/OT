import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserContextService } from './user-context.service';
import { JwtAuthGuard, PermissionsGuard } from './guards';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, UserContextService, JwtAuthGuard, PermissionsGuard],
  exports: [AuthService, UserContextService, JwtAuthGuard, PermissionsGuard, JwtModule],
})
export class AuthModule {}
