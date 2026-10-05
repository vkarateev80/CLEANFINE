#!/bin/bash
# М7.4: измерение интервала «В ДВИЖЕНИИ» (12 с по `GpsTrackingConfig`).
#
# Отдельный короткий прогон, потому что в основном драйвере скорость подаётся
# фоновой петле `geo fix`, а переменная, изменённая ПОСЛЕ запуска петли, в неё уже
# не попадает (петля — подпроцесс). Здесь скорость 1.4 м/с подаётся с самого начала
# и координата непрерывно меняется: приложение должно переключиться на 12 с.
set -u
export PATH="$HOME/Android/sdk/platform-tools:$PATH"
B=http://127.0.0.1:8080/api
OUT=/tmp/uat/gps-moving
mkdir -p "$OUT"
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$OUT/driver.log"; }

LAT=55.7558
LNG=37.6173
STOP=0
inject() {
  local i=0
  while [ "$STOP" = "0" ]; do
    i=$((i+1))
    LNG=$(python3 -c "print(f'{37.6173 + $i*0.0008:.6f}')")
    LAT=$(python3 -c "print(f'{55.7558 + $i*0.0004:.6f}')")
    adb emu geo fix "$LNG" "$LAT" 150 8 1.4 >/dev/null 2>&1
    sleep 4
  done
}

log "ждём запуска приложения"
for i in $(seq 1 90); do
  if [ -n "$(adb shell pidof com.cleaningops.cleaning_ops_app 2>/dev/null | tr -d '\r')" ]; then break; fi
  sleep 2
done
log "приложение запущено, 25 с на вход оператора"
sleep 25
inject &
PID=$!
log "движение подаётся (скорость 1.4 м/с, шаг ~60 м каждые 4 с)"
sleep 420
STOP=1
wait "$PID" 2>/dev/null
log "остановлено; выгружаю точки"

OT=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"operator","password":"oper123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
UID_OP=$(curl -s $B/auth/me -H "Authorization: Bearer $OT" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
FROM=$(python3 -c "import datetime;print((datetime.datetime.utcnow()-datetime.timedelta(minutes=20)).strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
TO=$(python3 -c "import datetime;print((datetime.datetime.utcnow()+datetime.timedelta(minutes=5)).strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
curl -s "$B/gps/tracks?userId=$UID_OP&from=$FROM&to=$TO" -H "Authorization: Bearer $OT" > "$OUT/tracks.json"
python3 "$(dirname "$0")/gps-intervals-report.py" "$OUT/tracks.json" | tee "$OUT/intervals.txt"
log "результат в $OUT/intervals.txt"
