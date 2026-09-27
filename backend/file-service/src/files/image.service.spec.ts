import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { ImageService } from './image.service';

/** Реальный PNG заданного размера — sharp работает по-настоящему, без моков. */
async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .png()
    .toBuffer();
}

describe('ImageService', () => {
  let service: ImageService;

  beforeEach(() => {
    service = new ImageService();
  });

  describe('inspect', () => {
    it('возвращает размеры и формат изображения', async () => {
      const result = await service.inspect(await makePng(1600, 900));
      expect(result).toEqual({ format: 'png', width: 1600, height: 900 });
    });

    it('возвращает null для не-изображения', async () => {
      expect(await service.inspect(Buffer.from('это не картинка'))).toBeNull();
    });

    it('возвращает null для пустого буфера', async () => {
      expect(await service.inspect(Buffer.alloc(0))).toBeNull();
    });
  });

  describe('assertMinResolution', () => {
    it('пропускает 1280×720 (граница)', () => {
      expect(() => service.assertMinResolution({ width: 1280, height: 720 })).not.toThrow();
    });

    it('пропускает больше минимального', () => {
      expect(() => service.assertMinResolution({ width: 4000, height: 3000 })).not.toThrow();
    });

    it('пропускает портрет 1080×1920 (фронтальная камера)', () => {
      expect(() => service.assertMinResolution({ width: 1080, height: 1920 })).not.toThrow();
    });

    it('отклоняет меньше минимального по ширине', () => {
      expect(() => service.assertMinResolution({ width: 1279, height: 720 })).toThrow(
        BadRequestException,
      );
    });

    it('отклоняет меньше минимального по высоте', () => {
      expect(() => service.assertMinResolution({ width: 1280, height: 719 })).toThrow(
        /меньше минимального/,
      );
    });
  });

  describe('generateWatermarkSvg', () => {
    const base = { userName: 'Иванов Иван', takenAt: new Date('2026-09-14T18:00:00.000Z') };

    it('содержит имя, дату и координаты', () => {
      const svg = service.generateWatermarkSvg({ ...base, lat: 55.7558, lng: 37.6173 });
      expect(svg).toContain('Иванов Иван');
      expect(svg).toContain('55.755800, 37.617300');
      expect(svg).toMatch(/2026/);
    });

    it('без координат пишет явную пометку', () => {
      const svg = service.generateWatermarkSvg(base);
      expect(svg).toContain('координаты не переданы');
    });

    it('не подставляет координаты, если передана только широта', () => {
      const svg = service.generateWatermarkSvg({ ...base, lat: 55.7558, lng: null });
      expect(svg).toContain('координаты не переданы');
    });

    it('экранирует XML в имени пользователя (защита от инъекции разметки)', () => {
      const svg = service.generateWatermarkSvg({
        ...base,
        userName: '<script>alert(1)</script>',
      });
      expect(svg).not.toContain('<script>');
      expect(svg).toContain('&lt;script&gt;');
    });

    it('экранирует амперсанд и кавычки', () => {
      const svg = service.generateWatermarkSvg({ ...base, userName: 'ООО "Ромашка" & Co' });
      expect(svg).toContain('&amp;');
      expect(svg).toContain('&quot;');
    });

    it('обрезает слишком длинное имя', () => {
      const svg = service.generateWatermarkSvg({ ...base, userName: 'Я'.repeat(100) });
      expect(svg).toContain('…');
    });

    it('принимает отрицательные координаты', () => {
      const svg = service.generateWatermarkSvg({ ...base, lat: -33.8688, lng: 151.2093 });
      expect(svg).toContain('-33.868800, 151.209300');
    });
  });

  describe('addWatermark', () => {
    it('накладывает знак и перекодирует в JPEG', async () => {
      const source = await makePng(1600, 900);
      const result = await service.addWatermark(source, {
        userName: 'Петров Пётр',
        takenAt: new Date('2026-09-14T12:00:00.000Z'),
        lat: 55.75,
        lng: 37.61,
      });

      const meta = await sharp(result).metadata();
      expect(meta.format).toBe('jpeg');
      // размеры сохраняются, знак только накладывается
      expect(meta.width).toBe(1600);
      expect(meta.height).toBe(900);
    });

    it('результат отличается от исходника (знак реально наложен)', async () => {
      const source = await makePng(1400, 800);
      const result = await service.addWatermark(source, {
        userName: 'Тест',
        takenAt: new Date(),
      });
      expect(Buffer.compare(source, result)).not.toBe(0);
    });

    it('работает на минимально допустимом разрешении', async () => {
      const result = await service.addWatermark(await makePng(1280, 720), {
        userName: 'Оператор',
        takenAt: new Date(),
      });
      expect((await sharp(result).metadata()).width).toBe(1280);
    });
  });

  describe('generateThumbnail', () => {
    it('уменьшает по ширине с сохранением пропорций', async () => {
      const result = await service.generateThumbnail(await makePng(1600, 900));
      const meta = await sharp(result).metadata();
      expect(meta.width).toBe(400);
      expect(meta.height).toBe(225); // 900 * 400/1600
      expect(meta.format).toBe('jpeg');
    });

    it('поддерживает произвольную ширину', async () => {
      const result = await service.generateThumbnail(await makePng(1600, 900), 200);
      expect((await sharp(result).metadata()).width).toBe(200);
    });

    it('не увеличивает маленькое изображение', async () => {
      const result = await service.generateThumbnail(await makePng(300, 200), 400);
      expect((await sharp(result).metadata()).width).toBe(300);
    });
  });
});
