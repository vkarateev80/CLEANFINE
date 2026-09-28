import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ExtractJwt, Strategy } from 'passport-jwt';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const ACCESS_SECRET = 'users-access-secret';

interface TestUser {
  id: string;
  email: string;
  role: string;
  fullName: string;
}

class TestJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: ACCESS_SECRET,
    });
  }

  validate(payload: { sub: string; email: string; role: string }): TestUser {
    return { id: payload.sub, email: payload.email, role: payload.role, fullName: 'Тест' };
  }
}

const safeUser = {
  id: 'u2',
  email: 'operator@cleaning-ops.com',
  phone: null,
  fullName: 'Оператор',
  role: 'OPERATOR',
  avatarUrl: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('UsersController (HTTP)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const usersService = {
    list: jest.fn(),
    getById: jest.fn(),
    register: jest.fn(),
    update: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: ACCESS_SECRET, signOptions: { expiresIn: '5m' } }),
      ],
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        TestJwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
    );
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  const bearer = (role: string) => `Bearer ${jwt.sign({ sub: 'u1', email: 'a@b.co', role })}`;
  const asAdmin = () => bearer('ADMIN');

  describe('GET /api/users — пагинация', () => {
    it('без query-параметров отдаёт 200 с дефолтами skip=0, take=50', async () => {
      // Регрессия: `new ParseIntPipe({ optional: true })` давал 400 на этот запрос.
      usersService.list.mockResolvedValue({ items: [safeUser], total: 1 });

      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', asAdmin())
        .expect(200);

      expect(usersService.list).toHaveBeenCalledWith({
        skip: 0,
        take: 50,
        role: undefined,
        search: undefined,
      });
      expect(res.body.total).toBe(1);
    });

    it('пробрасывает явные skip и take', async () => {
      usersService.list.mockResolvedValue({ items: [], total: 0 });
      await request(app.getHttpServer())
        .get('/api/users?skip=10&take=5')
        .set('Authorization', asAdmin())
        .expect(200);
      expect(usersService.list).toHaveBeenCalledWith({
        skip: 10,
        take: 5,
        role: undefined,
        search: undefined,
      });
    });

    it('нечисловой skip → безопасный дефолт 0, а не NaN и не 500', async () => {
      // DefaultValuePipe в Nest 10.4+ подставляет значение по умолчанию,
      // если результат преобразования — NaN. Итог: skip=0, ответ 200.
      usersService.list.mockResolvedValue({ items: [], total: 0 });
      await request(app.getHttpServer())
        .get('/api/users?skip=abc')
        .set('Authorization', asAdmin())
        .expect(200);
      expect(usersService.list).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }));
    });

    it('передаёт поиск', async () => {
      usersService.list.mockResolvedValue({ items: [], total: 0 });
      await request(app.getHttpServer())
        .get('/api/users?search=admin')
        .set('Authorization', asAdmin())
        .expect(200);
      expect(usersService.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'admin' }));
    });

    it('isActive=true → true, иное значение → false (текущее поведение)', async () => {
      usersService.list.mockResolvedValue({ items: [], total: 0 });
      await request(app.getHttpServer())
        .get('/api/users?isActive=true')
        .set('Authorization', asAdmin())
        .expect(200);
      expect(usersService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ isActive: true }),
      );

      await request(app.getHttpServer())
        .get('/api/users?isActive=1')
        .set('Authorization', asAdmin())
        .expect(200);
      expect(usersService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('без токена → 401', async () => {
      await request(app.getHttpServer()).get('/api/users').expect(401);
    });

    it('OPERATOR не имеет доступа → 403', async () => {
      await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', bearer('OPERATOR'))
        .expect(403);
    });

    it('SUPERVISOR имеет доступ → 200', async () => {
      usersService.list.mockResolvedValue({ items: [], total: 0 });
      await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', bearer('SUPERVISOR'))
        .expect(200);
    });
  });

  describe('GET /api/users/:id', () => {
    it('возвращает пользователя', async () => {
      usersService.getById.mockResolvedValue(safeUser);
      const res = await request(app.getHttpServer())
        .get('/api/users/u2')
        .set('Authorization', asAdmin())
        .expect(200);
      expect(res.body.id).toBe('u2');
      expect(usersService.getById).toHaveBeenCalledWith('u2');
    });

    it('OPERATOR не имеет доступа → 403', async () => {
      await request(app.getHttpServer())
        .get('/api/users/u2')
        .set('Authorization', bearer('OPERATOR'))
        .expect(403);
    });
  });

  describe('POST /api/users', () => {
    const payload = {
      email: 'new@cleaning-ops.com',
      password: 'newpass123',
      fullName: 'Новый Сотрудник',
      role: 'OPERATOR',
    };

    it('ADMIN создаёт пользователя, тело доходит целиком', async () => {
      usersService.register.mockResolvedValue(safeUser);
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', asAdmin())
        .send(payload)
        .expect(201);
      expect(usersService.register).toHaveBeenCalledWith(payload);
    });

    it('SUPERVISOR получает 403', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', bearer('SUPERVISOR'))
        .send(payload)
        .expect(403);
      expect(usersService.register).not.toHaveBeenCalled();
    });

    it('валидирует email и роль', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', asAdmin())
        .send({ ...payload, email: 'bad-email' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', asAdmin())
        .send({ ...payload, role: 'SUPERUSER' })
        .expect(400);
    });

    it('отклоняет короткий пароль', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', asAdmin())
        .send({ ...payload, password: '123' })
        .expect(400);
    });

    it('отклоняет некорректный телефон', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', asAdmin())
        .send({ ...payload, phone: 'не-телефон' })
        .expect(400);
    });
  });

  describe('PATCH /api/users/:id', () => {
    it('ADMIN обновляет пользователя', async () => {
      usersService.update.mockResolvedValue({ ...safeUser, fullName: 'Обновлён' });
      await request(app.getHttpServer())
        .patch('/api/users/u2')
        .set('Authorization', asAdmin())
        .send({ fullName: 'Обновлён' })
        .expect(200);
      expect(usersService.update).toHaveBeenCalledWith('u2', { fullName: 'Обновлён' });
    });

    it('SUPERVISOR получает 403', async () => {
      await request(app.getHttpServer())
        .patch('/api/users/u2')
        .set('Authorization', bearer('SUPERVISOR'))
        .send({ fullName: 'X' })
        .expect(403);
    });

    it('валидирует isActive как boolean', async () => {
      await request(app.getHttpServer())
        .patch('/api/users/u2')
        .set('Authorization', asAdmin())
        .send({ isActive: 'yes' })
        .expect(400);
    });
  });

  describe('DELETE /api/users/:id (мягкая деактивация)', () => {
    it('ADMIN деактивирует → 204 и isActive:false в сервисе', async () => {
      usersService.update.mockResolvedValue({ ...safeUser, isActive: false });
      await request(app.getHttpServer())
        .delete('/api/users/u2')
        .set('Authorization', asAdmin())
        .expect(204);
      expect(usersService.update).toHaveBeenCalledWith('u2', { isActive: false });
    });

    it('SUPERVISOR получает 403', async () => {
      await request(app.getHttpServer())
        .delete('/api/users/u2')
        .set('Authorization', bearer('SUPERVISOR'))
        .expect(403);
    });

    it('без токена → 401', async () => {
      await request(app.getHttpServer()).delete('/api/users/u2').expect(401);
    });
  });
});
