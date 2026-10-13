/**
 * Создание первого администратора.
 *   npm run create-admin -- --login admin --name "Иванов И.И."
 * Пароль запрашивается интерактивно или передаётся через переменную окружения ADMIN_PASSWORD
 * (не передавайте пароль аргументом командной строки — он попадёт в историю оболочки).
 */
import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';
import { hashPassword, PASSWORD_POLICY, PASSWORD_POLICY_TEXT } from '../src/auth/auth.service';
import { seedBase } from '../prisma/seed-base';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function askHidden(q: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = process.stdout.write.bind(process.stdout);
    let muted = false;
    (process.stdout as any).write = (s: string, ...rest: any[]) => (muted ? true : out(s, ...rest));
    rl.question(q, (a) => { (process.stdout as any).write = out; out('\n'); rl.close(); resolve(a); });
    muted = true;
  });
}

async function main() {
  const login = (arg('login') ?? 'admin').toLowerCase();
  const name = arg('name') ?? 'Администратор системы';
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = await askHidden(`Пароль для ${login}: `);
    const again = await askHidden('Повторите пароль: ');
    if (password !== again) throw new Error('Пароли не совпадают');
  }
  if (!PASSWORD_POLICY.test(password)) throw new Error(PASSWORD_POLICY_TEXT);
  const prisma = new PrismaClient();
  try {
    await seedBase(prisma);
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
    const ex = await prisma.user.findUnique({ where: { login } });
    if (ex) throw new Error(`Пользователь ${login} уже существует. Для сброса пароля используйте раздел «Пользователи».`);
    await prisma.user.create({
      data: { login, fullName: name, passwordHash: await hashPassword(password), allUnits: true, mustChangePassword: false, roles: { create: [{ roleId: role.id }] } },
    });
    console.log(`Администратор ${login} создан`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(`Ошибка: ${e.message}`); process.exit(1); });
