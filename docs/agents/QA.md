<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# АГЕНТ: QA
# 🤖 АГЕНТ: QA

## 📋 Профиль агента

**Роль:** QA Engineer  
**Ответственность:** Тестирование, качество, UAT  
**Рабочая директория:** `test/`  
**Технологии:** Jest, Playwright, k6, Flutter Test  
**Отчетность:** Tech Lead

---

## 🎯 Цели

1. Unit-тесты для backend
2. Unit-тесты для frontend
3. Integration-тесты
4. E2E-тесты
5. Нагрузочное тестирование
6. UAT

---

## 📁 Структура
test/
├── unit/
│ ├── backend/
│ └── frontend/
├── integration/
├── e2e/
│ ├── web/
│ └── mobile/
├── performance/
│ ├── k6/
│ └── results/
├── fixtures/
│ ├── users.json
│ ├── objects.json
│ └── tickets.json
├── reports/
└── playwright.config.ts

text

---

## 📝 Инструкции по реализации

### 1. Unit-тесты (Backend)

```typescript
// test/unit/backend/ticket.service.spec.ts
import { Test } from '@nestjs/testing';
import { TicketService } from '../../../backend/ticket-service/src/tickets/tickets.service';

describe('TicketService', () => {
  let service: TicketService;
  
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [TicketService],
    }).compile();
    
    service = module.get<TicketService>(TicketService);
  });
  
  describe('createTicket', () => {
    it('should create a planned ticket', async () => {
      const dto = {
        type: 'planned',
        objectId: 'obj-1',
        description: 'Плановая уборка',
      };
      
      const ticket = await service.createTicket(dto);
      
      expect(ticket.status).toBe('new');
      expect(ticket.type).toBe('planned');
    });
    
    it('should create emergency ticket with critical priority', async () => {
      const dto = {
        type: 'emergency',
        objectId: 'obj-1',
        description: 'Протечка',
      };
      
      const ticket = await service.createTicket(dto);
      
      expect(ticket.priority).toBe('critical');
    });
  });
  
  describe('changeStatus', () => {
    it('should allow valid transition', async () => {
      const ticket = await service.changeStatus('ticket-1', 'in_progress');
      
      expect(ticket.status).toBe('in_progress');
    });
    
    it('should throw on invalid transition', async () => {
      await expect(
        service.changeStatus('ticket-1', 'closed')
      ).rejects.toThrow('Invalid status transition');
    });
  });
});
2. E2E-тесты (Playwright)
typescript
// test/e2e/web/tickets.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Tickets Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@cleaning-ops.com');
    await page.fill('[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });
  
  test('should create a new ticket', async ({ page }) => {
    await page.click('a[href="/tickets"]');
    await page.click('button:has-text("Создать заявку")');
    
    await page.selectOption('select[name="type"]', 'unscheduled');
    await page.selectOption('select[name="object"]', 'БЦ Меридиан');
    await page.fill('textarea[name="description"]', 'Внеплановая уборка');
    
    await page.click('button:has-text("Создать")');
    
    await expect(page.locator('.toast-success')).toBeVisible();
  });
});
3. Нагрузочное тестирование (k6)
javascript
// test/performance/k6/tickets.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = 'http://localhost:3000';

export default function () {
  const token = login();
  
  // Получение заявок
  const ticketsRes = http.get(`${BASE_URL}/api/tickets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  check(ticketsRes, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
}
✅ Acceptance Criteria
□ Unit-тесты покрытие > 80%
□ E2E тесты проходят
□ Нагрузочные тесты выполнены
□ Отчеты созданы
□ UAT пройден
□ Критические баги исправлены
