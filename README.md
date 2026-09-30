# Конаково Рядом

Единая городская платформа для Telegram, WEB Control Center и будущего MAX.

## Статус

PRIVATE BETA foundation, версия архитектуры v3.5 Platform Ready.

## Архитектура

- Telegram Bot -> Supabase Edge Function `telegram-webhook`
- WEB Control Center -> Supabase Edge Function `control-center`
- Admin API -> Supabase Edge Function `admin-api`
- PostgreSQL -> единая база данных
- Telegram / MAX / Web -> IdentityLink и общий профиль пользователя

## Безопасность

Секреты не хранятся в GitHub. Для запуска нужны Supabase secrets:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `ADMIN_ACCESS_KEY`

До публичного запуска репозиторий рекомендуется перевести в Private.

## Первый запуск

1. Создать отдельный Supabase project `Konakovo Nearby`.
2. Применить `database/schema.sql`.
3. Развернуть Edge Functions из `supabase/functions`.
4. Добавить secrets в Supabase.
5. Вызвать setup endpoint для Telegram webhook.
6. Проверить /start и вход в WEB Control Center.

## Каналы

Сейчас:
- Telegram
- Web admin

Следующим этапом:
- MAX Bot
- MAX Mini App
- Telegram Mini App

Оба мессенджера будут использовать те же сущности, контент, пользователей, бизнесы, обращения и настройки.
