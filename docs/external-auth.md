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

If the API is reverse-proxied under `/api`, nginx must also send `X-Forwarded-Host`, `X-Forwarded-Proto` and `X-Forwarded-Prefix: /api`, otherwise providers will receive the wrong `redirect_uri`.

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

Что нужно получить:

- Telegram-бота с username
- токен бота от BotFather

Пошагово:

1. Откройте BotFather: <https://t.me/BotFather>
2. Если бота еще нет, выполните `/newbot` и создайте нового бота.
3. Скопируйте токен бота и добавьте его в разделе интеграций Telegram.
4. Убедитесь, что у бота есть username, потому что именно он используется для login deep-link.
5. В разделе интеграций Telegram включите нужного бота и поставьте флаг `использовать для входа`.
6. В разделе авторизации включите `Telegram`.
7. Сохраните настройки и нажмите `Проверить Telegram-вход`.

Для Telegram Widget дополнительно:

1. В BotFather выполните `/setdomain`.
2. Укажите домен сайта, на котором отображается `/auth`.
3. Включите `Telegram Widget`.
4. Сначала проверьте виджет в админке, затем откройте `/auth`.

Полезные ссылки:

- BotFather: <https://t.me/BotFather>
- Telegram bots FAQ: <https://core.telegram.org/bots#how-do-i-create-a-bot>
- Telegram Login Widget: <https://core.telegram.org/widgets/login>

### Google

Что нужно получить:

- `Client ID`
- `Client Secret`
- настроенный OAuth consent / branding screen

Пошагово:

1. Откройте Google Cloud Console credentials: <https://console.cloud.google.com/apis/credentials>
2. Выберите существующий Google Cloud project или создайте новый.
3. Заполните экран брендинга / consent screen: <https://console.cloud.google.com/auth/branding>
4. Если приложение еще не опубликовано, добавьте тестовых пользователей.
5. Создайте OAuth Client ID типа `Web application`.
6. Скопируйте callback URL из нашей админки и добавьте его в `Authorized redirect URIs`.
7. Скопируйте `Client ID` и `Client Secret` в поля `google_auth_client_id` и `google_auth_client_secret`.
8. Включите `Google`, сохраните настройки и нажмите `Проверить Google OAuth`.

Что проверять после настройки:

- `google_login_enabled=true` в `/settings/public-shell`
- на странице `/auth` появилась кнопка Google
- тест в админке открывает окно `accounts.google.com` без мгновенной backend-ошибки

Полезные ссылки:

- Google Auth Platform / branding: <https://console.cloud.google.com/auth/branding>
- OAuth credentials: <https://console.cloud.google.com/apis/credentials>
- Официальная инструкция: <https://developers.google.com/identity/protocols/oauth2/web-server>

### VK

Что нужно получить:

- `App ID / Client ID`
- `Secure key / Client Secret`

Пошагово:

1. Откройте портал разработчика VK: <https://dev.vk.com/ru>
2. Создайте приложение для сайта или откройте уже существующее.
3. В настройках приложения найдите `App ID` и защищенный ключ `Secure key`.
4. Скопируйте callback URL из нашей админки и добавьте его как разрешенный `redirect URI`.
5. Вставьте значения в поля `vk_auth_client_id` и `vk_auth_client_secret`.
6. Включите `VK`, сохраните настройки и нажмите `Проверить VK OAuth`.

Что проверять после настройки:

- `vk_login_enabled=true` в `/settings/public-shell`
- на странице `/auth` появилась кнопка VK
- тест в админке открывает `oauth.vk.com` без мгновенной backend-ошибки

Полезные ссылки:

- Портал разработчика VK: <https://dev.vk.com/ru>
- Auth code flow: <https://dev.vk.com/ru/api/access-token/authcode-flow-user>
- Получение профиля через users.get: <https://dev.vk.com/ru/reference/users.get>

### Яндекс

Что нужно получить:

- `Client ID`
- пароль приложения / `Client Secret`

Пошагово:

1. Откройте создание приложения Яндекс OAuth: <https://oauth.yandex.com/client/new/id/>
2. Создайте приложение и выберите сценарий для веб-сервиса.
3. Добавьте callback URL из нашей админки как адрес возврата.
4. После создания приложения скопируйте `Client ID` и пароль приложения.
5. Вставьте значения в поля `yandex_auth_client_id` и `yandex_auth_client_secret`.
6. Включите `Яндекс`, сохраните настройки и нажмите `Проверить Яндекс OAuth`.

Что проверять после настройки:

- `yandex_login_enabled=true` в `/settings/public-shell`
- на странице `/auth` появилась кнопка Яндекс
- тест в админке открывает `oauth.yandex.com` без мгновенной backend-ошибки

Полезные ссылки:

- Создать приложение: <https://oauth.yandex.com/client/new/id/>
- Регистрация клиента: <https://yandex.ru/dev/id/doc/ru/register-client>
- Auth code flow: <https://yandex.ru/dev/id/doc/ru/codes/code-and-token>

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
