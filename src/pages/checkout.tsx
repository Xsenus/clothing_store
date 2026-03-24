import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
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
  getYooKassaCapabilities,
  getYooMoneyCapabilities,
  isSettingEnabled,
  submitHostedCheckout,
} from '@/lib/yoomoney';
import { toast } from 'sonner';

type DeliveryMethod = 'home' | 'pickup' | 'self_pickup';

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

interface DeliveryQuoteResponse {
  provider?: string;
  currency?: string;
  toAddress?: string;
  homeDelivery?: DeliveryQuoteOption | null;
  pickupPointDelivery?: DeliveryQuoteOption | null;
  nearestPickupPointDelivery?: DeliveryQuoteOption | null;
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

const buildPickupQuoteCacheKey = (
  address: string,
  requestedWeightKg: number,
  subtotal: number,
  pickupPointId: string,
) => [address.trim(), requestedWeightKg.toFixed(3), subtotal.toFixed(2), pickupPointId].join('|');

interface PaymentOptionCardProps {
  id: string;
  value: string;
  currentValue: string;
  title: string;
  badge: string;
  subtitle?: string;
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
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoCodeLoading, setPromoCodeLoading] = useState(false);
  const [promoCodeError, setPromoCodeError] = useState('');
  const [appliedPromoCode, setAppliedPromoCode] = useState<PromoCodeValidationResult | null>(null);
  const [yooMoneyCapabilities, setYooMoneyCapabilities] = useState(() => ({
    enabled: false,
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
  const [isYandexDeliveryEnabled, setIsYandexDeliveryEnabled] = useState(true);

  const [homeDeliveryLoading, setHomeDeliveryLoading] = useState(false);
  const [homeDelivery, setHomeDelivery] = useState<DeliveryQuoteOption | null>(null);
  const [homeDeliveryError, setHomeDeliveryError] = useState('');

  const [pickupPointsLoading, setPickupPointsLoading] = useState(false);
  const [pickupPointsError, setPickupPointsError] = useState('');
  const [pickupPoints, setPickupPoints] = useState<PickupPointOption[]>([]);
  const [selectedPickupPointId, setSelectedPickupPointId] = useState('');
  const [pickupDeliveryLoading, setPickupDeliveryLoading] = useState(false);
  const [pickupDelivery, setPickupDelivery] = useState<DeliveryQuoteOption | null>(null);
  const [pickupDeliveryError, setPickupDeliveryError] = useState('');

  const [products, setProducts] = useState<Record<string, any>>({});
  const pickupQuoteCacheRef = useRef(new Map<string, DeliveryQuoteOption | null>());

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
          setYooMoneyCapabilities(getYooMoneyCapabilities(settings));
          setYooKassaCapabilities(getYooKassaCapabilities(settings));
          setIsYandexDeliveryEnabled(isSettingEnabled(settings?.yandex_delivery_enabled, true));
        }
      } catch {
        if (!cancelled) {
          setYooMoneyCapabilities(getYooMoneyCapabilities({}));
          setYooKassaCapabilities(getYooKassaCapabilities({}));
          setIsYandexDeliveryEnabled(true);
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
    );

    if (!methodStillAvailable) {
      setPaymentMethod('cod');
    }
  }, [paymentMethod, yooKassaCapabilities, yooMoneyCapabilities]);

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

  useEffect(() => {
    if (!isYandexDeliveryEnabled || !address.trim() || subtotal <= 0) {
      setHomeDeliveryLoading(false);
      setHomeDelivery(null);
      setHomeDeliveryError('');
      return;
    }

    let cancelled = false;

    const run = async () => {
      setHomeDeliveryLoading(true);
      setHomeDeliveryError('');

      try {
        const res = await FLOW.yandexDeliveryCalculate({
          input: {
            toAddress: address,
            weightKg: requestedWeightKg,
            declaredCost: subtotal,
          },
        });

        if (cancelled) {
          return;
        }

        const nextQuote = (res || null) as DeliveryQuoteResponse | null;
        const nextHomeDelivery = nextQuote?.homeDelivery || null;
        setHomeDelivery(nextHomeDelivery);
        setHomeDeliveryError(nextHomeDelivery?.available ? '' : nextHomeDelivery?.error || DELIVERY_CALCULATION_ERROR_MESSAGE);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setHomeDelivery(null);
        setHomeDeliveryError(getErrorMessage(error, DELIVERY_CALCULATION_ERROR_MESSAGE));
      } finally {
        if (!cancelled) {
          setHomeDeliveryLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [address, isYandexDeliveryEnabled, requestedWeightKg, subtotal]);

  useEffect(() => {
    if (!isYandexDeliveryEnabled || !address.trim() || subtotal <= 0) {
      setPickupPointsLoading(false);
      setPickupPoints([]);
      setPickupPointsError('');
      setSelectedPickupPointId('');
      setPickupDelivery(null);
      setPickupDeliveryError('');
      pickupQuoteCacheRef.current.clear();
      return;
    }

    let cancelled = false;

    const run = async () => {
      setPickupPointsLoading(true);
      setPickupPointsError('');
      setPickupPoints([]);
      setSelectedPickupPointId('');
      setPickupDelivery(null);
      setPickupDeliveryError('');
      pickupQuoteCacheRef.current.clear();

      try {
        const response = await FLOW.getYandexDeliveryPickupPoints({
          input: {
            toAddress: address,
            limit: 8,
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
          setPickupPointsError('Яндекс не нашел ПВЗ для этого адреса.');
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
  }, [address, isYandexDeliveryEnabled, requestedWeightKg, subtotal]);

  const selectedPickupPoint = pickupPoints.find((point) => point.id === selectedPickupPointId) || null;
  const selfPickupDelivery: DeliveryQuoteOption = {
    available: true,
    estimatedCost: 0,
    deliveryDays: null,
    tariff: 'self_pickup',
    error: null,
  };

  useEffect(() => {
    if (!isYandexDeliveryEnabled || !address.trim() || subtotal <= 0 || !selectedPickupPointId) {
      setPickupDelivery(null);
      setPickupDeliveryError('');
      setPickupDeliveryLoading(false);
      return;
    }

    const cacheKey = buildPickupQuoteCacheKey(address, requestedWeightKg, subtotal, selectedPickupPointId);
    const cachedQuote = pickupQuoteCacheRef.current.get(cacheKey);
    if (cachedQuote !== undefined) {
      setPickupDelivery(cachedQuote);
      setPickupDeliveryError(cachedQuote?.available ? '' : cachedQuote?.error || DELIVERY_CALCULATION_ERROR_MESSAGE);
      setPickupDeliveryLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setPickupDeliveryLoading(true);
      setPickupDeliveryError('');

      try {
        const response = await FLOW.yandexDeliveryCalculate({
          input: {
            toAddress: address,
            weightKg: requestedWeightKg,
            declaredCost: subtotal,
            pickupPointId: selectedPickupPointId,
          },
        });

        if (cancelled) {
          return;
        }

        const nextQuote = (response || null) as DeliveryQuoteResponse | null;
        const nextPickupDelivery = nextQuote?.pickupPointDelivery || nextQuote?.nearestPickupPointDelivery || {
          available: false,
          estimatedCost: null,
          deliveryDays: null,
          error: DELIVERY_CALCULATION_ERROR_MESSAGE,
        };
        pickupQuoteCacheRef.current.set(cacheKey, nextPickupDelivery);
        setPickupDelivery(nextPickupDelivery);
        setPickupDeliveryError(nextPickupDelivery?.available ? '' : nextPickupDelivery?.error || DELIVERY_CALCULATION_ERROR_MESSAGE);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const nextError = getErrorMessage(error, DELIVERY_CALCULATION_ERROR_MESSAGE);
        pickupQuoteCacheRef.current.set(cacheKey, {
          available: false,
          estimatedCost: null,
          deliveryDays: null,
          error: nextError,
        });
        setPickupDelivery({
          available: false,
          estimatedCost: null,
          deliveryDays: null,
          error: nextError,
        });
        setPickupDeliveryError(nextError);
      } finally {
        if (!cancelled) {
          setPickupDeliveryLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [address, isYandexDeliveryEnabled, requestedWeightKg, selectedPickupPointId, subtotal]);

  useEffect(() => {
    if (!isYandexDeliveryEnabled) {
      if (selectedDeliveryMethod !== 'self_pickup') {
        setSelectedDeliveryMethod('self_pickup');
      }
    }
  }, [isYandexDeliveryEnabled, selectedDeliveryMethod]);

  const selectedDeliveryOption = selectedDeliveryMethod === 'pickup'
    ? pickupDelivery
    : selectedDeliveryMethod === 'self_pickup'
      ? selfPickupDelivery
      : homeDelivery;
  const isPickupSelected = selectedDeliveryMethod === 'pickup';
  const isSelfPickupSelected = selectedDeliveryMethod === 'self_pickup';
  const isHomeSelected = selectedDeliveryMethod === 'home';
  const isHomeMethodDisabled = !isYandexDeliveryEnabled || !address.trim();
  const isPickupMethodDisabled = !isYandexDeliveryEnabled || !address.trim();
  const shipping = Number(selectedDeliveryOption?.estimatedCost ?? 0);
  const total = subtotal - promoDiscount + shipping;
  const visibleHomeDeliveryError = getVisibleDeliveryError(homeDeliveryError, isAdmin);
  const visiblePickupPointsError = pickupPointsError
    ? getVisibleDeliveryError(pickupPointsError, isAdmin)
    : '';
  const visiblePickupDeliveryError = pickupDeliveryError
    ? getVisibleDeliveryError(pickupDeliveryError, isAdmin)
    : '';
  const isShippingLoading = selectedDeliveryMethod === 'pickup'
    ? pickupPointsLoading || pickupDeliveryLoading
    : selectedDeliveryMethod === 'home'
      ? homeDeliveryLoading
      : false;
  const canSubmit = cartItems.length > 0
    && !hasUnavailableItems
    && !loading
    && !promoCodeLoading
    && !isShippingLoading
    && (
      selectedDeliveryMethod === 'self_pickup'
        ? true
        : selectedDeliveryMethod === 'home'
        ? Boolean(homeDelivery?.available)
        : Boolean(selectedPickupPoint?.id && pickupDelivery?.available)
    );

  const resolveSelectedShippingAddress = () => {
    if (selectedDeliveryMethod === 'self_pickup') {
      return 'Самовывоз';
    }

    if (selectedDeliveryMethod === 'pickup' && selectedPickupPoint?.address) {
      return `ПВЗ: ${selectedPickupPoint.address}`;
    }

    return address.trim();
  };

  const buildPaymentReturnUrl = () => {
    if (typeof window === 'undefined') {
      return null;
    }

    return `${window.location.origin}/profile?tab=orders`;
  };

  const handleDeliveryMethodSelect = (method: DeliveryMethod, disabled = false) => {
    if (disabled) {
      return;
    }

    setSelectedDeliveryMethod(method);
  };

  const handleDeliveryMethodKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    method: DeliveryMethod,
    disabled = false,
  ) => {
    if (disabled) {
      return;
    }

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      setSelectedDeliveryMethod(method);
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

    if ((selectedDeliveryMethod === 'home' || selectedDeliveryMethod === 'pickup') && !address.trim()) {
      toast.error('Укажите адрес для расчета доставки.');
      return;
    }

    if (selectedDeliveryMethod === 'pickup' && !selectedPickupPoint?.id) {
      toast.error('Выберите доступный ПВЗ из списка.');
      return;
    }

    if (!selectedDeliveryOption?.available) {
      toast.error(
        selectedDeliveryMethod === 'pickup'
          ? visiblePickupDeliveryError || DELIVERY_CALCULATION_ERROR_MESSAGE
          : visibleHomeDeliveryError || DELIVERY_CALCULATION_ERROR_MESSAGE,
      );
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

        <main className="flex-1 container mx-auto px-4 py-12">
          <h1 className="mb-8 text-4xl font-black uppercase tracking-tighter md:text-5xl">ОФОРМЛЕНИЕ ЗАКАЗА</h1>

          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
            <div>
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="space-y-4">
                  <h2 className="border-b pb-2 text-xl font-bold uppercase tracking-wider">ИНФОРМАЦИЯ О ПОКУПАТЕЛЕ</h2>
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
                      {isYandexDeliveryEnabled
                        ? 'Для доставки до двери и ПВЗ укажите адрес. Для самовывоза поле можно оставить пустым.'
                        : 'Яндекс.Доставка сейчас отключена. Для самовывоза адрес можно не указывать.'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="border-b pb-2 text-xl font-bold uppercase tracking-wider">СПОСОБ ОПЛАТЫ</h2>
                  <div className="space-y-3" role="radiogroup" aria-label="Способ оплаты">
                    <PaymentOptionCard
                      id="payment-cod"
                      value="cod"
                      currentValue={paymentMethod}
                      onSelect={setPaymentMethod}
                      title="Оплата при получении"
                      badge="При получении"
                      subtitle="Оплатите заказ при получении или примерке."
                    />
                    {yooMoneyCapabilities.allowBankCards && (
                      <PaymentOptionCard
                        id="payment-yoomoney-card"
                        value="yoomoney_card"
                        currentValue={paymentMethod}
                        onSelect={setPaymentMethod}
                        title="ЮMoney: банковская карта"
                        badge="Онлайн"
                        subtitle="Откроем защищенную форму ЮMoney и после оплаты вернем вас в личный кабинет."
                      />
                    )}
                    {yooMoneyCapabilities.allowWallet && (
                      <PaymentOptionCard
                        id="payment-yoomoney-wallet"
                        value="yoomoney_wallet"
                        currentValue={paymentMethod}
                        onSelect={setPaymentMethod}
                        title="ЮMoney: кошелек"
                        badge="Онлайн"
                        subtitle="Оплата через кошелек ЮMoney с подтверждением на стороне сервиса."
                      />
                    )}
                    {yooKassaCapabilities.allowBankCards && (
                      <PaymentOptionCard
                        id="payment-yookassa-card"
                        value="yookassa_card"
                        currentValue={paymentMethod}
                        onSelect={setPaymentMethod}
                        title="YooKassa: банковская карта"
                        badge="Онлайн"
                        subtitle="Переход на защищенную страницу YooKassa для оплаты банковской картой."
                      />
                    )}
                    {yooKassaCapabilities.allowSbp && (
                      <PaymentOptionCard
                        id="payment-yookassa-sbp"
                        value="yookassa_sbp"
                        currentValue={paymentMethod}
                        onSelect={setPaymentMethod}
                        title="YooKassa: СБП"
                        badge="Онлайн"
                        subtitle="Оплата через СБП на защищенной странице YooKassa."
                      />
                    )}
                    {yooKassaCapabilities.allowYooMoney && (
                      <PaymentOptionCard
                        id="payment-yookassa-yoomoney"
                        value="yookassa_yoomoney"
                        currentValue={paymentMethod}
                        onSelect={setPaymentMethod}
                        title="YooKassa: ЮMoney"
                        badge="Онлайн"
                        subtitle="Оплата ЮMoney внутри платежной страницы YooKassa."
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 border-b pb-2">
                    <h2 className="text-xl font-bold uppercase tracking-wider">СПОСОБ ДОСТАВКИ</h2>
                    {isShippingLoading && <span className="text-sm text-muted-foreground">Расчет...</span>}
                  </div>

                  {!isYandexDeliveryEnabled ? (
                    <p className="text-sm text-muted-foreground">
                      Яндекс.Доставка отключена в интеграциях, поэтому сейчас доступен только самовывоз.
                    </p>
                  ) : !address.trim() && (
                    <p className="text-sm text-muted-foreground">
                      Для доставки до двери и ПВЗ сначала укажите адрес. Самовывоз доступен без адреса.
                    </p>
                  )}

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
                        </div>
                      </div>
                    </div>

                    {isYandexDeliveryEnabled && (
                      <div
                        role="radio"
                        aria-checked={isHomeSelected}
                        aria-labelledby="checkout-delivery-home-label"
                        aria-disabled={isHomeMethodDisabled}
                        tabIndex={isHomeMethodDisabled ? -1 : 0}
                        className={cn(
                          'space-y-3 rounded-none border p-4 transition',
                          isHomeSelected
                            ? 'border-black bg-[linear-gradient(180deg,#faf6ee_0%,#f1e9db_100%)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08),0_10px_24px_rgba(0,0,0,0.06)]'
                            : !isHomeMethodDisabled
                              ? 'cursor-pointer border-gray-200 hover:border-black/40'
                              : 'border-gray-200 opacity-80',
                        )}
                        onClick={!isHomeMethodDisabled ? () => handleDeliveryMethodSelect('home') : undefined}
                        onKeyDown={(event) => handleDeliveryMethodKeyDown(event, 'home', isHomeMethodDisabled)}
                      >
                          <div className="flex items-start gap-3">
                            <DeliveryOptionIndicator selected={isHomeSelected} disabled={isHomeMethodDisabled} />
                            <div className="flex-1 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <span id="checkout-delivery-home-label" className="font-bold">До двери</span>
                                <span className="font-black">
                                  {!address.trim()
                                    ? 'Нужен адрес'
                                    : homeDelivery?.available
                                      ? formatProductPrice(homeDelivery.estimatedCost ?? 0)
                                      : 'Недоступно'}
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {!address.trim()
                                  ? 'Укажите адрес, чтобы рассчитать стоимость и срок доставки до двери.'
                                  : homeDelivery?.available
                                  ? `Адрес получателя: ${address}`
                                  : visibleHomeDeliveryError}
                              </div>
                              {homeDelivery?.available && formatDeliveryDays(homeDelivery.deliveryDays) && (
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                  Срок доставки: {formatDeliveryDays(homeDelivery.deliveryDays)}
                                </div>
                              )}
                            </div>
                          </div>
                      </div>
                    )}

                    {isYandexDeliveryEnabled && (
                      <div
                        role="radio"
                        aria-checked={isPickupSelected}
                        aria-labelledby="checkout-delivery-pickup-label"
                        aria-disabled={isPickupMethodDisabled}
                        tabIndex={isPickupMethodDisabled ? -1 : 0}
                        className={cn(
                          'space-y-4 rounded-none border p-4 transition',
                          isPickupSelected
                            ? 'border-black bg-[linear-gradient(180deg,#faf6ee_0%,#f1e9db_100%)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08),0_10px_24px_rgba(0,0,0,0.06)]'
                            : !isPickupMethodDisabled
                              ? 'cursor-pointer border-gray-200 hover:border-black/40'
                              : 'border-gray-200 opacity-80',
                        )}
                        onClick={!isPickupMethodDisabled ? () => handleDeliveryMethodSelect('pickup') : undefined}
                        onKeyDown={(event) => handleDeliveryMethodKeyDown(event, 'pickup', isPickupMethodDisabled)}
                      >
                          <div className="flex items-start gap-3">
                            <DeliveryOptionIndicator selected={isPickupSelected} disabled={isPickupMethodDisabled} />
                            <div className="flex-1 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <span id="checkout-delivery-pickup-label" className="font-bold">ПВЗ</span>
                                <span className="font-black">
                                  {!address.trim()
                                    ? 'Нужен адрес'
                                    : pickupDelivery?.available
                                    ? formatProductPrice(pickupDelivery.estimatedCost ?? 0)
                                    : pickupDeliveryLoading
                                      ? 'Расчет...'
                                      : pickupPointsLoading
                                        ? 'Загрузка ПВЗ...'
                                        : pickupPoints.length > 0
                                          ? 'Выберите ПВЗ'
                                          : 'Недоступно'}
                                </span>
                              </div>

                              {isPickupSelected && selectedPickupPoint?.id ? (
                                <div className="space-y-1 text-sm text-muted-foreground">
                                  <p className="font-medium text-foreground">Выбранный ПВЗ</p>
                                  <p>{selectedPickupPoint.address}</p>
                                  {selectedPickupPoint.instruction && <p>{selectedPickupPoint.instruction}</p>}
                                  <div className="flex flex-wrap gap-3 text-xs uppercase tracking-wide">
                                    {pickupDelivery?.available && formatDeliveryDays(pickupDelivery.deliveryDays) && (
                                      <span>Срок: {formatDeliveryDays(pickupDelivery.deliveryDays)}</span>
                                    )}
                                    {formatPickupDistance(selectedPickupPoint.distanceKm) && (
                                      <span>Расстояние: {formatPickupDistance(selectedPickupPoint.distanceKm)}</span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  {!address.trim()
                                    ? 'Укажите адрес, чтобы мы подобрали ближайшие ПВЗ.'
                                    : 'Выберите удобный пункт выдачи из списка. Стоимость и срок рассчитаем после выбора точки.'}
                                </p>
                              )}

                              {isPickupSelected && pickupPointsLoading && (
                                <p className="text-sm text-muted-foreground">
                                  Подбираем ПВЗ рядом с вашим адресом...
                                </p>
                              )}

                              {isPickupSelected && pickupDeliveryError && selectedPickupPoint?.id && !pickupDeliveryLoading && (
                                <p className="text-sm text-red-700">
                                  {visiblePickupDeliveryError}
                                </p>
                              )}

                              {isPickupSelected && pickupPointsError && (
                                <p className="text-sm text-red-700">
                                  {visiblePickupPointsError}
                                </p>
                              )}

                              {isPickupSelected && pickupPoints.length > 0 && (
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
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setSelectedPickupPointId(point.id);
                                            setSelectedDeliveryMethod('pickup');
                                          }}
                                          className={`w-full border p-3 text-left transition ${
                                            isSelected
                                              ? 'border-black bg-stone-50 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]'
                                              : 'border-black/15 bg-white hover:border-black/40 hover:bg-stone-50/60'
                                          }`}
                                        >
                                          <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="space-y-1">
                                              <p className="font-bold">{point.name || 'Пункт выдачи'}</p>
                                              <p className="text-sm text-muted-foreground">
                                                {point.address || 'Адрес не указан'}
                                              </p>
                                              {point.instruction && (
                                                <p className="text-xs text-muted-foreground">
                                                  {point.instruction}
                                                </p>
                                              )}
                                            </div>
                                            <div className="text-right">
                                              <p className="font-black">
                                                {isSelected
                                                  ? pickupDeliveryLoading
                                                    ? 'Расчет...'
                                                    : pickupDelivery?.available
                                                      ? formatProductPrice(pickupDelivery.estimatedCost ?? 0)
                                                      : 'Выбрано'
                                                  : 'Выбрать'}
                                              </p>
                                              {isSelected && !pickupDelivery?.available && !pickupDeliveryLoading && (
                                                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                                  Выбрано
                                                </p>
                                              )}
                                              {isSelected && pickupDelivery?.available && formatDeliveryDays(pickupDelivery.deliveryDays) && (
                                                <p className="text-xs uppercase text-muted-foreground">
                                                  {formatDeliveryDays(pickupDelivery.deliveryDays)}
                                                </p>
                                              )}
                                              {formatPickupDistance(point.distanceKm) && (
                                                <p className="text-xs uppercase text-muted-foreground">
                                                  {formatPickupDistance(point.distanceKm)}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                          {isSelected && pickupDeliveryError && !pickupDeliveryLoading && (
                                            <p className="mt-2 text-xs text-red-700">
                                              {visiblePickupDeliveryError}
                                            </p>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                      </div>
                    )}
                  </div>
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
                {selectedDeliveryMethod === 'pickup' && selectedPickupPoint?.address && (
                  <div className="border border-black/10 bg-white px-3 py-2 text-xs text-muted-foreground">
                    ПВЗ: {selectedPickupPoint.address}
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
