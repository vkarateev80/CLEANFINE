import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import {
  DEFAULT_PHOTO_QUALITY,
  DEFAULT_THUMBNAIL_WIDTH,
  MIN_PHOTO_HEIGHT,
  MIN_PHOTO_WIDTH,
} from '../config/configuration';
import { escapeXml, truncate } from '../common/xml.util';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface WatermarkMetadata {
  userName: string;
  takenAt: Date;
  lat?: number | null;
  lng?: number | null;
}

/**
 * Обработка изображений (УСТАВ.md → Агент Backend Files, п.2):
 * валидация разрешения, водяной знак (имя/дата/координаты), миниатюра.
 */
@Injectable()
export class ImageService {
  /** Метаданные изображения; null — файл не является изображением. */
  async inspect(buffer: Buffer): Promise<(ImageDimensions & { format: string }) | null> {
    try {
      const meta = await sharp(buffer).metadata();
      if (!meta.format || !meta.width || !meta.height) {
        return null;
      }
      return { format: meta.format, width: meta.width, height: meta.height };
    } catch {
      return null;
    }
  }

  /**
   * Проверка минимального разрешения фото (приёмка: 1280×720).
   * Ориентация не важна: портрет 1080×1920 проходит (min≥720, max≥1280),
   * потому что раньше проверка «по ширине» браковала фронтальную камеру.
   */
  assertMinResolution(dims: ImageDimensions): void {
    const minSide = Math.min(dims.width, dims.height);
    const maxSide = Math.max(dims.width, dims.height);
    if (minSide < MIN_PHOTO_HEIGHT || maxSide < MIN_PHOTO_WIDTH) {
      throw new BadRequestException(
        `Разрешение фото ${dims.width}×${dims.height} меньше минимального ` +
          `${MIN_PHOTO_WIDTH}×${MIN_PHOTO_HEIGHT} (ориентация не важна)`,
      );
    }
  }

  /** Накладывает водяной знак и перекодирует в JPEG (как в уставе, п.2). */
  async addWatermark(buffer: Buffer, metadata: WatermarkMetadata): Promise<Buffer> {
    const svg = Buffer.from(this.generateWatermarkSvg(metadata));
    return sharp(buffer)
      .rotate() // учесть EXIF-ориентацию до наложения знака
      .composite([{ input: svg, gravity: 'southeast' }])
      .jpeg({ quality: DEFAULT_PHOTO_QUALITY })
      .toBuffer();
  }

  /** Миниатюра для списков (по ширине). */
  async generateThumbnail(buffer: Buffer, width = DEFAULT_THUMBNAIL_WIDTH): Promise<Buffer> {
    return sharp(buffer)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  }

  /** SVG водяного знака: имя, дата, координаты (код устава п.2). */
  generateWatermarkSvg(metadata: WatermarkMetadata): string {
    const { userName, takenAt, lat, lng } = metadata;
    const date = takenAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const hasCoords = typeof lat === 'number' && typeof lng === 'number';
    const coords = hasCoords ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'координаты не переданы';

    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80">',
      '<rect width="400" height="80" fill="rgba(0,0,0,0.5)"/>',
      `<text x="10" y="28" fill="white" font-size="16" font-family="sans-serif">${escapeXml(truncate(userName, 34))}</text>`,
      `<text x="10" y="50" fill="white" font-size="13" font-family="sans-serif">${escapeXml(date)}</text>`,
      `<text x="10" y="70" fill="white" font-size="13" font-family="sans-serif">${escapeXml(coords)}</text>`,
      '</svg>',
    ].join('');
  }
}
