# RoboKassa

## Официальные материалы

- Интерфейс оплаты: <https://docs.robokassa.com/ru/pay-interface>
- Уведомления и redirect-URL: <https://docs.robokassa.com/ru/notifications-and-redirects>
- Тестовый режим: <https://docs.robokassa.com/ru/testing-mode>

## Что реализовано в проекте

- Поддержка hosted checkout RoboKassa из checkout и личного кабинета.
- Генерация подписи для платежной формы и поддержка тестового режима `IsTest=1`.
- Обработка `ResultURL` на сервере с проверкой подписи и автоматическим переводом платежа в `paid`.
- Поддержка повторного открытия активного счета из личного кабинета.
- Настройки и тест интеграции в админке.

Ключевые файлы:

- `backend/Store.Api/Services/RoboKassaPaymentService.cs`
- `backend/Store.Api/Controllers/IntegrationsController.cs`
- `src/pages/checkout.tsx`
- `src/lib/yoomoney.js`
- `src/components/admin/AdminNewIntegrationsTabs.tsx`

## URL внутри проекта

- Серверный callback `ResultURL`: `/api/integrations/robokassa/result`
- Повторное открытие счета: `/api/orders/{orderId}/payment/checkout`

`ResultURL` в коде поддержан и для `POST`, и для `GET`, чтобы не упираться в конкретную настройку кабинета.

## Настройки

Можно задавать через админку и через `appsettings.json`.

Основные ключи:

- `payments_robokassa_enabled`
- `robokassa_merchant_login`
- `robokassa_password1`
- `robokassa_password2`
- `robokassa_test_password1`
- `robokassa_test_password2`
- `robokassa_test_mode`
- `robokassa_label_prefix`
- `robokassa_payment_timeout_minutes`
- `robokassa_currency_label`
- `robokassa_payment_methods`
- `robokassa_receipt_enabled`
- `robokassa_receipt_tax`
- `robokassa_tax_system`

## Тестовый контур

1. Включить `payments_robokassa_enabled=true`.
2. Включить `robokassa_test_mode=true`.
3. Заполнить `MerchantLogin`, тестовые пароли `#1` и `#2`.
4. В кабинете RoboKassa настроить `ResultURL` на `/api/integrations/robokassa/result`.
5. В админке открыть вкладку `RoboKassa` и запустить тест.
6. На storefront выбрать оплату `RoboKassa` и проверить переход на hosted form.

Что можно проверить без боевого запуска:

- формирование платежной формы;
- передачу `InvId`, `OutSum`, `Shp_orderId`, `Shp_paymentId`;
- подпись callback;
- возврат `OK{InvId}` из `ResultURL`.

## Как работает оплата

- При создании заказа с методом `robokassa` создается локальная запись `OrderPayment`.
- Фронтенд получает `action`, `method` и `fields` для отправки на `https://auth.robokassa.ru/Merchant/Index.aspx`.
- После оплаты RoboKassa вызывает `ResultURL`.
- Сервер сверяет подпись через пароль `#2`, сумму и локальный платеж.
- При успешной валидации платеж помечается как `paid`, а заказ переводится в оплаченный статус.

## Ограничения

- `SuccessURL` и `FailURL` здесь используются как пользовательский redirect, но именно `ResultURL` считается источником истины по подтверждению оплаты.
- Для Receipt/54-ФЗ нужен корректный `tax` и при необходимости `tax_system` из вашего договора с RoboKassa.
- Ручной online-refresh у RoboKassa не реализован, потому что основной подтверждающий механизм здесь серверный callback `ResultURL`.
