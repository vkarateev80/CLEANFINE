#!/usr/bin/env python3
"""Генератор панелей Grafana CLEANFINE (19.10.2026).

Панели правятся здесь, а не руками в JSON: так видны запросы и раскладка.
Запуск: python3 infra/grafana/build_dashboards.py → infra/grafana/dashboards/*.json,
затем bash infra/grafana/apply.sh — ConfigMap-ы подхватит sidecar Grafana.
"""

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent / "dashboards"

SCHEDULE = {"type": "grafana-postgresql-datasource", "uid": "cf-pg-schedule"}
TICKETS = {"type": "grafana-postgresql-datasource", "uid": "cf-pg-tickets"}
AUTH = {"type": "grafana-postgresql-datasource", "uid": "cf-pg-auth"}
PROM = {"type": "prometheus", "uid": "prometheus"}
MIXED = {"type": "datasource", "uid": "-- Mixed --"}

# Сегодняшний день расписания: пояс организации из «Настроек» (переменная tz).
TODAY = "(now() AT TIME ZONE ${tz:sqlstring})::date"


def local(column: str, fmt: str = "HH24:MI") -> str:
    """Время из timestamp (UTC без пояса) → строка в поясе организации."""
    return f"to_char({column} AT TIME ZONE 'UTC' AT TIME ZONE ${{tz:sqlstring}}, '{fmt}')"


def sql(ds, ref, query, fmt="table"):
    return {
        "refId": ref,
        "datasource": ds,
        "rawSql": " ".join(query.split()),
        "format": fmt,
        "rawQuery": True,
        "editorMode": "code",
    }


def prom(ref, expr, legend="", instant=False):
    target = {"refId": ref, "datasource": PROM, "expr": expr, "legendFormat": legend, "range": not instant}
    if instant:
        target["instant"] = True
    return target


class Layout:
    def __init__(self):
        self.next_id = 1

    def panel(self, kind, title, x, y, w, h, targets, ds, **extra):
        panel = {
            "id": self.next_id,
            "type": kind,
            "title": title,
            "gridPos": {"x": x, "y": y, "w": w, "h": h},
            "datasource": ds,
            "targets": targets,
        }
        self.next_id += 1
        panel.update(extra)
        return panel


def thresholds(*steps):
    """steps: (значение|None, цвет)."""
    return {"mode": "absolute", "steps": [{"value": v, "color": c} for v, c in steps]}


def stat(layout, title, x, y, target, ds, steps, unit="none", description="", w=3, h=4):
    return layout.panel(
        "stat", title, x, y, w, h, [target], ds,
        description=description,
        fieldConfig={"defaults": {"unit": unit, "decimals": 0, "thresholds": thresholds(*steps), "color": {"mode": "thresholds"}}, "overrides": []},
        options={"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False}, "colorMode": "background", "graphMode": "none", "textMode": "value", "justifyMode": "center"},
    )


def join_users(hidden, order=None):
    """Имена сотрудников из базы auth: join по userId, служебные id прячем."""
    organize = {"excludeByName": {name: True for name in hidden}, "renameByName": {}}
    if order:
        organize["indexByName"] = {name: index for index, name in enumerate(order)}
    return [
        {"id": "joinByField", "options": {"byField": "userId", "mode": "inner"}},
        {"id": "organize", "options": organize},
    ]


USERS = sql(AUTH, "U", 'SELECT id AS "userId", "fullName" AS "Сотрудник" FROM users')


def table(layout, title, x, y, w, h, targets, transformations, overrides=None, description=""):
    return layout.panel(
        "table", title, x, y, w, h, targets, MIXED,
        description=description,
        transformations=transformations,
        fieldConfig={"defaults": {"custom": {"align": "auto", "cellOptions": {"type": "auto"}}}, "overrides": overrides or []},
        options={"showHeader": True, "cellHeight": "sm", "footer": {"show": False}},
    )


def status_colors(field, mapping):
    return {
        "matcher": {"id": "byName", "options": field},
        "properties": [
            {"id": "mappings", "value": [{"type": "value", "options": {text: {"color": color, "index": i} for i, (text, color) in enumerate(mapping.items())}}]},
            {"id": "custom.cellOptions", "value": {"type": "color-text"}},
        ],
    }


def work_dashboard():
    L = Layout()
    panels = []

    # --- Сегодня ---------------------------------------------------------
    panels.append(stat(L, "Смен сегодня", 0, 0, sql(SCHEDULE, "A", f'SELECT count(*) FROM "ScheduleEvent" WHERE "date"::date = {TODAY}'), SCHEDULE, [(None, "blue")]))
    panels.append(stat(L, "На смене сейчас", 3, 0, sql(SCHEDULE, "A", "SELECT count(*) FROM \"ScheduleEvent\" WHERE status = 'CHECKED_IN'"), SCHEDULE, [(None, "text"), (1, "green")], description="Отметились и ещё не закрыли смену"))
    panels.append(stat(L, "Закрыто сегодня", 6, 0, sql(SCHEDULE, "A", f"SELECT count(*) FROM \"ScheduleEvent\" WHERE \"date\"::date = {TODAY} AND status = 'CHECKED_OUT'"), SCHEDULE, [(None, "text")]))
    panels.append(stat(L, "Неявки сегодня", 9, 0, sql(SCHEDULE, "A", f"SELECT count(*) FROM \"ScheduleEvent\" WHERE \"date\"::date = {TODAY} AND status = 'MISSED'"), SCHEDULE, [(None, "green"), (1, "red")]))
    panels.append(stat(L, "Опоздания сегодня", 12, 0, sql(SCHEDULE, "A", f"SELECT count(*) FROM staff_shift_fact WHERE day = {TODAY} AND late"), SCHEDULE, [(None, "green"), (1, "orange")]))
    panels.append(stat(L, "Открытые заявки", 15, 0, sql(TICKETS, "A", "SELECT count(*) FROM tickets WHERE status IN ('new','assigned','in_progress','paused','overdue')"), TICKETS, [(None, "blue")]))
    panels.append(stat(L, "Просроченные", 18, 0, sql(TICKETS, "A", "SELECT count(*) FROM tickets WHERE status = 'overdue'"), TICKETS, [(None, "green"), (1, "red")]))
    panels.append(stat(L, "SOS открытые", 21, 0, sql(TICKETS, "A", "SELECT count(*) FROM tickets WHERE type = 'emergency' AND status IN ('new','assigned','in_progress','paused','overdue')"), TICKETS, [(None, "green"), (1, "red")]))

    # --- Смены сегодня -----------------------------------------------------
    shifts = sql(SCHEDULE, "A", f"""
        SELECT {local('e."plannedStart"')} AS "Начало",
               s.name AS "График",
               e."userId" AS "userId",
               CASE e.status WHEN 'PLANNED' THEN 'Запланирована' WHEN 'CHECKED_IN' THEN 'На смене'
                             WHEN 'CHECKED_OUT' THEN 'Закрыта' WHEN 'MISSED' THEN 'Неявка' END AS "Статус",
               {local('e."checkInAt"')} AS "Пришёл",
               {local('e."checkOutAt"')} AS "Ушёл",
               CASE WHEN f.late THEN f.lateness_minutes END AS "Опоздание, мин",
               CASE WHEN e."checkOutReason" IS NOT NULL THEN 'автоматически' END AS "Закрыта"
        FROM "ScheduleEvent" e
        JOIN "Schedule" s ON s.id = e."scheduleId"
        LEFT JOIN staff_shift_fact f ON f.event_id = e.id
        WHERE e."date"::date = {TODAY} OR e.status = 'CHECKED_IN'
        ORDER BY e."plannedStart"
    """)
    panels.append(table(
        L, "Смены сегодня", 0, 4, 24, 7, [shifts, USERS],
        join_users(["userId"], ["Начало", "Сотрудник", "График", "Статус", "Пришёл", "Ушёл", "Опоздание, мин", "Закрыта"]),
        [status_colors("Статус", {"Запланирована": "blue", "На смене": "green", "Закрыта": "text", "Неявка": "red"})],
        description="Смены сегодняшнего дня по поясу организации и открытые смены прошлых дней",
    ))

    # --- Маршруты сегодня ----------------------------------------------------
    routes = sql(TICKETS, "A", f"""
        SELECT t."assigneeId" AS "userId",
               CASE t.status WHEN 'new' THEN 'Новая' WHEN 'assigned' THEN 'Назначена' WHEN 'in_progress' THEN 'В работе'
                             WHEN 'paused' THEN 'Пауза' WHEN 'completed' THEN 'Выполнена' WHEN 'verified' THEN 'Проверена'
                             WHEN 'rejected' THEN 'Отклонена' WHEN 'closed' THEN 'Закрыта' WHEN 'overdue' THEN 'Просрочена' END AS "Статус",
               COALESCE(oc.done, 0) AS "Операций",
               t."operationsTotal" AS "Всего операций",
               round(100.0 * COALESCE(oc.done, 0) / NULLIF(t."operationsTotal", 0)) AS "Готово, %",
               COALESCE(rc.done, 0) AS "Помещений закрыто",
               COALESCE(oc.photos, 0) AS "Фото",
               {local('GREATEST(oc.last, rc.last)')} AS "Последняя отметка",
               {local('t."createdAt"', 'DD.MM HH24:MI')} AS "Заявка создана"
        FROM tickets t
        LEFT JOIN (SELECT "ticketId", count(*) AS done, count("photoUrl") AS photos, max("completedAt") AS last
                   FROM ticket_operation_completions GROUP BY 1) oc ON oc."ticketId" = t.id
        LEFT JOIN (SELECT "ticketId", count(*) AS done, max("completedAt") AS last
                   FROM ticket_room_completions GROUP BY 1) rc ON rc."ticketId" = t.id
        WHERE t.type = 'planned'
          AND ((t."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${{tz:sqlstring}})::date = {TODAY}
               OR t.status IN ('in_progress', 'paused'))
        ORDER BY t."createdAt"
    """)
    panels.append(table(
        L, "Маршруты сегодня", 0, 11, 24, 7, [routes, USERS],
        join_users(["userId"], ["Сотрудник", "Статус", "Готово, %", "Операций", "Всего операций", "Помещений закрыто", "Фото", "Последняя отметка", "Заявка создана"]),
        [
            {"matcher": {"id": "byName", "options": "Готово, %"}, "properties": [
                {"id": "unit", "value": "percent"}, {"id": "min", "value": 0}, {"id": "max", "value": 100},
                {"id": "custom.cellOptions", "value": {"type": "gauge", "mode": "basic"}},
                {"id": "thresholds", "value": thresholds((None, "orange"), (50, "yellow"), (100, "green"))},
            ]},
            status_colors("Статус", {"В работе": "green", "Просрочена": "red", "Назначена": "blue", "Выполнена": "text", "Закрыта": "text"}),
        ],
        description="Плановые заявки смен: сколько операций чек-листа отмечено, сколько помещений закрыто и фото",
    ))

    # --- Динамика ------------------------------------------------------------
    def bars(title, x, ds, query, overrides):
        return L.panel(
            "timeseries", title, x, 18, 12, 8, [sql(ds, "A", query, "time_series")], ds,
            fieldConfig={"defaults": {"custom": {"drawStyle": "bars", "fillOpacity": 70, "lineWidth": 1, "barAlignment": 0, "stacking": {"mode": "none"}}, "decimals": 0, "min": 0}, "overrides": overrides},
            options={"legend": {"displayMode": "list", "placement": "bottom", "showLegend": True}, "tooltip": {"mode": "multi", "sort": "none"}},
        )

    def color(name, c):
        return {"matcher": {"id": "byName", "options": name}, "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": c}}]}

    panels.append(bars("Заявки по дням", 0, TICKETS, """
        SELECT day::timestamp AS time, sum(created_count) AS "Создано", sum(completed_count) AS "Выполнено", sum(overdue_count) AS "Просрочено"
        FROM ticket_execution_daily WHERE day BETWEEN $__timeFrom()::date AND $__timeTo()::date
        GROUP BY day ORDER BY day
    """, [color("Создано", "blue"), color("Выполнено", "green"), color("Просрочено", "red")]))
    panels.append(bars("Смены по дням", 12, SCHEDULE, """
        SELECT day::timestamp AS time, sum(shifts_count) AS "Смен", sum(checked_out_count) AS "Отработано",
               sum(missed_count) AS "Неявки", sum(late_count) AS "Опоздания", sum(auto_closed_count) AS "Закрыты автоматически"
        FROM staff_control WHERE day BETWEEN $__timeFrom()::date AND $__timeTo()::date
        GROUP BY day ORDER BY day
    """, [color("Смен", "blue"), color("Отработано", "green"), color("Неявки", "red"), color("Опоздания", "orange"), color("Закрыты автоматически", "purple")]))

    # --- Открытые заявки -----------------------------------------------------
    open_tickets = sql(TICKETS, "A", f"""
        SELECT left(t.id, 8) AS "Заявка",
               CASE t.type WHEN 'planned' THEN 'Плановая' WHEN 'unscheduled' THEN 'Внеплановая' WHEN 'emergency' THEN 'SOS' ELSE t.type::text END AS "Тип",
               CASE t.priority::text WHEN 'critical' THEN 'Критичный' WHEN 'high' THEN 'Высокий' WHEN 'normal' THEN 'Обычный' WHEN 'low' THEN 'Низкий' ELSE t.priority::text END AS "Приоритет",
               CASE t.status WHEN 'new' THEN 'Новая' WHEN 'assigned' THEN 'Назначена' WHEN 'in_progress' THEN 'В работе'
                             WHEN 'paused' THEN 'Пауза' WHEN 'overdue' THEN 'Просрочена' ELSE t.status::text END AS "Статус",
               t."assigneeId" AS "userId",
               {local('t."createdAt"', 'DD.MM HH24:MI')} AS "Создана",
               left(t.description, 80) AS "Описание"
        FROM tickets t
        WHERE t.status IN ('new', 'assigned', 'in_progress', 'paused', 'overdue')
        ORDER BY (t.type = 'emergency') DESC, (t.status = 'overdue') DESC, t."createdAt" DESC
        LIMIT 100
    """)
    panels.append(table(
        L, "Открытые заявки", 0, 26, 24, 8, [open_tickets, USERS],
        join_users(["userId"], ["Заявка", "Тип", "Приоритет", "Статус", "Сотрудник", "Создана", "Описание"]),
        [
            status_colors("Статус", {"Просрочена": "red", "В работе": "green", "Назначена": "blue", "Новая": "blue"}),
            status_colors("Тип", {"SOS": "red"}),
        ],
    ))

    return {
        "uid": "cf-work",
        "title": "CLEANFINE — работа",
        "description": "Смены, маршруты и заявки: данные сервисов CLEANFINE только на чтение (роль grafana_ro)",
        "tags": ["cleanfine"],
        "timezone": "browser",
        "editable": True,
        "refresh": "1m",
        "time": {"from": "now-30d", "to": "now"},
        "schemaVersion": 39,
        "templating": {"list": [{
            "name": "tz",
            "label": "Часовой пояс",
            "type": "query",
            "datasource": SCHEDULE,
            "query": "SELECT COALESCE((SELECT \"timeZone\" FROM \"ScheduleSettings\" WHERE id = 'default'), 'Europe/Moscow')",
            "definition": "",
            "refresh": 1,
            "hide": 2,
            "current": {"text": "Europe/Moscow", "value": "Europe/Moscow"},
        }]},
        "panels": panels,
    }


# Входы Traefik: имя роутера → короткое имя (minio, ntfy, operator, portal, web-admin, grafana).
ENTRY = 'label_replace({expr}, "entry", "$1", "exported_service", "(?:cleaning-ops|monitoring)-(?:cleanfine-|kps-)?([a-z]+(?:-[a-z]+)?)(?:-[0-9a-f]+)?@.*")'
ENTRY_NAMES = {
    "web-admin": "Админка + API",
    "operator": "Оператор (/app)",
    "portal": "Портал заказчика",
    "minio": "Файлы и фото",
    "ntfy": "Push (ntfy)",
    "grafana": "Grafana",
}
NS = 'namespace="cleaning-ops"'


def entry_overrides():
    return [{"matcher": {"id": "byName", "options": key}, "properties": [{"id": "displayName", "value": value}]} for key, value in ENTRY_NAMES.items()]


def services_dashboard():
    L = Layout()
    panels = []

    def pstat(title, x, expr, unit, steps, description="", decimals=0):
        p = stat(L, title, x, 0, prom("A", expr, instant=True), PROM, steps, unit, description, w=4)
        p["fieldConfig"]["defaults"]["decimals"] = decimals
        return p

    panels.append(pstat("Недоступных реплик", 0, f"sum(kube_deployment_status_replicas_unavailable{{{NS}}}) + sum(kube_statefulset_status_replicas{{{NS}}} - kube_statefulset_status_replicas_ready{{{NS}}})", "none", [(None, "green"), (1, "red")], "Сервисы CLEANFINE, у которых не поднялись поды"))
    panels.append(pstat("Перезапусков за 24 ч", 4, f'sum(increase(kube_pod_container_status_restarts_total{{{NS},container!="backup"}}[24h]))', "none", [(None, "green"), (1, "orange"), (5, "red")]))
    panels.append(pstat("Ошибок 5xx за час", 8, 'sum(increase(traefik_service_requests_total{code=~"5.."}[1h])) or vector(0)', "none", [(None, "green"), (1, "orange"), (20, "red")]))
    panels.append(pstat("Запросов за час", 12, "sum(increase(traefik_service_requests_total[1h]))", "none", [(None, "blue")]))
    panels.append(pstat("Диск свободно", 16, '100 * min(node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay"})', "percent", [(None, "red"), (10, "orange"), (20, "green")]))
    panels.append(pstat("Память свободно", 20, "100 * min(node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)", "percent", [(None, "red"), (10, "orange"), (20, "green")]))

    def series(title, x, y, targets, unit, overrides=None, description="", stack=False, decimals=None):
        defaults = {"unit": unit, "custom": {"drawStyle": "line", "lineWidth": 1, "fillOpacity": 10, "showPoints": "never", "stacking": {"mode": "normal" if stack else "none"}}}
        if decimals is not None:
            defaults["decimals"] = decimals
        return L.panel(
            "timeseries", title, x, y, 12, 8, targets, PROM,
            description=description,
            fieldConfig={"defaults": defaults, "overrides": overrides or []},
            options={"legend": {"displayMode": "table", "placement": "right", "showLegend": True, "calcs": ["lastNotNull", "max"]}, "tooltip": {"mode": "multi", "sort": "desc"}},
        )

    requests = ENTRY.format(expr="rate(traefik_service_requests_total[5m])")
    panels.append(series("Запросы в минуту по входам", 0, 4, [prom("A", f"sum by (entry) ({requests}) * 60", "{{entry}}")], "short", entry_overrides(), "API всех сервисов идёт через вход «Админка + API» (nginx админки)"))
    errors = ENTRY.format(expr='rate(traefik_service_requests_total{code=~"5.."}[5m])')
    panels.append(series("Ошибки 5xx в минуту", 12, 4, [prom("A", f"sum by (entry) ({errors}) * 60", "{{entry}}")], "short", entry_overrides()))
    latency = ENTRY.format(expr="rate(traefik_service_request_duration_seconds_bucket[5m])")
    panels.append(series("Время ответа p95", 0, 12, [prom("A", f"histogram_quantile(0.95, sum by (le, entry) ({latency}))", "{{entry}}")], "s", entry_overrides()))
    panels.append(series("Реплики сервисов", 12, 12, [prom("A", f"sum by (deployment) (kube_deployment_status_replicas_available{{{NS}}})", "{{deployment}}")], "none", decimals=0, description="Автомасштабирование поднимает до 3 реплик при нагрузке"))
    panels.append(series("CPU по сервисам", 0, 20, [prom("A", f'sum by (container) (rate(container_cpu_usage_seconds_total{{{NS},container!="",container!="POD"}}[5m]))', "{{container}}")], "cores", stack=True))
    panels.append(series("Память по сервисам", 12, 20, [prom("A", f'sum by (container) (container_memory_working_set_bytes{{{NS},container!="",container!="POD"}})', "{{container}}")], "bytes", stack=True))
    panels.append(L.panel(
        "bargauge", "Перезапуски за 24 ч по сервисам", 0, 28, 12, 8,
        [prom("A", f'sort_desc(sum by (container) (increase(kube_pod_container_status_restarts_total{{{NS},container!="backup"}}[24h])))', "{{container}}", instant=True)], PROM,
        fieldConfig={"defaults": {"unit": "none", "decimals": 0, "min": 0, "thresholds": thresholds((None, "green"), (1, "orange"), (5, "red")), "color": {"mode": "thresholds"}}, "overrides": []},
        options={"orientation": "horizontal", "displayMode": "basic", "showUnfilled": True, "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False}},
    ))
    panels.append(series("Нагрузка сервера", 12, 28, [
        prom("A", '100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))', "CPU, %"),
        prom("B", "100 * (1 - min(node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))", "Память, %"),
        prom("C", '100 * (1 - min(node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay"}))', "Диск, %"),
    ], "percent"))

    return {
        "uid": "cf-services",
        "title": "CLEANFINE — сервисы",
        "description": "Здоровье сервисов CLEANFINE: трафик через Traefik, ошибки, время ответа, ресурсы подов и сервера",
        "tags": ["cleanfine"],
        "timezone": "browser",
        "editable": True,
        "refresh": "1m",
        "time": {"from": "now-6h", "to": "now"},
        "schemaVersion": 39,
        "panels": panels,
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, board in (("cleanfine-work", work_dashboard()), ("cleanfine-services", services_dashboard())):
        path = OUT / f"{name}.json"
        path.write_text(json.dumps(board, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()
