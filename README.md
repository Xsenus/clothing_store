# Clothing Store

React + Vite frontend with an ASP.NET Core 9 API and PostgreSQL.

## Stack
- Frontend: React, Vite, Tailwind CSS
- Backend: ASP.NET Core (.NET 9)
- Database: PostgreSQL
- Deploy: Nginx + systemd + PostgreSQL

## Configuration model
- Frontend local dev config lives in the root `.env`.
- Backend shared defaults live in `backend/Store.Api/appsettings*.json`.
- Backend local secrets should use `dotnet user-secrets`.
- Backend production secrets should live in an external environment file such as `/etc/clothing-store/environment`.

The root [`.env.example`](.env.example) is frontend-only.
The production backend environment template is [deploy/backend.environment.example](deploy/backend.environment.example).

## Local development
Frontend:

```bash
cp .env.example .env
npm ci
npm run dev
```

Backend:

```bash
dotnet user-secrets --project backend/Store.Api/Store.Api.csproj set "ConnectionStrings:DefaultConnection" "Host=127.0.0.1;Port=5432;Database=clothing_store;Username=postgres;Password=CHANGE_ME"
dotnet user-secrets --project backend/Store.Api/Store.Api.csproj set "AdminUser:Email" "admin@clothingstore.local"
dotnet user-secrets --project backend/Store.Api/Store.Api.csproj set "AdminUser:Password" "CHANGE_ME"
dotnet run --project backend/Store.Api/Store.Api.csproj
```

## Deployment
Use the step-by-step guide in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Notes
- On backend startup, EF Core migrations are applied automatically. If the PostgreSQL database is missing, the API will create it first when the configured role has `CREATEDB`.
- Prepared products are seeded from `seed/products.jsonl` when the `products` table is empty.
- Uploaded media is stored in `backend/uploads` by default.
- Gallery images are persisted in PostgreSQL and restored to disk when needed.
