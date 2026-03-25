# Внешняя авторизация

Документ описывает, какие провайдеры внешнего входа уже поддерживает магазин, где это включается, как работает сценарий входа и какие тесты реально можно выполнить без боевых учетных данных.

## Что уже реализовано

- Telegram login через login-бот
- Telegram Widget на странице `/auth`
- Google OAuth
- VK OAuth
- Яндекс OAuth

## Где это используется

- Страница входа: [auth.jsx](C:/Users/ilel/source/repos/clothing_store/src/pages/auth.jsx)
- Привязка и отвязка провайдеров в профиле: [profile.jsx](C:/Users/ilel/source/repos/clothing_store/src/pages/profile.jsx)
- Настройки провайдеров и тестовые кнопки в админке: [admin.tsx](C:/Users/ilel/source/repos/clothing_store/src/pages/admin.tsx)
- Серверный OAuth flow и callback-обработка: [AuthController.cs](C:/Users/ilel/source/repos/clothing_store/backend/Store.Api/Controllers/AuthController.cs)
- Публичные shell-флаги для витрины: [PublicSettingsController.cs](C:/Users/ilel/source/repos/clothing_store/backend/Store.Api/Controllers/PublicSettingsController.cs)

## Как работает поток OAuth

Для Google, VK и Яндекса используется одинаковая схема:

1. Фронтенд вызывает `POST /api/auth/external/start`.
2. Backend проверяет, включен ли провайдер и есть ли `client_id/client_secret`.
3. Backend сохраняет `ExternalAuthRequest` со `state`.
4. Backend возвращает `authUrl`.
5. Фронтенд открывает popup на стороне провайдера.
6. Провайдер возвращает пользователя на `GET /api/auth/external/callback/{provider}`.
7. Backend обменивает `code` на токен, запрашивает профиль и:
   - либо создает/находит пользователя для входа;
   - либо привязывает внешний аккаунт к уже авторизованному профилю.
8. Фронтенд поллит `GET /api/auth/external/status/{state}` и завершает вход или привязку.

Для Telegram отдельные маршруты:

- `POST /api/auth/telegram/start`
- `GET /api/auth/telegram/status/{state}`
- `POST /api/auth/telegram/login` для widget-сценария

## Какие ключи используются

Настройки можно хранить:

- в таблице `AppSettings` через админку;
- или в env/config, если удобнее держать секреты вне БД.

### AppSettings

- `telegram_login_enabled`
- `telegram_widget_enabled`
- `telegram_bot_username`
- `google_login_enabled`
- `google_auth_client_id`
- `google_auth_client_secret`
- `vk_login_enabled`
- `vk_auth_client_id`
- `vk_auth_client_secret`
- `yandex_login_enabled`
- `yandex_auth_client_id`
- `yandex_auth_client_secret`

### ENV / IConfiguration

- `Auth__Telegram__Enabled`
- `Auth__Telegram__WidgetEnabled`
- `Auth__Google__Enabled`
- `Auth__Google__ClientId`
- `Auth__Google__ClientSecret`
- `Auth__Vk__Enabled`
- `Auth__Vk__ClientId`
- `Auth__Vk__ClientSecret`
- `Auth__Yandex__Enabled`
- `Auth__Yandex__ClientId`
- `Auth__Yandex__ClientSecret`

Шаблон env-файла уже обновлен здесь: [backend.environment.example](C:/Users/ilel/source/repos/clothing_store/deploy/backend.environment.example)

## Callback URL

Callback URL всегда строится backend-ом по текущему origin API:

- Google: `/api/auth/external/callback/google`
- VK: `/api/auth/external/callback/vk`
- Яндекс: `/api/auth/external/callback/yandex`

В админке эти URL показаны в read-only полях, и именно их нужно добавлять у провайдера в список разрешенных redirect URI.

## Что включать на витрине

Кнопки на странице входа появляются только если провайдер реально готов с точки зрения public-shell:

- `google_login_enabled`
- `vk_login_enabled`
- `yandex_login_enabled`
- `telegram_login_enabled`
- `telegram_widget_enabled`

Public shell сам дополнительно проверяет, что у провайдера есть нужные ключи, поэтому просто поставить флаг недостаточно.

## Что делать в админке

Раздел: `Настройки -> Авторизация -> Внешние способы входа`

### Telegram

- выбрать login-бота в разделе интеграций Telegram;
- включить `использовать для входа`;
- при необходимости включить `Telegram Widget`;
- для widget-сценария у BotFather должен быть настроен домен через `setdomain`.

### Google

- включить `Google`;
- вставить `Client ID` и `Client Secret`;
- скопировать callback URL из админки;
- добавить его в Google Cloud Console как authorized redirect URI;
- нажать `Проверить Google OAuth`.

### VK

- включить `VK`;
- вставить `Client ID` и `Client Secret`;
- скопировать callback URL из админки;
- добавить его в настройках VK-приложения как redirect URI;
- нажать `Проверить VK OAuth`.

### Яндекс

- включить `Яндекс`;
- вставить `Client ID` и `Client Secret`;
- скопировать callback URL из админки;
- добавить его в приложении Яндекс ID как адрес возврата;
- нажать `Проверить Яндекс OAuth`.

## Что реально можно протестировать

### Telegram

- Telegram login и Telegram Widget можно проверять локально полноценно, если бот настроен и доступен.

### Google

- публичного универсального sandbox с общей тестовой парой нет;
- для теста нужен свой OAuth client в Google Cloud;
- можно использовать тестовый режим consent screen и test users.

### VK

- публичного универсального sandbox с общей тестовой парой нет;
- для теста нужно свое VK-приложение и собственные `Client ID / Client Secret`;
- без них можно проверить только то, что backend корректно формирует OAuth URL.

### Яндекс

- публичного универсального sandbox с общей тестовой парой нет;
- для теста нужно собственное приложение Яндекс ID;
- без своих ключей можно проверить только корректность server-side URL generation.

## Где искать логику в коде

- Нормализация провайдеров и exchange token: [AuthController.cs](C:/Users/ilel/source/repos/clothing_store/backend/Store.Api/Controllers/AuthController.cs)
- Публичная доступность кнопок на витрине: [PublicSettingsController.cs](C:/Users/ilel/source/repos/clothing_store/backend/Store.Api/Controllers/PublicSettingsController.cs)
- Технические email для внешних аккаунтов: [TechnicalEmailHelper.cs](C:/Users/ilel/source/repos/clothing_store/backend/Store.Api/Services/TechnicalEmailHelper.cs)
- Список привязанных внешних аккаунтов в профиле: [ProfileController.cs](C:/Users/ilel/source/repos/clothing_store/backend/Store.Api/Controllers/ProfileController.cs)

## Официальная документация

- Google OAuth 2.0 for Web Server Applications: <https://developers.google.com/identity/protocols/oauth2/web-server>
- VK auth code flow for user access token: <https://dev.vk.com/ru/api/access-token/authcode-flow-user>
- VK users.get: <https://dev.vk.com/ru/reference/users.get>
- Яндекс ID OAuth intro: <https://yandex.ru/dev/id/doc/ru/concepts/ya-oauth-intro>
- Яндекс ID authorization code flow: <https://yandex.ru/dev/id/doc/ru/codes/code-and-token>

## Коротко по текущему состоянию

- Telegram login: реализован
- Telegram Widget: реализован
- Google OAuth: реализован
- VK OAuth: реализован
- Яндекс OAuth: реализован

Если после включения провайдера кнопка не появляется на странице `/auth`, сначала проверьте:

1. Сохранены ли настройки в админке.
2. Не пустые ли `client_id/client_secret`.
3. Отдает ли `/settings/public-shell` значение `*_login_enabled=true`.
