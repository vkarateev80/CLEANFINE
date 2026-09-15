/**
 * Живая проверка М4.2: слушает material.low из общего exchange.
 * Использование: node tools/watch-material-low.js <секунды ожидания>
 * Печатает payload события или «нет события».
 */
const amqp = require('amqplib');

const QUEUE = 'material.low.verify';
const ROUTING_KEY = 'material.low';
const EXCHANGE = 'cleaning-ops.events';

async function main() {
  const waitMs = Number(process.argv[2] ?? 5000);
  const url = process.env.RABBITMQ_URL;
  if (!url) {
    console.error('RABBITMQ_URL не задан');
    process.exit(2);
  }

  const connection = await amqp.connect(url, { timeout: 5000 });
  const channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(QUEUE, { durable: false, autoDelete: true });
  await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);

  // Очередь одноразовая: чистим всё, что накопилось до старта проверки.
  await channel.purgeQueue(QUEUE);

  const received = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), waitMs);
    channel
      .consume(QUEUE, (message) => {
        if (!message) return;
        clearTimeout(timer);
        resolve(message.content.toString('utf8'));
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });

  if (received) {
    console.log('MATERIAL_LOW=' + received);
  } else {
    console.log('MATERIAL_LOW=нет события');
  }

  await channel.close().catch(() => undefined);
  await connection.close().catch(() => undefined);
}

main().catch((error) => {
  console.error('Ошибка watcher: ' + error.message);
  process.exit(1);
});
