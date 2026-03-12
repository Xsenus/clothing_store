# Авторизация через Telegram

Документ описывает, как в проекте работает вход через Telegram Login Widget, какие настройки нужны и почему Telegram ID сейчас не отображается как отдельное поле пользователя.

## 1) Полный поток авторизации

1. Фронтенд (`/auth`) читает публичные настройки через `GET /settings/public`.
2. Если `telegram_login_enabled=true` и задан `telegram_bot_username`, монтируется Telegram Login Widget.
3. После клика «Войти через Telegram» виджет возвращает объект `user` и `hash`.
4. Фронтенд отправляет данные в `POST /auth/telegram/login`.
5. Бэкенд:
   - получает `telegram_bot_token` из `app_settings` (или из конфига `Integrations:Telegram:BotToken`),
   - проверяет подпись (`hash`) по Telegram-правилам,
   - ищет пользователя по техническому email,
   - если пользователя нет — создаёт `users` + `profiles`,
   - создаёт `sessions` и `refresh_sessions`,
   - возвращает `token` и `refreshToken`.

---

## 2) Настройки (где и какие)

### 2.1 В админке

| Ключ | Где используется | Обязателен | Публичный |
|---|---|---:|---:|
| `telegram_login_enabled` | Включает блок Telegram-входа на фронте | Да | Да |
| `telegram_bot_username` | `data-telegram-login` для Telegram Widget | Да | Да |
| `telegram_bot_token` | Проверка подписи данных на бэкенде | Да | Нет |

### 2.2 Источник настроек

| Настройка | Приоритет чтения |
|---|---|
| `telegram_bot_token` | `app_settings.telegram_bot_token` → резервный источник: `Integrations:Telegram:BotToken` |
| `telegram_login_enabled`, `telegram_bot_username` | Только `app_settings`, отдаются через `GET /settings/public` |

---

## 3) Данные от Telegram и серверная валидация

### 3.1 Поля, отправляемые фронтом

| Поле на фронтенде | Источник из Telegram Widget | Поле в DTO бэкенда |
|---|---|---|
| `id` | `telegramUser.id` | `TelegramAuthPayload.Id` |
| `firstName` | `telegramUser.first_name` | `TelegramAuthPayload.FirstName` |
| `lastName` | `telegramUser.last_name` | `TelegramAuthPayload.LastName` |
| `username` | `telegramUser.username` | `TelegramAuthPayload.Username` |
| `photoUrl` | `telegramUser.photo_url` | `TelegramAuthPayload.PhotoUrl` |
| `authDate` | `telegramUser.auth_date` | `TelegramAuthPayload.AuthDate` |
| `hash` | `telegramUser.hash` | `TelegramAuthPayload.Hash` |

### 3.2 Что проверяется на бэкенде

| Проверка | Логика |
|---|---|
| Обязательные поля | `id`, `auth_date`, `hash` не пустые |
| Data-check-string | Сборка ключей `auth_date`, `id`, + опциональные (`first_name`, `last_name`, `photo_url`, `username`) и сортировка по `StringComparer.Ordinal` |
| Подпись | `secret = SHA256(bot_token)`, затем `HMAC-SHA256(data_check_string)` |
| Сравнение | `expected_hash` == `payload.hash` (в lowercase) |

---

## 4) Что хранится в БД после Telegram-входа

| Таблица | Поля | Что пишется |
|---|---|---|
| `users` | `id`, `email`, `verified`, ... | Новый пользователь с `email=telegram_<telegram_id>@telegram.local`, `verified=true`, пустой пароль |
| `profiles` | `user_id`, `email`, `name`, `nickname` | `name` = `firstName + lastName`, `nickname` = `username` |
| `sessions` | `token`, `user_id`, `created_at` | Access-сессия |
| `refresh_sessions` | `token`, `user_id`, `created_at` | Refresh-сессия |

---

## 5) Почему Telegram ID не видно в «Настройках профиля»

Сейчас это ожидаемое поведение из-за текущего дизайна данных:

1. В `profiles` нет отдельного поля `telegram_id`.
2. Telegram ID кодируется в `users.email` как `telegram_<id>@telegram.local`.
3. API профиля (`GET /profile`) возвращает: `name`, `phone`, `shippingAddress`, `email`, `nickname`, `isAdmin`, `isBlocked`.
4. UI вкладки «Настройки» показывает только эти поля — Telegram ID не входит в контракт.

---

## 6) Как правильно «доделать» (если нужен Telegram ID в интерфейсе)

Минимальный план:

1. Добавить поля в модель/миграцию (например, `profiles.telegram_id`, `profiles.telegram_username`, `profiles.telegram_photo_url`).
2. В `POST /auth/telegram/login` заполнять/обновлять их на каждом входе.
3. В `GET /profile` вернуть эти поля в ответе.
4. На фронте (`/profile`) показать Telegram-поля (обычно только для чтения).
5. В админке пользователей добавить колонки Telegram ID/username для поддержки.

