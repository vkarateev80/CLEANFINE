#!/usr/bin/env node
/**
 * Prisma-клиент каждому сервису в его собственный node_modules.
 *
 * Проблема: pnpm дедуплицирует @prisma/client в один каталог
 * `node_modules/.pnpm/@prisma+client@<версия>_prisma@<версия>/node_modules`,
 * поэтому `prisma generate` для девяти схем пишет в одно и то же место —
 * побеждает тот сервис, который сгенерировал последним. В CI это ломало
 * `build`/`typecheck` auth-service (он видел модели ticket-service).
 *
 * Решение: после generate переносим клиент в node_modules самого сервиса
 * реальной копией. Разрешение `@prisma/client` из сервиса больше не идёт по
 * симлинку в общий store, и каждый сервис видит модели своей схемы и при
 * сборке, и при запуске (в e2e все девять сервисов работают одновременно).
 *
 * Скрипт идемпотентен: повторный запуск просто перезаписывает копии.
 * Запуск: node scripts/ci/prisma-clients.mjs
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { createRequire } from 'node:module';
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

function requireFrom(dir) {
  return createRequire(path.join(dir, 'package.json'));
}

/** Каталог установленного пакета @prisma/client (реальный путь, без симлинка pnpm). */
function clientPackageDir(dir) {
  return path.dirname(requireFrom(dir).resolve('@prisma/client/package.json'));
}

/** Удаление цели: каталог или симлинк на каталог (симлинк снимаем, не трогая цель). */
function removeTarget(target) {
  if (!existsSync(target)) return;
  if (lstatSync(target).isSymbolicLink()) {
    unlinkSync(target);
    return;
  }
  rmSync(target, { recursive: true, force: true });
}

/** Сравнение путей без учёта регистра на Windows. */
function samePath(left, right) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function copyInto(source, target) {
  // При повторном запуске цель уже может быть тем же каталогом, что источник
  // (раскладка npm, где клиент лежит в node_modules самого сервиса).
  if (samePath(source, target)) return;
  removeTarget(target);
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true, dereference: true });
}

/**
 * Каталог сгенерированного клиента: prisma пишет его в `node_modules/.prisma/client`
 * того node_modules, в котором лежит сам пакет `@prisma/client`. В раскладке pnpm
 * это `node_modules/.pnpm/@prisma+client@…/node_modules/.prisma/client`, в раскладке
 * npm — `backend/<сервис>/node_modules/.prisma/client`. Поэтому идём вверх по
 * каталогам, а не полагаемся на одну конкретную глубину.
 */
function generatedClientDir(pkgDir) {
  const candidates = [path.join(pkgDir, '.prisma', 'client')];
  let dir = pkgDir;
  for (let level = 0; level < 4; level += 1) {
    dir = path.dirname(dir);
    candidates.push(path.join(dir, '.prisma', 'client'));
  }
  const found = candidates.find((candidate) => existsSync(path.join(candidate, 'index.js')));
  if (!found) {
    const seen = candidates.map(
      (candidate) =>
        `  ${candidate} → ${existsSync(candidate) ? 'каталог есть, index.js нет' : 'нет'}`,
    );
    throw new Error(`не найден сгенерированный Prisma-клиент для ${pkgDir}\n${seen.join('\n')}`);
  }
  return found;
}

function generate(dir) {
  execFileSync('pnpm', ['prisma:generate'], {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

/** Переносит клиент сервиса в его node_modules; возвращает путь к копии. */
function materialize(dir) {
  const pkgDir = clientPackageDir(dir);
  const generated = generatedClientDir(pkgDir);
  const nodeModules = path.join(dir, 'node_modules');
  copyInto(generated, path.join(nodeModules, '.prisma', 'client'));
  copyInto(pkgDir, path.join(nodeModules, '@prisma', 'client'));
}

/** Модели из схемы сервиса — эталон для проверки. */
function schemaModels(dir) {
  const schema = readFileSync(path.join(dir, 'prisma', 'schema.prisma'), 'utf8');
  return [...schema.matchAll(/^model\s+(\w+)/gm)].map((match) => match[1]).sort();
}

/**
 * Проверка клиента сервиса — обязательно в дочернем процессе: в текущем
 * процессе Node кэширует realpath симлинков, поэтому после подмены ссылки на
 * каталог `require.resolve` ещё возвращал бы путь в общем store. Дочерний
 * процесс видит ровно то, что увидят сборка и запуск сервиса.
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
  materialize(dir);
}

// Второй проход — проверка: у каждого сервиса своя копия клиента и модели его схемы.
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
