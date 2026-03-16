# Clothing Store

Фронтенд на React + Vite и API на ASP.NET Core 9 с PostgreSQL.

## Стек
- Фронтенд: React, Vite, Tailwind CSS
- Бэкенд: ASP.NET Core (.NET 9)
- База данных: PostgreSQL
- Развертывание: Nginx + systemd + PostgreSQL

## Модель конфигурации
- Локальная конфигурация фронтенда для разработки хранится в корневом `.env`.
- Общие значения по умолчанию для бэкенда хранятся в `backend/Store.Api/appsettings*.json`.
- Локальные секреты бэкенда следует хранить через `dotnet user-secrets`.
- Продакшен-секреты бэкенда должны храниться во внешнем файле окружения, например `/etc/clothing-store/environment`.

Корневой файл [`.env.example`](.env.example) относится только к фронтенду.
Шаблон продакшен-окружения для бэкенда находится в [deploy/backend.environment.example](deploy/backend.environment.example).

## Локальная разработка
Фронтенд:

```bash
cp .env.example .env
npm ci
npm run dev
```

Бэкенд:

```bash
dotnet user-secrets --project backend/Store.Api/Store.Api.csproj set "ConnectionStrings:DefaultConnection" "Host=127.0.0.1;Port=5432;Database=clothing_store;Username=postgres;Password=CHANGE_ME"
dotnet user-secrets --project backend/Store.Api/Store.Api.csproj set "AdminUser:Email" "admin@clothingstore.local"
dotnet user-secrets --project backend/Store.Api/Store.Api.csproj set "AdminUser:Password" "CHANGE_ME"
dotnet run --project backend/Store.Api/Store.Api.csproj
```

## Развертывание
Используйте пошаговую инструкцию из [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Примечания
- При запуске бэкенда миграции EF Core применяются автоматически. Если база PostgreSQL отсутствует, API сначала создаст её, если у указанной роли есть право `CREATEDB`.
- Подготовленные товары загружаются из `seed/products.jsonl`, когда таблица `products` пуста.
- Загруженные медиафайлы по умолчанию хранятся в `backend/uploads`.
- Изображения галереи сохраняются в PostgreSQL и при необходимости восстанавливаются на диск.

## Итог последних обновлений каталога

### 1) Сортировки в каталоге
- Добавлена и проверена клиентская сортировка `sale` («По акции») — сортирует товары по размеру скидки.
- Выбранная сортировка сохраняется в `localStorage` (`catalog_sort_by`) и восстанавливается при повторном визите.
- Если в URL есть `?sort=...`, он имеет приоритет над сохранённым значением.

### 2) Фильтры категорий и размеров
- Категории и размеры в каталоге теперь приходят из API `GET /products/filters`, а не из захардкоженных списков.
- В фильтрах показываются только **активные** значения словарей, которые реально используются в товарах.
- Категории отдаются с русскими `label` (либо из `description` словаря, либо через fallback-маппинг slug → RU-название).

### 3) Управление видимостью фильтров
- Добавлены настройки:
  - `catalog_filter_categories_enabled`
  - `catalog_filter_sizes_enabled`
- Эти флаги управляют отображением соответствующих блоков фильтров в каталоге.
- В админ-панели, в разделе словарей, добавлены переключатели для этих флагов.

### 4) Обновления словарей и сидирования
- Расширен дефолтный набор категорий.
- При инициализации БД добавляются недостающие категории/размеры, найденные в уже существующих товарах.
- Для стандартных category-slug автоматически заполняются русские описания (`description`), если поле пустое.

### 5) Рекомендованные проверки после деплоя
Фронтенд:
```bash
pnpm install
pnpm build
```

Бэкенд:
```bash
dotnet build backend/Store.Api/Store.Api.sln
```

Ручная проверка:
- Открыть `/catalog`, убедиться что категории отображаются на русском языке.
- Выбрать сортировку, перезагрузить страницу и проверить восстановление выбора.
- В админке отключить/включить фильтр категорий/размеров и убедиться, что блоки в каталоге скрываются/появляются.
