# Clothing Store — React + ASP.NET Core + PostgreSQL

Проект переведен на единый production-стек:

- **Frontend:** React + Vite + Tailwind
- **Backend:** ASP.NET Core Minimal API (.NET 8)
- **DB:** PostgreSQL 16
- **Deploy:** Docker Compose + Nginx + GitHub Actions (SSH deploy на VPS)

---

## Что реализовано в текущем сайте

На основании фактических страниц и текущего UI/flow:

- Каталог товаров + фильтрация/сортировка
- Карточка товара + похожие товары + отзывы + лайки
- Корзина (добавление/изменение/удаление/очистка)
- Оформление заказа
- Личный кабинет покупателя:
  - история заказов
  - избранное
  - настройки профиля
- Админка:
  - авторизация администратора
  - CRUD товаров
  - загрузка изображений/видео
  - удаление отзывов

> То есть “личный кабинет + корзина + заказы + история + каталоги с настройкой” поддерживаются текущими страницами и API.

> Подробный целевой план бизнес-процессов (каталог → корзина → checkout → оплата → доставка → статусы) описан в `docs/PRODUCT_WORKFLOW_PLAN.md`.

---

## Архитектура backend

- `backend/Store.Api/Program.cs` — маршруты API + бизнес-логика
- `backend/Store.Api/Migrations/*.sql` — SQL-миграции
- Миграции применяются автоматически при старте backend
- Рабочая БД — PostgreSQL (runtime-хранилище)
- Seed продуктов при пустой таблице:
  1) `backend/products.json`
  2) fallback: `seed/products.jsonl`

Подробности: `docs/ARCHITECTURE.md`.

---

## Локальный запуск

### 1) Frontend

```bash
npm ci
npm run dev
```

### 2) Backend

Требуется `.NET SDK 8`.

По умолчанию backend стартует на SQLite (`backend/app.db`) — это удобно для локальной разработки без PostgreSQL.
Если задан `DATABASE_URL`, backend использует PostgreSQL автоматически.

```bash
dotnet run --project backend/Store.Api/Store.Api.csproj
```

Ключевые переменные:

- `DATABASE_URL`
- `ASPNETCORE_URLS` (опционально: только если нужно переопределить порт/хост)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `STORE_UPLOADS_DIR`
- `STORE_PRODUCTS_PATH`
- `STORE_SEED_PRODUCTS_PATH`

### Как переключиться с SQLite на PostgreSQL

По умолчанию (без `DATABASE_URL`) backend запускается на SQLite-файле `backend/app.db`.

Чтобы перейти на PostgreSQL:

1. Поднять PostgreSQL (локально или в Docker).
2. Перед запуском backend задать переменную `DATABASE_URL` в формате Npgsql:

```bash
export DATABASE_URL='Host=127.0.0.1;Port=5432;Database=clothing_store;Username=postgres;Password=postgres'
dotnet run --project backend/Store.Api/Store.Api.csproj
```

3. Проверить в логах строку `Database provider: postgres`.

Если `DATABASE_URL` не задана, приложение автоматически вернётся к SQLite.


Данные инициализации по умолчанию:

- создаётся пользователь `user@clothingstore.local` / `user12345`;
- автоматически добавляются тестовые данные (лайк, корзина и тестовый заказ) для этого пользователя;
- админ-доступ доступен через `ADMIN_EMAIL` / `ADMIN_PASSWORD` (по умолчанию: `admin@clothingstore.local` / `admin12345`).

Требования к паролю при регистрации: минимум 10 символов, минимум одна заглавная, одна строчная буква и одна цифра.

Для доступа к dev-стенду с разных адресов (`localhost`, `127.0.0.1`, `192.168.x.x`, внешний IP):

- frontend dev-сервер слушает `0.0.0.0:5173`;
- backend по умолчанию слушает `0.0.0.0:3001`;
- Vite проксирует `/api` и `/uploads` на backend (`VITE_API_TARGET`, по умолчанию `http://127.0.0.1:3001`).

Это позволяет открывать один и тот же dev-стенд по любому IP/хосту машины без правок кода.

---

## Production (Docker Compose)

1. Создать env:

```bash
cp .env.example .env
```

2. Заполнить безопасные значения в `.env`.

3. Запуск:

```bash
docker compose up -d --build
```

4. Проверка:

- frontend: `http://<server-ip>/`
- API: `http://<server-ip>/api/products`

Подробности: `docs/DEPLOYMENT.md`.

---

## Автодеплой на VPS (push в main)

Workflow: `.github/workflows/deploy-vps.yml`

Поддерживаются **2 режима деплоя**:

1. `docker` — через Docker Compose (рекомендуется)
2. `direct` — напрямую на VPS без Docker (`systemd + nginx`)

Выбор режима:

- По умолчанию: `docker`
- Через GitHub Variable `DEPLOY_MODE`
- Или вручную в `Run workflow` через input `mode`

---

### 1) Общая подготовка VPS (для любого режима)

Установите и проверьте:

```bash
git --version
```

Создайте директорию приложения:

```bash
sudo mkdir -p /opt/clothing_store
sudo chown -R $USER:$USER /opt/clothing_store
cd /opt/clothing_store
git clone <YOUR_REPO_URL> .
cp .env.example .env
```

Заполните `.env` безопасными значениями.

> Workflow не перезаписывает `.env`, если он уже существует.

---

### 2) SSH-ключ для GitHub Actions

Сгенерируйте ключ локально:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy
```

- Публичный ключ добавьте на VPS в `~/.ssh/authorized_keys` пользователя деплоя.
- Приватный ключ добавьте в GitHub Secret `VPS_SSH_KEY`.

Проверьте вход:

```bash
ssh -i ~/.ssh/github_actions_deploy <user>@<server_ip>
```

---

### 3) GitHub Secrets и Variables

Repository → **Settings** → **Secrets and variables** → **Actions**.

#### Обязательные Secrets

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`

#### Опциональные Variables

- `VPS_SSH_PORT` — SSH порт (default `22`)
- `VPS_APP_DIR` — путь до проекта на сервере (default `/opt/clothing_store`)
- `DEPLOY_MODE` — `docker` или `direct` (default `docker`)
- `FRONTEND_DIST_DIR` — только для `direct`, куда выкладывать фронтенд (default `/var/www/clothing-store`)
- `BACKEND_SERVICE` — только для `direct`, имя systemd-сервиса backend (default `clothing-store-api`)

---

### 4) Вариант A — деплой через Docker Compose (`DEPLOY_MODE=docker`)

#### Что должно быть на VPS

```bash
docker --version
docker compose version
```

Пользователь деплоя должен иметь доступ к Docker (например, группа `docker`).

#### Что делает workflow

1. `git fetch --prune --tags origin`
2. `git reset --hard <ref>`
3. `docker compose pull`
4. `docker compose up -d --build --remove-orphans`
5. `docker compose ps`

#### Плюсы

- изолированное окружение;
- одинаковое поведение между серверами;
- проще обновлять зависимости.

> Важно: в `docker`-режиме PostgreSQL ставить на хост не нужно — БД запускается контейнером `postgres` из `docker-compose.yml`.

---

### 5) Вариант B — прямой деплой на VPS (`DEPLOY_MODE=direct`)

#### Что должно быть на VPS

```bash
node -v
npm -v
dotnet --version
rsync --version
systemctl --version
```

Дополнительно:

- настроенный `nginx` для раздачи `FRONTEND_DIST_DIR`;
- созданный systemd-сервис backend (имя = `BACKEND_SERVICE`);
- установленный PostgreSQL (рекомендуется для production).

#### Установка PostgreSQL на Ubuntu 24.04 (для `direct`)

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Создайте БД и пользователя:

```bash
sudo -u postgres psql <<'SQL'
CREATE USER clothing_store_user WITH ENCRYPTED PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE clothing_store OWNER clothing_store_user;
GRANT ALL PRIVILEGES ON DATABASE clothing_store TO clothing_store_user;
SQL
```

Добавьте в `/opt/clothing_store/.env` строку подключения (Npgsql формат):

```bash
DATABASE_URL=Host=127.0.0.1;Port=5432;Database=clothing_store;Username=clothing_store_user;Password=CHANGE_ME_STRONG_PASSWORD
```

Проверка подключения:

```bash
psql "host=127.0.0.1 port=5432 dbname=clothing_store user=clothing_store_user password=CHANGE_ME_STRONG_PASSWORD" -c 'SELECT 1;'
```

#### Что делает workflow

1. `git fetch --prune --tags origin`
2. `git reset --hard <ref>`
3. `npm ci && npm run build`
4. `rsync dist/ -> FRONTEND_DIST_DIR`
5. `dotnet publish backend/Store.Api/Store.Api.csproj`
6. `systemctl restart BACKEND_SERVICE`
7. `systemctl status BACKEND_SERVICE`

#### Пример systemd unit (`/etc/systemd/system/clothing-store-api.service`)

```ini
[Unit]
Description=Clothing Store API
After=network.target

[Service]
WorkingDirectory=/opt/clothing_store/backend/Store.Api/publish
ExecStart=/usr/bin/dotnet /opt/clothing_store/backend/Store.Api/publish/Store.Api.dll
Restart=always
RestartSec=5
User=www-data
Environment=ASPNETCORE_ENVIRONMENT=Production
EnvironmentFile=/opt/clothing_store/.env

[Install]
WantedBy=multi-user.target
```

Применить:

```bash
sudo systemctl daemon-reload
sudo systemctl enable clothing-store-api
sudo systemctl start clothing-store-api
```

#### Плюсы

- меньше runtime-слоя (без Docker);
- проще интеграция с системными сервисами.

---

### 6) Запуск workflow

- Автоматически при `push` в `main`
- Вручную через **Actions → Run workflow**:
  - `ref`: branch/tag/SHA
  - `mode`: `docker` или `direct`

При `push` деплоится конкретный `github.sha`.

---

### 7) Проверка после деплоя

#### Для `docker`

```bash
cd /opt/clothing_store
docker compose ps
docker compose logs backend --tail=100
docker compose logs frontend --tail=100
```

#### Для `direct`

```bash
sudo systemctl status clothing-store-api --no-pager
sudo journalctl -u clothing-store-api -n 100 --no-pager
ls -la /var/www/clothing-store
```

Проверка URL:

- `http://<server-ip>/`
- `http://<server-ip>/api/products`

---

### 8) Частые проблемы

- `Permission denied (publickey)`
  - проверьте корректность `VPS_SSH_KEY` и `authorized_keys`
- `Unsupported DEPLOY_MODE=...`
  - проверьте `DEPLOY_MODE`/input `mode` (`docker` или `direct`)
- `docker compose ... permission denied`
  - добавьте пользователя в группу `docker`
- `systemctl restart <service> failed` в `direct`
  - проверьте имя `BACKEND_SERVICE`, unit-файл и `journalctl`
- В `direct` backend не может подключиться к БД
  - проверьте, что PostgreSQL установлен и запущен: `sudo systemctl status postgresql`
  - проверьте `DATABASE_URL` в `/opt/clothing_store/.env`
  - проверьте доступ `psql` командой из шага установки
- Сайт недоступен
  - проверьте firewall/security group и логи backend/frontend

---

## Что удалено как legacy

- Python backend (`backend/app.py`, `backend/db.py`, `backend/requirements.txt`)
- Python `__pycache__/` и `*.pyc`

---

## Репозиторные правила

- `.gitignore` покрывает React + .NET + runtime data
- `deploy/data/*` хранит runtime данные в docker-режиме
- В репозитории оставлены только `.gitkeep` для структуры каталогов

---

## Диагностика

Если API недоступен:

1. Проверить контейнеры:

```bash
docker compose ps
```

2. Проверить логи backend/postgres:

```bash
docker compose logs backend --tail=200
docker compose logs postgres --tail=200
```

3. Проверить env и строку подключения `DATABASE_URL`.
