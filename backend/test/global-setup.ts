import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Для e2e-тестов создаётся НОВАЯ временная БД с уникальным именем (ot_e2e_<время>) на сервере из TEST_DATABASE_URL;
 * к ней применяются миграции (prisma migrate deploy). Существующие базы не изменяются.
 * Пользователь БД должен иметь право CREATEDB.
 */
export default async function () {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error('Задайте TEST_DATABASE_URL — строку подключения к серверу PostgreSQL для тестов');
  const name = `ot_e2e_${Date.now()}`;
  const admin = new PrismaClient({ datasources: { db: { url: base } } });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  await admin.$disconnect();
  const u = new URL(base);
  u.pathname = `/${name}`;
  process.env.E2E_DATABASE_URL = u.toString();
  process.env.E2E_DATABASE_NAME = name;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: u.toString() }, stdio: 'pipe' });
}
