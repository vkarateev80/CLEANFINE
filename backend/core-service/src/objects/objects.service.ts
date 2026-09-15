import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Object as CoreObject, Prisma } from '@prisma/client';
import type { ObjectStatus } from '@cleaning-ops/shared/types/core';
import { canTransitionObject } from '@cleaning-ops/shared/types/core';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateObjectDto, ListObjectsQueryDto, UpdateObjectDto } from './dto/object.dto';

@Injectable()
export class ObjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateObjectDto): Promise<CoreObject> {
    return this.prisma.object.create({
      data: {
        name: dto.name,
        address: dto.address,
        lat: dto.lat,
        lng: dto.lng,
        type: dto.type,
        totalArea: dto.totalArea,
        floorsCount: dto.floorsCount,
        clientName: dto.clientName,
        clientContact: dto.clientContact,
        status: dto.status ?? 'ACTIVE',
      },
    });
  }

  async list(query: ListObjectsQueryDto): Promise<{ items: CoreObject[]; total: number }> {
    const where: Prisma.ObjectWhereInput = {
      status: query.status,
      type: query.type,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { address: { contains: query.search, mode: 'insensitive' } },
              { clientName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.object.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 50, 100),
      }),
      this.prisma.object.count({ where }),
    ]);

    return { items, total };
  }

  async getById(id: string): Promise<CoreObject> {
    const found = await this.prisma.object.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException('Объект не найден');
    }
    return found;
  }

  /** Объект с этажами, помещениями и маршрутами — для карточки в админке. */
  async getDetail(id: string) {
    const found = await this.prisma.object.findUnique({
      where: { id },
      include: {
        floors: {
          orderBy: { number: 'asc' },
          include: {
            rooms: { orderBy: { name: 'asc' } },
            routes: { orderBy: { name: 'asc' }, include: { points: true } },
          },
        },
      },
    });
    if (!found) {
      throw new NotFoundException('Объект не найден');
    }
    return found;
  }

  async update(id: string, dto: UpdateObjectDto): Promise<CoreObject> {
    const current = await this.getById(id);

    if (dto.status && dto.status !== current.status) {
      if (!canTransitionObject(current.status as ObjectStatus, dto.status)) {
        throw new BadRequestException(
          `Недопустимый переход статуса объекта: ${current.status} → ${dto.status}`,
        );
      }
    }

    return this.prisma.object.update({
      where: { id },
      data: {
        name: dto.name,
        address: dto.address,
        lat: dto.lat,
        lng: dto.lng,
        type: dto.type,
        totalArea: dto.totalArea,
        floorsCount: dto.floorsCount,
        clientName: dto.clientName,
        clientContact: dto.clientContact,
        status: dto.status,
      },
    });
  }

  /**
   * Удаление объекта. Каскад в схеме удалит этажи → помещения, маршруты и точки.
   * Запрещаем удалять объект с маршрутами в статусе ACTIVE: сначала снимаем с эксплуатации.
   */
  async remove(id: string): Promise<void> {
    await this.getById(id);

    const activeRoutes = await this.prisma.route.count({
      where: { floor: { objectId: id }, status: 'ACTIVE' },
    });
    if (activeRoutes > 0) {
      throw new BadRequestException(
        `Нельзя удалить объект: у него ${activeRoutes} активных маршрутов. Переведите их в архив`,
      );
    }

    await this.prisma.object.delete({ where: { id } });
  }
}
