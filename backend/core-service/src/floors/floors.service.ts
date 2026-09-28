import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Floor } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AttachPlanDto, CreateFloorDto, UpdateFloorDto } from './dto/floor.dto';
import { FileServiceClient, PlanUploadError } from './file-service.client';

@Injectable()
export class FloorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileService: FileServiceClient,
  ) {}

  async create(objectId: string, dto: CreateFloorDto): Promise<Floor> {
    await this.assertObjectExists(objectId);
    await this.assertNumberFree(objectId, dto.number);

    return this.prisma.floor.create({
      data: {
        objectId,
        number: dto.number,
        name: dto.name,
        planScale: dto.planScale,
      },
    });
  }

  async listByObject(objectId: string): Promise<Floor[]> {
    await this.assertObjectExists(objectId);
    return this.prisma.floor.findMany({
      where: { objectId },
      orderBy: { number: 'asc' },
      include: { rooms: { select: { id: true } }, routes: { select: { id: true } } },
    });
  }

  async getById(id: string): Promise<Floor> {
    const found = await this.prisma.floor.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException('Этаж не найден');
    }
    return found;
  }

  /** Этаж с помещениями и маршрутами — для экрана плана. */
  async getDetail(id: string) {
    const found = await this.prisma.floor.findUnique({
      where: { id },
      include: {
        object: { select: { id: true, name: true } },
        rooms: {
          orderBy: { name: 'asc' },
          include: { techCard: { select: { id: true, name: true } } },
        },
        routes: {
          orderBy: { name: 'asc' },
          include: { points: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    });
    if (!found) {
      throw new NotFoundException('Этаж не найден');
    }
    return found;
  }

  async update(id: string, dto: UpdateFloorDto): Promise<Floor> {
    const current = await this.getById(id);

    if (dto.number !== undefined && dto.number !== current.number) {
      await this.assertNumberFree(current.objectId, dto.number);
    }

    return this.prisma.floor.update({
      where: { id },
      data: { number: dto.number, name: dto.name, planScale: dto.planScale },
    });
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.floor.delete({ where: { id } });
  }

  /** Привязка уже загруженного плана (URL из file-service) — используется в e2e. */
  async attachPlan(id: string, dto: AttachPlanDto): Promise<Floor> {
    await this.getById(id);
    return this.prisma.floor.update({
      where: { id },
      data: {
        planImageUrl: dto.planImageUrl,
        planScale: dto.planScale,
        planWidth: dto.planWidth,
        planHeight: dto.planHeight,
      },
    });
  }

  /**
   * Загрузка плана этажа: файл уходит в file-service (bucket plans), в core
   * сохраняется URL, масштаб и реальные размеры изображения. Токен пользователя
   * пробрасывается как есть.
   */
  async uploadPlan(
    id: string,
    file: Express.Multer.File | undefined,
    token: string,
    planScale?: number,
  ): Promise<Floor> {
    await this.getById(id);

    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('Файл плана не передан (поле file)');
    }

    try {
      const uploaded = await this.fileService.uploadPlan(file, token, { floorId: id, planScale });
      return await this.prisma.floor.update({
        where: { id },
        data: {
          planImageUrl: uploaded.url,
          planScale: planScale ?? undefined,
          planWidth: uploaded.width,
          planHeight: uploaded.height,
        },
      });
    } catch (error) {
      if (error instanceof PlanUploadError) {
        // Пробрасываем статус file-service: 400 (валидация) остаётся 400, 401 — 401 и т.д.
        // (Иначе истёкший access-токен вернулся бы 400, и клиент не обновил бы токен.)
        throw new HttpException(error.message, error.status);
      }
      throw error;
    }
  }

  private async assertObjectExists(objectId: string): Promise<void> {
    const found = await this.prisma.object.findUnique({ where: { id: objectId } });
    if (!found) {
      throw new NotFoundException('Объект не найден');
    }
  }

  private async assertNumberFree(objectId: string, number: number): Promise<void> {
    // Номер этажа уникален внутри объекта (@@unique([objectId, number])).
    const existing = await this.prisma.floor.findUnique({
      where: { objectId_number: { objectId, number } },
    });
    if (existing) {
      throw new ConflictException(`Этаж с номером ${number} уже есть у этого объекта`);
    }
  }
}
