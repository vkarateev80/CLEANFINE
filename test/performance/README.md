# Нагрузочные сценарии (k6) — М7.2

Эталон QA-агента (УСТАВ.md → Агент QA, п.3) и веха ПЛАН.md → М7.2.
Полный отчёт с цифрами, разбором узких мест и ограничений стенда — [`docs/PERFORMANCE_REPORT.md`](../../docs/PERFORMANCE_REPORT.md).

## Что здесь есть

```
k6/tickets.js        листинг заявок: разгон 50→100 rps + полка 100 rps, пороги p95<500 мс / ошибок<1 %
k6/auth.js           burst-логин: ровно 5×201 + 5×429 (лимит 5 входов/мин на IP), p95<500 мс
k6/gps-track.js      приём треков: 5 зап/с × 250 точек = 1250 точек/с (цель 1000 точек/с)
k6/schedule-gen.js   пик генерации 00:00: 100 графиков, фазы individual и sweep
baseline/tickets-buggy.js   каркас М0.8 как есть — только для сравнения «до/после»
auth-prod-throttle.sh       второй auth-service с БОЕВЫМИ лимитами входа (:3101) для auth.js
cleanup-stand.sh            уборка тестовых данных, демо-среду не трогает
results/                    сырые прогоны: JSON-сводки k6, логи, EXPLAIN-выгрузки
```

## Порядок прогона (стенд поднят, машина свободна)

Перед замерами убедитесь, что на хосте нет чужих тяжёлых процессов — осиротевшие headless
Chromium от прошлых прогонов Playwright и системные агенты дают мусор в p95:

```bash
ps aux | sort -k3 -nr | head -8      # кто ест CPU
uptime                                # load average
```

Проверка «до/после» в цифрах имеет смысл только на свободной машине: параллельные `pnpm test`,
`flutter test` или сборки делают p95 бессмысленным.

```bash
cd /Users/mac/Documents/DSH/DOMCLEAR

# 1. Листинг заявок (эталон вехи; ~3 мин)
~/.local/bin/k6 run --summary-export=test/performance/results/tickets.json \
  test/performance/k6/tickets.js

# 2. Треки GPS (~35 с). Перед прогоном и после — уборка треков оператора
~/.local/bin/k6 run --summary-export=test/performance/results/gps-track.json \
  test/performance/k6/gps-track.js
bash test/performance/cleanup-stand.sh gps --user <id оператора> --since <ISO-время старта>

# 3. Генерация смен (~1 мин + пауза). См. «Две фазы» ниже
~/.local/bin/k6 run --summary-export=test/performance/results/schedule-gen.json \
  test/performance/k6/schedule-gen.js

# 4. Burst-логин (~1 с). Нужен экземпляр auth с боевыми лимитами и ЧИСТОЕ окно лимита
bash test/performance/auth-prod-throttle.sh start
~/.local/bin/k6 run --summary-export=test/performance/results/auth.json \
  test/performance/k6/auth.js
bash test/performance/auth-prod-throttle.sh stop
```

Адрес стенда по умолчанию — `http://127.0.0.1:8080` (nginx, единая точка входа).
Прод-адрес задаётся `K6_BASE_URL`; отдельно `K6_AUTH_BASE_URL` — если целевой сервис вызывается
напрямую по host-loopback (так снят `results/tickets-direct.json`).

### Две фазы `schedule-gen.js`

Фаза `individual` создаёт смены на дату генерации. Если их не снять, фаза `sweep` увидит их и
пройдёт по пути идемпотентности («всё пропущено») — время будет измерено не на генерации.
Поэтому между фазами смены удаляются, а сценарий ждёт, пока API покажет `0` смен у своих графиков:

```bash
# запустить прогон (по умолчанию пауза между фазами 60 с, K6_SCHED_SWEEP_GAP)
~/.local/bin/k6 run test/performance/k6/schedule-gen.js &
sleep 20    # фаза individual занимает ~1–2 с при 20 VU
IDS=$(docker exec -i cleaning-ops-postgres psql -U admin -d cleaning_ops_schedule -tAc \
  "SELECT string_agg(id, ',') FROM \"Schedule\" WHERE name LIKE 'М7.2 k6%'")
bash test/performance/cleanup-stand.sh events --ids "$IDS"
wait
```

Уборка созданных графиков — после прогона:

```bash
bash test/performance/cleanup-stand.sh schedules --run-tag 'М7.2 k6'
```

## Уборка и демонстрационная среда

`scripts/reset-stand.sh` стирает базы целиком, **включая демо-данные** («БЦ «Ромашка»», 21 заявка,
5 материалов). Для нагрузочных прогонов он не нужен и в М7.2 не использовался.

`cleanup-stand.sh` удаляет только те данные, которые создали сценарии:

```bash
bash test/performance/cleanup-stand.sh status                                  # что сейчас в БД
bash test/performance/cleanup-stand.sh gps --user <uuid> --since <ISO> [--until <ISO>]
bash test/performance/cleanup-stand.sh events --ids <uuid,...>                  # только смены
bash test/performance/cleanup-stand.sh schedules --ids <uuid,...> [--run-tag <tag>] [--since <ISO>]
```

Демо-графики, объект и заявки не имеют метки прогона (`М7.2 k6 …`) и в фильтры не попадают.
Побочный эффект прохода `sweep` без `scheduleId`: он идёт и по демо-графикам — идемпотентно
(на дату генерации у них либо уже есть смены, либо создаются такие же штатные). Если после прогона
появились демо-смена и её заявка, они снимаются точечно по id.

## Пороги и почему они такие

* Пороги плана М7.2: `tickets.js` — 50→100 rps, **p95 < 500 мс**, **ошибок < 1 %**.
  Другим сценариям план латентностных порогов не задаёт: у `gps-track.js` требование
  «1000 точек/с», у `schedule-gen.js` — «пик генерации в 00:00», у `auth.js` — «burst-логин
  с rate-limit». Собственные пороги сценариев помечены в их коде комментариями.
* **Средняя скорость профиля 50→100→0 равна 62,5 rps по построению** `(50·30 + 75·60 + 50·30)/120`,
  а k6 считает `rate` как `count / время всего прогона`. Поэтому «выдержали 100 rps»
  проверяется двумя утверждениями: `dropped_iterations == 0` на разгоне и `iterations >= 5700`
  на полке 100 rps (60 с). Порог вида `http_reqs{scenario:plateau} rate>=95` был бы неверен.
* `gps_points_accepted` считает **принятые** сервером точки из ответа `POST /api/gps/track`,
  а не отправленные: иначе сценарий проходил бы на 400-х ответах.

## Имена переменных окружения

Префикс `K6_` у k6 зарезервирован под его собственные опции: например `-e K6_DURATION=5s`
**целиком заменяет** `options.scenarios` (в логе появляется
`"env" level configuration overrode scenarios configuration entirely`), и сценарий молча
перестаёт быть arrival-rate. Поэтому переменные сценариев названы с префиксом модуля:
`K6_GPS_*`, `K6_SCHED_*`, `K6_LIST_TAKE`, `K6_LOGIN_LIMIT`.

## Ретранслятор nginx → хост

Эталонные прогоны идут через nginx `:8080`. Его конфигурация живёт вне репозитория
(`~/.cleaning-ops/nginx/nginx.conf`) и должна содержать **upstream keepalive** — иначе под
нагрузкой отказывает путь «контейнер → хост» и вместо порогов плана получаются пятисекундные
504 (разбор и цифры до/после — `docs/PERFORMANCE_REPORT.md` §7):

```nginx
map $http_upgrade $connection_upgrade { default upgrade; '' ''; }   # НЕ `close`
upstream tickets_upstream { server host.docker.internal:3005; keepalive 16; }
```

## Что считается эталоном

`results/tickets.json`, `results/gps-track.json`, `results/schedule-gen.json`, `results/auth.json` —
прогоны через единую точку входа на свободной машине после исправлений. Все четыре завершаются
`exit 0` (все пороги выполнены). Остальные файлы в `results/` — вспомогательные: `relay-*`
(до/после правки ретранслятора), `baseline-tickets-buggy.json` (каркас с дефектами),
`tickets-direct.json` (напрямую в сервис), `explain/` (профилирование запросов).
