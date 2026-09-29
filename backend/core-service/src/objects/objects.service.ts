import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Object as CoreObject, Prisma } from '@prisma/client';
import type { ObjectStatus } from '@cleaning-ops/shared/types/core';
import { canTransitionObject } from '@cleaning-ops/shared/types/core';
import { PrismaService } from '../prisma/prisma.service';
import { AuthServiceClient } from './auth-service.client';
import type { CreateObjectDto, ListObjectsQueryDto, UpdateObjectDto } from './dto/object.dto';

/**
 * Разбор `ownerClientId` из DTO на три состояния.
 *
 * Различать «поля нет» и «null» можно ТОЛЬКО через `'ownerClientId' in dto`:
 * при `ValidationPipe({ transform: true })` отсутствующее поле не становится
 * собственным свойством экземпляра, а явный `null` — становится. Проверка по
 * значению (`dto.ownerClientId === undefined`) не различила бы эти случаи и
 * затирала бы привязку при обычном редактировании названия объекта.
 */
type OwnerClientIdInput = { present: false } | { present: true; value: string | null };

function readOwnerClientId(dto: CreateObjectDto | UpdateObjectDto): OwnerClientIdInput {
  if (!('ownerClientId' in dto)) {
    return { present: false };
  }
  const raw = dto.ownerClientId;
  // Пустая строка защитно нормализуется в null («снять привязку»): такой
  // «id-пустышка» в базу попасть не должен.
  if (raw === undefined || raw === null || raw === '') {
    return { present: true, value: null };
  }
  return { present: true, value: raw };
}

@Injectable()
export class ObjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authClient: AuthServiceClient,
  ) {}

  async create(dto: CreateObjectDto): Promise<CoreObject> {
    const owner = readOwnerClientId(dto);

    // Для create различие «поля нет» и null несущественно (оба = «привязки нет»):
    // валидируем и записываем только непустую строку.
    if (owner.present && owner.value !== null) {
      await this.authClient.assertClientAccount(owner.value);
    }

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
        // Поле кладём только при непустой строке: при отсутствии/null колонка
        // остаётся NULL (дефолт схемы), пустая строка в базу не попадает.
        ...(owner.present && owner.value !== null ? { ownerClientId: owner.value } : {}),
      },
    });
  }

  async list(query: ListObjectsQueryDto): Promise<{ items: CoreObject[]; total: number }> {
    const where: Prisma.ObjectWhereInput = {
      status: query.status,
      type: query.type,
      // Фильтр списка (не авторизация): undefined Prisma игнорирует.
      ownerClientId: query.ownerClientId,
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
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

    // Привязка обрабатывается ДО записи: при 400/503 от auth-service объект
    // не должен измениться вообще (fail-closed, ADR-05).
    const owner = readOwnerClientId(dto);
    const ownerPatch: { ownerClientId?: string | null } = {};
    if (owner.present) {
      if (owner.value !== null) {
        await this.authClient.assertClientAccount(owner.value);
        ownerPatch.ownerClientId = owner.value;
      } else {
        // Снятие привязки валидации не требует.
        ownerPatch.ownerClientId = null;
      }
    }
    // owner.present === false → ключа в data НЕТ, Prisma оставит колонку как есть.

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
        ...ownerPatch,
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
