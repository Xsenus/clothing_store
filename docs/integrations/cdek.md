# СДЭК

## Официальные материалы

- Официальный API-портал: <https://api-docs.cdek.ru>
- Тестовый OAuth endpoint: <https://api.edu.cdek.ru/v2/oauth/token>
- Боевой OAuth endpoint: <https://api.cdek.ru/v2/oauth/token>

В текущей реализации опора идет на официальный API v2:

- `/v2/oauth/token`
- `/v2/location/cities`
- `/v2/calculator/tarifflist`
- `/v2/deliverypoints`

## Что реализовано в проекте

- OAuth-авторизация в учебный и боевой контур.
- Расчет стоимости доставки до двери и до ПВЗ.
- Поиск ПВЗ по адресу клиента.
- Вывод СДЭК как одного из провайдеров доставки в checkout.
- Тест подключения и расчета в админке.

Ключевые файлы:

- `backend/Store.Api/Services/CdekDeliveryService.cs`
- `backend/Store.Api/Services/DeliveryIntegrationService.cs`
- `backend/Store.Api/Controllers/IntegrationsController.cs`
- `src/pages/checkout.tsx`
- `src/components/admin/AdminNewIntegrationsTabs.tsx`

## Настройки

- `delivery_cdek_enabled`
- `delivery_cdek_use_test_environment`
- `delivery_cdek_account`
- `delivery_cdek_password`
- `delivery_cdek_from_postal_code`
- `delivery_cdek_package_length_cm`
- `delivery_cdek_package_height_cm`
- `delivery_cdek_package_width_cm`

`account/password` используются как `client_id/client_secret` для OAuth v2.

## Что происходит в checkout

- Клиент передает адрес и параметры заказа в `/api/integrations/delivery/calculate`.
- Сервер агрегирует доступные службы доставки.
- Для СДЭК выполняется:
  - получение OAuth token;
  - определение города получателя;
  - запрос тарифов через `tarifflist`;
  - запрос списка ПВЗ через `deliverypoints`.
- В checkout выбирается лучший доступный вариант для доставки до двери и для ПВЗ.

## Тестовый контур

1. Включить `delivery_cdek_enabled=true`.
2. Включить `delivery_cdek_use_test_environment=true`.
3. Указать учебные `account/password`.
4. Заполнить индекс отправителя.
5. В админке открыть вкладку `СДЭК` и выполнить тест.

Актуальные учебные данные, которые проходят OAuth на `api.edu.cdek.ru`:

- `Account`: `wqGwiQx0gg8mLtiEKsUinjVSICCjtTEP`
- `Secure password`: `RmAmgvSgSl1yirlz9QupbzOJVqhCxcP5`

Что тестируется:

- получение OAuth token;
- определение города по адресу;
- расчет тарифов;
- получение списка ПВЗ.

Важно:

- учебный калькулятор `api.edu.cdek.ru` может периодически возвращать `500 v2_internal_error` даже на корректных запросах;
- в проекте для такого случая добавлен резервный demo-ответ учебного контура: `137 = 285 ₽` до двери и `136 = 140 ₽` до ПВЗ;
- OAuth, определение города и список ПВЗ при этом продолжают проверяться через официальный API, поэтому тест не падает целиком из-за нестабильности учебного калькулятора.

## Ограничения текущей реализации

- В текущем storefront-контуре реализованы расчет доставки и выбор ПВЗ.
- Автоматическое создание отправления в СДЭК при создании заказа пока не подключено к жизненному циклу `OrdersController`.
- Автоматический polling статусов СДЭК пока не реализован.

## Что нужно для перехода на полный фулфилмент

- Подключить создание отправления через `/v2/orders`.
- Сохранять `shipping_provider_order_id`, `shipping_tracking_number`, `shipping_tracking_url`.
- Добавить фоновую синхронизацию статусов доставки.
- Связать создание отправления с моментом подтверждения заказа менеджером или успешной оплатой.
