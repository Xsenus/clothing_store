# Clothing Store — React + ASP.NET Core + PostgreSQL

## Стек
- Frontend: React + Vite + Tailwind
- Backend: ASP.NET Core (.NET 9)
- DB: PostgreSQL (только PostgreSQL, без SQLite fallback)
- Deploy: Nginx + systemd + PostgreSQL

## Конфиги
- Frontend: `.env` (см. `.env.example`)
- Backend: `backend/Store.Api/appsettings.Development.json`, `backend/Store.Api/appsettings.Production.json`
- БД: `ConnectionStrings:DefaultConnection` (обязательно PostgreSQL connection string)

## Локальный запуск
```bash
npm ci
npm run dev

dotnet run --project backend/Store.Api/Store.Api.csproj
```

## Что изменено по хранилищу
- SQLite полностью удалён из backend-конфигурации и DI.
- Если таблица products пустая, БД заполняется подготовленными данными из `seed/products.jsonl`.
- Галерея хранит изображения в БД и кэширует их на диске в `backend/uploads`; при отсутствии файла на диске backend восстанавливает его из БД.

## Deployment
Подробный максимально пошаговый гайд: `docs/DEPLOYMENT.md`.

## Документация
- Архитектура: `docs/ARCHITECTURE.md`
- Деплой: `docs/DEPLOYMENT.md`
- Telegram auth: `docs/TELEGRAM_AUTH.md`
