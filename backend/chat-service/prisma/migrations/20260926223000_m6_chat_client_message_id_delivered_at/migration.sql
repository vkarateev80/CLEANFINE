-- M6, остаток «clientMessageId/deliveredAt в чате» (design chat.md п.11.1–11.2):
--
-- 1) clientMessageId — клиентский ключ идемпотентности `message:send` (WS) и
--    REST-фолбэка. Ретрай после обрыва связи с тем же ключом возвращает уже
--    сохранённое сообщение вместо дубля. NULL (сообщения без ключа) в
--    уникальном индексе PostgreSQL не конфликтуют.
-- 2) deliveredAt — «устройство получило»: заполняется, когда хотя бы один
--    получатель онлайн при отправке, либо при загрузке истории / прочтении.
--    null = только «отправлено».

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "clientMessageId" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Message_authorId_clientMessageId_key" ON "Message"("authorId", "clientMessageId");
