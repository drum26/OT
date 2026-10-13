import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { RequirePermissions } from '../common/decorators';
import { PageQuery } from '../common/pagination';
import { EmptyToNull, Trim } from '../common/validation';
import { UsersService } from './users.service';

export class UserQuery extends PageQuery {
  @IsOptional() @IsString() search?: string;
}

export class CreateUserDto {
  @Trim() @Matches(/^[a-zA-Z0-9._-]{3,50}$/, { message: 'Логин: 3–50 символов, латиница, цифры, . _ -' }) login: string;
  @Trim() @IsString() @MinLength(2) @MaxLength(200) fullName: string;
  @EmptyToNull() @IsOptional() @IsEmail() email?: string | null;
  @IsString() @MinLength(10) @MaxLength(128) password: string;
  @IsOptional() @IsBoolean() allUnits?: boolean;
  @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) roleIds: string[];
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) unitIds?: string[];
  @EmptyToNull() @IsOptional() @IsUUID() employeeId?: string | null;
}

export class UpdateUserDto {
  @Trim() @IsOptional() @IsString() @MinLength(2) @MaxLength(200) fullName?: string;
  @EmptyToNull() @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() allUnits?: boolean;
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) roleIds?: string[];
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) unitIds?: string[];
  @EmptyToNull() @IsOptional() @IsUUID() employeeId?: string | null;
}

export class ResetPasswordDto {
  @IsString() @MinLength(10) @MaxLength(128) password: string;
  @IsOptional() @IsBoolean() mustChange?: boolean;
}

export class RoleDto {
  @Trim() @Matches(/^[A-Z0-9_]{2,50}$/, { message: 'Код роли: латинские заглавные, цифры, _' }) code: string;
  @Trim() @IsString() @MinLength(2) @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsArray() @IsString({ each: true }) permissions: string[];
}

export class UpdateRoleDto {
  @Trim() @IsOptional() @IsString() @MinLength(2) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
}

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('users') @RequirePermissions('users.manage')
  list(@Query() q: UserQuery) { return this.users.list(q); }

  @Get('users/:id') @RequirePermissions('users.manage')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.users.get(id); }

  @Post('users') @RequirePermissions('users.manage')
  create(@Body() dto: CreateUserDto) { return this.users.create(dto); }

  @Patch('users/:id') @RequirePermissions('users.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) { return this.users.update(id, dto); }

  @Post('users/:id/reset-password') @RequirePermissions('users.manage')
  reset(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto) { return this.users.resetPassword(id, dto.password, dto.mustChange ?? true); }

  @Post('users/:id/unlock') @RequirePermissions('users.manage')
  unlock(@Param('id', ParseUUIDPipe) id: string) { return this.users.unlock(id); }

  @Get('roles') @RequirePermissions('users.manage')
  roles() { return this.users.roles(); }

  @Get('permissions') @RequirePermissions('users.manage')
  permissions() { return this.users.permissions(); }

  @Post('roles') @RequirePermissions('roles.manage')
  createRole(@Body() dto: RoleDto) { return this.users.createRole(dto); }

  @Put('roles/:id') @RequirePermissions('roles.manage')
  updateRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) { return this.users.updateRole(id, dto); }
}

// для class-transformer
void Type;
