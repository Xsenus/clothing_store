# Clothing Store — React + ASP.NET Core + PostgreSQL

Проект переведен на единый production-стек:

- **Frontend:** React + Vite + Tailwind
- **Backend:** ASP.NET Core Minimal API (.NET 8)
- **DB:** PostgreSQL 16
- **Deploy:** Docker Compose + Nginx + GitHub Actions (SSH deploy на VPS)

## Что уже покрыто по функционалу сайта

На основе текущих страниц и flow сайта реализованы и сохранены:

- Каталог товаров, карточка товара, похожие товары
- Лайки товаров
- Корзина (добавление, изменение количества, удаление, очистка)
- Оформление заказа и история заказов
- Личный кабинет покупателя (профиль, лайки, заказы)
- Регистрация/логин/логаут, подтверждение кода, сброс пароля
- Админка: логин, CRUD товаров, удаление отзывов, загрузка медиа

> Т.е. структура “личный кабинет + корзина + заказы + история + каталоги с настройкой” в текущем сайте поддерживается API и фронтом.

---

## Архитектура backend

- `backend/Store.Api/Program.cs` — все endpoints + бизнес-логика
- `backend/Store.Api/Migrations/001_init.sql` — SQL-миграция схемы
- Миграции применяются автоматически при старте API
- Продукты теперь хранятся в PostgreSQL (`products`), а не в JSON-файле
- При первом запуске делается seed из:
  1) `backend/products.json`, если есть
  2) иначе `seed/products.jsonl`

---

## Быстрый старт (Docker, рекомендовано)

1. Создать env:

```bash
cp .env.example .env
```

2. Заполнить `.env` безопасными значениями.

3. Запуск:

```bash
docker compose up -d --build
```

4. Проверка:

- frontend: `http://<server-ip>/`
- api через nginx: `http://<server-ip>/api/products`

---

## Локальная разработка без Docker

### Frontend

```bash
npm ci
npm run dev
```

### Backend

Нужны .NET SDK 8 + PostgreSQL.

```bash
dotnet run --project backend/Store.Api/Store.Api.csproj
```

Переменные окружения для backend:

- `DATABASE_URL` (строка подключения PostgreSQL)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `STORE_UPLOADS_DIR` (куда складывать upload-файлы)
- `STORE_PRODUCTS_PATH` (источник seed)
- `STORE_SEED_PRODUCTS_PATH` (fallback seed)

---

## Деплой на VPS (автоматический)

Workflow: `.github/workflows/deploy-vps.yml`

Триггер: push в `main`.

Что делает:

1. Подключается по SSH к VPS
2. Обновляет репозиторий
3. Поднимает стек `docker compose up -d --build`

GitHub Secrets:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`

Подготовка VPS:

1. Установить Docker и Docker Compose plugin
2. Клонировать проект в `/opt/clothing_store`
3. Создать `.env`
4. (Опционально) подключить systemd unit `deploy/systemd/clothing-store.service`

---

## Важные замечания

- Python backend удален.
- База данных переведена на PostgreSQL.
- JSON-файлы не используются как рабочая БД, только как источник начального seed.
- Для production фронт использует `VITE_API_URL=/api`.
