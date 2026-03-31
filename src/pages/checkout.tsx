import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';

import AddressAutocompleteInput from '@/components/AddressAutocompleteInput';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import PageSeo from '@/components/PageSeo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Authenticated, useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { FLOW } from '@/lib/api-mapping';
import { formatProductPrice } from '@/lib/price-format';
import { fetchPublicSettings } from '@/lib/site-settings';
import { cn } from '@/lib/utils';
import { getOrCreateVisitorId } from '@/lib/visitor-id';
import {
  getRoboKassaCapabilities,
  getYooKassaCapabilities,
  getYooMoneyCapabilities,
  isSettingEnabled,
  submitHostedCheckout,
} from '@/lib/yoomoney';
import { toast } from 'sonner';

type DeliveryMethod = 'home' | 'pickup' | 'self_pickup';
type ManagedDeliveryMethod = Exclude<DeliveryMethod, 'self_pickup'>;
type StatusTone = 'success' | 'warning' | 'danger' | 'muted';

interface DeliveryQuoteOption {
  available?: boolean;
  estimatedCost?: number | null;
  deliveryDays?: number | null;
  tariff?: string | null;
  error?: string | null;
}

interface PickupPointOption {
  id: string;
  name?: string;
  address?: string;
  instruction?: string | null;
  distanceKm?: number | null;
  available?: boolean;
  estimatedCost?: number | null;
  deliveryDays?: number | null;
  error?: string | null;
  paymentMethods?: string[] | null;
}

interface DeliveryProviderQuote {
  provider?: string;
  label?: string;
  currency?: string;
  homeDelivery?: DeliveryQuoteOption | null;
  pickupPointDelivery?: DeliveryQuoteOption | null;
  details?: Record<string, string> | null;
}

interface DeliveryProvidersResponse {
  toAddress?: string;
  providers?: DeliveryProviderQuote[] | null;
}

interface DeliveryProviderConfig {
  provider: string;
  label: string;
  enabled: boolean;
  ready: boolean;
  supportsHome: boolean;
  supportsPickup: boolean;
  pickupTitle: string;
}

interface CheckoutPaymentOption {
  id: string;
  value: string;
  title: string;
  badge: string;
  subtitle: string;
  enabled: boolean;
  working: boolean;
  statusLabel: string;
  statusTone: StatusTone;
  statusDescription: string;
}

interface CheckoutDeliveryCard {
  key: string;
  provider: string;
  providerLabel: string;
  method: ManagedDeliveryMethod;
  title: string;
  quote: DeliveryQuoteOption | null;
  providerQuote: DeliveryProviderQuote | null;
  available: boolean;
  disabled: boolean;
  priceLabel: string;
  summary: string;
  statusLabel: string;
  statusTone: StatusTone;
  statusDescription: string;
  deliveryDaysLabel: string | null;
  caption: string | null;
}

interface PromoCodeValidationResult {
  code: string;
  description?: string | null;
  discountType?: string | null;
  discountValue?: number | null;
  minimumSubtotal?: number | null;
  maximumDiscountAmount?: number | null;
  discountAmount?: number | null;
  discountedSubtotal?: number | null;
}

const DELIVERY_CALCULATION_ERROR_MESSAGE = 'Не удалось выполнить расчет стоимости доставки.';
const STATUS_TONE_CLASS_NAMES: Record<StatusTone, string> = {
  success: 'border-emerald-700 bg-emerald-700 text-white',
  warning: 'border-amber-700 bg-amber-50 text-amber-900',
  danger: 'border-red-700 bg-red-50 text-red-900',
  muted: 'border-black/15 bg-white text-muted-foreground',
};

const formatDeliveryDays = (days?: number | null) => {
  if (!Number.isFinite(Number(days)) || Number(days) <= 0) {
    return null;
  }

  const normalizedDays = Number(days);
  return normalizedDays === 1 ? '1 день' : `${normalizedDays} дн.`;
};

const formatPickupDistance = (distanceKm?: number | null) => {
  if (!Number.isFinite(Number(distanceKm)) || Number(distanceKm) <= 0) {
    return null;
  }

  return `${Number(distanceKm).toFixed(1)} км`;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallback;
};

const normalizeDeliveryError = (error?: string | null) => String(error || '').trim();

const getVisibleDeliveryError = (
  error: string | null | undefined,
  isAdmin: boolean,
  fallback = DELIVERY_CALCULATION_ERROR_MESSAGE,
) => {
  const normalized = normalizeDeliveryError(error);
  if (isAdmin) {
    return normalized || fallback;
  }

  return fallback;
};

const isProviderTestEnvironment = (provider?: DeliveryProviderQuote | null) => {
  const environment = String(provider?.details?.environment || '').trim().toLowerCase();
  const testEnvironment = String(provider?.details?.testEnvironment || '').trim().toLowerCase();
  return environment === 'test' || testEnvironment === 'true';
};

const getDeliveryProviderCaption = (provider?: DeliveryProviderQuote | null) => {
  const label = String(provider?.label || provider?.provider || '').trim();
  if (!label) {
    return null;
  }

  const quoteSource = String(provider?.details?.quoteSource || '').trim().toLowerCase();

  if (provider?.provider === 'russian_post') {
    return `${label} · официальный API`;
  }

  if (provider?.provider === 'cdek' && quoteSource === 'training_fallback') {
    return `${label} · учебный контур (demo тарифы)`;
  }

  return isProviderTestEnvironment(provider)
    ? `${label} · учебный контур`
    : label;
};

interface PaymentOptionCardProps {
  id: string;
  value: string;
  currentValue: string;
  title: string;
  badge: string;
  subtitle?: string;
  statusLabel?: string;
  statusTone?: StatusTone;
  statusDescription?: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
}

const PaymentOptionCard = ({
  id,
  value,
  currentValue,
  title,
  badge,
  subtitle,
  statusLabel,
  statusTone = 'muted',
  statusDescription,
  disabled = false,
  onSelect,
}: PaymentOptionCardProps) => {
  const isSelected = currentValue === value;

  return (
    <button
      type="button"
      className={cn(
        'w-full rounded-none border p-4 text-left transition',
        isSelected
          ? 'border-black bg-[linear-gradient(180deg,#faf6ee_0%,#f1e9db_100%)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08),0_10px_24px_rgba(0,0,0,0.06)]'
          : disabled
            ? 'cursor-not-allowed border-gray-200 bg-white opacity-50'
            : 'cursor-pointer border-black/20 bg-white hover:border-black/50',
      )}
      onClick={disabled ? undefined : () => onSelect(value)}
      disabled={disabled}
      role="radio"
      aria-checked={isSelected}
      aria-disabled={disabled}
    >
      <div className="flex items-start gap-3">
        <span
          id={id}
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border transition',
            isSelected ? 'border-black' : 'border-primary',
            disabled ? 'opacity-50' : '',
          )}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full transition',
              isSelected ? 'bg-black' : 'bg-transparent',
            )}
          />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={cn('font-bold', isSelected ? 'text-black' : '')}>{title}</span>
            <span
              className={cn(
                'text-xs uppercase tracking-[0.2em]',
                isSelected
                  ? 'inline-flex items-center border border-black bg-black px-2 py-1 font-bold text-white'
                  : 'text-muted-foreground',
              )}
            >
              {isSelected ? 'Выбрано' : badge}
            </span>
          </div>
          {subtitle ? (
            <p className={cn('text-sm text-muted-foreground', isSelected ? 'text-black/70' : '')}>{subtitle}</p>
          ) : null}
          {(statusLabel || statusDescription) ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {statusLabel ? (
                <span
                  className={cn(
                    'inline-flex items-center border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em]',
                    STATUS_TONE_CLASS_NAMES[statusTone],
                  )}
                >
                  {statusLabel}
                </span>
              ) : null}
              {statusDescription ? (
                <span className={cn('text-xs', isSelected ? 'text-black/60' : 'text-muted-foreground')}>
                  {statusDescription}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
};

interface DeliveryOptionIndicatorProps {
  selected: boolean;
  disabled?: boolean;
}

const DeliveryOptionIndicator = ({ selected, disabled = false }: DeliveryOptionIndicatorProps) => (
  <span
    aria-hidden="true"
    className={cn(
      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition',
      selected ? 'border-black' : 'border-primary',
      disabled ? 'opacity-50' : '',
    )}
  >
    <span
      className={cn(
        'h-2 w-2 rounded-full transition',
        selected ? 'bg-black' : 'bg-transparent',
      )}
    />
  </span>
);

export default function CheckoutPage() {
  const { cartItems, totalItems, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = Boolean(user?.isAdmin);

  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [selectedDeliveryMethod, setSelectedDeliveryMethod] = useState<DeliveryMethod>('self_pickup');
  const [selectedDeliveryProviderCode, setSelectedDeliveryProviderCode] = useState<string | null>(null);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoCodeLoading, setPromoCodeLoading] = useState(false);
  const [promoCodeError, setPromoCodeError] = useState('');
  const [appliedPromoCode, setAppliedPromoCode] = useState<PromoCodeValidationResult | null>(null);
  const [publicSettings, setPublicSettings] = useState<Record<string, string>>({});
  const [yooMoneyCapabilities, setYooMoneyCapabilities] = useState(() => ({
    enabled: false,
    ready: false,
    allowBankCards: false,
    allowWallet: false,
    hasAnyMethod: false,
  }));
  const [yooKassaCapabilities, setYooKassaCapabilities] = useState(() => ({
    enabled: false,
    allowBankCards: false,
    allowSbp: false,
    allowYooMoney: false,
    hasAnyMethod: false,
  }));
  const [roboKassaCapabilities, setRoboKassaCapabilities] = useState(() => ({
    enabled: false,
    ready: false,
    hasAnyMethod: false,
  }));
  const [isManagedDeliveryEnabled, setIsManagedDeliveryEnabled] = useState(true);

  const [homeDeliveryLoading, setHomeDeliveryLoading] = useState(false);
  const [deliveryProviders, setDeliveryProviders] = useState<DeliveryProviderQuote[]>([]);
  const [deliveryCalculationError, setDeliveryCalculationError] = useState('');

  const [pickupPointsLoading, setPickupPointsLoading] = useState(false);
  const [pickupPointsError, setPickupPointsError] = useState('');
  const [pickupPoints, setPickupPoints] = useState<PickupPointOption[]>([]);
  const [selectedPickupPointId, setSelectedPickupPointId] = useState('');
  const [pickupDeliveryLoading, setPickupDeliveryLoading] = useState(false);

  const [products, setProducts] = useState<Record<string, any>>({});
  const [profileVerification, setProfileVerification] = useState(() => ({
    emailVerified: false,
    phoneVerified: false,
    hasConfirmedContact: false,
  }));

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await FLOW.getAllProducts({ input: {} });
        if (Array.isArray(res)) {
          const map: Record<string, any> = {};
          res.forEach((product: any) => {
            map[product._id] = product;
          });
          setProducts(map);
        }
      } catch {
        console.error('Failed to fetch products');
      }
    };

    fetchProducts();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPublicSettings = async () => {
      try {
        const settings = await fetchPublicSettings();
        if (!cancelled) {
          setPublicSettings(settings && typeof settings === 'object' ? settings as Record<string, string> : {});
          setYooMoneyCapabilities(getYooMoneyCapabilities(settings));
          setYooKassaCapabilities(getYooKassaCapabilities(settings));
          setRoboKassaCapabilities(getRoboKassaCapabilities(settings));
          setIsManagedDeliveryEnabled(
            isSettingEnabled(settings?.yandex_delivery_enabled, true)
            || isSettingEnabled(settings?.delivery_cdek_enabled)
            || isSettingEnabled(settings?.delivery_russian_post_enabled)
            || isSettingEnabled(settings?.delivery_avito_enabled),
          );
        }
      } catch {
        if (!cancelled) {
          setPublicSettings({});
          setYooMoneyCapabilities(getYooMoneyCapabilities({}));
          setYooKassaCapabilities(getYooKassaCapabilities({}));
          setRoboKassaCapabilities(getRoboKassaCapabilities({}));
          setIsManagedDeliveryEnabled(true);
        }
      }
    };

    loadPublicSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (![
      'yoomoney',
      'yoomoney_card',
      'yoomoney_wallet',
      'yookassa',
      'yookassa_card',
      'yookassa_sbp',
      'yookassa_yoomoney',
      'robokassa',
    ].includes(paymentMethod)) {
      return;
    }

    const methodStillAvailable = (
      (paymentMethod === 'yoomoney_card' && yooMoneyCapabilities.allowBankCards)
      || (paymentMethod === 'yoomoney_wallet' && yooMoneyCapabilities.allowWallet)
      || (paymentMethod === 'yoomoney' && yooMoneyCapabilities.hasAnyMethod)
      || (paymentMethod === 'yookassa_card' && yooKassaCapabilities.allowBankCards)
      || (paymentMethod === 'yookassa_sbp' && yooKassaCapabilities.allowSbp)
      || (paymentMethod === 'yookassa_yoomoney' && yooKassaCapabilities.allowYooMoney)
      || (paymentMethod === 'yookassa' && yooKassaCapabilities.hasAnyMethod)
      || (paymentMethod === 'robokassa' && roboKassaCapabilities.hasAnyMethod)
    );

    if (!methodStillAvailable) {
      setPaymentMethod('cod');
    }
  }, [paymentMethod, roboKassaCapabilities, yooKassaCapabilities, yooMoneyCapabilities]);

  useEffect(() => {
    let cancelled = false;

    const hydrateProfile = async () => {
      try {
        const profile = await FLOW.getProfile({ input: {} });
        if (!profile || cancelled) {
          return;
        }

        setName((prev) => prev || profile.name || '');
        setEmail((prev) => prev || profile.email || '');
        setPhone((prev) => prev || profile.phone || '');
        setAddress((prev) => prev || profile.shippingAddress || '');
        setProfileVerification({
          emailVerified: !!profile.emailVerified,
          phoneVerified: !!profile.phoneVerified,
          hasConfirmedContact: !!profile.hasConfirmedContact || !!profile.emailVerified || !!profile.phoneVerified,
        });
      } catch {
        // Keep checkout available even if profile prefill fails.
      }
    };

    hydrateProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  const subtotal = cartItems.reduce((sum, item) => {
    const product = products[item.productId];
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);

  const hasUnavailableItems = cartItems.some((item) => {
    const product = products[item.productId];
    if (!product?.sizeStock) return false;
    return (product.sizeStock[item.size] ?? 0) < item.quantity;
  });

  const requestedWeightKg = Math.max(0.3, Number((totalItems * 0.3).toFixed(3)));
  const promoDiscount = Math.min(subtotal, Number(appliedPromoCode?.discountAmount ?? 0));
  const hasConfirmedContact = profileVerification.hasConfirmedContact
    || profileVerification.emailVerified
    || profileVerification.phoneVerified;
  const yoomoneyBankCardsEnabled = isSettingEnabled(publicSettings?.yoomoney_allow_bank_cards);
  const yoomoneyWalletEnabled = isSettingEnabled(publicSettings?.yoomoney_allow_wallet);
  const yookassaBankCardsEnabled = isSettingEnabled(publicSettings?.yookassa_allow_bank_cards, true);
  const yookassaSbpEnabled = isSettingEnabled(publicSettings?.yookassa_allow_sbp, true);
  const yookassaYooMoneyEnabled = isSettingEnabled(publicSettings?.yookassa_allow_yoomoney, true);

  const resolvePaymentStatus = (
    providerEnabled: boolean,
    providerReady: boolean,
    methodEnabled: boolean,
    working: boolean,
  ) => {
    if (working) {
      return {
        label: 'Работает',
        tone: 'success' as const,
        description: 'Метод доступен для оформления заказа.',
      };
    }

    if (!providerEnabled) {
      return {
        label: 'Отключено',
        tone: 'muted' as const,
        description: 'Интеграция выключена в публичных настройках.',
      };
    }

    if (!providerReady) {
      return {
        label: 'Не готово',
        tone: 'warning' as const,
        description: 'Интеграция включена, но еще не готова для публичного checkout.',
      };
    }

    if (!methodEnabled) {
      return {
        label: 'Метод выключен',
        tone: 'muted' as const,
        description: 'Этот способ отключен в настройках платежного провайдера.',
      };
    }

    return {
      label: 'Недоступно',
      tone: 'danger' as const,
      description: 'Сейчас этот способ оплаты не может принять заказ.',
    };
  };

  const codPaymentStatus = {
    label: 'Работает',
    tone: 'success' as const,
    description: 'Базовый способ оплаты всегда доступен для оформления.',
  };
  const yooMoneyCardStatus = resolvePaymentStatus(
    yooMoneyCapabilities.enabled,
    yooMoneyCapabilities.ready,
    yoomoneyBankCardsEnabled,
    yooMoneyCapabilities.allowBankCards,
  );
  const yooMoneyWalletStatus = resolvePaymentStatus(
    yooMoneyCapabilities.enabled,
    yooMoneyCapabilities.ready,
    yoomoneyWalletEnabled,
    yooMoneyCapabilities.allowWallet,
  );
  const yooKassaCardStatus = resolvePaymentStatus(
    yooKassaCapabilities.enabled,
    yooKassaCapabilities.ready,
    yookassaBankCardsEnabled,
    yooKassaCapabilities.allowBankCards,
  );
  const yooKassaSbpStatus = resolvePaymentStatus(
    yooKassaCapabilities.enabled,
    yooKassaCapabilities.ready,
    yookassaSbpEnabled,
    yooKassaCapabilities.allowSbp,
  );
  const yooKassaYooMoneyStatus = resolvePaymentStatus(
    yooKassaCapabilities.enabled,
    yooKassaCapabilities.ready,
    yookassaYooMoneyEnabled,
    yooKassaCapabilities.allowYooMoney,
  );
  const roboKassaStatus = resolvePaymentStatus(
    roboKassaCapabilities.enabled,
    roboKassaCapabilities.ready,
    roboKassaCapabilities.enabled,
    roboKassaCapabilities.hasAnyMethod,
  );

  const paymentOptions: CheckoutPaymentOption[] = [
    {
      id: 'payment-cod',
      value: 'cod',
      title: 'Оплата при получении',
      badge: 'При получении',
      subtitle: 'Оплатите заказ при получении или примерке.',
      enabled: true,
      working: true,
      statusLabel: codPaymentStatus.label,
      statusTone: codPaymentStatus.tone,
      statusDescription: codPaymentStatus.description,
    },
    {
      id: 'payment-yoomoney-card',
      value: 'yoomoney_card',
      title: 'ЮMoney: банковская карта',
      badge: 'Онлайн',
      subtitle: 'Откроем защищенную форму ЮMoney и после оплаты вернем вас в личный кабинет.',
      enabled: yooMoneyCapabilities.enabled,
      working: yooMoneyCapabilities.allowBankCards,
      statusLabel: yooMoneyCardStatus.label,
      statusTone: yooMoneyCardStatus.tone,
      statusDescription: yooMoneyCardStatus.description,
    },
    {
      id: 'payment-yoomoney-wallet',
      value: 'yoomoney_wallet',
      title: 'ЮMoney: кошелек',
      badge: 'Онлайн',
      subtitle: 'Оплата через кошелек ЮMoney с подтверждением на стороне сервиса.',
      enabled: yooMoneyCapabilities.enabled,
      working: yooMoneyCapabilities.allowWallet,
      statusLabel: yooMoneyWalletStatus.label,
      statusTone: yooMoneyWalletStatus.tone,
      statusDescription: yooMoneyWalletStatus.description,
    },
    {
      id: 'payment-yookassa-card',
      value: 'yookassa_card',
      title: 'YooKassa: банковская карта',
      badge: 'Онлайн',
      subtitle: 'Переход на защищенную страницу YooKassa для оплаты банковской картой.',
      enabled: yooKassaCapabilities.enabled,
      working: yooKassaCapabilities.allowBankCards,
      statusLabel: yooKassaCardStatus.label,
      statusTone: yooKassaCardStatus.tone,
      statusDescription: yooKassaCardStatus.description,
    },
    {
      id: 'payment-yookassa-sbp',
      value: 'yookassa_sbp',
      title: 'YooKassa: СБП',
      badge: 'Онлайн',
      subtitle: 'Оплата через СБП на защищенной странице YooKassa.',
      enabled: yooKassaCapabilities.enabled,
      working: yooKassaCapabilities.allowSbp,
      statusLabel: yooKassaSbpStatus.label,
      statusTone: yooKassaSbpStatus.tone,
      statusDescription: yooKassaSbpStatus.description,
    },
    {
      id: 'payment-yookassa-yoomoney',
      value: 'yookassa_yoomoney',
      title: 'YooKassa: ЮMoney',
      badge: 'Онлайн',
      subtitle: 'Оплата ЮMoney внутри платежной страницы YooKassa.',
      enabled: yooKassaCapabilities.enabled,
      working: yooKassaCapabilities.allowYooMoney,
      statusLabel: yooKassaYooMoneyStatus.label,
      statusTone: yooKassaYooMoneyStatus.tone,
      statusDescription: yooKassaYooMoneyStatus.description,
    },
    {
      id: 'payment-robokassa',
      value: 'robokassa',
      title: 'RoboKassa',
      badge: 'Онлайн',
      subtitle: 'Переход на защищенную платежную форму RoboKassa с возвратом в личный кабинет после оплаты.',
      enabled: roboKassaCapabilities.enabled,
      working: roboKassaCapabilities.hasAnyMethod,
      statusLabel: roboKassaStatus.label,
      statusTone: roboKassaStatus.tone,
      statusDescription: roboKassaStatus.description,
    },
  ];

  const visiblePaymentOptions = paymentOptions.filter((option) => (
    option.value === 'cod'
      || (isAdmin ? true : option.working)
  ));

  useEffect(() => {
    if (!isManagedDeliveryEnabled || !address.trim() || subtotal <= 0) {
      setHomeDeliveryLoading(false);
      setDeliveryProviders([]);
      setDeliveryCalculationError('');
      setPickupDeliveryLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setHomeDeliveryLoading(true);
      setPickupDeliveryLoading(true);
      setDeliveryCalculationError('');

      try {
        const res = await FLOW.deliveryCalculate({
          input: {
            toAddress: address,
            weightKg: requestedWeightKg,
            declaredCost: subtotal,
            paymentMethod,
          },
        });

        if (cancelled) {
          return;
        }

        const nextResponse = (res || null) as DeliveryProvidersResponse | null;
        const nextProviders = Array.isArray(nextResponse?.providers) ? nextResponse.providers : [];
        setDeliveryProviders(nextProviders);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setDeliveryProviders([]);
        setDeliveryCalculationError(getErrorMessage(error, DELIVERY_CALCULATION_ERROR_MESSAGE));
      } finally {
        if (!cancelled) {
          setHomeDeliveryLoading(false);
          setPickupDeliveryLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [address, isManagedDeliveryEnabled, paymentMethod, requestedWeightKg, subtotal]);

  const deliveryProviderConfigs: DeliveryProviderConfig[] = [
    {
      provider: 'yandex_delivery',
      label: 'Яндекс Доставка',
      enabled: isSettingEnabled(publicSettings?.yandex_delivery_enabled, true),
      ready: true,
      supportsHome: true,
      supportsPickup: true,
      pickupTitle: 'Пункт выдачи',
    },
    {
      provider: 'cdek',
      label: 'СДЭК',
      enabled: isSettingEnabled(publicSettings?.delivery_cdek_enabled),
      ready: isSettingEnabled(publicSettings?.delivery_cdek_ready),
      supportsHome: true,
      supportsPickup: true,
      pickupTitle: 'ПВЗ',
    },
    {
      provider: 'russian_post',
      label: 'Почта России',
      enabled: isSettingEnabled(publicSettings?.delivery_russian_post_enabled),
      ready: isSettingEnabled(publicSettings?.delivery_russian_post_ready),
      supportsHome: true,
      supportsPickup: true,
      pickupTitle: 'Отделение',
    },
    {
      provider: 'avito',
      label: 'Avito',
      enabled: isSettingEnabled(publicSettings?.delivery_avito_enabled),
      ready: isSettingEnabled(publicSettings?.delivery_avito_ready),
      supportsHome: false,
      supportsPickup: false,
      pickupTitle: 'Пункт выдачи',
    },
  ];

  const deliveryProviderMap = new Map(
    deliveryProviders.map((provider) => [String(provider.provider || '').trim().toLowerCase(), provider] as const),
  );
  const isDeliveryCalculationPending = (homeDeliveryLoading || pickupDeliveryLoading) && Boolean(address.trim());

  const buildDeliveryCard = (
    config: DeliveryProviderConfig,
    method: ManagedDeliveryMethod,
  ): CheckoutDeliveryCard => {
    const providerQuote = deliveryProviderMap.get(config.provider) || null;
    const quote = method === 'home'
      ? providerQuote?.homeDelivery || null
      : providerQuote?.pickupPointDelivery || null;
    const available = Boolean(quote?.available);
    const optionError = normalizeDeliveryError(quote?.error);
    const title = `${config.label}: ${method === 'home' ? 'до двери' : config.pickupTitle}`;
    const caption = getDeliveryProviderCaption(providerQuote) || config.label;
    const deliveryDaysLabel = available ? formatDeliveryDays(quote?.deliveryDays) : null;

    let priceLabel = 'Недоступно';
    let summary = '';
    let statusLabel = 'Недоступно';
    let statusTone: StatusTone = 'danger';
    let statusDescription = '';

    if (!config.ready) {
      priceLabel = 'Не настроено';
      summary = `${config.label} включен, но публичный checkout еще не готов для расчета.`;
      statusLabel = 'Не готово';
      statusTone = 'warning';
      statusDescription = 'Провайдер включен, но его публичная конфигурация еще не завершена.';
    } else if (!address.trim()) {
      priceLabel = 'Нужен адрес';
      summary = method === 'home'
        ? 'Укажите адрес, чтобы рассчитать стоимость и срок доставки до двери.'
        : 'Укажите адрес, чтобы подобрать ближайшие пункты выдачи.';
      statusLabel = 'Нужен адрес';
      statusTone = 'muted';
      statusDescription = 'Без адреса этот вариант нельзя рассчитать.';
    } else if (available) {
      priceLabel = formatProductPrice(quote?.estimatedCost ?? 0);
      summary = method === 'home'
        ? `Доставка по адресу: ${address}`
        : `Выберите удобный ${config.pickupTitle.toLowerCase()} из списка ниже.`;
      statusLabel = 'Работает';
      statusTone = 'success';
      statusDescription = 'Вариант доступен для оформления заказа.';
    } else if (isDeliveryCalculationPending && !providerQuote) {
      priceLabel = 'Расчет...';
      summary = `Запрашиваем тарифы ${config.label}.`;
      statusLabel = 'Расчет';
      statusTone = 'muted';
      statusDescription = 'Ждем ответ от провайдера.';
    } else if (optionError) {
      priceLabel = 'Недоступно';
      summary = getVisibleDeliveryError(optionError, isAdmin);
      statusLabel = 'Не работает';
      statusTone = 'danger';
      statusDescription = 'Провайдер ответил ошибкой для этого сценария доставки.';
    } else if (!providerQuote && deliveryCalculationError) {
      priceLabel = 'Нет ответа';
      summary = getVisibleDeliveryError(deliveryCalculationError, isAdmin);
      statusLabel = 'Нет ответа';
      statusTone = 'danger';
      statusDescription = 'Общий запрос расчета завершился ошибкой.';
    } else if (!providerQuote) {
      priceLabel = 'Нет ответа';
      summary = isAdmin
        ? `${config.label} включен, но не вернул расчет для этого адреса и способа оплаты.`
        : DELIVERY_CALCULATION_ERROR_MESSAGE;
      statusLabel = 'Нет ответа';
      statusTone = 'danger';
      statusDescription = 'Провайдер не вернул расчет в общем запросе доставки.';
    } else {
      priceLabel = 'Недоступно';
      summary = method === 'home'
        ? 'Служба не вернула доступный вариант доставки до двери.'
        : 'Служба не вернула доступный вариант доставки до пункта выдачи.';
      statusLabel = 'Недоступно';
      statusTone = 'danger';
      statusDescription = 'Провайдер ответил, но этот тип доставки сейчас не доступен.';
    }

    return {
      key: `${config.provider}:${method}`,
      provider: config.provider,
      providerLabel: config.label,
      method,
      title,
      quote,
      providerQuote,
      available,
      disabled: !address.trim() || !available,
      priceLabel,
      summary,
      statusLabel,
      statusTone,
      statusDescription,
      deliveryDaysLabel,
      caption,
    };
  };

  const deliveryCards = deliveryProviderConfigs.flatMap((config) => {
    if (!config.enabled) {
      return [];
    }

    const nextCards: CheckoutDeliveryCard[] = [];
    if (config.supportsHome) {
      nextCards.push(buildDeliveryCard(config, 'home'));
    }

    if (config.supportsPickup) {
      nextCards.push(buildDeliveryCard(config, 'pickup'));
    }

    return nextCards;
  });

  const visibleDeliveryCards = deliveryCards.filter((card) => isAdmin || card.available);
  const adminDeliveryDiagnostics = isAdmin
    ? deliveryProviderConfigs
      .filter((config) => config.enabled && !config.supportsHome && !config.supportsPickup)
      .map((config) => ({
        provider: config.provider,
        label: config.label,
        statusLabel: config.ready ? 'Нет checkout-метода' : 'Не готово',
        statusTone: config.ready ? 'warning' as const : 'danger' as const,
        description: config.ready
          ? `${config.label} включен, но в storefront пока нет подключенного checkout-сценария.`
          : `${config.label} включен, но публичный checkout-контур пока не готов.`,
      }))
    : [];

  useEffect(() => {
    const selectedPickupCard = selectedDeliveryMethod === 'pickup'
      ? deliveryCards.find((card) => card.provider === selectedDeliveryProviderCode && card.method === 'pickup')
      : null;

    if (
      !isManagedDeliveryEnabled
      || !address.trim()
      || subtotal <= 0
      || selectedDeliveryMethod !== 'pickup'
      || !selectedPickupCard?.provider
      || !selectedPickupCard.available
    ) {
      setPickupPointsLoading(false);
      setPickupPoints((current) => (current.length === 0 ? current : []));
      setPickupPointsError((current) => (current ? '' : current));
      setSelectedPickupPointId((current) => (current ? '' : current));
      return;
    }

    let cancelled = false;

    const run = async () => {
      setPickupPointsLoading(true);
      setPickupPointsError('');
      setPickupPoints([]);
      setSelectedPickupPointId('');

      try {
        const response = await FLOW.getDeliveryPickupPoints({
          input: {
            provider: selectedPickupCard.provider,
            toAddress: address,
            limit: 8,
            paymentMethod,
            weightKg: requestedWeightKg,
            declaredCost: subtotal,
          },
        });

        if (cancelled) {
          return;
        }

        const nextPoints = Array.isArray((response as { points?: PickupPointOption[] } | null)?.points)
          ? ((response as { points?: PickupPointOption[] }).points || [])
          : [];

        setPickupPoints(nextPoints);
        setSelectedPickupPointId((current) => {
          const hasCurrent = nextPoints.some((point) => point.id === current);
          if (hasCurrent) {
            return current;
          }

          return nextPoints[0]?.id || '';
        });

        if (nextPoints.length === 0) {
          setPickupPointsError('Службы доставки не нашли доступные пункты выдачи для этого адреса.');
          return;
        }

        setPickupPointsError('');
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPickupPoints([]);
        setSelectedPickupPointId('');
        setPickupPointsError(getErrorMessage(error, DELIVERY_CALCULATION_ERROR_MESSAGE));
      } finally {
        if (!cancelled) {
          setPickupPointsLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [
    address,
    deliveryProviders,
    isManagedDeliveryEnabled,
    paymentMethod,
    publicSettings,
    requestedWeightKg,
    selectedDeliveryMethod,
    selectedDeliveryProviderCode,
    subtotal,
  ]);

  const selectedPickupPoint = pickupPoints.find((point) => point.id === selectedPickupPointId) || null;
  const selfPickupDelivery: DeliveryQuoteOption = {
    available: true,
    estimatedCost: 0,
    deliveryDays: null,
    tariff: 'self_pickup',
    error: null,
  };

  useEffect(() => {
    if (!isManagedDeliveryEnabled) {
      if (selectedDeliveryMethod !== 'self_pickup' || selectedDeliveryProviderCode !== null) {
        setSelectedDeliveryMethod('self_pickup');
        setSelectedDeliveryProviderCode(null);
      }
      return;
    }

    if (selectedDeliveryMethod === 'self_pickup') {
      return;
    }

    const currentSelection = deliveryCards.find((card) => (
      card.provider === selectedDeliveryProviderCode
      && card.method === selectedDeliveryMethod
      && card.available
    ));

    if (currentSelection) {
      return;
    }

    const firstAvailableCard = deliveryCards.find((card) => card.available);
    if (firstAvailableCard) {
      setSelectedDeliveryMethod(firstAvailableCard.method);
      setSelectedDeliveryProviderCode(firstAvailableCard.provider);
      return;
    }

    setSelectedDeliveryMethod('self_pickup');
    setSelectedDeliveryProviderCode(null);
  }, [
    address,
    deliveryProviders,
    isManagedDeliveryEnabled,
    publicSettings,
    selectedDeliveryMethod,
    selectedDeliveryProviderCode,
  ]);

  const selectedManagedDeliveryCard = selectedDeliveryMethod === 'self_pickup'
    ? null
    : deliveryCards.find((card) => (
      card.provider === selectedDeliveryProviderCode
      && card.method === selectedDeliveryMethod
    )) || null;
  const selectedManagedDeliveryQuote = selectedManagedDeliveryCard?.quote || null;
  const selectedDeliveryProvider = selectedManagedDeliveryCard?.providerQuote || null;
  const pickupDelivery = selectedDeliveryMethod === 'pickup' && selectedManagedDeliveryQuote
    ? {
        ...selectedManagedDeliveryQuote,
        estimatedCost: selectedPickupPoint?.estimatedCost ?? selectedManagedDeliveryQuote.estimatedCost,
        deliveryDays: selectedPickupPoint?.deliveryDays ?? selectedManagedDeliveryQuote.deliveryDays,
      }
    : selectedManagedDeliveryQuote;
  const selectedDeliveryOption = selectedDeliveryMethod === 'pickup'
    ? pickupDelivery
    : selectedDeliveryMethod === 'self_pickup'
      ? selfPickupDelivery
      : selectedManagedDeliveryQuote;
  const isPickupSelected = selectedDeliveryMethod === 'pickup';
  const isSelfPickupSelected = selectedDeliveryMethod === 'self_pickup';
  const shipping = Number(selectedDeliveryOption?.estimatedCost ?? 0);
  const total = subtotal - promoDiscount + shipping;
  const visiblePickupPointsError = pickupPointsError
    ? getVisibleDeliveryError(pickupPointsError, isAdmin)
    : '';
  const visibleSelectedDeliveryError = selectedManagedDeliveryCard
    ? getVisibleDeliveryError(
        selectedManagedDeliveryCard.quote?.error
          || (!selectedManagedDeliveryCard.providerQuote ? deliveryCalculationError : '')
          || DELIVERY_CALCULATION_ERROR_MESSAGE,
        isAdmin,
      )
    : '';
  const isShippingLoading = selectedDeliveryMethod === 'pickup'
    ? pickupPointsLoading || pickupDeliveryLoading
    : selectedDeliveryMethod === 'home'
      ? homeDeliveryLoading
      : false;
  const canSubmit = cartItems.length > 0
    && !hasUnavailableItems
    && hasConfirmedContact
    && !loading
    && !promoCodeLoading
    && !isShippingLoading
    && (
      selectedDeliveryMethod === 'self_pickup'
        ? true
        : selectedDeliveryMethod === 'home'
        ? Boolean(selectedManagedDeliveryQuote?.available)
        : Boolean(selectedPickupPoint?.id && pickupDelivery?.available)
    );
  const selectedShippingProvider = selectedDeliveryMethod === 'home'
    ? selectedDeliveryProvider?.provider || selectedDeliveryProviderCode || null
    : selectedDeliveryMethod === 'pickup'
      ? selectedDeliveryProvider?.provider || selectedDeliveryProviderCode || null
      : 'self_pickup';
  const selectedShippingTariff = selectedDeliveryMethod === 'home'
    ? selectedManagedDeliveryQuote?.tariff || null
    : selectedDeliveryMethod === 'pickup'
      ? pickupDelivery?.tariff || null
      : 'self_pickup';
  const selectedDeliveryProviderCaption = selectedDeliveryMethod === 'home'
    ? getDeliveryProviderCaption(selectedDeliveryProvider) || selectedManagedDeliveryCard?.providerLabel || null
    : selectedDeliveryMethod === 'pickup'
      ? getDeliveryProviderCaption(selectedDeliveryProvider) || selectedManagedDeliveryCard?.providerLabel || null
      : 'Самовывоз';

  const resolveSelectedShippingAddress = () => {
    if (selectedDeliveryMethod === 'self_pickup') {
      return 'Самовывоз';
    }

    if (selectedDeliveryMethod === 'pickup' && selectedPickupPoint?.address) {
      return `Пункт выдачи: ${selectedPickupPoint.address}`;
    }

    return address.trim();
  };

  const buildPaymentReturnUrl = () => {
    if (typeof window === 'undefined') {
      return null;
    }

    return `${window.location.origin}/profile?tab=orders`;
  };

  const handleDeliveryMethodSelect = (
    method: DeliveryMethod,
    providerCode: string | null = null,
    disabled = false,
  ) => {
    if (disabled) {
      return;
    }

    setSelectedDeliveryMethod(method);
    setSelectedDeliveryProviderCode(method === 'self_pickup' ? null : providerCode);
  };

  const handleDeliveryMethodKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    method: DeliveryMethod,
    providerCode: string | null = null,
    disabled = false,
  ) => {
    if (disabled) {
      return;
    }

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      setSelectedDeliveryMethod(method);
      setSelectedDeliveryProviderCode(method === 'self_pickup' ? null : providerCode);
    }
  };

  const applyPromoCode = async (rawCode?: string) => {
    const normalizedCode = String(rawCode ?? promoCodeInput).trim().toUpperCase();
    if (!normalizedCode) {
      setPromoCodeError('Введите промокод.');
      setAppliedPromoCode(null);
      return;
    }

    setPromoCodeLoading(true);
    setPromoCodeError('');

    try {
      const result = await FLOW.validatePromoCode({
        input: {
          code: normalizedCode,
          subtotal,
        },
      });

      const nextPromoCode = {
        code: String(result?.code || normalizedCode),
        description: result?.description ?? null,
        discountType: result?.discountType ?? null,
        discountValue: Number(result?.discountValue ?? 0),
        minimumSubtotal: result?.minimumSubtotal ?? null,
        maximumDiscountAmount: result?.maximumDiscountAmount ?? null,
        discountAmount: Number(result?.discountAmount ?? 0),
        discountedSubtotal: Number(result?.discountedSubtotal ?? subtotal),
      } satisfies PromoCodeValidationResult;

      setAppliedPromoCode(nextPromoCode);
      setPromoCodeInput(nextPromoCode.code);
      toast.success(`Промокод ${nextPromoCode.code} применен.`);
    } catch (error) {
      setAppliedPromoCode(null);
      setPromoCodeError(getErrorMessage(error, 'Не удалось проверить промокод.'));
    } finally {
      setPromoCodeLoading(false);
    }
  };

  const removePromoCode = () => {
    setAppliedPromoCode(null);
    setPromoCodeError('');
  };

  useEffect(() => {
    if (!appliedPromoCode?.code) {
      return;
    }

    if (subtotal <= 0) {
      setAppliedPromoCode(null);
      setPromoCodeError('');
      return;
    }

    const validatedSubtotal = Number(appliedPromoCode.discountedSubtotal ?? 0) + Number(appliedPromoCode.discountAmount ?? 0);
    if (Math.abs(validatedSubtotal - subtotal) < 0.01) {
      return;
    }

    let cancelled = false;

    const revalidatePromoCode = async () => {
      setPromoCodeLoading(true);
      setPromoCodeError('');

      try {
        const result = await FLOW.validatePromoCode({
          input: {
            code: appliedPromoCode.code,
            subtotal,
          },
        });

        if (cancelled) {
          return;
        }

        setAppliedPromoCode({
          code: String(result?.code || appliedPromoCode.code),
          description: result?.description ?? null,
          discountType: result?.discountType ?? null,
          discountValue: Number(result?.discountValue ?? 0),
          minimumSubtotal: result?.minimumSubtotal ?? null,
          maximumDiscountAmount: result?.maximumDiscountAmount ?? null,
          discountAmount: Number(result?.discountAmount ?? 0),
          discountedSubtotal: Number(result?.discountedSubtotal ?? subtotal),
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setAppliedPromoCode(null);
        setPromoCodeError(getErrorMessage(error, 'Промокод больше не подходит к текущему заказу.'));
      } finally {
        if (!cancelled) {
          setPromoCodeLoading(false);
        }
      }
    };

    void revalidatePromoCode();

    return () => {
      cancelled = true;
    };
  }, [appliedPromoCode?.code, subtotal]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (cartItems.length === 0) {
      toast.error('Ваша корзина пуста');
      return;
    }

    if (hasUnavailableItems) {
      toast.error('В корзине есть товары без достаточного остатка. Обновите количество.');
      return;
    }

    if (!hasConfirmedContact) {
      toast.error('Подтвердите email или телефон в профиле перед оформлением заказа.');
      return;
    }

    if ((selectedDeliveryMethod === 'home' || selectedDeliveryMethod === 'pickup') && !address.trim()) {
      toast.error('Укажите адрес для расчета доставки.');
      return;
    }

    if (selectedDeliveryMethod === 'pickup' && !selectedPickupPoint?.id) {
      toast.error('Выберите доступный пункт выдачи из списка.');
      return;
    }

    if (!selectedDeliveryOption?.available) {
      toast.error(visibleSelectedDeliveryError || DELIVERY_CALCULATION_ERROR_MESSAGE);
      return;
    }

    setLoading(true);

    try {
      const visitorId = getOrCreateVisitorId();
      const order = await FLOW.createOrder({
        input: {
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          shippingAddress: resolveSelectedShippingAddress(),
          paymentMethod,
          items: cartItems,
          shippingAmount: shipping,
          shippingMethod: selectedDeliveryMethod,
          shippingProvider: selectedShippingProvider,
          shippingTariff: selectedShippingTariff,
          pickupPointId: selectedPickupPoint?.id || null,
          totalAmount: total,
          paymentReturnUrl: buildPaymentReturnUrl(),
          visitorId,
          promoCode: appliedPromoCode?.code || null,
        },
      });

      await clearCart();

      if (order?.payment?.checkout) {
        toast.success('Заказ создан. Перенаправляем на страницу оплаты.');
        submitHostedCheckout(order.payment.checkout);
        return;
      }

      toast.success('Заказ успешно оформлен');
      navigate('/profile');
    } catch (error) {
      console.error('Checkout failed:', error);
      toast.error(getErrorMessage(error, 'Не удалось оформить заказ. Попробуйте еще раз.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Authenticated>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <PageSeo
          title="Оформление заказа"
          description="Оформление заказа в магазине fashiondemon."
          canonicalPath="/checkout"
          robots="noindex,nofollow"
        />
        <Header />

        <main className="flex-1 container mx-auto px-4 pb-12 pt-24 md:pt-28">
          <h1 className="mb-8 text-4xl font-black uppercase tracking-tighter md:text-5xl">ОФОРМЛЕНИЕ ЗАКАЗА</h1>

          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
            <div>
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="space-y-4">
                  <h2 className="border-b pb-2 text-xl font-bold uppercase tracking-wider">ИНФОРМАЦИЯ О ПОКУПАТЕЛЕ</h2>
                  {!hasConfirmedContact ? (
                    <div className="space-y-3 border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                      <div className="font-bold uppercase tracking-[0.18em]">Нужно подтверждение контакта</div>
                      <p>Оформление заказа доступно только после подтверждения email или телефона в профиле.</p>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-none border-red-300 bg-white text-red-900 hover:bg-red-100"
                        onClick={() => navigate('/profile?tab=settings')}
                      >
                        Открыть профиль
                      </Button>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Полное имя</Label>
                      <Input
                        id="name"
                        name="name"
                        autoComplete="name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        className="rounded-none border-black focus-visible:ring-black"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        className="rounded-none border-black focus-visible:ring-black"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Телефон</Label>
                    <Input
                      id="phone"
                      name="tel"
                      type="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      required
                      className="rounded-none border-black focus-visible:ring-black"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="border-b pb-2 text-xl font-bold uppercase tracking-wider">АДРЕС ДЛЯ РАСЧЕТА ДОСТАВКИ</h2>
                  <div className="space-y-2">
                    <Label htmlFor="checkout-address">Адрес доставки</Label>
                    <AddressAutocompleteInput
                      id="checkout-address"
                      name="street-address"
                      value={address}
                      onValueChange={(nextValue) => setAddress(nextValue)}
                      inputClassName="rounded-none border-black focus-visible:ring-black"
                      placeholder="Начните вводить адрес"
                    />
                    <p className="text-sm text-muted-foreground">
                      {isManagedDeliveryEnabled
                        ? 'Для доставки до двери и в пункт выдачи укажите адрес. Для самовывоза поле можно оставить пустым.'
                        : 'Онлайн-интеграции доставки сейчас отключены. Для самовывоза адрес можно не указывать.'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="border-b pb-2 text-xl font-bold uppercase tracking-wider">СПОСОБ ОПЛАТЫ</h2>
                  {isAdmin ? (
                    <p className="text-sm text-muted-foreground">
                      Для администратора показаны все способы оплаты, включая отключенные и неготовые. Покупателю видны только рабочие варианты.
                    </p>
                  ) : null}
                  <div className="space-y-3" role="radiogroup" aria-label="Способ оплаты">
                    {visiblePaymentOptions.map((option) => (
                      <PaymentOptionCard
                        key={option.id}
                        id={option.id}
                        value={option.value}
                        currentValue={paymentMethod}
                        onSelect={setPaymentMethod}
                        title={option.title}
                        badge={option.badge}
                        subtitle={option.subtitle}
                        disabled={!option.working}
                        statusLabel={isAdmin ? option.statusLabel : undefined}
                        statusTone={option.statusTone}
                        statusDescription={isAdmin ? option.statusDescription : undefined}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 border-b pb-2">
                    <h2 className="text-xl font-bold uppercase tracking-wider">СПОСОБ ДОСТАВКИ</h2>
                    {isShippingLoading && <span className="text-sm text-muted-foreground">Расчет...</span>}
                  </div>

                  {!isManagedDeliveryEnabled ? (
                    <p className="text-sm text-muted-foreground">
                      Онлайн-интеграции доставки отключены, поэтому сейчас доступен только самовывоз.
                    </p>
                  ) : !address.trim() && (
                    <p className="text-sm text-muted-foreground">
                      Для доставки до двери и ПВЗ сначала укажите адрес. Самовывоз доступен без адреса.
                    </p>
                  )}
                  {isAdmin ? (
                    <p className="text-sm text-muted-foreground">
                      Для администратора показаны все включенные службы доставки и их статус. Покупателю видны только рабочие варианты.
                    </p>
                  ) : null}

                  <div className="grid gap-2" role="radiogroup" aria-label="Способ доставки">
                    <div
                      role="radio"
                      aria-checked={isSelfPickupSelected}
                      aria-labelledby="checkout-delivery-self-pickup-label"
                      tabIndex={0}
                      className={cn(
                        'space-y-3 rounded-none border p-4 transition',
                        isSelfPickupSelected
                          ? 'border-black bg-[linear-gradient(180deg,#faf6ee_0%,#f1e9db_100%)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08),0_10px_24px_rgba(0,0,0,0.06)]'
                          : 'cursor-pointer border-gray-200 hover:border-black/40',
                      )}
                      onClick={() => handleDeliveryMethodSelect('self_pickup')}
                      onKeyDown={(event) => handleDeliveryMethodKeyDown(event, 'self_pickup')}
                    >
                      <div className="flex items-start gap-3">
                        <DeliveryOptionIndicator selected={isSelfPickupSelected} />
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span id="checkout-delivery-self-pickup-label" className="font-bold">Самовывоз</span>
                            <span className={cn(
                              'font-black',
                              isSelfPickupSelected ? 'text-black' : '',
                            )}>0 ₽</span>
                          </div>
                          <div className={cn(
                            'text-sm text-muted-foreground',
                            isSelfPickupSelected ? 'text-black/70' : '',
                          )}>
                            Заберете заказ самостоятельно. После оформления мы свяжемся с вами и подтвердим детали выдачи.
                          </div>
                          {isAdmin ? (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <span className={cn(
                                'inline-flex items-center border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em]',
                                STATUS_TONE_CLASS_NAMES.success,
                              )}>
                                Работает
                              </span>
                              <span className={cn('text-xs', isSelfPickupSelected ? 'text-black/60' : 'text-muted-foreground')}>
                                Самовывоз доступен независимо от интеграций доставки.
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {visibleDeliveryCards.map((card) => {
                      const isSelected = selectedDeliveryMethod === card.method && selectedDeliveryProviderCode === card.provider;

                      return (
                        <div
                          key={card.key}
                          role="radio"
                          aria-checked={isSelected}
                          aria-labelledby={`checkout-delivery-${card.key}-label`}
                          aria-disabled={card.disabled}
                          tabIndex={card.disabled ? -1 : 0}
                          className={cn(
                            'space-y-3 rounded-none border p-4 transition',
                            isSelected
                              ? 'border-black bg-[linear-gradient(180deg,#faf6ee_0%,#f1e9db_100%)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08),0_10px_24px_rgba(0,0,0,0.06)]'
                              : !card.disabled
                                ? 'cursor-pointer border-gray-200 hover:border-black/40'
                                : 'border-gray-200 opacity-80',
                          )}
                          onClick={!card.disabled ? () => handleDeliveryMethodSelect(card.method, card.provider) : undefined}
                          onKeyDown={(event) => handleDeliveryMethodKeyDown(event, card.method, card.provider, card.disabled)}
                        >
                          <div className="flex items-start gap-3">
                            <DeliveryOptionIndicator selected={isSelected} disabled={card.disabled} />
                            <div className="flex-1 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <span id={`checkout-delivery-${card.key}-label`} className="font-bold">{card.title}</span>
                                <span className="font-black">{card.priceLabel}</span>
                              </div>
                              <div className="text-sm text-muted-foreground">{card.summary}</div>
                              {card.deliveryDaysLabel ? (
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                  Срок доставки: {card.deliveryDaysLabel}
                                </div>
                              ) : null}
                              {card.caption ? (
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                  Расчет: {card.caption}
                                </div>
                              ) : null}
                              {isAdmin ? (
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <span className={cn(
                                    'inline-flex items-center border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em]',
                                    STATUS_TONE_CLASS_NAMES[card.statusTone],
                                  )}>
                                    {card.statusLabel}
                                  </span>
                                  <span className={cn('text-xs', isSelected ? 'text-black/60' : 'text-muted-foreground')}>
                                    {card.statusDescription}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {isManagedDeliveryEnabled && visibleDeliveryCards.length === 0 && address.trim() ? (
                    <p className="text-sm text-muted-foreground">
                      Для этого адреса сейчас нет доступных онлайн-вариантов доставки. Самовывоз остается доступным.
                    </p>
                  ) : null}

                  {adminDeliveryDiagnostics.length > 0 ? (
                    <div className="space-y-2 border border-black/10 bg-white p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Включенные службы без checkout-сценария
                      </div>
                      <div className="space-y-2">
                        {adminDeliveryDiagnostics.map((service) => (
                          <div key={service.provider} className="flex flex-col gap-2 border border-black/10 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                              <div className="font-bold">{service.label}</div>
                              <div className="text-sm text-muted-foreground">{service.description}</div>
                            </div>
                            <span className={cn(
                              'inline-flex items-center border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em]',
                              STATUS_TONE_CLASS_NAMES[service.statusTone],
                            )}>
                              {service.statusLabel}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {isPickupSelected ? (
                    <div className="space-y-4 border border-black/10 bg-white p-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="font-bold uppercase tracking-wide">Пункт выдачи</h3>
                          {selectedDeliveryProviderCaption ? (
                            <span className="text-xs uppercase tracking-wide text-muted-foreground">
                              {selectedDeliveryProviderCaption}
                            </span>
                          ) : null}
                        </div>
                        {selectedPickupPoint?.id ? (
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <p className="font-medium text-foreground">Выбранный пункт</p>
                            <p>{selectedPickupPoint.address}</p>
                            {selectedPickupPoint.instruction ? <p>{selectedPickupPoint.instruction}</p> : null}
                            <div className="flex flex-wrap gap-3 text-xs uppercase tracking-wide">
                              {pickupDelivery?.available && formatDeliveryDays(pickupDelivery.deliveryDays) ? (
                                <span>Срок: {formatDeliveryDays(pickupDelivery.deliveryDays)}</span>
                              ) : null}
                              {formatPickupDistance(selectedPickupPoint.distanceKm) ? (
                                <span>Расстояние: {formatPickupDistance(selectedPickupPoint.distanceKm)}</span>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Выберите удобный пункт выдачи из списка. Стоимость и срок уже рассчитаны выбранной службой.
                          </p>
                        )}
                      </div>

                      {pickupPointsLoading ? (
                        <p className="text-sm text-muted-foreground">
                          Подбираем пункты выдачи рядом с вашим адресом...
                        </p>
                      ) : null}

                      {!pickupPointsLoading && pickupPointsError ? (
                        <p className="text-sm text-red-700">
                          {visiblePickupPointsError}
                        </p>
                      ) : null}

                      {!pickupPointsLoading && !pickupPointsError && selectedPickupPoint?.id && !pickupDelivery?.available ? (
                        <p className="text-sm text-red-700">
                          {visibleSelectedDeliveryError}
                        </p>
                      ) : null}

                      {pickupPoints.length > 0 ? (
                        <div className="space-y-2 border border-black/10 bg-white p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            Пункты выдачи для вашего адреса
                          </div>
                          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                            {pickupPoints.map((point) => {
                              const isSelected = point.id === selectedPickupPointId;

                              return (
                                <button
                                  key={point.id}
                                  type="button"
                                  onClick={() => setSelectedPickupPointId(point.id)}
                                  className={`w-full border p-3 text-left transition ${
                                    isSelected
                                      ? 'border-black bg-stone-50 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]'
                                      : 'border-black/15 bg-white hover:border-black/40 hover:bg-stone-50/60'
                                  }`}
                                >
                                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                                    <div className="min-w-0 space-y-1">
                                      <p className="font-bold">{point.name || 'Пункт выдачи'}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {point.address || 'Адрес не указан'}
                                      </p>
                                      {point.instruction ? (
                                        <p className="text-xs text-muted-foreground">
                                          {point.instruction}
                                        </p>
                                      ) : null}
                                    </div>
                                    <div className="min-w-[96px] text-right">
                                      <p className="font-black">
                                        {isSelected
                                          ? pickupDeliveryLoading
                                            ? 'Расчет...'
                                            : pickupDelivery?.available
                                              ? formatProductPrice(pickupDelivery.estimatedCost ?? 0)
                                              : 'Выбрано'
                                          : 'Выбрать'}
                                      </p>
                                      {isSelected && !pickupDelivery?.available && !pickupDeliveryLoading ? (
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                          Выбрано
                                        </p>
                                      ) : null}
                                      {isSelected && pickupDelivery?.available && formatDeliveryDays(pickupDelivery.deliveryDays) ? (
                                        <p className="text-xs uppercase text-muted-foreground">
                                          {formatDeliveryDays(pickupDelivery.deliveryDays)}
                                        </p>
                                      ) : null}
                                      {formatPickupDistance(point.distanceKm) ? (
                                        <p className="text-xs uppercase text-muted-foreground">
                                          {formatPickupDistance(point.distanceKm)}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                  {isSelected && !pickupDelivery?.available && !pickupDeliveryLoading ? (
                                    <p className="mt-2 text-xs text-red-700">
                                      {visibleSelectedDeliveryError}
                                    </p>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <Button
                  type="submit"
                  className="w-full h-16 rounded-none bg-black text-xl font-black uppercase tracking-widest text-white transition-all hover:bg-gray-800"
                  disabled={!canSubmit}
                >
                  {loading ? 'Обработка...' : `ОФОРМИТЬ ЗАКАЗ - ${formatProductPrice(total)}`}
                </Button>

                {hasUnavailableItems && (
                  <p className="text-sm text-red-600">
                    Некоторые товары закончились. Вернитесь в корзину и скорректируйте заказ.
                  </p>
                )}
              </form>
            </div>

            <div className="sticky top-24 h-fit border border-gray-200 bg-gray-50 p-8">
              <h3 className="mb-6 text-xl font-black uppercase tracking-tighter">СВОДКА ЗАКАЗА</h3>

              <div className="mb-8 space-y-4">
                {cartItems.map((item) => {
                  const product = products[item.productId];
                  if (!product) return null;

                  return (
                    <div key={item.cartId} className="flex items-start justify-between text-sm">
                      <div>
                        <p className="font-bold">{product.name}</p>
                        <p className="text-xs text-gray-500">Размер: {item.size} x {item.quantity}</p>
                        {product?.sizeStock && (product.sizeStock[item.size] ?? 0) < item.quantity && (
                          <p className="text-xs text-red-600">Закончился (доступно: {product.sizeStock[item.size] ?? 0})</p>
                        )}
                      </div>
                      <span className="font-bold">{formatProductPrice(product.price * item.quantity)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="mb-6 space-y-3 border border-black/10 bg-white p-4">
                <div className="space-y-1">
                  <div className="text-sm font-bold uppercase tracking-[0.2em]">Промокод</div>
                  <p className="text-xs text-muted-foreground">
                    Введите код скидки, если он у вас есть.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={promoCodeInput}
                    onChange={(event) => {
                      const nextValue = event.target.value.toUpperCase();
                      setPromoCodeInput(nextValue);
                      setPromoCodeError('');
                      if (appliedPromoCode?.code && nextValue.trim() !== appliedPromoCode.code) {
                        setAppliedPromoCode(null);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void applyPromoCode();
                      }
                    }}
                    placeholder="Например, DEMON10"
                    className="rounded-none border-black bg-white focus-visible:ring-black"
                    disabled={promoCodeLoading}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none border-black px-4"
                    disabled={promoCodeLoading || !promoCodeInput.trim()}
                    onClick={() => void applyPromoCode()}
                  >
                    {promoCodeLoading ? 'Проверка...' : appliedPromoCode ? 'Обновить' : 'Применить'}
                  </Button>
                </div>
                {promoCodeError ? (
                  <p className="text-sm text-red-600">{promoCodeError}</p>
                ) : null}
                {appliedPromoCode ? (
                  <div className="space-y-2 border border-emerald-200 bg-emerald-50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold">{appliedPromoCode.code}</div>
                        {appliedPromoCode.description ? (
                          <p className="text-muted-foreground">{appliedPromoCode.description}</p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        className="rounded-none px-2 text-sm text-muted-foreground"
                        onClick={removePromoCode}
                      >
                        Убрать
                      </Button>
                    </div>
                    <div className="text-emerald-700">
                      Скидка: {formatProductPrice(promoDiscount)}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 border-t border-gray-200 pt-4">
                <div className="flex justify-between text-sm">
                  <span>Промежуточный итог</span>
                  <span className="font-bold">{formatProductPrice(subtotal)}</span>
                </div>
                {appliedPromoCode ? (
                  <div className="flex justify-between text-sm text-emerald-700">
                    <span>Скидка по промокоду</span>
                    <span className="font-bold">- {formatProductPrice(promoDiscount)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-sm">
                  <span>Доставка{isShippingLoading ? ' (расчет...)' : ''}</span>
                  <span className="font-bold">
                    {selectedDeliveryOption?.available ? formatProductPrice(shipping) : '—'}
                  </span>
                </div>
                {selectedDeliveryProviderCaption && (
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Провайдер: {selectedDeliveryProviderCaption}
                  </div>
                )}
                {selectedDeliveryMethod === 'pickup' && selectedPickupPoint?.address && (
                  <div className="border border-black/10 bg-white px-3 py-2 text-xs text-muted-foreground">
                    Пункт выдачи: {selectedPickupPoint.address}
                  </div>
                )}
                <div className="mt-4 flex justify-between border-t border-black pt-4 text-xl font-black">
                  <span>ИТОГО</span>
                  <span>{formatProductPrice(total)}</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </Authenticated>
  );
}
