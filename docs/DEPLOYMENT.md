# Руководство по развертыванию

Целевая платформа: Ubuntu 22.04/24.04 с Nginx, systemd, PostgreSQL, Node.js и .NET 9.

Операционный чеклист: [AUTODEPLOY_CHECKLIST.md](./AUTODEPLOY_CHECKLIST.md).

## 0) Пути и имена
- Репозиторий: `/opt/clothing_store`
- Каталог runtime для бэкенда: `/opt/clothing_store_runtime/store-api`
- Корень Nginx для фронтенда: `/var/www/clothing-store`
- Сервис бэкенда: `clothing-store-api.service`
- Файл окружения бэкенда: `/etc/clothing-store/environment`
- Адрес привязки бэкенда: `127.0.0.1:3001`
- Публичный домен: `your-domain.com`

Почему runtime-каталог вынесен за пределы репозитория:
- Это предотвращает рекурсивное вложение `publish/publish/...` при `dotnet publish`.
- Это изолирует runtime-артефакты от git-дерева.
- Это делает откат и очистку безопаснее.

## 1) Установка пакетов и инструментов
Прямой деплой собирает проект на VPS, поэтому на сервере должны быть установлены Node.js 18+ и SDK/runtime .NET 9.

```bash
sudo apt update
sudo apt install -y git nginx postgresql postgresql-contrib rsync curl ca-certificates gnupg

# Node.js 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# SDK и runtime .NET 9
curl -fsSL https://packages.microsoft.com/config/ubuntu/$(. /etc/os-release && echo $VERSION_ID)/packages-microsoft-prod.deb -o packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
rm packages-microsoft-prod.deb
sudo apt update
sudo apt install -y dotnet-sdk-9.0

node --version
npm --version
dotnet --list-sdks
dotnet --list-runtimes
```

## 2) Создание роли PostgreSQL
```bash
sudo -u postgres psql <<'SQL'
CREATE USER store_user WITH ENCRYPTED PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
ALTER USER store_user CREATEDB;
SQL
```

При первом запуске бэкенда API автоматически создаст целевую базу из `ConnectionStrings__DefaultConnection`, если её ещё нет.

Если вы не хотите выдавать право `CREATEDB`, создайте базу вручную и назначьте владельцем роль приложения:

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE clothing_store OWNER store_user;
SQL
```

## 3) Клонирование проекта
```bash
sudo mkdir -p /opt/clothing_store
sudo chown -R $USER:$USER /opt/clothing_store
cd /opt/clothing_store
git clone <YOUR_REPO_URL> .
```

## 4) Подготовка runtime и окружения
Создайте runtime-каталоги:

```bash
sudo mkdir -p /opt/clothing_store_runtime/store-api
sudo mkdir -p /etc/clothing-store
sudo mkdir -p /var/www/clothing-store
sudo mkdir -p /opt/clothing_store/backend/uploads
sudo chown -R www-data:www-data /opt/clothing_store/backend/uploads
```

Создайте `/etc/clothing-store/environment`:

```bash
sudo tee /etc/clothing-store/environment >/dev/null <<'ENV'
ASPNETCORE_ENVIRONMENT=Production
ConnectionStrings__DefaultConnection=Host=127.0.0.1;Port=5432;Database=clothing_store;Username=store_user;Password=CHANGE_ME_STRONG_PASSWORD
AdminUser__Email=admin@your-domain.com
AdminUser__Password=CHANGE_ME_ADMIN_PASSWORD
ENV
sudo chmod 600 /etc/clothing-store/environment
```

Если на первом запуске база `clothing_store` может отсутствовать, роль PostgreSQL из `ConnectionStrings__DefaultConnection` должна иметь право `CREATEDB`.

Шаблон файла в репозитории: [deploy/backend.environment.example](../deploy/backend.environment.example).

Production-сборке фронтенда не нужен корневой `.env` на сервере. Приложение по умолчанию использует `/api`.

## 5) Однократная очистка старых вложенных publish-артефактов
Если раньше вы публиковали в `backend/Store.Api/publish`, один раз удалите старое runtime-дерево, чтобы не путаться:

```bash
sudo rm -rf /opt/clothing_store/backend/Store.Api/publish
sudo rm -rf /opt/clothing_store_runtime/store-api/*
```

## 6) Проверка appsettings бэкенда
Продакшен-секреты нельзя коммитить. Храните их в `/etc/clothing-store/environment`, а в `backend/Store.Api/appsettings.Production.json` оставляйте только несекретные переопределения.

## 7) Сборка фронтенда и публикация бэкенда
```bash
cd /opt/clothing_store
npm ci
npm run build
sudo rsync -a --delete dist/ /var/www/clothing-store/

dotnet publish backend/Store.Api/Store.Api.csproj -c Release -o /opt/clothing_store_runtime/store-api
```

## 8) Настройка systemd
Используйте корень репозитория как `WorkingDirectory`, а внешний runtime-каталог как цель для `ExecStart`.

```bash
sudo tee /etc/systemd/system/clothing-store-api.service >/dev/null <<'UNIT'
[Unit]
Description=Clothing Store API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
WorkingDirectory=/opt/clothing_store
ExecStart=/usr/bin/dotnet /opt/clothing_store_runtime/store-api/Store.Api.dll
Restart=always
RestartSec=5
User=www-data
StateDirectory=clothing-store-api
CacheDirectory=clothing-store-api
Environment=HOME=/var/lib/clothing-store-api
Environment=DOTNET_CLI_HOME=/var/lib/clothing-store-api/.dotnet
Environment=DOTNET_BUNDLE_EXTRACT_BASE_DIR=/var/cache/clothing-store-api/dotnet-bundle
Environment=DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
Environment=DOTNET_NOLOGO=1
Environment=DOTNET_CLI_TELEMETRY_OPTOUT=1
Environment=DatabaseBackup__Directory=/var/lib/clothing-store-api/backups/database
EnvironmentFile=/etc/clothing-store/environment

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now clothing-store-api
sudo systemctl restart clothing-store-api
sudo systemctl status clothing-store-api --no-pager
```

Эталонный шаблон в репозитории: [deploy/systemd/clothing-store-api.service](../deploy/systemd/clothing-store-api.service).

Дополнительные переменные окружения `HOME` / `DOTNET_*` не дают .NET host пытаться записывать first-run файлы в `/var/www/.dotnet`, когда сервис работает от `www-data`.
`DatabaseBackup__Directory` в unit-файле уводит дампы БД в `/var/lib/clothing-store-api/backups/database`, чтобы сервис не пытался создавать их внутри git-каталога `/opt/clothing_store/backend`.

## 9) Настройка Nginx
```bash
sudo tee /etc/nginx/sites-available/clothing-store >/dev/null <<'NGINX'
server {
  listen 80;
  server_name your-domain.com;

  root /var/www/clothing-store;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Prefix /api;
  }

  location /uploads/ {
    proxy_pass http://127.0.0.1:3001/uploads/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri /index.html;
  }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/clothing-store /etc/nginx/sites-enabled/clothing-store
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl status nginx --no-pager
```

Эталонный шаблон в репозитории: [deploy/nginx/clothing-store.conf](../deploy/nginx/clothing-store.conf).

Важно:
- Шаблон Nginx из репозитория работает только по HTTP (`listen 80`).
- Если Cloudflare проксирует `https://your-domain.com`, либо установите режим SSL/TLS `Flexible`, либо сначала поднимите HTTPS на origin-сервере на порту `443`, а уже потом используйте `Full` / `Full (strict)`.
- В документации Cloudflare указано, что режим `Full (strict)` требует, чтобы origin принимал HTTPS на `443` и отдавал подходящий сертификат.

## 10) Проверки после деплоя
```bash
curl -i http://127.0.0.1:3001/products
curl -i http://127.0.0.1:3001/media/non-existent-id
curl -i http://127.0.0.1:3001/admin/gallery
curl -I http://your-domain.com
curl -i http://your-domain.com/api/products
sudo journalctl -u clothing-store-api -n 200 --no-pager
```

Если `http://your-domain.com` работает, а `https://your-domain.com` возвращает Cloudflare `520`, сначала проверьте режим SSL/TLS в Cloudflare и убедитесь, что origin-сервер действительно обслуживает HTTPS.

## 11) Обновление релиза
```bash
cd /opt/clothing_store
git pull
npm ci
npm run build
sudo rsync -a --delete dist/ /var/www/clothing-store/
dotnet publish backend/Store.Api/Store.Api.csproj -c Release -o /opt/clothing_store_runtime/store-api
sudo systemctl restart clothing-store-api
sudo systemctl restart nginx
```

## 12) Переменные GitHub Actions
Сценарий деплоя поддерживает следующие переменные репозитория:
- `VPS_APP_DIR`
- `FRONTEND_DIST_DIR`
- `BACKEND_SERVICE`
- `BACKEND_DLL_PATH`
- `BACKEND_ENV_FILE`
- `BACKEND_HEALTHCHECK_URL`
- `VPS_SSH_PORT`
