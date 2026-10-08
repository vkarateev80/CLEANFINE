#!/bin/bash
# ============================================================
# CLEANFINE — установка IPA на iPhone по проводу (без App Store и TestFlight)
#
# Решение владельца 08.10.2026: iOS-версия «Команды» (и «Оператора») ставится
# с Mac по кабелю. Скрипт берёт IPA, проверяет его профиль подписи (срок и
# список устройств) и ставит на подключённый iPhone через `devicectl`
# (Xcode 15+; телефон должен доверять Mac — «Доверять этому компьютеру»).
#
#   scripts/ios-install-cable.sh                       # ~/Desktop/CLEANFINE-Team-1.0.0-ios.ipa
#   scripts/ios-install-cable.sh ~/Desktop/CLEANFINE-Operator-1.0.0-ios.ipa
#   scripts/ios-install-cable.sh <файл.ipa> <UDID>     # если подключено несколько iPhone
#   DRY_RUN=1 scripts/ios-install-cable.sh …           # только проверить IPA и профиль
#
# Ограничение бесплатной Apple ID (личная команда): профиль живёт 7 дней,
# после чего приложение перестаёт запускаться — пересобрать IPA и поставить
# снова. Платная Apple Developer Program снимает это (профиль на год,
# Ad Hoc до 100 устройств). Устройство должно быть в профиле: новый iPhone
# сначала один раз запускается из Xcode/`flutter run`, чтобы Xcode добавил
# его UDID в профиль, затем пересобирается IPA.
# ============================================================
set -eu

IPA="${1:-$HOME/Desktop/CLEANFINE-Team-1.0.0-ios.ipa}"
UDID="${2:-}"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

[ -f "$IPA" ] || { echo "Нет файла: $IPA"; exit 1; }

# --- подключённые физические iPhone ---------------------------------------
LIST="$(mktemp)"
xcrun devicectl list devices --json-output "$LIST" >/dev/null 2>&1
CONNECTED=$(plutil -convert json -o - "$LIST" | python3 -c '
import json,sys
d=json.load(sys.stdin)
for dev in d.get("result",{}).get("devices",[]):
    if dev.get("connectionProperties",{}).get("tunnelState")!="connected": continue
    hw=dev.get("hardwareProperties",{})
    if hw.get("reality")!="physical": continue
    print(hw.get("udid",""), dev.get("deviceProperties",{}).get("name",""))
')
rm -f "$LIST"

if [ -z "$UDID" ]; then
  COUNT=$(printf "%s\n" "$CONNECTED" | grep -c . || true)
  if [ "$COUNT" -eq 0 ]; then
    echo "Нет подключённого iPhone. Подключите кабелем, разблокируйте и нажмите «Доверять»."; exit 1
  elif [ "$COUNT" -gt 1 ]; then
    echo "Подключено несколько iPhone — укажите UDID вторым аргументом:"; echo "$CONNECTED"; exit 1
  fi
  UDID=$(echo "$CONNECTED" | awk '{print $1}')
fi
NAME=$(echo "$CONNECTED" | awk -v u="$UDID" '$1==u {$1=""; print substr($0,2)}')
echo "==> iPhone: ${NAME:-$UDID} ($UDID)"

# --- что внутри IPA: bundle, имя, профиль ----------------------------------
TMP="$(mktemp -d)"
unzip -q -o "$IPA" 'Payload/*.app/Info.plist' 'Payload/*.app/embedded.mobileprovision' -d "$TMP"
APP=$(ls -d "$TMP"/Payload/*.app | head -1)
BUNDLE=$(plutil -extract CFBundleIdentifier raw "$APP/Info.plist")
TITLE=$(plutil -extract CFBundleDisplayName raw "$APP/Info.plist" 2>/dev/null || plutil -extract CFBundleName raw "$APP/Info.plist")
VERSION=$(plutil -extract CFBundleShortVersionString raw "$APP/Info.plist")
echo "==> $TITLE $VERSION ($BUNDLE)"

if [ -f "$APP/embedded.mobileprovision" ]; then
  PROF="$TMP/profile.plist"
  security cms -D -i "$APP/embedded.mobileprovision" > "$PROF" 2>/dev/null
  EXP=$(plutil -extract ExpirationDate raw "$PROF")
  PNAME=$(plutil -extract Name raw "$PROF")
  echo "==> Профиль: $PNAME, действует до $EXP"
  if ! plutil -extract ProvisionedDevices json -o - "$PROF" 2>/dev/null | grep -q "$UDID"; then
    echo "!!  Этого iPhone нет в профиле подписи — iOS откажется запускать приложение."
    echo "    Сначала запустите приложение на нём из Xcode/flutter run (Xcode добавит UDID), затем пересоберите IPA."
    rm -rf "$TMP"; exit 1
  fi
fi
rm -rf "$TMP"

# --- установка ------------------------------------------------------------
if [ "${DRY_RUN:-0}" = "1" ]; then echo "==> DRY_RUN: установка пропущена"; exit 0; fi
echo "==> Устанавливаю…"
# Первая попытка после подключения нередко падает с IXRemoteErrorDomain 6
# («Connection invalid») — служба установки на телефоне ещё не поднялась;
# со второй проходит. Телефон должен быть разблокирован.
if ! xcrun devicectl device install app --device "$UDID" "$IPA"; then
  echo "==> Не вышло, повторяю через 5 с (разблокируйте iPhone)…"; sleep 5
  xcrun devicectl device install app --device "$UDID" "$IPA"
fi
echo "==> Готово. Если iOS пишет «Ненадёжный разработчик»: Настройки → Основные → VPN и управление устройством → доверять разработчику."
