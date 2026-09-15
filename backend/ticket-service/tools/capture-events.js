#!/usr/bin/env node
/**
 * Dev-утилита ticket-service: слушает exchange cleaning-ops.events и печатает payload'ы
 * событий в консоль и в JSONL-файл. Нужна для проверки контракта 3.2 на живом стенде
 * (кто какие поля реально публикует), в сборку сервиса не входит (лежит вне src).
 *
 * Запуск (из backend/ticket-service):
 *   node tools/capture-events.js [файл.jsonl] [длительность_мс]
 * RABBITMQ_URL берётся из окружения или из корневого .env.
 */
const amqp = require('amqplib');
const fs = require('fs');
const path = require('path');

const EXCHANGE = 'cleaning-ops.events';
const ROUTING_KEYS = [
  'ticket.created',
  'ticket.assigned',
  'ticket.emergency',
  'ticket.overdue',
  'ticket.operation.completed',
];

function resolveRabbitUrl() {
  if (process.env.RABBITMQ_URL) {
    return process.env.RABBITMQ_URL;
  }
  const envPath = path.resolve(__dirname, '../../../.env');
  const env = fs.readFileSync(envPath, 'utf8');
  const match = env.match(/^RABBITMQ_URL=(.+)$/m);
  if (!match) {
    throw new Error(`RABBITMQ_URL не найден ни в окружении, ни в ${envPath}`);
  }
  return match[1].trim();
}

const outFile = process.argv[2] || path.resolve(__dirname, '../events-capture.jsonl');
const durationMs = Number(process.argv[3] || 60_000);

(async () => {
  const connection = await amqp.connect(resolveRabbitUrl());
  const channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  const queue = await channel.assertQueue('', { exclusive: true, autoDelete: true });
  for (const key of ROUTING_KEYS) {
    await channel.bindQueue(queue.queue, EXCHANGE, key);
  }

  fs.writeFileSync(outFile, '');
  console.log(`capture: слушаю ${EXCHANGE} → ${outFile} (${durationMs} мс)`);

  channel.consume(queue.queue, (message) => {
    if (!message) {
      return;
    }
    const line = JSON.stringify({
      routingKey: message.fields.routingKey,
      payload: JSON.parse(message.content.toString()),
    });
    fs.appendFileSync(outFile, `${line}\n`);
    console.log(`EVENT ${line}`);
  });

  setTimeout(async () => {
    try {
      await channel.close();
      await connection.close();
    } catch {
      /* соединение уже закрыто */
    }
    process.exit(0);
  }, durationMs);
})().catch((error) => {
  console.error('capture: ошибка', error.message);
  process.exit(1);
});
