# Architecture Notes

## Stack
- Frontend: React + Vite
- Backend: ASP.NET Core (.NET 9)
- DB: PostgreSQL
- Reverse proxy: Nginx

## Database policy
- Проект работает **только с PostgreSQL**.
- SQLite не используется ни в runtime, ни как fallback.

## Data model (high level)
Основные таблицы:
- `users`, `sessions`, `admin_sessions`
- `verification_codes`, `profiles`
- `products` (JSONB payload + индексируемые поля)
- `cart_items`, `likes`, `orders`
- `gallery_images` (медиа в БД, `binary_data`)

## Product storage strategy
Продукт хранится в `products.data` (JSONB), а ключевые поля дублируются для фильтрации и сортировки.

## Seed strategy
Если таблица `products` пуста, backend импортирует подготовленные данные из `seed/products.jsonl` в PostgreSQL.

## Media strategy
Медиа хранится в таблице `gallery_images` (поле `binary_data`) и кэшируется в `backend/uploads/gallery/*` для быстрого ответа.
Если файл на диске отсутствует, backend отдает изображение из БД и восстанавливает файл на диск.
