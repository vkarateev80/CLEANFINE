#!/usr/bin/env node
/**
 * Переводы интерфейса оператора (shared/i18n/*.json) ↔ код двух клиентов.
 *
 *   node scripts/i18n/sync.mjs          — сгенерировать Dart-карту и показать сводку
 *   node scripts/i18n/sync.mjs --check  — то же, но выход 1, если переводов не хватает
 *   node scripts/i18n/sync.mjs --todo   — напечатать недостающие ключи как JSON-объект
 *
 * Ключи собираются из исходников: Dart — `tr('…')`, `'…'.tr`, `trArgs('…')`;
 * TypeScript — `t('…')`. Строки с переносом внутри литерала не поддерживаются
 * (и не нужны — в интерфейсе их нет).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DICT_DIR = join(ROOT, 'shared', 'i18n');
const LANGS = ['ky', 'uz'];
const DART_OUT = join(ROOT, 'mobile', 'cleaning-ops-app', 'lib', 'core', 'i18n', 'translations.g.dart');
const FLUTTER_LIB = join(ROOT, 'mobile', 'cleaning-ops-app', 'lib');
const WEB_SRC = join(ROOT, 'frontend', 'web-operator', 'src');

const args = new Set(process.argv.slice(2));

function walk(dir, filter, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

/** Снимает экранирование Dart/TS-литерала в одинарных кавычках. */
function unescape(raw) {
  return raw.replace(/\\(.)/g, (_, ch) => (ch === 'n' ? '\n' : ch));
}

const DART_PATTERNS = [
  /\btr(?:Args)?\(\s*'((?:[^'\\\n]|\\.)*)'/g,
  /'((?:[^'\\\n]|\\.)*)'\s*\.tr\b/g,
];
/** Подписи из const-контекста перечислены в lib/core/i18n/static_keys.dart списком. */
const STATIC_KEYS_FILE = join(FLUTTER_LIB, 'core', 'i18n', 'static_keys.dart');
const TS_PATTERNS = [/(?<![A-Za-z0-9_$.])t\(\s*'((?:[^'\\\n]|\\.)*)'/g];

function collect(files, patterns) {
  const keys = new Map(); // key → первое место использования
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const key = unescape(match[1]);
        if (key.trim() === '' || !/[А-Яа-яЁё]/.test(key)) continue;
        if (!keys.has(key)) keys.set(key, relative(ROOT, file));
      }
    }
  }
  return keys;
}

const dartFiles = walk(FLUTTER_LIB, (f) => f.endsWith('.dart') && !f.endsWith('.g.dart'));
const tsFiles = walk(WEB_SRC, (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const dartKeys = collect(dartFiles, DART_PATTERNS);
{
  const text = readFileSync(STATIC_KEYS_FILE, 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const body = text.slice(text.indexOf('<String>['), text.lastIndexOf(']'));
  for (const m of body.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
    const key = unescape(m[1]);
    if (!dartKeys.has(key)) dartKeys.set(key, relative(ROOT, STATIC_KEYS_FILE));
  }
}
const tsKeys = collect(tsFiles, TS_PATTERNS);
{
  const file = join(WEB_SRC, 'i18n', 'staticKeys.ts');
  const text = readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const body = text.slice(text.indexOf('= ['), text.lastIndexOf(']'));
  for (const m of body.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
    const key = unescape(m[1]);
    if (!tsKeys.has(key)) tsKeys.set(key, relative(ROOT, file));
  }
}
const used = new Map([...dartKeys, ...tsKeys]);

const dicts = {};
for (const lang of LANGS) {
  dicts[lang] = JSON.parse(readFileSync(join(DICT_DIR, `${lang}.json`), 'utf8'));
}

const missing = {};
for (const lang of LANGS) {
  missing[lang] = [...used.keys()].filter((key) => !(key in dicts[lang]) || dicts[lang][key] === '');
}
const unused = [...new Set(LANGS.flatMap((lang) => Object.keys(dicts[lang])))].filter((key) => !used.has(key));

// Плейсхолдеры перевода обязаны совпадать с исходником.
const badPlaceholders = [];
for (const lang of LANGS) {
  for (const [key, value] of Object.entries(dicts[lang])) {
    const src = (key.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(' ');
    const dst = (value.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(' ');
    if (src !== dst) badPlaceholders.push(`${lang}: «${key}» → «${value}»`);
  }
}

function dartString(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$').replace(/\n/g, '\\n')}'`;
}

let dart = '// СГЕНЕРИРОВАНО scripts/i18n/sync.mjs из shared/i18n/*.json — не править руками.\n';
dart += '// ignore_for_file: lines_longer_than_80_chars\n\n';
dart += '/// Переводы интерфейса: язык → русская строка → перевод.\n';
dart += 'const Map<String, Map<String, String>> kTranslations = <String, Map<String, String>>{\n';
for (const lang of LANGS) {
  dart += `  '${lang}': <String, String>{\n`;
  for (const key of Object.keys(dicts[lang]).sort((a, b) => a.localeCompare(b, 'ru'))) {
    const value = dicts[lang][key];
    if (value === '') continue;
    dart += `    ${dartString(key)}: ${dartString(value)},\n`;
  }
  dart += '  },\n';
}
dart += '};\n';
writeFileSync(DART_OUT, dart);

if (args.has('--todo')) {
  const todo = {};
  for (const key of [...used.keys()].sort((a, b) => a.localeCompare(b, 'ru'))) {
    if (LANGS.some((lang) => missing[lang].includes(key))) todo[key] = '';
  }
  console.log(JSON.stringify(todo, null, 2));
}

console.error(
  `ключей в коде: ${used.size} (dart ${dartKeys.size}, web ${tsKeys.size}); ` +
    LANGS.map((lang) => `${lang}: нет ${missing[lang].length}`).join(', ') +
    `; лишних в словарях: ${unused.length}; плейсхолдеры: ${badPlaceholders.length} ошибок`,
);
if (unused.length && !args.has('--todo')) console.error('лишние ключи: ' + unused.slice(0, 20).map((k) => `«${k}»`).join(', ') + (unused.length > 20 ? ' …' : ''));
if (badPlaceholders.length) console.error(badPlaceholders.join('\n'));
if (args.has('--check') && (LANGS.some((lang) => missing[lang].length) || badPlaceholders.length)) {
  for (const lang of LANGS) for (const key of missing[lang]) console.error(`${lang}: нет перевода «${key}» (${used.get(key)})`);
  process.exit(1);
}
