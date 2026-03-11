# Deployment Guide (Direct: systemd + Nginx + PostgreSQL)

Этот проект деплоится напрямую через systemd + Nginx + PostgreSQL.

## 1. Установка зависимостей на сервер

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git nginx postgresql postgresql-contrib rsync ca-certificates curl gnupg lsb-release
```

Установите .NET SDK и Node.js (если ещё не установлены).

## 2. PostgreSQL

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE clothing_store;
CREATE USER store_user WITH ENCRYPTED PASSWORD 'Qwerty!@#';
GRANT ALL PRIVILEGES ON DATABASE clothing_store TO store_user;
SQL
```

## 3. Клонирование проекта

```bash
sudo mkdir -p /opt/clothing_store
sudo chown -R $USER:$USER /opt/clothing_store
cd /opt/clothing_store
git clone <YOUR_REPO_URL> .
```

## 4. Конфиг frontend (.env)

Создайте/обновите `/opt/clothing_store/.env`:

```env
VITE_API_URL=/api
VITE_API_TARGET=http://127.0.0.1:3001
VITE_SITE_URL=https://your-domain.com
```

## 5. Конфиг backend (appsettings)

### Development

`backend/Store.Api/appsettings.Development.json`:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=127.0.0.1;Port=5433;Database=clothing_store;Username=store_user;Password=Qwerty!@#"
  }
}
```

### Production

`backend/Store.Api/appsettings.Production.json`:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=127.0.0.1;Port=5432;Database=clothing_store;Username=store_user;Password=Qwerty!@#"
  }
}
```

## 6. Build frontend и publish backend

```bash
cd /opt/clothing_store
npm ci
npm run build
sudo mkdir -p /var/www/clothing-store
sudo rsync -a --delete dist/ /var/www/clothing-store/

dotnet publish backend/Store.Api/Store.Api.csproj -c Release -o /opt/clothing_store/backend/Store.Api/publish
```

## 7. systemd сервис backend

```bash
sudo tee /etc/systemd/system/clothing-store-api.service >/dev/null <<'UNIT'
[Unit]
Description=Clothing Store API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
WorkingDirectory=/opt/clothing_store
ExecStart=/usr/bin/dotnet /opt/clothing_store/backend/Store.Api/publish/Store.Api.dll
Restart=always
RestartSec=5
User=www-data
Environment=ASPNETCORE_ENVIRONMENT=Production

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now clothing-store-api
sudo systemctl restart clothing-store-api
sudo systemctl status clothing-store-api --no-pager
```

## 8. Nginx

Настройте Nginx как reverse-proxy на backend (`127.0.0.1:3001`) и раздачу фронтенда из `/var/www/clothing-store`.

## 9. Проверка

```bash
curl --fail --silent --show-error http://127.0.0.1:3001/products >/dev/null && echo OK
sudo journalctl -u clothing-store-api -n 100 --no-pager
```
