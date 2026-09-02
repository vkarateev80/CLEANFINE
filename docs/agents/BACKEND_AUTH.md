<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# АГЕНТ: BACKEND AUTH
# 🤖 АГЕНТ: BACKEND AUTH SERVICE

## 📋 Профиль агента

**Роль:** Backend Developer (Auth)  
**Ответственность:** Аутентификация, авторизация, RBAC  
**Рабочая директория:** `backend/auth-service/`  
**Технологии:** NestJS, TypeScript, PostgreSQL, Redis, JWT  
**Отчетность:** Backend Architect

---

## 🎯 Цели

1. Реализовать JWT-аутентификацию
2. Реализовать PIN-код аутентификацию
3. Реализовать биометрическую аутентификацию
4. Реализовать RBAC (Role-Based Access Control)
5. Обеспечить безопасность (rate limiting, refresh tokens)

---

## 📁 Структура проекта
backend/auth-service/
├── src/
│ ├── main.ts # Точка входа
│ ├── app.module.ts # Корневой модуль
│ ├── auth/
│ │ ├── auth.controller.ts # HTTP контроллер
│ │ ├── auth.service.ts # Бизнес-логика
│ │ ├── auth.module.ts # Модуль
│ │ ├── strategies/
│ │ │ ├── jwt.strategy.ts
│ │ │ ├── jwt-refresh.strategy.ts
│ │ │ └── local.strategy.ts
│ │ ├── guards/
│ │ │ ├── jwt-auth.guard.ts
│ │ │ ├── roles.guard.ts
│ │ │ └── biometric.guard.ts
│ │ └── decorators/
│ │ ├── roles.decorator.ts
│ │ └── public.decorator.ts
│ ├── users/
│ │ ├── users.controller.ts
│ │ ├── users.service.ts
│ │ ├── users.module.ts
│ │ ├── entities/
│ │ │ └── user.entity.ts
│ │ └── dto/
│ │ ├── login.dto.ts
│ │ ├── register.dto.ts
│ │ ├── refresh-token.dto.ts
│ │ └── pin-login.dto.ts
│ ├── tokens/
│ │ ├── tokens.service.ts
│ │ └── tokens.module.ts
│ └── config/
│ ├── configuration.ts
│ └── validation.ts
├── test/
│ ├── auth.e2e-spec.ts
│ ├── auth.service.spec.ts
│ └── users.service.spec.ts
├── prisma/
│ ├── schema.prisma
│ └── migrations/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
└── nest-cli.json

text

---

## 📝 Инструкции по реализации

### 1. Инициализация проекта

```bash
cd backend/auth-service
nest new . --package-manager pnpm
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt passport-local bcrypt class-validator class-transformer @prisma/client
pnpm add -D @types/passport-jwt @types/passport-local @types/bcrypt prisma
2. Схема БД (Prisma)
prisma
// prisma/schema.prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  phone         String?  @unique
  passwordHash  String
  fullName      String
  role          Role     @default(OPERATOR)
  pinCode       String?
  biometricKey  String?
  avatarUrl     String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id        String   @id @default(uuid())
  token     String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  expiresAt DateTime
  createdAt DateTime @default(now())
  revokedAt DateTime?
}

enum Role {
  OPERATOR
  SUPERVISOR
  ADMIN
  CLIENT
}
3. Endpoints
typescript
// auth.controller.ts
@Controller('api/auth')
export class AuthController {
  
  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    // Email + password → access + refresh tokens
  }

  @Public()
  @Post('pin')
  async pinLogin(@Body() dto: PinLoginDto) {
    // PIN code → access + refresh tokens
  }

  @Public()
  @Post('biometric')
  async biometricLogin(@Body() dto: BiometricDto) {
    // Biometric key → access + refresh tokens
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    // Refresh token → new access token
  }

  @Post('logout')
  async logout(@CurrentUser() user: User) {
    // Revoke refresh token
  }

  @Get('me')
  async me(@CurrentUser() user: User) {
    // Return current user
  }

  @Post('change-password')
  async changePassword(@CurrentUser() user: User, @Body() dto: ChangePasswordDto) {
    // Change password
  }

  @Post('change-pin')
  async changePin(@CurrentUser() user: User, @Body() dto: ChangePinDto) {
    // Change PIN
  }
}
4. RBAC Guard
typescript
// guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (!requiredRoles) return true;
    
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.role === role);
  }
}
✅ Acceptance Criteria
□ Login с email/password работает
□ PIN-код аутентификация работает
□ Refresh token работает
□ RBAC работает для всех ролей
□ Rate limiting на login (5 попыток/минуту)
□ Unit-тесты покрытие > 80%
□ E2E тесты проходят
□ Swagger документация
□ Docker контейнер запускается
