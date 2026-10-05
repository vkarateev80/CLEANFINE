/**
 * Проверка, что schedule.missed_checkin реально уходит в RabbitMQ с полем objectName
 * (имя объекта из core-service, полученное служебным токеном).
 *
 * Запуск из backend/schedule-service:
 *   $env:RABBITMQ_URL='amqp://admin:...@localhost:5672'; node tools/verify-missed-event.js
 */
const amqp = require('amqplib');

const SCHEDULE = process.env.SCHEDULE_URL || 'http://localhost:3008';
const AUTH = process.env.AUTH_URL || 'http://localhost:3001';
const RABBITMQ_URL = process.env.RABBITMQ_URL;
const EXCHANGE = 'cleaning-ops.events';
const ROUTING_KEY = 'schedule.missed_checkin';
const QUEUE = `verify.schedule.missed.${Date.now()}`;

const OBJECT_ID = 'dc7991c5-fafd-4744-a2b7-b930d180ae24';
const today = () => new Date().toISOString().slice(0, 10);

async function call(method, url, { token, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  return { status: response.status, payload: text ? JSON.parse(text) : null };
}

async function main() {
  if (!RABBITMQ_URL) {
    throw new Error('Задайте RABBITMQ_URL');
  }
  const login = await call('POST', `${AUTH}/api/auth/login`, {
    body: { email: 'admin', password: 'admin123' },
  });
  const admin = login.payload.accessToken;

  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(QUEUE, { durable: false, autoDelete: true });
  await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
  console.log(`Очередь ${QUEUE} привязана к ${EXCHANGE}/${ROUTING_KEY}`);

  const received = new Promise((resolve) => {
    void channel.consume(QUEUE, (message) => {
      if (message) {
        resolve(JSON.parse(message.content.toString('utf8')));
      }
    });
  });

  const schedule = await call('POST', `${SCHEDULE}/api/schedule`, {
    token: admin,
    body: {
      objectId: OBJECT_ID,
      name: 'E2E проверка события неявки',
      recurrence: { frequency: 'daily', time: '00:05' },
      assignees: ['9174ffd1-7c65-4c8e-8b82-5baf89fd5d88'],
      isActive: true,
    },
  });
  await call('POST', `${SCHEDULE}/api/schedule/generate?date=${today()}`, { token: admin });
  const scan = await call('POST', `${SCHEDULE}/api/schedule/check-missed?date=${today()}`, {
    token: admin,
  });
  console.log('check-missed:', JSON.stringify(scan.payload?.missed));

  const payload = await Promise.race([
    received,
    new Promise((resolve) => setTimeout(() => resolve(null), 8_000)),
  ]);
  console.log('Полученное событие:', JSON.stringify(payload, null, 2));

  await call('DELETE', `${SCHEDULE}/api/schedule/${schedule.payload.id}`, { token: admin });
  await channel.deleteQueue(QUEUE).catch(() => undefined);
  await channel.close().catch(() => undefined);
  await connection.close().catch(() => undefined);

  if (!payload) {
    console.error('СОБЫТИЕ НЕ ПОЛУЧЕНО');
    process.exitCode = 1;
    return;
  }
  const ok =
    payload.eventId &&
    payload.scheduleId &&
    payload.userId &&
    payload.objectId === OBJECT_ID &&
    typeof payload.objectName === 'string' &&
    payload.objectName.length > 0;
  console.log(ok ? 'OK: событие содержит objectName и все поля контракта' : 'ПРОВАЛ: поля события неполные');
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error('FAILED:', error);
  process.exitCode = 1;
});
