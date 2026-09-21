import { io } from 'socket.io-client';
const token = process.argv[2];
async function probe(label, url) {
  return new Promise((resolve) => {
    const socket = io(`${url}/chat`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });
    const done = (result) => { socket.close(); resolve(`${label} ${url} → ${result}`); };
    socket.on('connect', () => done(`ПОДКЛЮЧЁН id=${socket.id}`));
    socket.on('connect_error', (err) => done(`ОШИБКА: ${err.message}`));
    setTimeout(() => done('ТАЙМАУТ'), 7000);
  });
}
const t = await fetch('http://127.0.0.1:8080/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@cleaning-ops.com', password: 'admin123' }),
}).then((r) => r.json()).then((d) => d.accessToken);
console.log(await probe('[напрямую]', 'http://127.0.0.1:3009'));
console.log(await probe('[через nginx :8080]', 'http://127.0.0.1:8080'));
console.log(await probe('[через nginx :8081]', 'http://127.0.0.1:8081'));
