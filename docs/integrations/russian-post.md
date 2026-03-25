# Почта России

## Официальные материалы

- Общая спецификация: <https://otpravka.pochta.ru/specification>
- Авторизация токеном: <https://otpravka.pochta.ru/static/views/specification/authorization-token.html>
- Расчет тарифа: <https://otpravka.pochta.ru/static/views/specification/nogroup-rate_calculate.html>
- Поиск ближайших отделений: <https://otpravka.pochta.ru/static/views/specification/services-postoffice-find.nearby.details.html>
- Создание заказа v2: <https://otpravka.pochta.ru/static/views/specification/orders-creating_order_v2.html>

Рабочий API base:

- `https://otpravka-api.pochta.ru`

## Что реализовано в проекте

- Авторизация через `AccessToken` и `X-User-Authorization`.
- Расчет тарифа по официальному API Почты России.
- Поиск ближайших отделений по координатам адреса.
- Вывод Почты России в checkout как варианта доставки.
- Тест интеграции в админке.

Ключевые файлы:

- `backend/Store.Api/Services/RussianPostDeliveryService.cs`
- `backend/Store.Api/Services/DeliveryIntegrationService.cs`
- `backend/Store.Api/Controllers/IntegrationsController.cs`
- `src/pages/checkout.tsx`
- `src/components/admin/AdminNewIntegrationsTabs.tsx`

## Используемые API-методы

- `POST /1.0/tariff`
- `GET /postoffice/1.0/nearby.details`

В документации также изучен метод создания отправления:

- `PUT /2.0/user/backlog`

## Настройки

- `delivery_russian_post_enabled`
- `delivery_russian_post_access_token`
- `delivery_russian_post_authorization_key`
- `delivery_russian_post_from_postal_code`
- `delivery_russian_post_mail_type`
- `delivery_russian_post_mail_category`
- `delivery_russian_post_dimension_type`
- `delivery_russian_post_package_length_cm`
- `delivery_russian_post_package_height_cm`
- `delivery_russian_post_package_width_cm`

## Что происходит в checkout

- Клиент передает адрес заказа.
- Сервер через DaData пытается определить индекс и координаты.
- Для расчета используется `POST /1.0/tariff`.
- Для ПВЗ/отделений используется `GET /postoffice/1.0/nearby.details`.
- В ответ storefront получает стоимость, срок и список ближайших отделений.

## Тестовый контур

1. Включить `delivery_russian_post_enabled=true`.
2. Заполнить `AccessToken` и `X-User-Authorization`.
3. Указать индекс отправителя.
4. В админке открыть вкладку `Почта России`.
5. Выполнить тест расчета и поиска отделений.

Что тестируется:

- валидность авторизации;
- определение индекса назначения;
- расчет тарифа;
- получение ближайших отделений.

Важно:

- публичных универсальных demo-token для API `otpravka-api.pochta.ru` нет;
- успешный тест требует реальные `AccessToken` и `X-User-Authorization` из кабинета Отправки;
- из некоторых сетей прямые запросы к API могут дополнительно блокироваться антибот-защитой, поэтому проверять лучше именно через сервер проекта и с рабочими учетными данными.

## Ограничения текущей реализации

- В storefront-контуре реализованы расчет и подбор отделений.
- Автоматическое создание отправления через `PUT /2.0/user/backlog` пока не встроено в жизненный цикл заказа.
- Автоматическая синхронизация статусов и ШПИ пока не подключена.

## Что нужно для полного фулфилмента

- Формировать payload backlog по данным заказа.
- Сохранять `barcode`, `result-id` и связанные shipping-поля в заказе.
- Добавить отдельный сценарий подтверждения/отправки заказа менеджером.
- После этого можно подключить статусный polling и обновление клиента через личный кабинет/уведомления.
