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

// Минимальный парсер .env (без dotenv).
// Если файла нет (CI, контейнер) — молча продолжаем: переменные окружения
// процесса имеют приоритет, и в CI DATABASE_URL задаётся джобой.
function loadEnv() {
  let text;
  try {
    text = readFileSync(join(root, '.env'), 'utf8');
  } catch {
    console.log('.env не найден — использую переменные окружения процесса');
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
    // уже заданные в окружении значения не перетираем
    if (m && process.env[m[1]] === undefined) {
      // снимаем обрамляющие кавычки: bash при source делает то же, наш парсер обязан
      // повторить (иначе Prisma получает "postgresql://…" в кавычках и падает валидацией)
      let v = m[2];
      if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}
loadEnv();

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL не задан (ни в .env, ни в окружении) — seed невозможен');
  process.exit(1);
}

const users = JSON.parse(readFileSync(join(root, 'test', 'fixtures', 'users.json'), 'utf8'));

const prisma = new PrismaClient();

async function main() {
  let created = 0;
  let updated = 0;

  for (const u of users) {
    const email = u.email.toLowerCase();

    // Учётные данные (пароль/PIN/биометрия) пересоздаются на каждом прогоне:
    // seed обязан приводить dev-стенд к документированному состоянию из fixtures.
    // Раньше ветка update не трогала passwordHash, и после смены пароля через API
    // документированные креды перестают работать, хотя seed рапортует успех.
    const credentials = {
      passwordHash: await bcrypt.hash(u.password, 10),
      pinCode: u.pinCode ? await bcrypt.hash(String(u.pinCode), 10) : null,
      // biometricKey — идентификатор устройства: не перетираем null'ом, если в фикстуре его нет
      ...(u.biometricKey ? { biometricKey: u.biometricKey } : {}),
    };

    const data = {
      email,
      phone: u.phone ?? null,
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive ?? true,
      ...credentials,
    };

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({ where: { email }, data });
      updated++;
      console.log(`обновлён: ${email} (${u.role})${u.pinCode ? `, PIN=${u.pinCode}` : ''}`);
    } else {
      await prisma.user.create({ data });
      created++;
      console.log(`создан: ${email} (${u.role})${u.pinCode ? `, PIN=${u.pinCode}` : ''}`);
    }
  }

  const withPin = users.filter((u) => u.pinCode).length;
  const withBiometric = users.filter((u) => u.biometricKey).length;
  console.log(
    `Seed готов: создано ${created}, обновлено ${updated}; PIN у ${withPin}/${users.length}, биометрия у ${withBiometric}/${users.length}`,
  );
  if (withPin === 0) {
    console.warn('ВНИМАНИЕ: ни у одного пользователя нет pinCode — PIN-вход будет недоступен');
  }
  if (withBiometric === 0) {
    console.warn('ВНИМАНИЕ: ни у одного пользователя нет biometricKey — биометрический вход будет недоступен');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
