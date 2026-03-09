# Deployment Guide (VPS)

Ниже — **основной, оптимизированный сценарий деплоя без Docker** (systemd + Nginx + PostgreSQL на Ubuntu).
Сценарий построен так, чтобы после первичной настройки вы меняли в проекте только код и базовые переменные, а дальше обновление выполнялось автоматически через GitHub Actions.

---

## 1) Целевой результат

После выполнения инструкции:

- frontend раздается через Nginx из `/var/www/clothing-store`;
- backend работает как systemd-сервис `clothing-store-api`;
- PostgreSQL установлен напрямую в Ubuntu;
- push в `main` запускает auto-deploy в режиме `direct`;
- поддержан сценарий **приватного репозитория**.

---

## 2) One-time bootstrap VPS (Ubuntu 22.04/24.04)

Подключитесь к серверу:

```bash
ssh <user>@<server_ip>
```

Обновите систему и установите нужные пакеты:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt autoremove -y
sudo apt install -y ca-certificates curl gnupg lsb-release git nginx postgresql postgresql-contrib rsync
```

Откройте порты и включите firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

Убедитесь, что сервисы запущены:

```bash
sudo systemctl enable --now nginx
sudo systemctl enable --now postgresql
```

---

## 3) Установка .NET 8 SDK и Node.js 20

### .NET 8 SDK

```bash
wget https://packages.microsoft.com/config/ubuntu/$(. /etc/os-release && echo $VERSION_ID)/packages-microsoft-prod.deb -O packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
rm packages-microsoft-prod.deb
sudo apt update
sudo apt install -y dotnet-sdk-8.0
```

Проверка:

```bash
dotnet --version
```

### Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Проверка:

```bash
node -v
npm -v
```

---

## 4) PostgreSQL: БД и пользователь

Создайте БД и пользователя:

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE clothing_store;
CREATE USER store_user WITH ENCRYPTED PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE clothing_store TO store_user;
SQL
```

Проверьте подключение:

```bash
PGPASSWORD='CHANGE_ME_STRONG_PASSWORD' psql -h 127.0.0.1 -U store_user -d clothing_store -c 'select 1;'
```

---

## 5) Клонирование проекта (public/private)

Рекомендуемый путь проекта:

```bash
sudo mkdir -p /opt/clothing_store
sudo chown -R $USER:$USER /opt/clothing_store
cd /opt/clothing_store
```

### Если репозиторий публичный

```bash
git clone <YOUR_REPO_URL> .
```

### Если репозиторий приватный

Создайте deploy key на сервере:

```bash
ssh-keygen -t ed25519 -C "vps-deploy-key" -f ~/.ssh/vps_deploy_key -N ""
cat ~/.ssh/vps_deploy_key.pub
```

1. Добавьте публичный ключ в GitHub repo: **Settings → Deploy keys → Add deploy key** (Read access достаточно).
2. Настройте SSH для git:

```bash
cat >> ~/.ssh/config <<'CFG'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/vps_deploy_key
  IdentitiesOnly yes
CFG
chmod 600 ~/.ssh/config
```

3. Клонируйте:

```bash
git clone git@github.com:<ORG_OR_USER>/<REPO>.git .
```

---

## 6) Настройка переменных (минимум ручных данных)

Создайте env-файл для backend-сервиса:

```bash
sudo mkdir -p /etc/clothing-store
sudo tee /etc/clothing-store/api.env >/dev/null <<'ENV'
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://127.0.0.1:3001
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=CHANGE_ME_ADMIN_PASSWORD
DATABASE_URL=Host=127.0.0.1;Port=5432;Database=clothing_store;Username=store_user;Password=CHANGE_ME_STRONG_PASSWORD
STORE_UPLOADS_DIR=/var/lib/clothing-store/uploads
STORE_PRODUCTS_PATH=/opt/clothing_store/backend/products.json
STORE_SEED_PRODUCTS_PATH=/opt/clothing_store/seed/products.jsonl
ENV
sudo chmod 600 /etc/clothing-store/api.env
```

Создайте каталог для загрузок:

```bash
sudo mkdir -p /var/lib/clothing-store/uploads
sudo chown -R $USER:$USER /var/lib/clothing-store
```

---

## 7) Systemd (backend) + Nginx (frontend + reverse proxy)

### Systemd unit

```bash
sudo tee /etc/systemd/system/clothing-store-api.service >/dev/null <<'UNIT'
[Unit]
Description=Clothing Store API (.NET 8)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
WorkingDirectory=/opt/clothing_store
EnvironmentFile=/etc/clothing-store/api.env
ExecStart=/usr/bin/dotnet /opt/clothing_store/backend/Store.Api/publish/Store.Api.dll
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
UNIT
```

### Nginx config

```bash
sudo tee /etc/nginx/sites-available/clothing-store >/dev/null <<'NGINX'
server {
    listen 80;
    server_name _;

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
    }

    location / {
        try_files $uri /index.html;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/clothing-store /etc/nginx/sites-enabled/clothing-store
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## 8) Первичный релиз (одной командной последовательностью)

```bash
cd /opt/clothing_store
npm ci
npm run build
sudo mkdir -p /var/www/clothing-store
sudo rsync -a --delete dist/ /var/www/clothing-store/

dotnet publish backend/Store.Api/Store.Api.csproj -c Release -o backend/Store.Api/publish
sudo systemctl daemon-reload
sudo systemctl enable --now clothing-store-api
sudo systemctl restart clothing-store-api
```

Проверка:

```bash
sudo systemctl status clothing-store-api --no-pager
curl -I http://localhost/
curl http://localhost/api/products
```

---

## 9) Автообновление через GitHub Actions (direct mode)

В проекте уже есть workflow `.github/workflows/deploy-vps.yml`.

### Обязательные Secrets

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY` (приватный ключ для входа на VPS)

### Обязательные Variables для режима без Docker

- `DEPLOY_MODE=direct`
- `VPS_APP_DIR=/opt/clothing_store`
- `FRONTEND_DIST_DIR=/var/www/clothing-store`
- `BACKEND_SERVICE=clothing-store-api`

### Важно для приватного репозитория

Workflow заходит на сервер по SSH и делает `git fetch` на VPS.
Значит у VPS должен быть доступ к приватному репо (deploy key/SSH config из шага 5).

После этого деплой полностью автоматический: `push main` → build + publish + restart сервиса.

---

## 10) Обновление вручную (fallback)

```bash
cd /opt/clothing_store
git fetch --all
git reset --hard origin/main
npm ci
npm run build
sudo rsync -a --delete dist/ /var/www/clothing-store/
dotnet publish backend/Store.Api/Store.Api.csproj -c Release -o backend/Store.Api/publish
sudo systemctl restart clothing-store-api
```

---

## 11) Rollback

```bash
cd /opt/clothing_store
git log --oneline -n 10
git reset --hard <PREVIOUS_COMMIT>
npm ci
npm run build
sudo rsync -a --delete dist/ /var/www/clothing-store/
dotnet publish backend/Store.Api/Store.Api.csproj -c Release -o backend/Store.Api/publish
sudo systemctl restart clothing-store-api
```

---

## 12) PostgreSQL backup/restore

Бэкап:

```bash
mkdir -p /opt/clothing_store/backups
PGPASSWORD='CHANGE_ME_STRONG_PASSWORD' pg_dump -h 127.0.0.1 -U store_user -d clothing_store > /opt/clothing_store/backups/db_$(date +%F_%H-%M-%S).sql
```

Восстановление:

```bash
PGPASSWORD='CHANGE_ME_STRONG_PASSWORD' psql -h 127.0.0.1 -U store_user -d clothing_store < /opt/clothing_store/backups/<backup_file>.sql
```

---

## 13) Краткий checklist

- [ ] Ubuntu обновлена
- [ ] Установлены: nginx, postgresql, dotnet 8, node 20, git, rsync
- [ ] Созданы БД/пользователь PostgreSQL
- [ ] Настроены `/etc/clothing-store/api.env` и `clothing-store-api.service`
- [ ] Настроен Nginx и проверен `nginx -t`
- [ ] Выполнен первый release и проверены `/` и `/api/products`
- [ ] В GitHub Actions выставлен `DEPLOY_MODE=direct`
- [ ] Для приватного репо добавлен deploy key на VPS

