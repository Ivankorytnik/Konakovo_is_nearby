# Развертывание Конаково Рядом

## 1. Supabase

Создать отдельный проект в организации Korytnik Hub.

Рекомендуемый регион: eu-central-1 или eu-west-1.

Применить файл:

`database/schema.sql`

## 2. Secrets

В Supabase Edge Functions добавить:

- TELEGRAM_BOT_TOKEN
- TELEGRAM_WEBHOOK_SECRET
- ADMIN_ACCESS_KEY

Не добавлять эти значения в GitHub.

## 3. Edge Functions

Развернуть:

- telegram-webhook
- admin-api
- control-center
- telegram-setup

Настройки JWT:

- telegram-webhook: verify_jwt = false, авторизация выполняется через Telegram secret token
- telegram-setup: verify_jwt = false, авторизация выполняется через x-admin-key
- control-center: verify_jwt = false, интерфейс не читает БД напрямую
- admin-api: verify_jwt = false, авторизация выполняется через x-admin-key

## 4. Подключение Telegram

POST:

`https://PROJECT.supabase.co/functions/v1/telegram-setup`

Header:

`x-admin-key: ADMIN_ACCESS_KEY`

После этого Telegram будет отправлять updates на:

`https://PROJECT.supabase.co/functions/v1/telegram-webhook`

## 5. WEB Control Center

Открыть:

`https://PROJECT.supabase.co/functions/v1/control-center`

Ввести:

- Admin API URL:
  `https://PROJECT.supabase.co/functions/v1/admin-api/dashboard`
- ADMIN_ACCESS_KEY

## 6. Проверка

1. Отправить Telegram-боту /start.
2. Убедиться, что создан profile.
3. Убедиться, что создан identity_link channel=telegram.
4. Проверить отсутствие повторной обработки update_id.
5. Открыть Control Center.
6. Проверить счетчик пользователей.
7. Создать тестовый черновик контента.
8. Проверить таблицу content_items.

## 7. PRIVATE BETA

До публичного запуска:

- репозиторий GitHub перевести в Private;
- оставить app_config.private_beta = true;
- не публиковать ссылку на бот;
- ограничить первых тестировщиков;
- после стабилизации добавить whitelist, moderation queue и полноценную Auth-сессию админки.

## 8. Следующий этап

После Telegram:

- Telegram Mini App
- MAX Bot
- MAX Mini App
- единый Feed Engine
- Help
- Business
- Map
- Moderation
- Notifications
- Growth/referrals
- Analytics
