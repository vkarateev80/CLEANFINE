// Генератор артефактов дизайн-токенов (М1.1, задача DS-001).
// Читает design/tokens/*.json → пишет design/tokens/generated/{tokens.css, lib/app_tokens.dart}.
// Запуск: node design/scripts/generate.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const designRoot = join(__dirname, '..');
const tokensDir = join(designRoot, 'tokens');
const outDir = join(tokensDir, 'generated');

const colors = JSON.parse(readFileSync(join(tokensDir, 'colors.json'), 'utf8')).colors;
const typography = JSON.parse(readFileSync(join(tokensDir, 'typography.json'), 'utf8')).typography;
const spacing = JSON.parse(readFileSync(join(tokensDir, 'spacing.json'), 'utf8')).spacing;
const shadows = JSON.parse(readFileSync(join(tokensDir, 'shadows.json'), 'utf8')).shadows;
const radius = JSON.parse(readFileSync(join(tokensDir, 'borderRadius.json'), 'utf8')).borderRadius;

mkdirSync(outDir, { recursive: true });

// ---------- CSS ----------
const cssLines = [':root {', '  /* Цвета (design/tokens/colors.json) */'];
for (const [group, shades] of Object.entries(colors)) {
  for (const [shade, hex] of Object.entries(shades)) {
    cssLines.push(`  --color-${group}-${shade}: ${hex};`);
  }
}
cssLines.push('', '  /* Типографика */', `  --font-sans: ${typography.fontFamily.sans};`, `  --font-mono: ${typography.fontFamily.mono};`);
for (const [size, px] of Object.entries(typography.sizes)) cssLines.push(`  --text-${size}: ${px};`);
for (const [weight, val] of Object.entries(typography.weights)) cssLines.push(`  --font-weight-${weight}: ${val};`);
for (const [lh, px] of Object.entries(typography.lineHeights)) cssLines.push(`  --leading-${lh}: ${px};`);
cssLines.push('', '  /* Отступы (база 4px) */', `  --spacing-base: ${spacing.base}px;`);
for (const [step, px] of Object.entries(spacing.scale)) cssLines.push(`  --spacing-${step}: ${px}px;`);
cssLines.push('', '  /* Тени (4 уровня) */');
for (const [level, s] of Object.entries(shadows.levels)) {
  cssLines.push(`  --shadow-${level}: ${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread}px ${s.color};`);
}
cssLines.push('', '  /* Скругления */');
for (const [level, px] of Object.entries(radius.levels)) cssLines.push(`  --radius-${level}: ${px}px;`);
cssLines.push('}');
writeFileSync(join(outDir, 'tokens.css'), cssLines.join('\n') + '\n', 'utf8');

// ---------- Dart (Flutter) ----------
const hexToInt = (hex) => `0xFF${hex.slice(1).toUpperCase()}`;

/**
 * Идентификатор Dart: не может начинаться с цифры, поэтому ключи вида `2xl`
 * (шаг шкалы отступов) становятся `space2xl`. Иначе сгенерированный файл не
 * компилируется во Flutter (`static const double 2xl = 32;` — ошибка парсера).
 */
const dartIdent = (name, prefix = 'space') => {
  const cleaned = String(name).replace(/[^A-Za-z0-9_]/g, '');
  return /^[0-9]/.test(cleaned) ? `${prefix}${cleaned}` : cleaned;
};

const dart = [];
dart.push('// Сгенерировано автоматически: node design/scripts/generate.mjs. Не редактировать вручную.');
dart.push('/// Дизайн-токены Cleaning Ops (источник: design/tokens/*.json).');
dart.push('/// Цвета — как int (используйте Color(AppColors.primary500));');
dart.push('/// сборка ThemeData выполняется в mobile (М6) поверх этих констант.');
dart.push('');
dart.push('class AppColors {');
for (const [group, shades] of Object.entries(colors)) {
  for (const [shade, hex] of Object.entries(shades)) {
    const name = group === 'primary' ? 'primary' : group;
    dart.push(`  static const int ${name}${shade} = ${hexToInt(hex)};`);
  }
}
dart.push('}');
dart.push('');
dart.push('class AppSpacing {');
dart.push(`  static const double base = ${spacing.base};`);
for (const [step, px] of Object.entries(spacing.scale))
  dart.push(`  static const double ${dartIdent(step)} = ${px};`);
dart.push('}');
dart.push('');
dart.push('class AppRadius {');
for (const [level, px] of Object.entries(radius.levels))
  dart.push(`  static const double ${dartIdent(level, 'radius')} = ${px};`);
dart.push('}');
dart.push('');
dart.push('class AppTypography {');
dart.push(`  static const String fontSans = '${typography.fontFamily.sans}';`);
dart.push(`  static const String fontMono = '${typography.fontFamily.mono}';`);
for (const [size, px] of Object.entries(typography.sizes)) {
  dart.push(`  static const double size${size.toUpperCase()} = ${parseFloat(px)};`);
}
for (const [weight, val] of Object.entries(typography.weights)) dart.push(`  static const int weight${weight[0].toUpperCase() + weight.slice(1)} = ${val};`);
dart.push('}');

// Проверка: сгенерированные константы должны быть валидными Dart-идентификаторами.
// Ломающий пример уже был: шкала отступов содержит `2xl`, и Flutter не собирался.
const badIdentifiers = dart
  .map((line) => /^\s+static const \w+ ([A-Za-z0-9_]+) =/.exec(line))
  .filter((match) => match && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(match[1]))
  .map((match) => match[1]);
if (badIdentifiers.length > 0) {
  throw new Error(`невалидные Dart-идентификаторы в app_tokens.dart: ${badIdentifiers.join(', ')}`);
}

// Dart-файл лежит в `lib/` каталога-пакета: мобильное приложение подключает
// design/tokens/generated как path-зависимость `cleaning_ops_tokens`, а Dart
// видит в пакете только то, что лежит под `lib/`.
mkdirSync(join(outDir, 'lib'), { recursive: true });
writeFileSync(join(outDir, 'lib', 'app_tokens.dart'), dart.join('\n') + '\n', 'utf8');

console.log('Generated:');
console.log('  - design/tokens/generated/tokens.css');
console.log('  - design/tokens/generated/lib/app_tokens.dart');
