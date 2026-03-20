# YooKassa Setup

## Что уже поддержано

- Создание платежа по API YooKassa с redirect-сценарием.
- Поддержка способов оплаты:
  - `YooKassa: банковская карта`
  - `YooKassa: СБП`
  - `YooKassa: ЮMoney`
- Возврат пользователя в личный кабинет после оплаты.
- Входящие webhook-уведомления.
- Ручная перепроверка статуса платежа из профиля и админки.
- Фоновая сверка и автоматическая очистка просроченных резервов.

## Что заполнить в интеграциях

В админке откройте `Интеграции -> YooKassa` и заполните:

- `Включить оплату через YooKassa`
- `Shop ID`
- `Secret Key`
- `Тестовый магазин / тестовые ключи`
- `Префикс метки`
- `Окно ожидания оплаты, минут`
- нужные способы оплаты:
  - карты
  - СБП
  - ЮMoney

## Webhook URL

Укажите в кабинете YooKassa URL:

`/api/integrations/yookassa/notifications`

Рекомендуемые события:

- `payment.succeeded`
- `payment.canceled`

## Тестовый режим

Для тестирования используйте тестовый магазин и тестовые ключи YooKassa.
Отдельный sandbox-URL для API не нужен: используется тот же API, но с тестовыми реквизитами магазина.

## Боевой запуск

1. Протестируйте оплату в тестовом магазине.
2. Проверьте webhook-уведомления.
3. Замените `Shop ID` и `Secret Key` на боевые.
4. Отключите флаг `Тестовый магазин / тестовые ключи`.
5. Снова проверьте webhook и статус заказа.

## Полезные ссылки

- Quick start: https://yookassa.ru/developers/payment-acceptance/getting-started/quick-start
- Payment methods: https://yookassa.ru/developers/payment-acceptance/getting-started/payment-methods
- Webhooks: https://yookassa.ru/developers/using-api/webhooks
- Test integration: https://yookassa.ru/docs/support/payments/onboarding/integration
