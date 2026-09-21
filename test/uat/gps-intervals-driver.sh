#!/bin/bash
# М7.4: ведущий сценарий измерения GPS-интервалов.
#
# Пока integration_test держит приложение живым, этот скрипт подаёт эмулятору
# координаты и в конце забирает с сервера фактические метки времени принятых
# точек. Никаких «ожидаемых» чисел здесь нет: считаются те, что пришли.
#
# Почему координаты подаются НЕПРЕРЫВНО: `adb emu geo fix` доставляет точку только
# активному подписчику, а первый фикс на эмуляторе приходит через ~2 минуты
# (измерено `probe_location_test.dart`). Поэтому фоновая петля `geo fix` работает
# всё время прогона, а фазы лишь меняют координату.
#
# Фазы (после прогрева): статично 7 мин → движение 3 мин → сеть выключена 80 с →
# сеть включена 60 с.
set -u
export PATH="$HOME/Android/sdk/platform-tools:$PATH"
B=http://127.0.0.1:8080/api
OUT=/tmp/uat/gps-run
mkdir -p "$OUT"

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$OUT/driver.log"; }

LAT=55.7558
LNG=37.6173
# Скорость подаётся ВМЕСТЕ с координатой: приложение выбирает интервал по
# последней известной скорости (`GpsTrackingConfig.movingSpeedMps` = 0.5 м/с),
# поэтому «статично» и «в движении» различаются не только координатой.
VEL=0
STOP=0
inject() {
  while [ "$STOP" = "0" ]; do
    adb emu geo fix "$LNG" "$LAT" 150 8 "$VEL" >/dev/null 2>&1
    sleep 2
  done
}

log "ждём запуска приложения"
for i in $(seq 1 90); do
  if [ -n "$(adb shell pidof com.cleaningops.cleaning_ops_app 2>/dev/null | tr -d '\r')" ]; then break; fi
  sleep 2
done
log "приложение запущено, даю 25 с на вход оператора"
sleep 25

inject &
INJECT_PID=$!
log "подача координат запущена (pid $INJECT_PID, точка 55.7558/37.6173)"

log "фаза 1: ПРОГРЕВ + СТАТИЧНО 420 с (координата одна, скорость 0)"
VEL=0
sleep 420

log "фаза 2: ДВИЖЕНИЕ 180 с (шаг ~60 м каждые 4 с, скорость 1.4 м/с)"
VEL=1.4
for i in $(seq 1 45); do
  LNG=$(python3 -c "print(f'{37.6173 + $i*0.0008:.6f}')")
  LAT=$(python3 -c "print(f'{55.7558 + $i*0.0004:.6f}')")
  sleep 4
done

log "фаза 3: СЕТЬ ВЫКЛЮЧЕНА 80 с (буфер)"
VEL=0
adb shell svc wifi disable >/dev/null 2>&1
adb shell svc data disable >/dev/null 2>&1
LAT=55.7558
LNG=37.6173
sleep 80

log "фаза 4: СЕТЬ ВКЛЮЧЕНА 60 с (догрузка буфера)"
adb shell svc data enable >/dev/null 2>&1
adb shell svc wifi enable >/dev/null 2>&1
sleep 60

STOP=1
wait "$INJECT_PID" 2>/dev/null
log "подача координат остановлена"

log "готово; выгружаю принятые точки"
OT=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"operator@cleaning-ops.com","password":"oper123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
UID_OP=$(curl -s $B/auth/me -H "Authorization: Bearer $OT" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
FROM=$(python3 -c "import datetime;print((datetime.datetime.utcnow()-datetime.timedelta(hours=2)).strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
TO=$(python3 -c "import datetime;print((datetime.datetime.utcnow()+datetime.timedelta(minutes=5)).strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
curl -s "$B/gps/tracks?userId=$UID_OP&from=$FROM&to=$TO" -H "Authorization: Bearer $OT" > "$OUT/tracks.json"
python3 "$(dirname "$0")/gps-intervals-report.py" "$OUT/tracks.json" | tee "$OUT/intervals.txt"
log "результат в $OUT/intervals.txt"
