# Deployment Guide

Target platform: Ubuntu 22.04/24.04 with Nginx, systemd, PostgreSQL, Node.js, and .NET 9.

Operational runbook: [AUTODEPLOY_CHECKLIST.md](./AUTODEPLOY_CHECKLIST.md).

## 0) Paths and names
- Repository: `/opt/clothing_store`
- Backend runtime directory: `/opt/clothing_store_runtime/store-api`
- Frontend Nginx root: `/var/www/clothing-store`
- Backend service: `clothing-store-api.service`
- Backend environment file: `/etc/clothing-store/environment`
- Backend bind address: `127.0.0.1:3001`
- Public domain: `your-domain.com`

Why the runtime directory is outside the repository:
- It prevents `dotnet publish` from recursively nesting `publish/publish/...`.
- It keeps runtime artifacts isolated from the git working tree.
- It makes rollback and cleanup safer.

## 1) Install packages and toolchain
Direct deploy builds the project on the VPS, so the server must have Node.js 18+ and .NET 9 SDK/runtime installed.

```bash
sudo apt update
sudo apt install -y git nginx postgresql postgresql-contrib rsync curl ca-certificates gnupg

# Node.js 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# .NET 9 SDK + runtime
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

## 2) Create PostgreSQL database
```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE clothing_store;
CREATE USER store_user WITH ENCRYPTED PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE clothing_store TO store_user;
SQL
```

## 3) Clone the project
```bash
sudo mkdir -p /opt/clothing_store
sudo chown -R $USER:$USER /opt/clothing_store
cd /opt/clothing_store
git clone <YOUR_REPO_URL> .
```

## 4) Prepare runtime and environment
Create runtime directories:

```bash
sudo mkdir -p /opt/clothing_store_runtime/store-api
sudo mkdir -p /etc/clothing-store
sudo mkdir -p /var/www/clothing-store
sudo mkdir -p /opt/clothing_store/backend/uploads
sudo chown -R www-data:www-data /opt/clothing_store/backend/uploads
```

Create `/etc/clothing-store/environment`:

```bash
sudo tee /etc/clothing-store/environment >/dev/null <<'ENV'
ASPNETCORE_ENVIRONMENT=Production
ConnectionStrings__DefaultConnection=Host=127.0.0.1;Port=5432;Database=clothing_store;Username=store_user;Password=CHANGE_ME_STRONG_PASSWORD
AdminUser__Email=admin@your-domain.com
AdminUser__Password=CHANGE_ME_ADMIN_PASSWORD
ENV
sudo chmod 600 /etc/clothing-store/environment
```

Template file in the repository: [deploy/backend.environment.example](../deploy/backend.environment.example).

The frontend production build does not require a root `.env` on the server. The app defaults to `/api`.

## 5) Clean old nested publish artifacts once
If you previously published into `backend/Store.Api/publish`, remove the old runtime tree once to avoid confusion:

```bash
sudo rm -rf /opt/clothing_store/backend/Store.Api/publish
sudo rm -rf /opt/clothing_store_runtime/store-api/*
```

## 6) Review backend appsettings
Production secrets should not be committed. Keep secrets in `/etc/clothing-store/environment` and keep `backend/Store.Api/appsettings.Production.json` limited to non-secret overrides.

## 7) Build frontend and publish backend
```bash
cd /opt/clothing_store
npm ci
npm run build
sudo rsync -a --delete dist/ /var/www/clothing-store/

dotnet publish backend/Store.Api/Store.Api.csproj -c Release -o /opt/clothing_store_runtime/store-api
```

## 8) Configure systemd
Use the repository root as `WorkingDirectory` and the external runtime directory as `ExecStart` target.

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
EnvironmentFile=/etc/clothing-store/environment

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now clothing-store-api
sudo systemctl restart clothing-store-api
sudo systemctl status clothing-store-api --no-pager
```

Reference template in repo: [deploy/systemd/clothing-store-api.service](../deploy/systemd/clothing-store-api.service).

The extra `HOME` / `DOTNET_*` environment variables prevent the .NET host from trying to write first-run files into `/var/www/.dotnet` when the service runs as `www-data`.

## 9) Configure Nginx
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
    proxy_set_header X-Forwarded-Proto $scheme;
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

Reference template in repo: [deploy/nginx/clothing-store.conf](../deploy/nginx/clothing-store.conf).

## 10) Post-deploy checks
```bash
curl -i http://127.0.0.1:3001/products
curl -i http://127.0.0.1:3001/media/non-existent-id
curl -i http://127.0.0.1:3001/admin/gallery
curl -I http://your-domain.com
curl -i http://your-domain.com/api/products
sudo journalctl -u clothing-store-api -n 200 --no-pager
```

## 11) Release update
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

## 12) GitHub Actions variables
The deploy workflow supports these repository variables:
- `VPS_APP_DIR`
- `FRONTEND_DIST_DIR`
- `BACKEND_SERVICE`
- `BACKEND_DLL_PATH`
- `BACKEND_ENV_FILE`
- `BACKEND_HEALTHCHECK_URL`
- `VPS_SSH_PORT`
