#!/bin/bash
# М7.4: нажатие затвора в системном приложении камеры эмулятора.
#
# Зачем: фотоотчёт оператора снимается через `image_picker` → системное приложение
# `com.android.camera2`. У него нет точки автоматизации из `integration_test`
# (тест живёт в процессе Flutter-приложения), поэтому затвор нажимает хост-скрипт,
# пока идёт прогон. Одна и та же координата работает в обоих состояниях камеры:
# в режиме съёмки это кнопка затвора, в режиме просмотра снимка — кнопка «Done»
# (проверено дампом `uiautomator`: `done_button` = [424,1639][655,1870]).
#
# Использование: bash camera-shutter.sh <секунд>   (по умолчанию 420)
set -u
export PATH="$HOME/Android/sdk/platform-tools:$PATH"
END=$(( $(date +%s) + ${1:-420} ))
while [ "$(date +%s)" -lt "$END" ]; do
  if adb shell dumpsys activity activities 2>/dev/null | grep -q "com.android.camera2/com.android.camera.CaptureActivity"; then
    echo "[$(date +%H:%M:%S)] камера открыта — нажимаю затвор/«Done»"
    adb shell input tap 540 1755 >/dev/null 2>&1
    sleep 3
    # Если это был режим просмотра, второго нажатия быть не должно: камера уже закрыта.
    if adb shell dumpsys activity activities 2>/dev/null | grep -q "com.android.camera2/com.android.camera.CaptureActivity"; then
      adb shell input tap 540 1755 >/dev/null 2>&1
    fi
    sleep 2
  else
    sleep 2
  fi
done
