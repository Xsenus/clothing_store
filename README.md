# Clothing Store

Фронтенд на React + Vite и API на ASP.NET Core 9 с PostgreSQL.

## Стек
- Фронтенд: React, Vite, Tailwind CSS
- Бэкенд: ASP.NET Core (.NET 9)
- База данных: PostgreSQL
- Развертывание: Nginx + systemd + PostgreSQL

## Модель конфигурации
- Локальная конфигурация фронтенда для разработки хранится в корневом `.env`.
- Общие значения по умолчанию для бэкенда хранятся в `backend/Store.Api/appsettings*.json`.
- Локальные секреты бэкенда следует хранить через `dotnet user-secrets`.
- Продакшен-секреты бэкенда должны храниться во внешнем файле окружения, например `/etc/clothing-store/environment`.

Корневой файл [`.env.example`](.env.example) относится только к фронтенду.
Шаблон продакшен-окружения для бэкенда находится в [deploy/backend.environment.example](deploy/backend.environment.example).

## Локальная разработка
Фронтенд:

```bash
cp .env.example .env
npm ci
npm run dev
```

Бэкенд:

```bash
dotnet user-secrets --project backend/Store.Api/Store.Api.csproj set "ConnectionStrings:DefaultConnection" "Host=127.0.0.1;Port=5432;Database=clothing_store;Username=postgres;Password=CHANGE_ME"
dotnet user-secrets --project backend/Store.Api/Store.Api.csproj set "AdminUser:Email" "admin@clothingstore.local"
dotnet user-secrets --project backend/Store.Api/Store.Api.csproj set "AdminUser:Password" "CHANGE_ME"
dotnet run --project backend/Store.Api/Store.Api.csproj
```

## Развертывание
Используйте пошаговую инструкцию из [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Примечания
- При запуске бэкенда миграции EF Core применяются автоматически. Если база PostgreSQL отсутствует, API сначала создаст её, если у указанной роли есть право `CREATEDB`.
- Подготовленные товары загружаются из `seed/products.jsonl`, когда таблица `products` пуста.
- Загруженные медиафайлы по умолчанию хранятся в `backend/uploads`.
- Изображения галереи сохраняются в PostgreSQL и при необходимости восстанавливаются на диск.
