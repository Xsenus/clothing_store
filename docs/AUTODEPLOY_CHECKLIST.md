# Autodeploy Checklist

Use this checklist after migrating the VPS to the external runtime layout.

## 1) Expected VPS layout
- Repository root: `/opt/clothing_store`
- Backend runtime: `/opt/clothing_store_runtime/store-api`
- Backend env file: `/etc/clothing-store/environment`
- Frontend dist: `/var/www/clothing-store`
- Backend service: `clothing-store-api`
- Backend bind: `127.0.0.1:3001`

## 2) Expected GitHub Actions settings
Secrets:
- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`

Variables:
- `BACKEND_DLL_PATH=/opt/clothing_store_runtime/store-api/Store.Api.dll`
- `BACKEND_ENV_FILE=/etc/clothing-store/environment`

Optional variables only if you override defaults:
- `VPS_APP_DIR`
- `FRONTEND_DIST_DIR`
- `BACKEND_SERVICE`
- `BACKEND_HEALTHCHECK_URL`
- `VPS_SSH_PORT`

## 3) Expected backend environment file
`/etc/clothing-store/environment` must contain:
- `ASPNETCORE_ENVIRONMENT=Production`
- `ConnectionStrings__DefaultConnection=...`
- `AdminUser__Email=...`
- `AdminUser__Password=...`

Quick check:

```bash
grep -E '^(ASPNETCORE_ENVIRONMENT|ConnectionStrings__DefaultConnection|AdminUser__Email)=' /etc/clothing-store/environment
```

## 4) Expected PostgreSQL state
The application requires a reachable PostgreSQL instance and an accessible target database.

Quick check:

```bash
pg_lsclusters
pg_isready -h 127.0.0.1 -p 5432
sudo -u postgres psql -d postgres -c '\l'
```

Application credential check:

```bash
CONNECTION_STRING="$(grep -m1 '^ConnectionStrings__DefaultConnection=' /etc/clothing-store/environment | cut -d= -f2-)"
DB_HOST="$(printf '%s' "$CONNECTION_STRING" | tr ';' '\n' | sed -n 's/^Host=//p' | head -n1)"
DB_PORT="$(printf '%s' "$CONNECTION_STRING" | tr ';' '\n' | sed -n 's/^Port=//p' | head -n1)"
DB_NAME="$(printf '%s' "$CONNECTION_STRING" | tr ';' '\n' | sed -n 's/^Database=//p' | head -n1)"
DB_USER="$(printf '%s' "$CONNECTION_STRING" | tr ';' '\n' | sed -n 's/^Username=//p' | head -n1)"
DB_PASSWORD="$(printf '%s' "$CONNECTION_STRING" | tr ';' '\n' | sed -n 's/^Password=//p' | head -n1)"
PGPASSWORD="$DB_PASSWORD" psql -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" -Atqc 'select current_database(), current_user;'
```

## 5) Expected systemd state
Quick check:

```bash
systemctl show clothing-store-api -p WorkingDirectory -p ExecStart -p EnvironmentFiles --no-pager
systemctl status clothing-store-api --no-pager
journalctl -u clothing-store-api -n 100 --no-pager
```

Expected values:
- `WorkingDirectory=/opt/clothing_store`
- `ExecStart=/usr/bin/dotnet /opt/clothing_store_runtime/store-api/Store.Api.dll`
- `EnvironmentFiles=/etc/clothing-store/environment`

## 6) Expected Nginx state
Quick check:

```bash
nginx -t
systemctl status nginx --no-pager
curl -I http://fashiondemon.shop
curl -i http://fashiondemon.shop/api/products
```

## 7) Success criteria after a deploy
- `systemctl is-active clothing-store-api` returns `active`
- `ss -ltnp | grep 3001` shows `dotnet`
- `curl -i http://127.0.0.1:3001/products` returns `200`
- `curl -i http://fashiondemon.shop/api/products` returns `200`
- `sudo -u postgres psql -d clothing_store -c 'select * from "__EFMigrationsHistory";'` shows migrations

## 8) First triage when autodeploy fails
Run these commands in order:

```bash
systemctl status clothing-store-api --no-pager
journalctl -u clothing-store-api -n 150 --no-pager
pg_lsclusters
pg_isready -h 127.0.0.1 -p 5432
ss -ltnp | grep 3001 || true
curl -i http://127.0.0.1:3001/products || true
systemctl show clothing-store-api -p WorkingDirectory -p ExecStart -p EnvironmentFiles --no-pager
```

Typical failure classes:
- PostgreSQL not running
- target database missing
- app user cannot access the database
- wrong `EnvironmentFile`
- wrong `ExecStart`
- stale GitHub Actions variables pointing to the old `publish` path

## 9) One-time migration cleanup
After the new layout is confirmed stable:
- keep the runtime outside the repository
- keep backend secrets only in `/etc/clothing-store/environment`
- do not reintroduce `backend/Store.Api/publish`
- keep `/opt/clothing_store/.env` only as a temporary compatibility file if still needed
