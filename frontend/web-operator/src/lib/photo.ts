/**
 * Фото из камеры телефона. Браузер отдаёт `File` через `<input type="file"
 * accept="image/*" capture="environment">`; мы проверяем разрешение
 * (file-service отклоняет меньше 1280×720), ужимаем до 1920 px по длинной
 * стороне (как `image_picker` в нативном приложении) и отдаём JPEG.
 */
export const PHOTO_MIN_WIDTH = 1280;
export const PHOTO_MIN_HEIGHT = 720;
export const PHOTO_MAX_SIDE = 1920;
export const PHOTO_TOO_SMALL_TEXT = 'Фото слишком маленькое. Снимите заново';

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
  takenAt: string;
  /** Object URL для превью; вызывающий код обязан `revokePhotoPreview`. */
  previewUrl: string;
}

export class PhotoTooSmall extends Error {
  constructor() {
    super(PHOTO_TOO_SMALL_TEXT);
    this.name = 'PhotoTooSmall';
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось прочитать фото'));
    image.src = url;
  });
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    // Проверка по длинной/короткой стороне: вертикальное фото 720×1280 тоже годится.
    const long = Math.max(width, height);
    const short = Math.min(width, height);
    if (long < PHOTO_MIN_WIDTH || short < PHOTO_MIN_HEIGHT) throw new PhotoTooSmall();

    const scale = Math.min(1, PHOTO_MAX_SIDE / long);
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось обработать фото');
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Не удалось сжать фото'))),
        'image/jpeg',
        0.85,
      );
    });
    return {
      blob,
      width: targetWidth,
      height: targetHeight,
      takenAt: new Date(file.lastModified || Date.now()).toISOString(),
      previewUrl: URL.createObjectURL(blob),
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function revokePhotoPreview(photo: PreparedPhoto | null | undefined): void {
  if (photo) URL.revokeObjectURL(photo.previewUrl);
}
