import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Route, RoutePoint } from '@prisma/client';
import {
  canTransitionRoute,
  type RouteStatus,
} from '@cleaning-ops/shared/types/core';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AddRoutePointDto,
  CreateRouteDto,
  ListRoutesQueryDto,
  ReorderPointsDto,
  UpdateRoutePointDto,
  UpdateRouteDto,
} from './dto/route.dto';

/** Смещение для обхода уникальности (routeId, orderIndex) при перестановке. */
const ORDER_OFFSET = 100_000;

/**
 * Элемент плоского списка маршрутов: связи с этажом и объектом развёрнуты в
 * скаляры, вместо точек — их количество. Полные точки здесь не нужны: список
 * служит выбором маршрута (форма графика), а не его детализацией.
 */
export interface RouteListItem {
  id: string;
  name: string;
  floorId: string;
  /** Объект этажа: у маршрута прямой связи с объектом в схеме нет. */
  objectId: string;
  pointsCount: number;
  createdAt: Date;
}

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(floorId: string, dto: CreateRouteDto): Promise<Route> {
    await this.getFloor(floorId);
    return this.prisma.route.create({ data: { floorId, name: dto.name } });
  }

  async listByFloor(floorId: string) {
    await this.getFloor(floorId);
    return this.prisma.route.findMany({
      where: { floorId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { points: { orderBy: { orderIndex: 'asc' }, include: { room: true } } },
    });
  }

  /**
   * Плоский список маршрутов (`GET /api/routes`) с необязательными фильтрами и
   * пагинацией. Нужен там, где этаж заранее неизвестен — например селекту
   * маршрута в форме графика: привязка (`Schedule.routeId`) хранится без этажа.
   * Фильтр по объекту идёт через этаж, потому что в схеме маршрут связан только
   * с этажом (`Route.floorId` → `Floor.objectId`).
   */
  async list(query: ListRoutesQueryDto): Promise<{ items: RouteListItem[]; total: number }> {
    const where: Prisma.RouteWhereInput = { floorId: query.floorId };
    if (query.objectId) {
      where.floor = { objectId: query.objectId };
    }

    // $transaction как в objects/tech-cards: items и total обязаны считаться по
    // одному и тому же фильтру, иначе пагинация «поедет» на параллельной записи.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.route.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 50, 100),
        select: {
          id: true,
          name: true,
          floorId: true,
          createdAt: true,
          floor: { select: { objectId: true } },
          _count: { select: { points: true } },
        },
      }),
      this.prisma.route.count({ where }),
    ]);

    return {
      // Разворачиваем вложенность в плоские поля: клиенту (селекту) нужны
      // скаляры, а не объект floor с единственным полем.
      items: rows.map(({ floor, _count, ...route }) => ({
        ...route,
        objectId: floor.objectId,
        pointsCount: _count.points,
      })),
      total,
    };
  }

  /** Маршрут с точками (и помещениями) и суммарной оценкой времени. */
  async getDetail(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: {
        floor: { select: { id: true, objectId: true, name: true, number: true, planImageUrl: true } },
        points: {
          orderBy: { orderIndex: 'asc' },
          include: {
            room: {
              include: {
                techCard: { select: { id: true, operations: { select: { id: true } } } },
              },
            },
          },
        },
      },
    });
    if (!route) {
      throw new NotFoundException('Маршрут не найден');
    }
    // Операции по точкам: одна техкарта на двух помещениях считается дважды —
    // ключ идемпотентности завершения включает roomId, каждое помещение
    // закрывает свои копии операций (М6.4).
    const operationsByTechCard = new Map<string, number>();
    let operationsTotal = 0;
    for (const point of route.points) {
      const techCard = point.room?.techCard;
      if (!techCard) continue;
      let count = operationsByTechCard.get(techCard.id);
      if (count === undefined) {
        count = techCard.operations?.length ?? 0;
        operationsByTechCard.set(techCard.id, count);
      }
      operationsTotal += count;
    }
    return {
      ...route,
      totalEstimatedTimeMin: sumEstimatedTime(route.points),
      /** Сколько операций чек-листов на маршруте — чтобы клиент не собирал N+1. */
      operationsTotal,
    };
  }

  async update(id: string, dto: UpdateRouteDto): Promise<Route> {
    const current = await this.getRoute(id);

    if (dto.status && dto.status !== current.status) {
      if (!canTransitionRoute(current.status as RouteStatus, dto.status)) {
        throw new BadRequestException(
          `Недопустимый переход статуса маршрута: ${current.status} → ${dto.status}`,
        );
      }
    }

    return this.prisma.route.update({
      where: { id },
      data: { name: dto.name, status: dto.status },
    });
  }

  async remove(id: string): Promise<void> {
    await this.getRoute(id);
    await this.prisma.route.delete({ where: { id } });
  }

  /** Добавление точки: orderIndex = конец маршрута, помещение — с того же этажа. */
  async addPoint(routeId: string, dto: AddRoutePointDto): Promise<RoutePoint> {
    const route = await this.getRoute(routeId);
    this.assertMutable(route);

    const room = await this.prisma.room.findUnique({ where: { id: dto.roomId } });
    if (!room) {
      throw new NotFoundException('Помещение не найдено');
    }
    if (room.floorId !== route.floorId) {
      throw new BadRequestException('Помещение принадлежит другому этажу');
    }

    const last = await this.prisma.routePoint.findFirst({
      where: { routeId },
      orderBy: { orderIndex: 'desc' },
    });

    return this.prisma.routePoint.create({
      data: {
        routeId,
        roomId: dto.roomId,
        orderIndex: (last?.orderIndex ?? -1) + 1,
        estimatedTimeMin: dto.estimatedTimeMin,
      },
    });
  }

  async updatePoint(pointId: string, dto: UpdateRoutePointDto): Promise<RoutePoint> {
    const point = await this.getPoint(pointId);
    const route = await this.getRoute(point.routeId);
    this.assertMutable(route);
    return this.prisma.routePoint.update({
      where: { id: pointId },
      data: { estimatedTimeMin: dto.estimatedTimeMin },
    });
  }

  /** Удаление точки с пересборкой порядковых номеров (без «дыр»). */
  async removePoint(pointId: string): Promise<void> {
    const point = await this.getPoint(pointId);
    const route = await this.getRoute(point.routeId);
    this.assertMutable(route);

    await this.prisma.$transaction(async (tx) => {
      await tx.routePoint.delete({ where: { id: pointId } });

      const rest = await tx.routePoint.findMany({
        where: { routeId: point.routeId },
        orderBy: { orderIndex: 'asc' },
      });

      // Сначала уводим за пределы диапазона, чтобы не столкнуться с @@unique
      for (const [index, item] of rest.entries()) {
        await tx.routePoint.update({
          where: { id: item.id },
          data: { orderIndex: ORDER_OFFSET + index },
        });
      }
      for (const [index, item] of rest.entries()) {
        await tx.routePoint.update({ where: { id: item.id }, data: { orderIndex: index } });
      }
    });
  }

  /**
   * Переупорядочивание точек (М2.5).
   * Требует полный список id маршрута; порядок в массиве = новый orderIndex.
   * Перестановка идёт в транзакции через смещение, иначе @@unique([routeId, orderIndex])
   * срабатывает на промежуточном состоянии.
   */
  async reorderPoints(routeId: string, dto: ReorderPointsDto): Promise<{ points: RoutePoint[] }> {
    const route = await this.getRoute(routeId);
    this.assertMutable(route);

    const existing = await this.prisma.routePoint.findMany({
      where: { routeId },
      orderBy: { orderIndex: 'asc' },
    });

    const existingIds = new Set(existing.map((p) => p.id));
    const incomingIds = dto.pointIds;

    const foreign = incomingIds.filter((id) => !existingIds.has(id));
    if (foreign.length > 0) {
      throw new BadRequestException(
        `Точки не принадлежат маршруту ${route.name}: ${foreign.join(', ')}`,
      );
    }
    if (incomingIds.length !== existing.length) {
      throw new BadRequestException(
        `Передан неполный список точек: в маршруте ${existing.length}, передано ${incomingIds.length}`,
      );
    }
    if (new Set(incomingIds).size !== incomingIds.length) {
      throw new BadRequestException('pointIds содержит дубликаты');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of incomingIds.entries()) {
        await tx.routePoint.update({
          where: { id },
          data: { orderIndex: ORDER_OFFSET + index },
        });
      }
      for (const [index, id] of incomingIds.entries()) {
        await tx.routePoint.update({ where: { id }, data: { orderIndex: index } });
      }
    });

    const points = await this.prisma.routePoint.findMany({
      where: { routeId },
      orderBy: { orderIndex: 'asc' },
      include: { room: true },
    });

    return { points };
  }

  private async getRoute(id: string): Promise<Route> {
    const route = await this.prisma.route.findUnique({ where: { id } });
    if (!route) {
      throw new NotFoundException('Маршрут не найден');
    }
    return route;
  }

  /** Архивный маршрут неизменяем: точки не добавляются, не двигаются и не удаляются. */
  private assertMutable(route: Route): void {
    if (route.status === 'ARCHIVED') {
      throw new BadRequestException('Архивный маршрут нельзя изменить');
    }
  }

  private async getPoint(id: string): Promise<RoutePoint> {
    const point = await this.prisma.routePoint.findUnique({ where: { id } });
    if (!point) {
      throw new NotFoundException('Точка маршрута не найдена');
    }
    return point;
  }

  private async getFloor(floorId: string): Promise<void> {
    const floor = await this.prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) {
      throw new NotFoundException('Этаж не найден');
    }
  }
}

/** Суммарная оценка времени маршрута (null-значения считаются нулём). */
export function sumEstimatedTime(points: { estimatedTimeMin: number | null }[]): number {
  return points.reduce((sum, p) => sum + (p.estimatedTimeMin ?? 0), 0);
}
