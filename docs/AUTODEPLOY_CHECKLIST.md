# Чеклист автодеплоя

Используйте этот чеклист после переноса VPS на внешнюю runtime-структуру.

## 1) Ожидаемая структура VPS
- Корень репозитория: `/opt/clothing_store`
- Runtime бэкенда: `/opt/clothing_store_runtime/store-api`
- Файл окружения бэкенда: `/etc/clothing-store/environment`
- Каталог фронтенда: `/var/www/clothing-store`
- Сервис бэкенда: `clothing-store-api`
- Адрес привязки бэкенда: `127.0.0.1:3001`

## 2) Ожидаемые настройки GitHub Actions
Секреты:
- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`

Переменные:
- `BACKEND_DLL_PATH=/opt/clothing_store_runtime/store-api/Store.Api.dll`
- `BACKEND_ENV_FILE=/etc/clothing-store/environment`

Опциональные переменные нужны только если вы переопределяете значения по умолчанию:
- `VPS_APP_DIR`
- `FRONTEND_DIST_DIR`
- `BACKEND_SERVICE`
- `BACKEND_HEALTHCHECK_URL`
- `VPS_SSH_PORT`

## 3) Ожидаемый файл окружения бэкенда
`/etc/clothing-store/environment` должен содержать:
- `ASPNETCORE_ENVIRONMENT=Production`
- `ConnectionStrings__DefaultConnection=...`
- `AdminUser__Email=...`
- `AdminUser__Password=...`

Быстрая проверка:

```bash
grep -E '^(ASPNETCORE_ENVIRONMENT|ConnectionStrings__DefaultConnection|AdminUser__Email)=' /etc/clothing-store/environment
```

## 4) Ожидаемое состояние PostgreSQL
Приложению нужен доступный экземпляр PostgreSQL. Целевая база может отсутствовать при первом запуске, если роль приложения имеет право `CREATEDB`.

Быстрая проверка:

```bash
pg_lsclusters
pg_isready -h 127.0.0.1 -p 5432
sudo -u postgres psql -d postgres -c '\l'
```

Проверка учётных данных приложения:

```bash
CONNECTION_STRING="$(grep -m1 '^ConnectionStrings__DefaultConnection=' /etc/clothing-store/environment | cut -d= -f2-)"
DB_HOST="$(printf '%s' "$CONNECTION_STRING" | tr ';' '\n' | sed -n 's/^Host=//p' | head -n1)"
DB_PORT="$(printf '%s' "$CONNECTION_STRING" | tr ';' '\n' | sed -n 's/^Port=//p' | head -n1)"
DB_NAME="$(printf '%s' "$CONNECTION_STRING" | tr ';' '\n' | sed -n 's/^Database=//p' | head -n1)"
DB_USER="$(printf '%s' "$CONNECTION_STRING" | tr ';' '\n' | sed -n 's/^Username=//p' | head -n1)"
DB_PASSWORD="$(printf '%s' "$CONNECTION_STRING" | tr ';' '\n' | sed -n 's/^Password=//p' | head -n1)"
PGPASSWORD="$DB_PASSWORD" psql -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" -U "$DB_USER" -d postgres -Atqc 'select current_database(), current_user;'
PGPASSWORD="$DB_PASSWORD" psql -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" -U "$DB_USER" -d postgres -Atqc "select rolcreatedb from pg_roles where rolname = current_user;"
```

Если вторая команда возвращает `t`, бэкенд сможет автоматически создать отсутствующую целевую базу при запуске.

## 5) Ожидаемое состояние systemd
Быстрая проверка:

```bash
systemctl show clothing-store-api -p WorkingDirectory -p ExecStart -p EnvironmentFiles --no-pager
systemctl status clothing-store-api --no-pager
journalctl -u clothing-store-api -n 100 --no-pager
```

Ожидаемые значения:
- `WorkingDirectory=/opt/clothing_store`
- `ExecStart=/usr/bin/dotnet /opt/clothing_store_runtime/store-api/Store.Api.dll`
- `EnvironmentFiles=/etc/clothing-store/environment`
- `HOME=/var/lib/clothing-store-api`
- `DOTNET_CLI_HOME=/var/lib/clothing-store-api/.dotnet`

## 6) Ожидаемое состояние Nginx
Быстрая проверка:

```bash
nginx -t
systemctl status nginx --no-pager
curl -I http://fashiondemon.shop
curl -i http://fashiondemon.shop/api/products
```

Примечание по Cloudflare HTTPS:
- Шаблон Nginx из репозитория обслуживает только HTTP.
- Если `http://fashiondemon.shop` работает, а `https://fashiondemon.shop` возвращает Cloudflare `520`, проверьте режим SSL/TLS в Cloudflare.
- Используйте `Flexible`, если origin отдает только HTTP.
- Используйте `Full` / `Full (strict)` только после настройки origin HTTPS на `443`.

## 7) Критерии успешного деплоя
- `systemctl is-active clothing-store-api` возвращает `active`
- `ss -ltnp | grep 3001` показывает `dotnet`
- `curl -i http://127.0.0.1:3001/products` возвращает `200`
- `curl -i http://fashiondemon.shop/api/products` возвращает `200`
- `sudo -u postgres psql -d clothing_store -c 'select * from "__EFMigrationsHistory";'` показывает миграции

## 8) Первая диагностика при сбое автодеплоя
Запустите эти команды по порядку:

```bash
systemctl status clothing-store-api --no-pager
journalctl -u clothing-store-api -n 150 --no-pager
pg_lsclusters
pg_isready -h 127.0.0.1 -p 5432
ss -ltnp | grep 3001 || true
curl -i http://127.0.0.1:3001/products || true
systemctl show clothing-store-api -p WorkingDirectory -p ExecStart -p EnvironmentFiles --no-pager
```

Типовые причины сбоев:
- PostgreSQL не запущен
- целевая база отсутствует, а у роли приложения нет `CREATEDB`
- пользователь приложения не может подключиться к базе
- неверный `EnvironmentFile`
- неверный `ExecStart`
- устаревшие переменные GitHub Actions, которые всё ещё указывают на старый путь `publish`

## 9) Однократная очистка после миграции
После того как новая структура подтверждена как стабильная:
- держите runtime вне репозитория
- храните секреты бэкенда только в `/etc/clothing-store/environment`
- не возвращайте `backend/Store.Api/publish`
- оставляйте `/opt/clothing_store/.env` только как временный файл совместимости, если он всё ещё нужен
