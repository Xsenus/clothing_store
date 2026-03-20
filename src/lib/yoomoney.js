const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

const YOO_MONEY_METHODS = new Set([
  "yoomoney",
  "yoomoney_card",
  "yoomoney_wallet",
]);

const YOO_KASSA_METHODS = new Set([
  "yookassa",
  "yookassa_card",
  "yookassa_sbp",
  "yookassa_yoomoney",
]);

export const YOO_MONEY_PAYMENT_METHOD_LABELS = {
  yoomoney: "ЮMoney",
  yoomoney_card: "ЮMoney: банковская карта",
  yoomoney_wallet: "ЮMoney: кошелек",
};

export const YOO_KASSA_PAYMENT_METHOD_LABELS = {
  yookassa: "YooKassa",
  yookassa_card: "YooKassa: банковская карта",
  yookassa_sbp: "YooKassa: СБП",
  yookassa_yoomoney: "YooKassa: ЮMoney",
};

export const YOO_MONEY_PAYMENT_STATUS_LABELS = {
  pending: "Ожидает оплаты",
  paid: "Оплачен",
  expired: "Счет истек",
  canceled: "Отменен",
  cancelled: "Отменен",
  review_required: "Нужна проверка",
  error: "Ошибка",
};

export const YOO_KASSA_PAYMENT_STATUS_LABELS = {
  pending: "Ожидает оплаты",
  paid: "Оплачен",
  expired: "Время оплаты истекло",
  canceled: "Отменен",
  cancelled: "Отменен",
  review_required: "Нужна проверка",
  error: "Ошибка",
};

export const isSettingEnabled = (value, fallback = false) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return ENABLED_VALUES.has(normalized);
};

export const isYooMoneyPaymentMethod = (value) =>
  YOO_MONEY_METHODS.has(String(value || "").trim().toLowerCase());

export const isYooKassaPaymentMethod = (value) =>
  YOO_KASSA_METHODS.has(String(value || "").trim().toLowerCase());

const normalizeText = (value) => String(value ?? "").trim();

export const getYooMoneyConfigurationIssues = (settings) => {
  const enabled = isSettingEnabled(settings?.payments_yoomoney_enabled);
  if (!enabled) {
    return [];
  }

  const issues = [];

  if (!normalizeText(settings?.yoomoney_wallet_number)) {
    issues.push("Укажите номер кошелька YooMoney.");
  }

  if (!normalizeText(settings?.yoomoney_notification_secret)) {
    issues.push("Добавьте секрет для HTTP-уведомлений YooMoney.");
  }

  if (!normalizeText(settings?.yoomoney_access_token)) {
    issues.push("Добавьте access token YooMoney для проверки оплат.");
  }

  if (
    !isSettingEnabled(settings?.yoomoney_allow_bank_cards, true)
    && !isSettingEnabled(settings?.yoomoney_allow_wallet)
  ) {
    issues.push("Включите хотя бы один способ оплаты YooMoney.");
  }

  return issues;
};

export const getYooKassaConfigurationIssues = (settings) => {
  const enabled = isSettingEnabled(settings?.payments_yookassa_enabled);
  if (!enabled) {
    return [];
  }

  const issues = [];

  if (!normalizeText(settings?.yookassa_shop_id)) {
    issues.push("Укажите Shop ID YooKassa.");
  }

  if (!normalizeText(settings?.yookassa_secret_key)) {
    issues.push("Добавьте Secret Key YooKassa.");
  }

  if (
    !isSettingEnabled(settings?.yookassa_allow_bank_cards, true)
    && !isSettingEnabled(settings?.yookassa_allow_sbp, true)
    && !isSettingEnabled(settings?.yookassa_allow_yoomoney, true)
  ) {
    issues.push("Включите хотя бы один способ оплаты YooKassa.");
  }

  return issues;
};

export const getYooMoneyCapabilities = (settings) => {
  const enabled = isSettingEnabled(settings?.payments_yoomoney_enabled);
  const ready = enabled && (settings?.payments_yoomoney_ready === undefined
    ? true
    : isSettingEnabled(settings?.payments_yoomoney_ready));
  const allowBankCards = ready && isSettingEnabled(settings?.yoomoney_allow_bank_cards);
  const allowWallet = ready && isSettingEnabled(settings?.yoomoney_allow_wallet);

  return {
    enabled,
    ready,
    allowBankCards,
    allowWallet,
    hasAnyMethod: allowBankCards || allowWallet,
  };
};

export const getYooKassaCapabilities = (settings) => {
  const enabled = isSettingEnabled(settings?.payments_yookassa_enabled);
  const ready = enabled && (settings?.payments_yookassa_ready === undefined
    ? true
    : isSettingEnabled(settings?.payments_yookassa_ready));
  const allowBankCards = ready && isSettingEnabled(settings?.yookassa_allow_bank_cards, true);
  const allowSbp = ready && isSettingEnabled(settings?.yookassa_allow_sbp, true);
  const allowYooMoney = ready && isSettingEnabled(settings?.yookassa_allow_yoomoney, true);

  return {
    enabled,
    ready,
    allowBankCards,
    allowSbp,
    allowYooMoney,
    hasAnyMethod: allowBankCards || allowSbp || allowYooMoney,
  };
};

export const submitHostedCheckout = (checkout) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Оплата доступна только в браузере.");
  }

  const action = String(checkout?.action || "").trim();
  const method = String(checkout?.method || "POST").trim().toUpperCase() || "POST";
  const fields = checkout?.fields && typeof checkout.fields === "object"
    ? checkout.fields
    : {};

  if (!action) {
    throw new Error("Сервер не вернул корректную ссылку для оплаты.");
  }

  if (method === "REDIRECT") {
    window.location.assign(action);
    return;
  }

  const form = document.createElement("form");
  form.method = method;
  form.action = action;
  form.acceptCharset = "utf-8";
  form.style.display = "none";

  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = String(value);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
  window.setTimeout(() => {
    form.remove();
  }, 1000);
};

export const submitYooMoneyCheckoutForm = submitHostedCheckout;
