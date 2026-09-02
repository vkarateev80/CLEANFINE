<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# АГЕНТ: BACKEND FILES
# 🤖 АГЕНТ: BACKEND FILE SERVICE

## 📋 Профиль агента

**Роль:** Backend Developer (Files)  
**Ответственность:** Загрузка файлов, фото, водяные знаки  
**Рабочая директория:** `backend/file-service/`  
**Технологии:** NestJS, TypeScript, MinIO (S3), Sharp, Multer  
**Отчетность:** Backend Architect

---

## 🎯 Цели

1. Загрузка файлов в S3/MinIO
2. Генерация миниатюр
3. Водяные знаки
4. Валидация форматов
5. Привязка к заявкам

---

## 📝 Инструкции по реализации

### 1. Конфигурация MinIO

```typescript
// minio.config.ts
import { Client } from 'minio';

export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

export const BUCKETS = {
  PHOTOS: 'photos',
  PLANS: 'plans',
  AVATARS: 'avatars',
  DOCUMENTS: 'documents',
};
2. Загрузка с водяным знаком
typescript
// photo.service.ts
import sharp from 'sharp';

@Injectable()
export class PhotoService {
  
  async uploadPhoto(file: Express.Multer.File, metadata: PhotoMetadata): Promise<Photo> {
    // 1. Валидация
    this.validatePhoto(file);
    
    // 2. Добавление водяного знака
    const watermarkedBuffer = await this.addWatermark(file.buffer, metadata);
    
    // 3. Генерация миниатюры
    const thumbnailBuffer = await this.generateThumbnail(watermarkedBuffer);
    
    // 4. Загрузка в MinIO
    const photoUrl = await this.uploadToMinIO(watermarkedBuffer, 'original');
    const thumbnailUrl = await this.uploadToMinIO(thumbnailBuffer, 'thumbnail');
    
    // 5. Сохранение в БД
    const photo = await this.savePhotoMetadata({
      url: photoUrl,
      thumbnailUrl,
      ...metadata,
    });
    
    return photo;
  }

  private async addWatermark(buffer: Buffer, metadata: PhotoMetadata): Promise<Buffer> {
    const watermarkSvg = this.generateWatermarkSvg(metadata);
    
    return await sharp(buffer)
      .composite([{
        input: Buffer.from(watermarkSvg),
        gravity: 'southeast',
      }])
      .jpeg({ quality: 85 })
      .toBuffer();
  }

  private generateWatermarkSvg(metadata: PhotoMetadata): string {
    const { userName, timestamp, lat, lng } = metadata;
    const date = new Date(timestamp).toLocaleString('ru-RU');
    const coords = `${lat?.toFixed(6)}, ${lng?.toFixed(6)}`;
    
    return `
      <svg width="400" height="80">
        <rect width="400" height="80" fill="rgba(0,0,0,0.5)"/>
        <text x="10" y="25" fill="white" font-size="14">${userName}</text>
        <text x="10" y="45" fill="white" font-size="12">${date}</text>
        <text x="10" y="65" fill="white" font-size="12">${coords}</text>
      </svg>
    `;
  }
}
✅ Acceptance Criteria
□ Загрузка файлов работает
□ Водяные знаки накладываются
□ Миниатюры генерируются
□ Валидация работает
□ Форматы: JPEG, PNG, MP4
□ Максимальный размер: 10 МБ
□ Минимальное разрешение: 1280x720
