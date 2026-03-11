# Clothing Store — React + ASP.NET Core + PostgreSQL

## Стек

- Frontend: React + Vite + Tailwind
- Backend: ASP.NET Core (.NET 9)
- DB: PostgreSQL (основной), SQLite (fallback при `Data Source=...`)
- Deploy: Nginx + systemd + PostgreSQL

---

## Где находятся настройки

### Frontend

Файл в корне проекта: `.env`

```env
VITE_API_URL=/api
VITE_API_TARGET=http://127.0.0.1:3001
```

- `VITE_API_URL` — путь, на который фронт отправляет API-запросы.
- `VITE_API_TARGET` — куда Vite proxy направляет запросы в dev.

### Backend

- Dev: `backend/Store.Api/appsettings.Development.json`
- Prod: `backend/Store.Api/appsettings.Production.json`

Основные секции:

- `ConnectionStrings:DefaultConnection`
- `Integrations:Telegram:*`
- `Email:*`

Ключевая логика инициализации API и БД: `backend/Store.Api/Program.cs`.

---

## Запуск локально

### 1) Frontend

```bash
npm ci
npm run dev
```

### 2) Backend

```bash
dotnet run --project backend/Store.Api/Store.Api.csproj
```

При старте backend автоматически применяет миграции (`Database.MigrateAsync()`).

---

## Управление сервисами на сервере (systemd)

Ниже предполагаются сервисы:

- `clothing-store-api` (backend)
- `nginx` (web/proxy)
- `postgresql` (БД)

### Быстрая шпаргалка

```bash
# статус
sudo systemctl status clothing-store-api --no-pager
sudo systemctl status nginx --no-pager
sudo systemctl status postgresql --no-pager

# запуск
sudo systemctl start clothing-store-api
sudo systemctl start nginx
sudo systemctl start postgresql

# остановка
sudo systemctl stop clothing-store-api
sudo systemctl stop nginx
sudo systemctl stop postgresql

# перезапуск
sudo systemctl restart clothing-store-api
sudo systemctl restart nginx
sudo systemctl restart postgresql
```

### Автозапуск после перезагрузки сервера

```bash
sudo systemctl enable clothing-store-api
sudo systemctl enable nginx
sudo systemctl enable postgresql
```

### Логи backend

```bash
sudo journalctl -u clothing-store-api -n 200 --no-pager
sudo journalctl -u clothing-store-api -f
```

---

## Как проверить, что сервисы работают

### Проверка API с сервера

```bash
curl -i http://127.0.0.1:3001/products
curl -i http://127.0.0.1:3001/admin/telegram-bots
```

> Для `/admin/*` эндпоинтов без токена администратора ожидаемо будет `401`, это нормально и означает, что API отвечает.

### Проверка через Nginx (снаружи)

```bash
curl -I https://your-domain.com
curl -i https://your-domain.com/api/products
```

### Проверка БД

```bash
sudo -u postgres psql -d clothing_store -c "select now();"
```

---

## Как проверить в админ-панели

1. Открыть `/admin` и авторизоваться.
2. Перейти в раздел интеграции Telegram-бота.
3. В форме бота:
   - ввести токен,
   - нажать **«Проверить (getMe)»**,
   - дождаться успешного ответа с `ID`, `username`, `name`.
4. Сохранить бота и нажать проверку/синхронизацию в списке ботов.
5. Если ошибка — сразу смотреть backend-логи (`journalctl`).

---

## Ошибка `Request failed: 404` при проверке Telegram-бота

Подробный пошаговый runbook вынесен в отдельный документ:

- `docs/TELEGRAM_BOT_404.md`

Коротко:

- Если в `journalctl` есть `Request reached the end of the middleware pipeline...` для `POST /admin/telegram-bots/validate` или `/check`, то маршрут отсутствует в **запущенном** backend-процессе.
- Обычно это старый бинарник, отсутствие рестарта после деплоя или неверный upstream в nginx.
- Выполните чеклист из `docs/TELEGRAM_BOT_404.md`.

---

## Deploy в production

Подробный гайд: `docs/DEPLOYMENT.md`.

Коротко:

1. Собрать фронтенд и скопировать `dist` в `/var/www/clothing-store`.
2. Выполнить `dotnet publish` backend.
3. Перезапустить `clothing-store-api`.
4. Проверить `nginx`, `postgresql`, API и логи.

---

## Примечание по миграциям

Миграции создаются вручную через EF Core CLI и применяются автоматически на старте backend.
