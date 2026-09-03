// Seed пользователей (М1.7). Использует Prisma auth-service и .env из корня репозитория.
// Запуск: node scripts/seed/seed-users.mjs   (требует запущенного PostgreSQL и применённых миграций auth)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(root, 'backend', 'auth-service', 'package.json'));
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

// Минимальный парсер .env (без dotenv)
function loadEnv() {
  const text = readFileSync(join(root, '.env'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}
loadEnv();

const users = JSON.parse(readFileSync(join(root, 'test', 'fixtures', 'users.json'), 'utf8'));

const prisma = new PrismaClient();

async function main() {
  let created = 0;
  let updated = 0;
  for (const u of users) {
    const email = u.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    const data = {
      email,
      phone: u.phone ?? null,
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive ?? true,
    };
    if (existing) {
      await prisma.user.update({ where: { email }, data });
      updated++;
      console.log(`обновлён: ${email} (${u.role})`);
    } else {
      await prisma.user.create({
        data: { ...data, passwordHash: await bcrypt.hash(u.password, 10) },
      });
      created++;
      console.log(`создан: ${email} (${u.role})`);
    }
  }
  console.log(`Seed готов: создано ${created}, обновлено ${updated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
