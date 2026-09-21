#!/usr/bin/env bash
# Уборка тестовых данных после нагрузочных сценариев М7.2.
#
# Зачем отдельный скрипт: k6 не умеет ходить в Postgres (в сборке нет xk6-sql), поэтому
# сценарии печатают в teardown готовую команду уборки, а удаление делает этот скрипт.
# SQL выполняется через psql внутри уже поднятого контейнера cleaning-ops-postgres —
# новых зависимостей не требуется.
#
# ДЕМОНСТРАЦИОННАЯ СРЕДА НЕ ЗАТРАГИВАЕТСЯ: удаляются только строки, попавшие в узкое окно
# прогона (--since) и/или только явно перечисленные id. Ни один вызов не делает
# TRUNCATE/DROP и не трогает объект «БЦ «Ромашка»» и его 21 заявку.
#
# Использование:
#   bash test/performance/cleanup-stand.sh status
#   bash test/performance/cleanup-stand.sh gps --user <uuid> --since <iso> [--until <iso>]
#   bash test/performance/cleanup-stand.sh schedules --ids <uuid,...> [--run-tag <tag>] [--since <iso>]
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-cleaning-ops-postgres}"
PG_USER="${PG_USER:-admin}"

psql_db() {
  local db="$1"; shift
  docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$db" -v ON_ERROR_STOP=1 "$@"
}
psql_schedule() { psql_db cleaning_ops_schedule "$@"; }
psql_gps() { psql_db cleaning_ops_gps "$@"; }
psql_tickets() { psql_db cleaning_ops_tickets "$@"; }
psql_core() { psql_db cleaning_ops_core "$@"; }

usage() {
  sed -n '12,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 1
}

cmd_status() {
  echo "— gps_tracks:      $(psql_gps -tAc 'SELECT count(*) FROM gps_tracks')"
  echo "— geofences:       $(psql_gps -tAc 'SELECT count(*) FROM geofences')"
  echo "— schedules:       $(psql_schedule -tAc 'SELECT count(*) FROM "Schedule"')"
  echo "— schedule_events: $(psql_schedule -tAc 'SELECT count(*) FROM "ScheduleEvent"')"
  echo "— tickets:         $(psql_tickets -tAc 'SELECT count(*) FROM tickets')"
  echo "— tickets planned: $(psql_tickets -tAc "SELECT count(*) FROM tickets WHERE type = 'planned'")"
  echo "— objects:         $(psql_core -tAc 'SELECT count(*) FROM objects')"
}

cmd_gps() {
  local user="" since="" until=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --user) user="$2"; shift 2 ;;
      --since) since="$2"; shift 2 ;;
      --until) until="$2"; shift 2 ;;
      *) echo "неизвестный параметр: $1" >&2; exit 2 ;;
    esac
  done
  [[ -n "$user" && -n "$since" ]] || { echo "нужны --user и --since" >&2; exit 2; }
  local window="\"timestamp\" >= '${since}'::timestamptz"
  if [[ -n "$until" ]]; then
    window="${window} AND \"timestamp\" <= '${until}'::timestamptz"
  fi
  local deleted
  deleted="$(psql_gps -tAc "WITH d AS (DELETE FROM gps_tracks WHERE user_id = '${user}'::uuid AND ${window} RETURNING 1) SELECT count(*) FROM d")"
  echo "gps_tracks: удалено $deleted строк (user_id=$user, ${window})"
}

cmd_schedules() {
  local ids="" since="" run_tag=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --ids) ids="$2"; shift 2 ;;
      --since) since="$2"; shift 2 ;;
      --run-tag) run_tag="$2"; shift 2 ;;
      *) echo "неизвестный параметр: $1" >&2; exit 2 ;;
    esac
  done
  if [[ -z "$ids" && -z "$run_tag" ]]; then
    echo "нужен --ids и/или --run-tag" >&2; exit 2
  fi

  # Выборка графиков: по явным id и/или по метке прогона в имени. Обе формы намеренно
  # узкие — графики демо-среды не имеют метки и в фильтр не попадают.
  local scope
  if [[ -n "$ids" && -n "$run_tag" ]]; then
    scope="id = ANY(string_to_array('${ids}', ',')::text[]) OR name LIKE '%${run_tag}%'"
  elif [[ -n "$ids" ]]; then
    scope="id = ANY(string_to_array('${ids}', ',')::text[])"
  else
    scope="name LIKE '%${run_tag}%'"
  fi

  local count events
  count="$(psql_schedule -tAc "SELECT count(*) FROM \"Schedule\" WHERE ${scope}")"
  events="$(psql_schedule -tAc "SELECT count(*) FROM \"ScheduleEvent\" WHERE \"scheduleId\" IN (SELECT id FROM \"Schedule\" WHERE ${scope})")"
  # Смены удаляются каскадом вместе с графиком (onDelete: Cascade), но удаляем явно:
  # так скрипт не зависит от того, включён ли каскад в конкретной версии схемы.
  psql_schedule -qAc "DELETE FROM \"ScheduleEvent\" WHERE \"scheduleId\" IN (SELECT id FROM \"Schedule\" WHERE ${scope})" >/dev/null
  psql_schedule -qAc "DELETE FROM \"Schedule\" WHERE ${scope}" >/dev/null
  echo "schedules: удалено графиков $count, смен $events"

  # Заявки, созданные генерацией (только если сценарий запускался с objectId).
  # Фильтр тройной и намеренно узкий: тип planned + метка прогона в описании
  # («Плановая уборка по графику «М7.2 k6 <runId> #NNN»») + окно времени.
  # 21 демонстрационная заявка помечена «[demo]» и в этот фильтр не попадает ни при чём.
  if [[ -n "$run_tag" ]]; then
    local window=""
    [[ -n "$since" ]] && window=" AND \"createdAt\" >= '${since}'::timestamptz"
    local deleted
    deleted="$(psql_tickets -tAc "WITH d AS (DELETE FROM tickets WHERE type = 'planned' AND description LIKE '%${run_tag}%'${window} RETURNING 1) SELECT count(*) FROM d")"
    echo "tickets: удалено плановых заявок прогона $run_tag: $deleted"
  fi
}

# Удаление ТОЛЬКО смен тестовых графиков (графики остаются): нужен для сценария
# schedule-gen — фаза sweep должна получить чистую дату, а не одни пропуски.
cmd_events() {
  local run_tag="" ids=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run-tag) run_tag="$2"; shift 2 ;;
      --ids) ids="$2"; shift 2 ;;
      *) echo "неизвестный параметр: $1" >&2; exit 2 ;;
    esac
  done
  [[ -n "$run_tag" || -n "$ids" ]] || { echo "нужен --run-tag и/или --ids" >&2; exit 2; }
  # ВНИМАНИЕ: id графиков в этой БД — text, а не uuid (Prisma @default(uuid()) на String),
  # поэтому приводим к text[]: uuid[] даёт «operator does not exist: text = uuid».
  local scope
  if [[ -n "$ids" && -n "$run_tag" ]]; then
    scope="id = ANY(string_to_array('${ids}', ',')::text[]) OR name LIKE '%${run_tag}%'"
  elif [[ -n "$ids" ]]; then
    scope="id = ANY(string_to_array('${ids}', ',')::text[])"
  else
    scope="name LIKE '%${run_tag}%'"
  fi
  local deleted
  deleted="$(psql_schedule -tAc "WITH d AS (DELETE FROM \"ScheduleEvent\" WHERE \"scheduleId\" IN (SELECT id FROM \"Schedule\" WHERE ${scope}) RETURNING 1) SELECT count(*) FROM d")"
  echo "schedule_events: удалено $deleted строк (тестовые графики)"
}

[[ $# -ge 1 ]] || usage
case "$1" in
  status) shift; cmd_status "$@" ;;
  gps) shift; cmd_gps "$@" ;;
  schedules) shift; cmd_schedules "$@" ;;
  events) shift; cmd_events "$@" ;;
  *) usage ;;
esac
