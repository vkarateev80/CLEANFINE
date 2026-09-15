// Генератор тестовых изображений для e2e file-service.
// Использование: node scripts/make-fixtures.cjs <каталог>
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const sharp = require('sharp');

async function main() {
  const out = process.argv[2];
  if (!out) {
    console.error('укажите каталог для фикстур');
    process.exit(1);
  }
  mkdirSync(out, { recursive: true });

  // Валидное фото: ≥1280×720
  const big = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: { r: 90, g: 140, b: 200 } },
  })
    .png()
    .toBuffer();
  writeFileSync(join(out, 'photo-ok.png'), big);

  // Слишком маленькое фото
  const small = await sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 120, b: 90 } },
  })
    .png()
    .toBuffer();
  writeFileSync(join(out, 'photo-small.png'), small);

  // План этажа (тоже изображение, но kind=plan — разрешение не проверяется)
  const plan = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 240, g: 240, b: 235 } },
  })
    .png()
    .toBuffer();
  writeFileSync(join(out, 'floor-plan.png'), plan);

  // Документ допустимого размера и превышающий лимит 10 МБ
  writeFileSync(join(out, 'doc.txt'), Buffer.from('технический документ', 'utf8'));
  writeFileSync(join(out, 'too-big.png'), Buffer.alloc(11 * 1024 * 1024, 7));

  console.log('фикстуры созданы в', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
