-- Роль MANAGER (офисный менеджер, 14.10.2026): права как у SUPERVISOR без
-- админских действий. Расширение enum: существующие строки не трогаются.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGER';
