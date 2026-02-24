# Architecture Notes

## Stack

- Frontend: React + Vite
- Backend: ASP.NET Core Minimal API (.NET 8)
- DB: PostgreSQL
- Reverse proxy: Nginx (frontend container)

## Data model (high level)

Основные таблицы:

- `users`
- `sessions`
- `admin_sessions`
- `verification_codes`
- `profiles`
- `products` (JSONB payload + indexed fields)
- `cart_items`
- `likes`
- `orders`

Схема создается миграциями в `backend/Store.Api/Migrations`.

## Product storage strategy

Продукт хранится в `products.data` (JSONB), а также дублируются ключевые поля для фильтрации/сортировки:

- `slug`
- `category`
- `is_new`
- `is_popular`
- `likes_count`
- `creation_time`

Это позволяет:

- не ломать фронтовый payload
- быстрее отбирать “new/popular/category”

## Seed strategy

При пустой таблице `products` backend импортирует данные в таком порядке:

1. `backend/products.json`
2. `seed/products.jsonl`

## Auth strategy

- user token: таблица `sessions`
- admin token: таблица `admin_sessions`
- password hash: PBKDF2 SHA-256
- email-коды: `verification_codes`

## Upload strategy

Загрузка медиа на файловую систему (`STORE_UPLOADS_DIR`), доступ через `/uploads/...`.
