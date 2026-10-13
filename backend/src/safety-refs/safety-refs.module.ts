import { Module } from '@nestjs/common';
import { SafetyRefsController } from './safety-refs.controller';

@Module({ controllers: [SafetyRefsController] })
export class SafetyRefsModule {}
