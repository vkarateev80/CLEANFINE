-- Очистка тестовых данных chat-service после живой проверки.
-- Запуск: docker cp tools/cleanup-chat.sql cleaning-ops-postgres:/tmp/ && \
--         docker exec cleaning-ops-postgres psql -U admin -d cleaning_ops_chat -f /tmp/cleanup-chat.sql
-- Message/ChatMember ссылаются на Chat, поэтому сначала дети, затем родитель.
TRUNCATE TABLE "Message" RESTART IDENTITY CASCADE;
TRUNCATE TABLE "ChatMember" RESTART IDENTITY CASCADE;
TRUNCATE TABLE "Chat" RESTART IDENTITY CASCADE;

SELECT 'Chat' AS table_name, count(*) AS rows FROM "Chat"
UNION ALL SELECT 'ChatMember', count(*) FROM "ChatMember"
UNION ALL SELECT 'Message', count(*) FROM "Message";
