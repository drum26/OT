import { PrismaClient } from '@prisma/client';

/** Удаление только той временной БД, которую создал global-setup */
export default async function () {
  const name = process.env.E2E_DATABASE_NAME;
  if (!name || !/^ot_e2e_\d+$/.test(name) || process.env.E2E_KEEP_DB === 'true') return;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.$disconnect();
}
