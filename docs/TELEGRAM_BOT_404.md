# Ошибка `Request failed: 404` при проверке Telegram-бота

Этот документ — пошаговая инструкция для ситуации, когда в админке при нажатии **«Проверить (getMe)»** появляется `Request failed: 404`.

## Что означает этот `404`

Если в `journalctl` есть строки:

- `Request reached the end of the middleware pipeline without being handled by application code`
- `Request path: POST .../admin/telegram-bots/validate` (или `/check`)

это означает, что в **запущенном процессе API** нет такого маршрута. Обычно причина одна из следующих:

1. запущен старый бэкенд-бинарник;
2. бэкенд после деплоя не был перезапущен;
3. `/api` в nginx смотрит не на тот upstream.

Это не ошибка Telegram-токена и не проблема CORS.

## Пошаговый чеклист

1. **Проверьте эндпоинт напрямую через ваш домен**:

```bash
curl -i -X POST https://your-domain.com/api/admin/telegram-bots/validate \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <admin_token>" \
  --data '{"token":"123:abc"}'
```

Интерпретация:

- `404` → маршрут не найден в текущем бэкенде (идём дальше по шагам).
- `401` → маршрут есть, но неверный/просроченный admin token.
- `400` → маршрут есть, бэкенд обрабатывает запрос; проверяйте токен и переданные данные.

2. **Проверьте, какой сервис реально отвечает за `/api`**:

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo systemctl status clothing-store-api --no-pager
```

3. **Обновите код и пересоберите бэкенд**:

```bash
cd /opt/clothing_store
git pull
npm ci && npm run build
dotnet publish backend/Store.Api/Store.Api.csproj -c Release
```

4. **Перезапустите API и проверьте запуск**:

```bash
sudo systemctl restart clothing-store-api
sudo systemctl status clothing-store-api --no-pager
sudo journalctl -u clothing-store-api -n 100 --no-pager
```

5. **Снова проверьте эндпоинт через curl** (тот же запрос из шага 1).

6. **Повторите проверку в админке**: кнопка **«Проверить (getMe)»**.

## Когда проблема точно решена

- `POST /api/admin/telegram-bots/validate` больше не возвращает `404`.
- В логах больше нет `Request reached the end of the middleware pipeline...` для `/admin/telegram-bots/validate` и `/check`.
- В админке появляется ответ Telegram `getMe` (ID/username/name), а не `Request failed: 404`.
