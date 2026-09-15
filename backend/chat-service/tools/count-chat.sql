SELECT 'Chat' AS table_name, count(*) AS rows FROM "Chat"
UNION ALL SELECT 'ChatMember', count(*) FROM "ChatMember"
UNION ALL SELECT 'Message', count(*) FROM "Message";
