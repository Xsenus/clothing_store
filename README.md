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

Требуется `.NET SDK 8` + PostgreSQL.

```bash
dotnet run --project backend/Store.Api/Store.Api.csproj
```

Ключевые переменные:

- `DATABASE_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `STORE_UPLOADS_DIR`
- `STORE_PRODUCTS_PATH`
- `STORE_SEED_PRODUCTS_PATH`

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

Нужные GitHub Secrets:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`

Логика workflow:

1. SSH на VPS
2. Обновление репозитория
3. Подъем `docker compose up -d --build --remove-orphans`

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
