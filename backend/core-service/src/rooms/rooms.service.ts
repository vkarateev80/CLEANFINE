import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Floor, Room } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRoomDto, UpdateRoomDto } from './dto/room.dto';

/** Размеры плана в пикселях — берём из загруженного изображения этажа. */
interface PlanSize {
  width: number;
  height: number;
}

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(floorId: string, dto: CreateRoomDto): Promise<Room> {
    const floor = await this.getFloor(floorId);
    this.assertCoordinatesInsidePlan(dto, await this.planSize(floor));
    if (dto.techCardId) {
      await this.assertTechCardExists(dto.techCardId);
    }

    return this.prisma.room.create({
      data: {
        floorId,
        name: dto.name,
        areaM2: dto.areaM2,
        floorType: dto.floorType,
        coordsX: dto.coordsX,
        coordsY: dto.coordsY,
        coordsWidth: dto.coordsWidth,
        coordsHeight: dto.coordsHeight,
        zone: dto.zone,
        techCardId: dto.techCardId ?? null,
      },
    });
  }

  async listByFloor(floorId: string): Promise<Room[]> {
    await this.getFloor(floorId);
    return this.prisma.room.findMany({
      where: { floorId },
      orderBy: { name: 'asc' },
      include: { techCard: { select: { id: true, name: true } } },
    });
  }

  async getById(id: string): Promise<Room> {
    const found = await this.prisma.room.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException('Помещение не найдено');
    }
    return found;
  }

  async update(id: string, dto: UpdateRoomDto): Promise<Room> {
    const current = await this.getById(id);
    const floor = await this.getFloor(current.floorId);

    this.assertCoordinatesInsidePlan(
      {
        coordsX: dto.coordsX ?? current.coordsX ?? undefined,
        coordsY: dto.coordsY ?? current.coordsY ?? undefined,
        coordsWidth: dto.coordsWidth ?? current.coordsWidth ?? undefined,
        coordsHeight: dto.coordsHeight ?? current.coordsHeight ?? undefined,
      },
      await this.planSize(floor),
    );

    if (dto.techCardId) {
      await this.assertTechCardExists(dto.techCardId);
    }

    return this.prisma.room.update({
      where: { id },
      data: {
        name: dto.name,
        areaM2: dto.areaM2,
        floorType: dto.floorType,
        coordsX: dto.coordsX,
        coordsY: dto.coordsY,
        coordsWidth: dto.coordsWidth,
        coordsHeight: dto.coordsHeight,
        zone: dto.zone,
        // null отвязывает техкарту, undefined — не трогает связь
        ...(dto.techCardId !== undefined ? { techCardId: dto.techCardId } : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.room.delete({ where: { id } });
  }

  private async getFloor(floorId: string): Promise<Floor> {
    const floor = await this.prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) {
      throw new NotFoundException('Этаж не найден');
    }
    return floor;
  }

  private async assertTechCardExists(techCardId: string): Promise<void> {
    const found = await this.prisma.techCard.findUnique({ where: { id: techCardId } });
    if (!found) {
      throw new NotFoundException('Техкарта не найдена');
    }
  }

  /**
   * Размеры плана этажа в пикселях.
   * При загрузке плана file-service отдаёт реальные width/height изображения,
   * core сохраняет их в Floor.planWidth/planHeight — валидация координат идёт
   * по реальному плану (приёмочный пункт М2.4).
   * Для планов, привязанных без размеров (старые данные), остаётся запасной
   * лимит PLAN_MAX_SIZE (по умолчанию 10000×10000).
   */
  private async planSize(floor: Floor): Promise<PlanSize | null> {
    if (!floor.planImageUrl) {
      return null;
    }
    if (floor.planWidth && floor.planHeight) {
      return { width: floor.planWidth, height: floor.planHeight };
    }
    const max = Number(process.env.PLAN_MAX_SIZE);
    const size = Number.isFinite(max) && max > 0 ? max : 10_000;
    return { width: size, height: size };
  }

  /** Координаты области не должны выходить за размеры плана. */
  private assertCoordinatesInsidePlan(
    coords: {
      coordsX?: number;
      coordsY?: number;
      coordsWidth?: number;
      coordsHeight?: number;
    },
    plan: PlanSize | null,
  ): void {
    const hasAny =
      coords.coordsX !== undefined ||
      coords.coordsY !== undefined ||
      coords.coordsWidth !== undefined ||
      coords.coordsHeight !== undefined;
    if (!hasAny) {
      return;
    }

    if (!plan) {
      throw new BadRequestException('Нельзя задать координаты помещения: у этажа не загружен план');
    }

    const { coordsX = 0, coordsY = 0, coordsWidth, coordsHeight } = coords;

    if (coordsX > plan.width || coordsY > plan.height) {
      throw new BadRequestException(
        `Координаты (${coordsX}, ${coordsY}) выходят за размеры плана ${plan.width}×${plan.height}`,
      );
    }

    if (coordsWidth !== undefined && coordsX + coordsWidth > plan.width) {
      throw new BadRequestException(
        `Область выходит за ширину плана: x=${coordsX} + width=${coordsWidth} > ${plan.width}`,
      );
    }

    if (coordsHeight !== undefined && coordsY + coordsHeight > plan.height) {
      throw new BadRequestException(
        `Область выходит за высоту плана: y=${coordsY} + height=${coordsHeight} > ${plan.height}`,
      );
    }
  }
}
