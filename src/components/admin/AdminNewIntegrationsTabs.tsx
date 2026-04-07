import { useEffect, useMemo, useState } from "react";
import AddressAutocompleteInput from "@/components/AddressAutocompleteInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FLOW } from "@/lib/api-mapping";
import { getRoboKassaConfigurationIssues, isSettingEnabled } from "@/lib/yoomoney";

type SettingsMap = Record<string, string>;
type UpdateSettingHandler = (key: string, value: string) => void;
type IntegrationProps = { settings: SettingsMap; updateSetting: UpdateSettingHandler };
type CdekPickupPointOption = {
  id: string;
  name?: string;
  address?: string;
  instruction?: string | null;
  distanceKm?: number | null;
};

const CDEK_TEST_ACCOUNT = "wqGwiQx0gg8mLtiEKsUinjVSICCjtTEP";
const CDEK_TEST_PASSWORD = "RmAmgvSgSl1yirlz9QupbzOJVqhCxcP5";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }

  return fallback;
};

const hasValue = (value: unknown) => String(value ?? "").trim().length > 0;

const formatRub = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${amount.toLocaleString("ru-RU")} ₽`
    : "—";
};

const buildResultUrl = () => {
  if (typeof window === "undefined") return "/api/integrations/robokassa/result";

  try {
    const apiBaseUrl = new URL(import.meta.env.VITE_API_URL || "/api", window.location.origin);
    return new URL("integrations/robokassa/result", apiBaseUrl.href.endsWith("/") ? apiBaseUrl.href : `${apiBaseUrl.href}/`).toString();
  } catch {
    return `${window.location.origin}/api/integrations/robokassa/result`;
  }
};

const JsonBox = ({ value }: { value: unknown }) => (
  <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-none border border-black/10 bg-white p-3 text-xs leading-6 [overflow-wrap:anywhere]">
    {JSON.stringify(value, null, 2)}
  </pre>
);

const IssueBox = ({ enabled, issues, summary }: { enabled: boolean; issues: string[]; summary: string }) => (
  <div className={`min-w-0 rounded-none border p-3 text-sm [overflow-wrap:anywhere] ${enabled ? "border-black/10 bg-slate-50" : "border-amber-200 bg-amber-50"}`}>
    <div>{summary}</div>
    {issues.length > 0 && (
      <ul className="mt-2 list-disc space-y-1 pl-5 text-red-700">
        {issues.map((issue) => <li key={issue}>{issue}</li>)}
      </ul>
    )}
  </div>
);

const ResultBox = ({ error, result }: { error: string; result: unknown }) => (
  <>
    {error && <div className="rounded-none border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {result && <JsonBox value={result} />}
  </>
);

const HelpBox = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="min-w-0 overflow-hidden rounded-none border border-black/10 bg-white p-3 text-sm">
    <div className="font-medium">{title}</div>
    <div className="mt-2 space-y-2 text-muted-foreground [overflow-wrap:anywhere]">{children}</div>
  </div>
);

const NO_AUTOFILL_PROPS = {
  autoComplete: "off",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
  "data-form-type": "other",
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
} as const;

type NoAutofillInputProps = React.ComponentProps<typeof Input>;

const NoAutofillInput = ({
  onFocus,
  onPointerDown,
  onMouseDown,
  readOnly,
  ...props
}: NoAutofillInputProps) => {
  const [locked, setLocked] = useState(true);

  const unlock = () => setLocked(false);

  return (
    <Input
      {...NO_AUTOFILL_PROPS}
      {...props}
      readOnly={readOnly || locked}
      onFocus={(event) => {
        unlock();
        onFocus?.(event);
      }}
      onPointerDown={(event) => {
        unlock();
        onPointerDown?.(event);
      }}
      onMouseDown={(event) => {
        unlock();
        onMouseDown?.(event);
      }}
    />
  );
};

const AutofillTrap = ({ scope }: { scope: string }) => (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden opacity-0"
  >
    <input tabIndex={-1} type="text" name={`${scope}-username`} autoComplete="username" defaultValue="" />
    <input tabIndex={-1} type="password" name={`${scope}-password`} autoComplete="current-password" defaultValue="" />
  </div>
);

const getCdekIssues = (settings: SettingsMap) => {
  if (!isSettingEnabled(settings.delivery_cdek_enabled)) return [];
  const issues = [];
  if (!hasValue(settings.delivery_cdek_account)) issues.push("Укажите Account / client_id СДЭК.");
  if (!hasValue(settings.delivery_cdek_password)) issues.push("Укажите Password / client_secret СДЭК.");
  const hasOriginPostalCode = hasValue(settings.delivery_cdek_from_postal_code);
  const hasOriginAddress = hasValue(settings.delivery_cdek_from_address);
  const canResolveOriginAddress = hasOriginAddress && hasValue(settings.dadata_api_key);
  if (!hasOriginPostalCode && !hasOriginAddress) issues.push("Укажите индекс или адрес точки отправления СДЭК.");
  if (!hasOriginPostalCode && hasOriginAddress && !canResolveOriginAddress) issues.push("Для автоопределения индекса по адресу точки отправления нужен ключ DaData.");
  if (String(settings.delivery_cdek_from_location_type || "").trim().toLowerCase() === "pickup_point" && !hasValue(settings.delivery_cdek_from_pickup_point_code)) {
    issues.push("Для отправки через ПВЗ СДЭК укажите код пункта отправления.");
  }
  return issues;
};

const getRussianPostIssues = (settings: SettingsMap) => {
  if (!isSettingEnabled(settings.delivery_russian_post_enabled)) return [];
  const issues = [];
  if (!hasValue(settings.delivery_russian_post_access_token)) issues.push("Укажите AccessToken Почты России.");
  if (!hasValue(settings.delivery_russian_post_authorization_key)) issues.push("Укажите X-User-Authorization key.");
  if (!hasValue(settings.delivery_russian_post_from_postal_code)) issues.push("Укажите индекс отправителя.");
  return issues;
};

const getAvitoIssues = (settings: SettingsMap) => {
  if (!isSettingEnabled(settings.delivery_avito_enabled)) return [];
  const issues = [];
  if (!hasValue(settings.delivery_avito_client_id)) issues.push("Укажите client_id Avito.");
  if (!hasValue(settings.delivery_avito_client_secret)) issues.push("Укажите client_secret Avito.");
  return issues;
};

export function AdminRoboKassaIntegrationTab({ settings, updateSetting }: IntegrationProps) {
  const [amount, setAmount] = useState("100");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const issues = useMemo(() => getRoboKassaConfigurationIssues(settings), [settings]);

  const runTest = async () => {
    setRunning(true);
    setError("");
    try {
      setResult(await FLOW.adminTestRoboKassa({
        input: {
          enabled: isSettingEnabled(settings.payments_robokassa_enabled),
          merchantLogin: settings.robokassa_merchant_login || "",
          password1: settings.robokassa_password1 || "",
          password2: settings.robokassa_password2 || "",
          testPassword1: settings.robokassa_test_password1 || "",
          testPassword2: settings.robokassa_test_password2 || "",
          testMode: isSettingEnabled(settings.robokassa_test_mode, true),
          labelPrefix: settings.robokassa_label_prefix || "FD",
          paymentTimeoutMinutes: Number(settings.robokassa_payment_timeout_minutes || "60"),
          currencyLabel: settings.robokassa_currency_label || "",
          paymentMethods: settings.robokassa_payment_methods || "",
          receiptEnabled: isSettingEnabled(settings.robokassa_receipt_enabled),
          receiptTax: settings.robokassa_receipt_tax || "",
          taxSystem: settings.robokassa_tax_system || "",
          amount: Number(amount.replace(",", ".")),
          returnUrl: typeof window === "undefined" ? null : window.location.href,
        },
      }));
    } catch (nextError) {
      setResult(null);
      setError(getErrorMessage(nextError, "Не удалось проверить RoboKassa."));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-w-0 space-y-3 overflow-hidden border p-3">
      <div className="flex items-start gap-2"><Checkbox id="payments-robokassa-enabled" checked={isSettingEnabled(settings.payments_robokassa_enabled)} onCheckedChange={(checked) => updateSetting("payments_robokassa_enabled", checked ? "true" : "false")} /><Label htmlFor="payments-robokassa-enabled" className="leading-snug">Включить RoboKassa</Label></div>
      <IssueBox enabled={isSettingEnabled(settings.payments_robokassa_enabled)} issues={issues} summary="Hosted checkout, test mode, подпись ResultURL и формирование чека через Receipt при необходимости." />
      <HelpBox title="Как настроить RoboKassa">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Заполните `MerchantLogin`, `Password #1` и `Password #2` из кабинета RoboKassa.</li>
          <li>Для тестового режима включите `robokassa_test_mode=true` и укажите свои тестовые пароли `#1` и `#2` из кабинета.</li>
          <li>Публичных универсальных тестовых логина и паролей RoboKassa не предоставляет, поэтому успешная внешняя оплата возможна только с вашей тестовой учетной записью.</li>
          <li>После сохранения настроек задайте `ResultURL` на адрес ниже и запустите проверку интеграции.</li>
          <li>Тест в админке проверяет локальную генерацию формы, набор полей, подпись и готовность callback `ResultURL`.</li>
        </ol>
      </HelpBox>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="robokassa-merchant-login">Merchant Login</Label><NoAutofillInput id="robokassa-merchant-login" name="integration-robokassa-merchant-login" value={settings.robokassa_merchant_login || ""} onChange={(event) => updateSetting("robokassa_merchant_login", event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="robokassa-label-prefix">Префикс</Label><Input id="robokassa-label-prefix" value={settings.robokassa_label_prefix || "FD"} onChange={(event) => updateSetting("robokassa_label_prefix", event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="robokassa-password1">Пароль #1</Label><NoAutofillInput id="robokassa-password1" name="integration-robokassa-password1" type="password" autoComplete="new-password" value={settings.robokassa_password1 || ""} onChange={(event) => updateSetting("robokassa_password1", event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="robokassa-password2">Пароль #2</Label><NoAutofillInput id="robokassa-password2" name="integration-robokassa-password2" type="password" autoComplete="new-password" value={settings.robokassa_password2 || ""} onChange={(event) => updateSetting("robokassa_password2", event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="robokassa-test-password1">Тестовый пароль #1</Label><NoAutofillInput id="robokassa-test-password1" name="integration-robokassa-test-password1" type="password" autoComplete="new-password" value={settings.robokassa_test_password1 || ""} onChange={(event) => updateSetting("robokassa_test_password1", event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="robokassa-test-password2">Тестовый пароль #2</Label><NoAutofillInput id="robokassa-test-password2" name="integration-robokassa-test-password2" type="password" autoComplete="new-password" value={settings.robokassa_test_password2 || ""} onChange={(event) => updateSetting("robokassa_test_password2", event.target.value)} /></div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="robokassa-timeout-minutes">Срок жизни счета, минут</Label><Input id="robokassa-timeout-minutes" value={settings.robokassa_payment_timeout_minutes || "60"} onChange={(event) => updateSetting("robokassa_payment_timeout_minutes", event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="robokassa-payment-methods">PaymentMethods</Label><Input id="robokassa-payment-methods" value={settings.robokassa_payment_methods || ""} onChange={(event) => updateSetting("robokassa_payment_methods", event.target.value)} placeholder="Например, BankCard" /></div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2"><Checkbox id="robokassa-test-mode" checked={isSettingEnabled(settings.robokassa_test_mode, true)} onCheckedChange={(checked) => updateSetting("robokassa_test_mode", checked ? "true" : "false")} /><Label htmlFor="robokassa-test-mode">Тестовый режим</Label></div>
        <div className="flex items-center gap-2"><Checkbox id="robokassa-receipt-enabled" checked={isSettingEnabled(settings.robokassa_receipt_enabled)} onCheckedChange={(checked) => updateSetting("robokassa_receipt_enabled", checked ? "true" : "false")} /><Label htmlFor="robokassa-receipt-enabled">Передавать Receipt</Label></div>
      </div>
      <div className="rounded-none border border-black/10 bg-white p-3 text-sm"><div className="font-medium">Result URL</div><div className="mt-1 break-all font-mono text-xs">{buildResultUrl()}</div></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_auto]">
        <div className="space-y-1"><Label htmlFor="robokassa-test-amount">Тестовая сумма, ₽</Label><Input id="robokassa-test-amount" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
        <div className="flex items-end"><Button type="button" className="w-full rounded-none md:w-auto" disabled={running || !isSettingEnabled(settings.payments_robokassa_enabled)} onClick={runTest}>{running ? "Проверяем..." : "Проверить интеграцию"}</Button></div>
      </div>
      <ResultBox error={error} result={result} />
    </div>
  );
}

export function AdminCdekIntegrationTab({ settings, updateSetting }: IntegrationProps) {
  const [address, setAddress] = useState("630099, Новосибирск, Красный проспект, 25");
  const [weightKg, setWeightKg] = useState("0.300");
  const [declaredCost, setDeclaredCost] = useState("1000");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [originPickupPointsLoading, setOriginPickupPointsLoading] = useState(false);
  const [originPickupPointsError, setOriginPickupPointsError] = useState("");
  const [originPickupPoints, setOriginPickupPoints] = useState<CdekPickupPointOption[]>([]);
  const issues = useMemo(() => getCdekIssues(settings), [settings]);
  const cdekResult = result && typeof result === "object" ? result as {
    tokenReceived?: boolean;
    note?: string;
    cityCode?: string;
    quote?: {
      details?: Record<string, string> | null;
      homeDelivery?: { available?: boolean; estimatedCost?: number | null; tariff?: string | null } | null;
      pickupPointDelivery?: { available?: boolean; estimatedCost?: number | null; tariff?: string | null } | null;
    } | null;
    pickupPoints?: Array<{ id?: string; address?: string }> | null;
  } : null;
  const cdekUsesTrainingFallback = String(cdekResult?.quote?.details?.quoteSource || "").trim().toLowerCase() === "training_fallback";
  const normalizedOriginLocationType = String(settings.delivery_cdek_from_location_type || "").trim().toLowerCase();
  const isOriginPickupPoint = normalizedOriginLocationType === "pickup_point";
  const selectedOriginPickupPoint = originPickupPoints.find((point) => point.id === settings.delivery_cdek_from_pickup_point_code) || null;

  useEffect(() => {
    if (!isOriginPickupPoint) {
      setOriginPickupPoints([]);
      setOriginPickupPointsError("");
      setOriginPickupPointsLoading(false);
      return;
    }

    const originAddress = String(settings.delivery_cdek_from_address || "").trim();
    if (!originAddress) {
      setOriginPickupPoints([]);
      setOriginPickupPointsError("");
      setOriginPickupPointsLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setOriginPickupPointsLoading(true);
      setOriginPickupPointsError("");

      try {
        const response = await FLOW.adminListCdekPickupPoints({
          input: {
            enabled: isSettingEnabled(settings.delivery_cdek_enabled),
            useTestEnvironment: isSettingEnabled(settings.delivery_cdek_use_test_environment, true),
            account: settings.delivery_cdek_account || "",
            password: settings.delivery_cdek_password || "",
            fromPostalCode: settings.delivery_cdek_from_postal_code || "",
            fromLocationType: settings.delivery_cdek_from_location_type || "warehouse",
            fromAddress: settings.delivery_cdek_from_address || "",
            fromPickupPointCode: settings.delivery_cdek_from_pickup_point_code || "",
            toAddress: originAddress,
            limit: 12,
          },
        });

        if (cancelled) {
          return;
        }

        const nextPoints = Array.isArray((response as { points?: CdekPickupPointOption[] } | null)?.points)
          ? ((response as { points?: CdekPickupPointOption[] }).points || [])
          : [];

        setOriginPickupPoints(nextPoints);
        setOriginPickupPointsError(nextPoints.length === 0 ? "По этому адресу или городу не нашлось ПВЗ СДЭК." : "");
      } catch (nextError) {
        if (cancelled) {
          return;
        }

        setOriginPickupPoints([]);
        setOriginPickupPointsError(getErrorMessage(nextError, "Не удалось загрузить список ПВЗ СДЭК."));
      } finally {
        if (!cancelled) {
          setOriginPickupPointsLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [
    isOriginPickupPoint,
    settings.delivery_cdek_account,
    settings.delivery_cdek_enabled,
    settings.delivery_cdek_from_address,
    settings.delivery_cdek_from_location_type,
    settings.delivery_cdek_from_pickup_point_code,
    settings.delivery_cdek_from_postal_code,
    settings.delivery_cdek_password,
    settings.delivery_cdek_use_test_environment,
  ]);

  const handleOriginPickupPointSelect = (nextPointId: string) => {
    updateSetting("delivery_cdek_from_pickup_point_code", nextPointId);
    const nextPoint = originPickupPoints.find((point) => point.id === nextPointId);
    if (nextPoint?.address) {
      updateSetting("delivery_cdek_from_address", nextPoint.address);
    }
  };

  const runTest = async () => {
    setRunning(true);
    setError("");
    try {
      setResult(await FLOW.adminTestCdekDelivery({ input: { enabled: isSettingEnabled(settings.delivery_cdek_enabled), useTestEnvironment: isSettingEnabled(settings.delivery_cdek_use_test_environment, true), account: settings.delivery_cdek_account || "", password: settings.delivery_cdek_password || "", fromPostalCode: settings.delivery_cdek_from_postal_code || "", fromLocationType: settings.delivery_cdek_from_location_type || "warehouse", fromAddress: settings.delivery_cdek_from_address || "", fromPickupPointCode: settings.delivery_cdek_from_pickup_point_code || "", toAddress: address, weightKg: Number(weightKg.replace(",", ".")), declaredCost: Number(declaredCost.replace(",", ".")), packageLengthCm: Number(settings.delivery_cdek_package_length_cm || "30"), packageHeightCm: Number(settings.delivery_cdek_package_height_cm || "20"), packageWidthCm: Number(settings.delivery_cdek_package_width_cm || "10") } }));
    } catch (nextError) {
      setResult(null);
      setError(getErrorMessage(nextError, "Не удалось проверить СДЭК."));
    } finally {
      setRunning(false);
    }
  };

  const applyOfficialTestCredentials = () => {
    updateSetting("delivery_cdek_use_test_environment", "true");
    updateSetting("delivery_cdek_account", CDEK_TEST_ACCOUNT);
    updateSetting("delivery_cdek_password", CDEK_TEST_PASSWORD);
    updateSetting("delivery_cdek_from_location_type", settings.delivery_cdek_from_location_type || "warehouse");
    updateSetting("delivery_cdek_from_postal_code", settings.delivery_cdek_from_postal_code || "630099");
    updateSetting("delivery_cdek_from_address", settings.delivery_cdek_from_address || "630099, Новосибирск, Красный проспект, 25");
    setAddress("630099, Новосибирск, Красный проспект, 25");
    setWeightKg("0.300");
    setDeclaredCost("1000");
  };

  return (
    <div className="min-w-0 space-y-3 overflow-hidden border p-3">
      <AutofillTrap scope="integration-cdek" />
      <div className="flex items-start gap-2"><Checkbox id="delivery-cdek-enabled" checked={isSettingEnabled(settings.delivery_cdek_enabled)} onCheckedChange={(checked) => updateSetting("delivery_cdek_enabled", checked ? "true" : "false")} /><Label htmlFor="delivery-cdek-enabled" className="leading-snug">Включить СДЭК</Label></div>
      <IssueBox enabled={isSettingEnabled(settings.delivery_cdek_enabled)} issues={issues} summary="OAuth, расчет тарифов и список ПВЗ через официальный API CDEK v2." />
      <HelpBox title="Как настроить СДЭК">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Для боевого использования нужен договор со СДЭК.</li>
          <li>Для разработки используйте учебный контур <a className="underline underline-offset-2" href="https://api.edu.cdek.ru" target="_blank" rel="noreferrer">api.edu.cdek.ru</a> и официальный интеграторский раздел <a className="underline underline-offset-2" href="https://www.cdek.ru/clients/integrator.html" target="_blank" rel="noreferrer">cdek.ru/clients/integrator.html</a>.</li>
          <li>Заполните `Account`, `Secure password`, включите учебный контур и укажите точку отправления: индекс, адрес и при необходимости код ПВЗ/офиса.</li>
          <li>После изменения полей нажмите кнопку сохранения текущего раздела внизу страницы, затем запустите тест интеграции.</li>
          <li>Чтобы checkout увидел СДЭК, после сохранения в `public-shell` должно появиться `delivery_cdek_enabled=true`.</li>
          <li>Успешный тест должен вернуть `tokenReceived=true`, `cityCode`, тарифы и список ПВЗ.</li>
          <li>Если учебный калькулятор СДЭК ответит `v2_internal_error`, система покажет резервные demo-тарифы учебного контура вместо падения теста.</li>
        </ol>
        <div className="rounded-none border border-black/10 bg-white p-3 text-xs text-muted-foreground">
          Для расчета тарифа storefront использует индекс отправителя. Если индекс не заполнен, сервер попробует определить его по адресу точки отправления через DaData. Код ПВЗ нужен, если вы реально сдаете отправления через пункт СДЭК, а не со своего склада.
        </div>
        <div className="grid grid-cols-1 gap-2 border border-black/10 bg-slate-50 p-3 font-mono text-xs md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="font-semibold text-black">Account</div>
          <div className="break-all text-black">{CDEK_TEST_ACCOUNT}</div>
          <div className="font-semibold text-black">Secure password</div>
          <div className="break-all text-black">{CDEK_TEST_PASSWORD}</div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button type="button" variant="outline" className="w-full rounded-none sm:w-auto" onClick={applyOfficialTestCredentials}>
            Подставить тестовые данные
          </Button>
          <span className="text-xs">
            Эти данные подходят только для учебного контура `api.edu.cdek.ru`.
          </span>
        </div>
      </HelpBox>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="delivery-cdek-account">Account / client_id</Label><NoAutofillInput id="delivery-cdek-account" name="integration-cdek-client-key" autoComplete="new-password" value={settings.delivery_cdek_account || ""} onChange={(event) => updateSetting("delivery_cdek_account", event.target.value)} placeholder={CDEK_TEST_ACCOUNT} /></div>
        <div className="space-y-1"><Label htmlFor="delivery-cdek-password">Password / client_secret</Label><NoAutofillInput id="delivery-cdek-password" name="integration-cdek-api-secret" type="password" autoComplete="new-password" value={settings.delivery_cdek_password || ""} onChange={(event) => updateSetting("delivery_cdek_password", event.target.value)} placeholder={CDEK_TEST_PASSWORD} /></div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="delivery-cdek-origin-type">Точка отправления</Label>
          <Select value={settings.delivery_cdek_from_location_type || "warehouse"} onValueChange={(value) => updateSetting("delivery_cdek_from_location_type", value)}>
            <SelectTrigger id="delivery-cdek-origin-type" className="rounded-none">
              <SelectValue placeholder="Выберите тип точки отправления" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="warehouse">Свой склад / шоурум</SelectItem>
              <SelectItem value="pickup_point">ПВЗ / офис СДЭК</SelectItem>
              <SelectItem value="other">Другая точка</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="delivery-cdek-origin-address">Адрес точки отправления</Label>
          <AddressAutocompleteInput
            id="delivery-cdek-origin-address"
            name="delivery_cdek_from_address"
            value={settings.delivery_cdek_from_address || ""}
            onValueChange={(nextValue) => {
              updateSetting("delivery_cdek_from_address", nextValue);
              if (!isOriginPickupPoint) {
                return;
              }

              const currentPoint = originPickupPoints.find((point) => point.id === settings.delivery_cdek_from_pickup_point_code);
              if (!currentPoint || currentPoint.address !== nextValue) {
                updateSetting("delivery_cdek_from_pickup_point_code", "");
              }
            }}
            placeholder={isOriginPickupPoint ? "Введите город или адрес, чтобы подобрать ПВЗ СДЭК" : "Новосибирск, Красный проспект, 25"}
            inputClassName="rounded-none"
            suggestionsClassName="rounded-none"
          />
          {isOriginPickupPoint ? (
            <div className="space-y-2 pt-2">
              <Label htmlFor="delivery-cdek-origin-point-select">ПВЗ в выбранном городе</Label>
              <Select
                value={settings.delivery_cdek_from_pickup_point_code || undefined}
                onValueChange={handleOriginPickupPointSelect}
                disabled={originPickupPointsLoading || originPickupPoints.length === 0}
              >
                <SelectTrigger id="delivery-cdek-origin-point-select" className="rounded-none">
                  <SelectValue placeholder={originPickupPointsLoading ? "Загружаем ПВЗ СДЭК..." : "Выберите ПВЗ / офис СДЭК"} />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  {originPickupPoints.map((point) => (
                    <SelectItem key={point.id} value={point.id}>
                      {point.name || point.id}
                      {point.address ? ` — ${point.address}` : ""}
                      {point.distanceKm ? ` · ${point.distanceKm.toFixed(1)} км` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedOriginPickupPoint?.address ? (
                <div className="rounded-none border border-black/10 bg-white px-3 py-2 text-xs text-muted-foreground">
                  {selectedOriginPickupPoint.address}
                  {selectedOriginPickupPoint.instruction ? ` · ${selectedOriginPickupPoint.instruction}` : ""}
                </div>
              ) : null}
              {originPickupPointsLoading ? (
                <div className="text-xs text-muted-foreground">Ищем ПВЗ СДЭК в выбранном городе...</div>
              ) : null}
              {!originPickupPointsLoading && originPickupPoints.length > 0 ? (
                <div className="text-xs text-muted-foreground">
                  Найдено пунктов: {originPickupPoints.length}. После выбора код ПВЗ заполнится автоматически.
                </div>
              ) : null}
              {!originPickupPointsLoading && originPickupPointsError ? (
                <div className="text-xs text-red-700">{originPickupPointsError}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="space-y-1"><Label htmlFor="delivery-cdek-postal">Индекс отправителя</Label><Input id="delivery-cdek-postal" value={settings.delivery_cdek_from_postal_code || "630099"} onChange={(event) => updateSetting("delivery_cdek_from_postal_code", event.target.value)} placeholder="630099" /></div>
        <div className="space-y-1"><Label htmlFor="delivery-cdek-origin-point-code">Код ПВЗ / офиса</Label><Input id="delivery-cdek-origin-point-code" value={settings.delivery_cdek_from_pickup_point_code || ""} onChange={(event) => updateSetting("delivery_cdek_from_pickup_point_code", event.target.value)} placeholder="Например, NSK12" /></div>
        <div className="space-y-1"><Label htmlFor="delivery-cdek-length">Длина, см</Label><Input id="delivery-cdek-length" value={settings.delivery_cdek_package_length_cm || "30"} onChange={(event) => updateSetting("delivery_cdek_package_length_cm", event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="delivery-cdek-height">Высота, см</Label><Input id="delivery-cdek-height" value={settings.delivery_cdek_package_height_cm || "20"} onChange={(event) => updateSetting("delivery_cdek_package_height_cm", event.target.value)} /></div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="space-y-1"><Label htmlFor="delivery-cdek-width">Ширина, см</Label><Input id="delivery-cdek-width" value={settings.delivery_cdek_package_width_cm || "10"} onChange={(event) => updateSetting("delivery_cdek_package_width_cm", event.target.value)} /></div>
      </div>
      <div className="rounded-none border border-black/10 bg-white p-3 text-xs text-muted-foreground">
        Индекс остается главным параметром для тарифа. Адрес нужен для автоподстановки индекса и понятной фиксации, откуда именно вы отправляете заказы. Если вы сдаете отправления через ПВЗ СДЭК, дополнительно укажите код офиса.
      </div>
      <div className="flex items-center gap-2"><Checkbox id="delivery-cdek-test-environment" checked={isSettingEnabled(settings.delivery_cdek_use_test_environment, true)} onCheckedChange={(checked) => updateSetting("delivery_cdek_use_test_environment", checked ? "true" : "false")} /><Label htmlFor="delivery-cdek-test-environment">Учебный контур api.edu.cdek.ru</Label></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1 md:col-span-3">
          <Label htmlFor="delivery-cdek-test-address">Тестовый адрес</Label>
          <AddressAutocompleteInput
            id="delivery-cdek-test-address"
            name="delivery_cdek_test_address"
            value={address}
            onValueChange={setAddress}
            placeholder="630099, Новосибирск, Красный проспект, 25"
            inputClassName="rounded-none"
            suggestionsClassName="rounded-none"
          />
        </div>
        <div className="space-y-1"><Label htmlFor="delivery-cdek-test-weight">Вес, кг</Label><Input id="delivery-cdek-test-weight" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="0.300" /></div>
        <div className="space-y-1"><Label htmlFor="delivery-cdek-test-cost">Объявленная стоимость, ₽</Label><Input id="delivery-cdek-test-cost" value={declaredCost} onChange={(event) => setDeclaredCost(event.target.value)} placeholder="1000" /></div>
        <div className="flex items-end"><Button type="button" className="w-full rounded-none md:w-auto" disabled={running || !isSettingEnabled(settings.delivery_cdek_enabled)} onClick={runTest}>{running ? "Проверяем..." : "Проверить интеграцию"}</Button></div>
      </div>
      {cdekResult?.tokenReceived && (
        <div className={`rounded-none border p-3 text-sm ${cdekUsesTrainingFallback ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          Проверка прошла: OAuth token получен, город распознан как `{cdekResult.cityCode || "—"}`, тариф до двери {cdekResult.quote?.homeDelivery?.available ? `доступен (${cdekResult.quote?.homeDelivery?.estimatedCost ?? "—"} ₽, тариф ${cdekResult.quote?.homeDelivery?.tariff || "—"})` : "не найден"}, тариф до ПВЗ {cdekResult.quote?.pickupPointDelivery?.available ? `доступен (${cdekResult.quote?.pickupPointDelivery?.estimatedCost ?? "—"} ₽, тариф ${cdekResult.quote?.pickupPointDelivery?.tariff || "—"})` : "не найден"}, найдено ПВЗ: {Array.isArray(cdekResult.pickupPoints) ? cdekResult.pickupPoints.length : 0}.
          {cdekResult.note ? ` ${cdekResult.note}` : ""}
        </div>
      )}
      <ResultBox error={error} result={result} />
    </div>
  );
}

export function AdminRussianPostIntegrationTab({ settings, updateSetting }: IntegrationProps) {
  const [address, setAddress] = useState("630099, Новосибирск, Красный проспект, 25");
  const [weightKg, setWeightKg] = useState("0.300");
  const [declaredCost, setDeclaredCost] = useState("1000");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const issues = useMemo(() => getRussianPostIssues(settings), [settings]);
  const russianPostResult = result && typeof result === "object" ? result as {
    fromPostalCode?: string;
    destinationPostalCode?: string | null;
    quote?: {
      homeDelivery?: { available?: boolean; estimatedCost?: number | null; deliveryDays?: number | null; tariff?: string | null } | null;
      pickupPointDelivery?: { available?: boolean; estimatedCost?: number | null; deliveryDays?: number | null; tariff?: string | null } | null;
    } | null;
    pickupPoints?: Array<{ id?: string; address?: string }> | null;
    note?: string;
  } : null;

  const runTest = async () => {
    setRunning(true);
    setError("");
    try {
      setResult(await FLOW.adminTestRussianPostDelivery({ input: { enabled: isSettingEnabled(settings.delivery_russian_post_enabled), accessToken: settings.delivery_russian_post_access_token || "", authorizationKey: settings.delivery_russian_post_authorization_key || "", fromPostalCode: settings.delivery_russian_post_from_postal_code || "", toAddress: address, weightKg: Number(weightKg.replace(",", ".")), declaredCost: Number(declaredCost.replace(",", ".")), mailType: settings.delivery_russian_post_mail_type || "POSTAL_PARCEL", mailCategory: settings.delivery_russian_post_mail_category || "ORDINARY", dimensionType: settings.delivery_russian_post_dimension_type || "PACK", packageLengthCm: Number(settings.delivery_russian_post_package_length_cm || "30"), packageHeightCm: Number(settings.delivery_russian_post_package_height_cm || "20"), packageWidthCm: Number(settings.delivery_russian_post_package_width_cm || "10") } }));
    } catch (nextError) {
      setResult(null);
      setError(getErrorMessage(nextError, "Не удалось проверить Почту России."));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-w-0 space-y-3 overflow-hidden border p-3">
      <div className="flex items-start gap-2"><Checkbox id="delivery-russian-post-enabled" checked={isSettingEnabled(settings.delivery_russian_post_enabled)} onCheckedChange={(checked) => updateSetting("delivery_russian_post_enabled", checked ? "true" : "false")} /><Label htmlFor="delivery-russian-post-enabled" className="leading-snug">Включить Почту России</Label></div>
      <IssueBox enabled={isSettingEnabled(settings.delivery_russian_post_enabled)} issues={issues} summary="Tariff API и поиск отделений через официальный сервис otpravka-api.pochta.ru." />
      <HelpBox title="Как настроить Почту России">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Используйте официальный API `otpravka-api.pochta.ru` и учетные данные из кабинета Отправки.</li>
          <li>Заполните `AccessToken`, `X-User-Authorization`, индекс отправителя и параметры типа отправления.</li>
          <li>Публичных универсальных demo-token для этого API нет: успешный тест требует ваши реальные данные из кабинета Отправки.</li>
          <li>Для доставки в отделение обычно подходят `POSTAL_PARCEL` и `ORDINARY`, для курьерского сценария используйте типы вроде `EMS` или `ONLINE_COURIER`.</li>
          <li>После изменения полей нажмите кнопку сохранения текущего раздела внизу страницы, затем запустите тест интеграции.</li>
          <li>Чтобы checkout увидел Почту России, после сохранения в `public-shell` должно появиться `delivery_russian_post_enabled=true`.</li>
        </ol>
        <div className="rounded-none border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Из некоторых сетей raw-запросы к `otpravka-api.pochta.ru` могут блокироваться антибот-защитой до полноценной авторизации. Если видите ошибку доступа, сначала проверьте реальные ключи и повторите тест через сервер проекта.
        </div>
      </HelpBox>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="delivery-russian-post-token">AccessToken</Label><NoAutofillInput id="delivery-russian-post-token" name="integration-russian-post-token" type="password" autoComplete="new-password" value={settings.delivery_russian_post_access_token || ""} onChange={(event) => updateSetting("delivery_russian_post_access_token", event.target.value)} placeholder="Токен из кабинета Отправка" /></div>
        <div className="space-y-1"><Label htmlFor="delivery-russian-post-key">X-User-Authorization</Label><NoAutofillInput id="delivery-russian-post-key" name="integration-russian-post-key" type="password" autoComplete="new-password" value={settings.delivery_russian_post_authorization_key || ""} onChange={(event) => updateSetting("delivery_russian_post_authorization_key", event.target.value)} placeholder="Ключ авторизации пользователя" /></div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="space-y-1"><Label htmlFor="delivery-russian-postal">Индекс отправителя</Label><Input id="delivery-russian-postal" value={settings.delivery_russian_post_from_postal_code || "630099"} onChange={(event) => updateSetting("delivery_russian_post_from_postal_code", event.target.value)} placeholder="630099" /></div>
        <div className="space-y-1"><Label htmlFor="delivery-russian-mail-type">MailType</Label><Input id="delivery-russian-mail-type" value={settings.delivery_russian_post_mail_type || "POSTAL_PARCEL"} onChange={(event) => updateSetting("delivery_russian_post_mail_type", event.target.value)} placeholder="POSTAL_PARCEL" /></div>
        <div className="space-y-1"><Label htmlFor="delivery-russian-mail-category">MailCategory</Label><Input id="delivery-russian-mail-category" value={settings.delivery_russian_post_mail_category || "ORDINARY"} onChange={(event) => updateSetting("delivery_russian_post_mail_category", event.target.value)} placeholder="ORDINARY" /></div>
        <div className="space-y-1"><Label htmlFor="delivery-russian-dimension-type">DimensionType</Label><Input id="delivery-russian-dimension-type" value={settings.delivery_russian_post_dimension_type || "PACK"} onChange={(event) => updateSetting("delivery_russian_post_dimension_type", event.target.value)} placeholder="PACK" /></div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="space-y-1 md:col-span-4">
          <Label htmlFor="delivery-russian-test-address">Тестовый адрес</Label>
          <AddressAutocompleteInput
            id="delivery-russian-test-address"
            name="delivery_russian_test_address"
            value={address}
            onValueChange={setAddress}
            placeholder="630099, Новосибирск, Красный проспект, 25"
            inputClassName="rounded-none"
            suggestionsClassName="rounded-none"
          />
        </div>
        <div className="space-y-1"><Label htmlFor="delivery-russian-test-weight">Вес, кг</Label><Input id="delivery-russian-test-weight" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="0.300" /></div>
        <div className="space-y-1"><Label htmlFor="delivery-russian-test-cost">Объявленная стоимость, ₽</Label><Input id="delivery-russian-test-cost" value={declaredCost} onChange={(event) => setDeclaredCost(event.target.value)} placeholder="1000" /></div>
        <div className="flex items-end"><Button type="button" className="w-full rounded-none md:w-auto" disabled={running || !isSettingEnabled(settings.delivery_russian_post_enabled)} onClick={runTest}>{running ? "Проверяем..." : "Проверить интеграцию"}</Button></div>
      </div>
      {russianPostResult?.quote && (
        <div className="rounded-none border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Проверка прошла: отправитель `{russianPostResult.fromPostalCode || "—"}`, индекс назначения `{russianPostResult.destinationPostalCode || "—"}`, доставка в отделение {russianPostResult.quote?.pickupPointDelivery?.available ? `доступна (${formatRub(russianPostResult.quote?.pickupPointDelivery?.estimatedCost)}, срок ${russianPostResult.quote?.pickupPointDelivery?.deliveryDays ?? "—"} дн.)` : "не найдена"}, доставка до двери {russianPostResult.quote?.homeDelivery?.available ? `доступна (${formatRub(russianPostResult.quote?.homeDelivery?.estimatedCost)}, срок ${russianPostResult.quote?.homeDelivery?.deliveryDays ?? "—"} дн.)` : "не настроена для выбранного MailType"}, найдено отделений: {Array.isArray(russianPostResult.pickupPoints) ? russianPostResult.pickupPoints.length : 0}.
        </div>
      )}
      <ResultBox error={error} result={result} />
    </div>
  );
}

export function AdminAvitoIntegrationTab({ settings, updateSetting }: IntegrationProps) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const issues = useMemo(() => getAvitoIssues(settings), [settings]);
  const avitoResult = result && typeof result === "object" ? result as {
    tokenEndpointReachable?: boolean;
    tokenIssued?: boolean;
    scope?: string;
    detail?: string;
    note?: string;
  } : null;

  const runTest = async () => {
    setRunning(true);
    setError("");
    try {
      setResult(await FLOW.adminTestAvitoDelivery({ input: { enabled: isSettingEnabled(settings.delivery_avito_enabled), clientId: settings.delivery_avito_client_id || "", clientSecret: settings.delivery_avito_client_secret || "", scope: settings.delivery_avito_scope || "items:info", warehouseAddress: settings.delivery_avito_warehouse_address || "", notes: settings.delivery_avito_notes || "" } }));
    } catch (nextError) {
      setResult(null);
      setError(getErrorMessage(nextError, "Не удалось проверить Avito OAuth."));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-w-0 space-y-3 overflow-hidden border p-3">
      <div className="flex items-start gap-2"><Checkbox id="delivery-avito-enabled" checked={isSettingEnabled(settings.delivery_avito_enabled)} onCheckedChange={(checked) => updateSetting("delivery_avito_enabled", checked ? "true" : "false")} /><Label htmlFor="delivery-avito-enabled" className="leading-snug">Включить Avito</Label></div>
      <IssueBox enabled={isSettingEnabled(settings.delivery_avito_enabled)} issues={issues} summary="Проверка официального OAuth endpoint Avito и подготовка к партнерскому delivery-контуру при наличии публичной спецификации." />
      <HelpBox title="Как настроить Avito">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Заполните `Client ID` и `Client Secret` из кабинета разработчика Avito.</li>
          <li>Публичной универсальной тестовой пары `client_id/client_secret` Avito не выдает, поэтому выпуск токена возможен только для вашего приложения.</li>
          <li>При необходимости укажите `scope` и адрес склада для внутренней привязки настроек.</li>
          <li>После изменения полей нажмите кнопку сохранения текущего раздела внизу страницы, затем запустите OAuth test.</li>
          <li>Этот тест проверяет только доступность OAuth-контура и учетные данные.</li>
          <li>Успешный OAuth test сам по себе не включает расчет доставки Avito в checkout, потому что публичный storefront delivery API в текущем проекте не подключен.</li>
        </ol>
      </HelpBox>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="delivery-avito-client-id">Client ID</Label><NoAutofillInput id="delivery-avito-client-id" name="integration-avito-client-id" value={settings.delivery_avito_client_id || ""} onChange={(event) => updateSetting("delivery_avito_client_id", event.target.value)} placeholder="ID приложения Avito" /></div>
        <div className="space-y-1"><Label htmlFor="delivery-avito-client-secret">Client Secret</Label><NoAutofillInput id="delivery-avito-client-secret" name="integration-avito-client-secret" type="password" autoComplete="new-password" value={settings.delivery_avito_client_secret || ""} onChange={(event) => updateSetting("delivery_avito_client_secret", event.target.value)} placeholder="Секрет приложения Avito" /></div>
        <div className="space-y-1"><Label htmlFor="delivery-avito-scope">OAuth scope</Label><Input id="delivery-avito-scope" value={settings.delivery_avito_scope || "items:info"} onChange={(event) => updateSetting("delivery_avito_scope", event.target.value)} placeholder="items:info" /></div>
        <div className="space-y-1">
          <Label htmlFor="delivery-avito-address">Адрес склада</Label>
          <AddressAutocompleteInput
            id="delivery-avito-address"
            name="delivery_avito_warehouse_address"
            value={settings.delivery_avito_warehouse_address || ""}
            onValueChange={(nextValue) => updateSetting("delivery_avito_warehouse_address", nextValue)}
            placeholder="Новосибирск, Красный проспект, 25"
            inputClassName="rounded-none"
            suggestionsClassName="rounded-none"
          />
        </div>
        <div className="space-y-1 md:col-span-2"><Label htmlFor="delivery-avito-notes">Примечание</Label><Textarea id="delivery-avito-notes" value={settings.delivery_avito_notes || ""} onChange={(event) => updateSetting("delivery_avito_notes", event.target.value)} rows={4} /></div>
      </div>
      {avitoResult?.tokenEndpointReachable && (
        <div className={`rounded-none border p-3 text-sm ${avitoResult.tokenIssued ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          Проверка завершена: OAuth endpoint доступен, token {avitoResult.tokenIssued ? "получен" : "не получен"}, scope `{avitoResult.scope || "—"}`.
          {avitoResult.detail ? ` ${avitoResult.detail}` : ""}
          {avitoResult.note ? ` ${avitoResult.note}` : ""}
        </div>
      )}
      <Button type="button" className="w-full rounded-none md:w-auto" disabled={running || !isSettingEnabled(settings.delivery_avito_enabled)} onClick={runTest}>{running ? "Проверяем..." : "Проверить OAuth и доступность контура"}</Button>
      <ResultBox error={error} result={result} />
    </div>
  );
}
