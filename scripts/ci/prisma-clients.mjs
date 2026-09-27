/**
 * Генерация Prisma-клиента каждой схемы в node_modules своего сервиса.
 *
 * Схемы указывают `output = "../node_modules/.prisma/client"` — prisma пишет
 * клиент в пакет сервиса. Но `@prisma/client` в изолированном node_modules
 * pnpm — СИМЛИНК в общий store, а его default.js требует `.prisma/client/default`
 * от СЕБЯ (то есть от store), где общего клиента нет: резолв падает.
 * Поэтому после generate симлинк заменяется РЕАЛЬНОЙ КОПИЕЙ пакета рядом
 * с сервисным `.prisma` (то, что раньше делал «перенос копии» и что ждёт
 * verify: resolve должен указывать внутрь node_modules сервиса).
 * Примечание: пути вида backend/<service>/node_modules.
 *
 * Запуск: node scripts/ci/prisma-clients.mjs
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const backendDir = path.join(root, 'backend');

/** Сервисы с prisma/schema.prisma, в алфавитном порядке (как в CI-цикле). */
function serviceDirs() {
  return readdirSync(backendDir)
    .map((name) => path.join(backendDir, name))
    .filter((dir) => existsSync(path.join(dir, 'prisma', 'schema.prisma')))
    .sort();
}

function generate(dir) {
  execFileSync('pnpm', ['prisma:generate'], {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  ensureRealClient(dir);
}

/**
 * Симлинк @prisma/client → общий store заменяем реальной копией в сервисе:
 * только так `require('.prisma/client/default')` из default.js находит клиент
 * ЭТОГО сервиса (лежит в node_modules самого сервиса: .prisma/client), а verify видит
 * resolve внутри node_modules сервиса. Идемпотентно: реальная копия не трогается,
 * `pnpm install` вернёт симлинк — следующий прогон снова скопирует.
 */
function ensureRealClient(dir) {
  const clientDir = path.join(dir, 'node_modules', '@prisma', 'client');
  if (!existsSync(clientDir)) return;
  const stat = lstatSync(clientDir);
  if (!stat.isSymbolicLink()) return;
  const real = realpathSync(clientDir);
  rmSync(clientDir, { recursive: true, force: true });
  cpSync(real, clientDir, { recursive: true });
}

/** Модели из схемы сервиса — эталон для проверки. */
function schemaModels(dir) {
  const schema = readFileSync(path.join(dir, 'prisma', 'schema.prisma'), 'utf8');
  return [...schema.matchAll(/^model\s+(\w+)/gm)].map((match) => match[1]).sort();
}

/**
 * Проверка клиента сервиса — обязательно в дочернем процессе: в текущем
 * процессе Node кэширует realpath симлинков. Дочерний процесс видит ровно то,
 * что увидят сборка и запуск сервиса.
 */
const INSPECT = `
const path = require('node:path');
const { createRequire } = require('node:module');
const requireFromService = createRequire(path.join(process.cwd(), 'package.json'));
const resolved = requireFromService.resolve('@prisma/client');
const { Prisma } = requireFromService('@prisma/client');
console.log(JSON.stringify({
  resolved,
  models: Prisma.dmmf.datamodel.models.map((model) => model.name).sort(),
}));
`;

function inspect(dir) {
  const output = execFileSync(process.execPath, ['-e', INSPECT], { cwd: dir, encoding: 'utf8' });
  const lastLine = output.trim().split('\n').pop();
  return JSON.parse(lastLine);
}

/** Клиент сервиса резолвится из его node_modules и содержит модели его схемы. */
function verify(dir, name) {
  const { resolved, models } = inspect(dir);
  const own = path.join(dir, 'node_modules');
  if (!resolved.startsWith(own)) {
    throw new Error(`${name}: @prisma/client резолвится в общий store (${resolved})`);
  }
  const expected = schemaModels(dir);
  if (models.join(',') !== expected.join(',')) {
    throw new Error(
      `${name}: модели клиента не совпадают со схемой\n  схема:   ${expected.join(',')}\n  клиент:  ${models.join(',')}`,
    );
  }
  return models.length;
}

const dirs = serviceDirs();
if (dirs.length === 0) {
  console.error('не найдено ни одного backend-сервиса с prisma/schema.prisma');
  process.exit(1);
}

for (const dir of dirs) {
  const name = path.basename(dir);
  console.log(`== prisma client: ${name} ==`);
  generate(dir);
}

// Второй проход — проверка: у каждого сервиса свой клиент и модели его схемы.
let failed = 0;
for (const dir of dirs) {
  const name = path.basename(dir);
  try {
    const count = verify(dir, name);
    console.log(`ок: ${name} — ${count} моделей своей схемы`);
  } catch (error) {
    failed += 1;
    console.error(`ОШИБКА: ${error.message}`);
  }
}

if (failed > 0) {
  console.error(`проверка Prisma-клиентов не прошла: ${failed} сервис(ов)`);
  process.exit(1);
}
console.log(`готово: клиент сгенерирован и проверен для ${dirs.length} сервисов`);
