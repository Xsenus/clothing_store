# Clothing Store — React + ASP.NET Core + PostgreSQL

## Stack

- Frontend: React + Vite + Tailwind
- Backend: ASP.NET Core (.NET 9)
- DB: PostgreSQL (основной), SQLite (fallback при `Data Source=...`)
- Deploy: Nginx + systemd + PostgreSQL

---

## Backend: откуда берётся конфиг БД

Backend использует `ConnectionStrings:DefaultConnection` из `appsettings*.json`.

- `appsettings.Development.json` — dev-конфигурация
- `appsettings.Production.json` — production-конфигурация

Если строка подключения пустая или в формате SQLite (`Data Source=...`), будет использован SQLite.
Если строка подключения PostgreSQL (`Host=...;Port=...`), будет использован PostgreSQL.

Ключевая логика: `backend/Store.Api/Program.cs`.

---

## Разделение конфигов (frontend vs backend)

### Frontend `.env`

Файл `.env` в корне используется для Vite-переменных фронта:

```env
VITE_API_URL=/api
VITE_API_TARGET=http://127.0.0.1:3001
```

### Backend `appsettings`

#### Development (`backend/Store.Api/appsettings.Development.json`)

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=127.0.0.1;Port=5433;Database=clothing_store;Username=store_user;Password=Qwerty!@#"
  }
}
```

#### Production (`backend/Store.Api/appsettings.Production.json`)

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=127.0.0.1;Port=5432;Database=clothing_store;Username=store_user;Password=Qwerty!@#"
  }
}
```

---

## Локальный запуск

### Frontend

```bash
npm ci
npm run dev
```

### Backend (Development)

```bash
dotnet run --project backend/Store.Api/Store.Api.csproj
```

Backend при старте автоматически выполняет миграции (`Database.MigrateAsync()`).
Для `dotnet ef` из Visual Studio/PMC можно дополнительно задать `STORE_API_DIR` (путь к `backend/Store.Api`), если команда запускается не из корня репозитория.
Если миграции ещё не созданы, backend завершится с ошибкой и попросит создать baseline migration.

---

## Deploy на сервер (Production)

Подробно: `docs/DEPLOYMENT.md`.

Коротко:

1. Установить `nginx`, `postgresql`, `.NET SDK`, `node`.
2. Собрать фронтенд: `npm ci && npm run build`, скопировать `dist` в `/var/www/clothing-store`.
3. Опубликовать backend: `dotnet publish backend/Store.Api/Store.Api.csproj -c Release`.
4. Запустить backend как systemd сервис `clothing-store-api`.
5. Убедиться, что в `appsettings.Production.json` задан production PostgreSQL connection string.

---

## Примечание по миграциям

Миграции создаются вручную через EF Core CLI и применяются автоматически на старте backend.
