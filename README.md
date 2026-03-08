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

### 1) Подготовить VPS (один раз)

На сервере должны быть установлены:

- `git`
- `docker` + `docker compose` plugin
- доступ пользователя деплоя к Docker (обычно через группу `docker`)

Проверка:

```bash
git --version
docker --version
docker compose version
```

Создайте директорию проекта (или используйте свою):

```bash
sudo mkdir -p /opt/clothing_store
sudo chown -R $USER:$USER /opt/clothing_store
```

Клонируйте репозиторий:

```bash
cd /opt/clothing_store
git clone <YOUR_REPO_URL> .
```

Создайте production env:

```bash
cp .env.example .env
```

Заполните `.env` безопасными значениями (`POSTGRES_PASSWORD`, `ADMIN_PASSWORD` и т.д.).

> Важно: workflow не перезаписывает `.env`, если файл уже существует.

---

### 2) Подготовить SSH-ключ для GitHub Actions

На локальной машине сгенерируйте отдельный ключ для деплоя (если ещё нет):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy
```

Добавьте **публичный** ключ на VPS в `~/.ssh/authorized_keys` пользователя деплоя.

Проверьте вход:

```bash
ssh -i ~/.ssh/github_actions_deploy <user>@<server_ip>
```

---

### 3) Настроить Secrets и Variables в GitHub

Repository → **Settings** → **Secrets and variables** → **Actions**.

#### Secrets (обязательные)

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`

`VPS_SSH_KEY` — это **приватный** ключ целиком (включая `-----BEGIN ...` и `-----END ...`).

#### Variables (опциональные)

- `VPS_SSH_PORT` (по умолчанию `22`)
- `VPS_APP_DIR` (по умолчанию `/opt/clothing_store`)

Если `VPS_APP_DIR` не задан, workflow деплоит в `/opt/clothing_store`.

---

### 4) Как запускается деплой

Workflow запускается:

- автоматически при `push` в `main`;
- вручную через `workflow_dispatch` (кнопка **Run workflow** в GitHub Actions) с параметром `ref`.

Для `push` деплоится конкретный `github.sha` (коммит, который вызвал workflow).
Для ручного запуска можно передать branch/tag/SHA через `ref`.

---

### 5) Что делает workflow (по шагам)

Логика workflow:

1. Проверка обязательных secrets на стороне GitHub Actions
2. SSH на VPS
3. `git fetch --prune --tags origin` + деплой конкретного `ref` (`github.sha` для push, input `ref` для ручного запуска)
4. Подъем `docker compose up -d --build --remove-orphans`
5. Проверка состояния контейнеров через `docker compose ps`
6. При ошибке автоматически выводятся `docker compose ps` и `docker compose logs --tail=100`

---

### 6) Первая проверка после настройки

1. Сделайте небольшой commit в `main` (или запустите workflow вручную через **Run workflow**).
2. Дождитесь статуса `Success` в GitHub Actions.
3. На VPS проверьте:

```bash
cd /opt/clothing_store
docker compose ps
docker compose logs backend --tail=100
docker compose logs frontend --tail=100
```

4. Проверьте в браузере:

- `http://<server-ip>/`
- `http://<server-ip>/api/products`

---

### 7) Частые проблемы и решения

- `Permission denied (publickey)`
  - проверьте, что в `VPS_SSH_KEY` лежит приватный ключ без искажений;
  - проверьте, что публичный ключ добавлен в `authorized_keys` нужного пользователя.

- `cd: /opt/clothing_store: No such file or directory`
  - создайте директорию на VPS или задайте корректный `VPS_APP_DIR` в GitHub Variables.

- Ошибка `docker compose ... permission denied`
  - добавьте пользователя деплоя в группу `docker` и перезайдите в сессию.

- Контейнеры поднялись, но сайт не открывается
  - проверьте, что порт `80` открыт в firewall/cloud security group;
  - проверьте `docker compose ps` и логи `frontend`/`backend`.

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
