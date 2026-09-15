import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

const user = { id: 'u-1', email: 'a@b.c', role: 'ADMIN', fullName: '' } as never;

function createServiceMock() {
  return {
    create: jest.fn().mockResolvedValue({ id: 'mat-1' }),
    list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    listStocks: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    createMovement: jest.fn().mockResolvedValue({ movement: { id: 'mov-1' }, stocks: [] }),
    report: jest.fn().mockResolvedValue({ rows: [], totals: {} }),
    listMovements: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getById: jest.fn().mockResolvedValue({ id: 'mat-1' }),
    update: jest.fn().mockResolvedValue({ id: 'mat-1' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

describe('MaterialsController (М4.1)', () => {
  let controller: MaterialsController;
  let service: ReturnType<typeof createServiceMock>;

  beforeEach(async () => {
    service = createServiceMock();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [MaterialsController],
      providers: [{ provide: MaterialsService, useValue: service }],
    }).compile();

    controller = moduleRef.get(MaterialsController);
  });

  it('CRUD делегируется сервису', async () => {
    const dto = {
      name: 'Мыло',
      unit: 'л',
      defaultConsumption: 0.05,
      minStockThreshold: 5,
      costPerUnit: 100,
    };

    await expect(controller.create(dto)).resolves.toEqual({ id: 'mat-1' });
    expect(service.create).toHaveBeenCalledWith(dto);

    await controller.list({ search: 'мыло' });
    expect(service.list).toHaveBeenCalledWith({ search: 'мыло' });

    await controller.getById('mat-1');
    expect(service.getById).toHaveBeenCalledWith('mat-1');

    await controller.update('mat-1', { name: 'Мыло 2' });
    expect(service.update).toHaveBeenCalledWith('mat-1', { name: 'Мыло 2' });

    await controller.remove('mat-1');
    expect(service.remove).toHaveBeenCalledWith('mat-1');
  });

  it('остатки и отчёт делегируются сервису', async () => {
    await controller.stocks({ objectId: 'obj-1', onlyLow: true });
    expect(service.listStocks).toHaveBeenCalledWith({ objectId: 'obj-1', onlyLow: true });

    await controller.report({ objectId: 'obj-1', from: '2026-01-01', to: '2026-01-31' });
    expect(service.report).toHaveBeenCalledWith({
      objectId: 'obj-1',
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('движение подписывается текущим пользователем (userId из JWT)', async () => {
    await controller.createMovement(
      {
        materialId: 'mat-1',
        objectId: 'obj-1',
        type: 'OUT',
        quantity: 30,
        ticketId: 't-1',
      },
      user,
    );

    expect(service.createMovement).toHaveBeenCalledWith({
      materialId: 'mat-1',
      objectId: 'obj-1',
      type: 'OUT',
      quantity: 30,
      ticketId: 't-1',
      targetObjectId: undefined,
      userId: 'u-1',
    });
  });

  it('движение без аутентифицированного пользователя не падает', async () => {
    await controller.createMovement(
      { materialId: 'mat-1', objectId: 'obj-1', type: 'IN', quantity: 1 },
      undefined as never,
    );

    expect(service.createMovement).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'unknown' }),
    );
  });

  it('история движений берётся по материалу', async () => {
    await controller.movements('mat-1', { objectId: 'obj-1', limit: 10 });
    expect(service.listMovements).toHaveBeenCalledWith('mat-1', { objectId: 'obj-1', limit: 10 });
  });
});
