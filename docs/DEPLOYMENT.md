# Deployment Guide (VPS, systemd + Nginx + PostgreSQL)

Ниже — полный сценарий деплоя проекта на VPS. Примеры команд рассчитаны на Ubuntu 22.04/24.04.

## 0) Принятые пути и имена
- Репозиторий: `/opt/clothing_store`
- Backend publish: `/opt/clothing_store/backend/Store.Api/publish`
- Frontend build (Nginx root): `/var/www/clothing-store`
- systemd сервис API: `clothing-store-api.service`
- API bind: `127.0.0.1:3001`
- Публичный домен: `your-domain.com`

## 1) Установка пакетов
```bash
sudo apt update
sudo apt install -y git nginx postgresql postgresql-contrib rsync curl ca-certificates
```

## 2) Создание БД и пользователя PostgreSQL
```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE clothing_store;
CREATE USER store_user WITH ENCRYPTED PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE clothing_store TO store_user;
SQL
```

## 3) Клонирование проекта
```bash
sudo mkdir -p /opt/clothing_store
sudo chown -R $USER:$USER /opt/clothing_store
cd /opt/clothing_store
git clone <YOUR_REPO_URL> .
```

## 4) Настройка `.env`
Создать `/opt/clothing_store/.env`:
```env
VITE_API_URL=/api
VITE_API_TARGET=http://127.0.0.1:3001
ASPNETCORE_ENVIRONMENT=Production
ConnectionStrings__DefaultConnection=Host=127.0.0.1;Port=5432;Database=clothing_store;Username=store_user;Password=CHANGE_ME_STRONG_PASSWORD
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=CHANGE_ME_ADMIN_PASSWORD
```


## 4.1) Подготовленные товары (seed)
Убедитесь, что файл `/opt/clothing_store/seed/products.jsonl` существует в репозитории.
При пустой таблице `products` backend автоматически импортирует товары из этого файла при старте.

## 5) Настройка backend appsettings
Проверить `backend/Store.Api/appsettings.Production.json`:
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=127.0.0.1;Port=5432;Database=clothing_store;Username=store_user;Password=CHANGE_ME_STRONG_PASSWORD"
  },
  "Swagger": {
    "Enabled": false
  }
}
```

## 6) Сборка frontend и publish backend
```bash
cd /opt/clothing_store
npm ci
npm run build
sudo mkdir -p /var/www/clothing-store
sudo rsync -a --delete dist/ /var/www/clothing-store/

dotnet publish backend/Store.Api/Store.Api.csproj -c Release -o /opt/clothing_store/backend/Store.Api/publish
```

## 7) systemd unit для backend
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
EnvironmentFile=/opt/clothing_store/.env

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now clothing-store-api
sudo systemctl restart clothing-store-api
sudo systemctl status clothing-store-api --no-pager
```

## 8) Nginx
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

## 9) Проверка после деплоя
```bash
curl -i http://127.0.0.1:3001/products
curl -i http://127.0.0.1:3001/media/non-existent-id
curl -i http://127.0.0.1:3001/admin/gallery
curl -I http://your-domain.com
curl -i http://your-domain.com/api/products
sudo journalctl -u clothing-store-api -n 200 --no-pager
```

## 10) Обновление релиза
```bash
cd /opt/clothing_store
git pull
npm ci
npm run build
sudo rsync -a --delete dist/ /var/www/clothing-store/
dotnet publish backend/Store.Api/Store.Api.csproj -c Release -o /opt/clothing_store/backend/Store.Api/publish
sudo systemctl restart clothing-store-api
sudo systemctl restart nginx
```
