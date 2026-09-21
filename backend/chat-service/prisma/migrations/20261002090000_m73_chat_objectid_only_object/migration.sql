-- M7.3: инвариант «objectId — только у object-чатов» (дефект 500 в createTicketChat).
--
-- Поле Chat.objectId имеет ГЛОБАЛЬНЫЙ уникальный индекс (Chat_objectId_key), но
-- ticket-чат писал в него объект заявки. Вторая заявка того же объекта получала
-- P2002 на этом индексе, ветка обработки гонки искала чат по ticketId, не находила
-- его и отдавала 500 «No Chat found» вместо создания чата. Пострадавший путь —
-- POST /api/chat/chats (им пользуется и мобильное приложение М6.8).
--
-- 1) Чиним данные, накопленные до правки кода: у не-object чатов objectId пуст.
UPDATE "Chat" SET "objectId" = NULL WHERE "type" <> 'object' AND "objectId" IS NOT NULL;

-- 2) Запрещаем возврат дефекта на уровне хранилища: objectId заполнен ровно
--    тогда, когда чат — object-чат. Ограничение не выражается в схеме Prisma
--    (как и SQL-view отчётов М7.1), поэтому живёт в SQL-миграции.
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_objectId_only_object_check"
  CHECK ("type" = 'object' OR "objectId" IS NULL);
