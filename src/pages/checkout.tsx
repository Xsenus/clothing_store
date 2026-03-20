import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

import AddressAutocompleteInput from '@/components/AddressAutocompleteInput';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import PageSeo from '@/components/PageSeo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Authenticated, useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { FLOW } from '@/lib/api-mapping';
import { formatProductPrice } from '@/lib/price-format';
import { toast } from 'sonner';

type DeliveryMethod = 'home' | 'pickup';

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
  paymentMethod: string,
  requestedWeightKg: number,
  subtotal: number,
  pickupPointId: string,
) => [address.trim(), paymentMethod, requestedWeightKg.toFixed(3), subtotal.toFixed(2), pickupPointId].join('|');

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
  const [selectedDeliveryMethod, setSelectedDeliveryMethod] = useState<DeliveryMethod>('home');

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

  useEffect(() => {
    if (!address.trim() || subtotal <= 0) {
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
            paymentMethod,
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
  }, [address, paymentMethod, requestedWeightKg, subtotal]);

  useEffect(() => {
    if (!address.trim() || subtotal <= 0) {
      setPickupPoints([]);
      setPickupPointsError('');
      setSelectedPickupPointId('');
      setPickupDelivery(null);
      setPickupDeliveryError('');
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
            paymentMethod,
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
  }, [address, paymentMethod, requestedWeightKg, subtotal]);

  const selectedPickupPoint = pickupPoints.find((point) => point.id === selectedPickupPointId) || null;

  useEffect(() => {
    if (!address.trim() || subtotal <= 0 || !selectedPickupPointId) {
      setPickupDelivery(null);
      setPickupDeliveryError('');
      setPickupDeliveryLoading(false);
      return;
    }

    const cacheKey = buildPickupQuoteCacheKey(address, paymentMethod, requestedWeightKg, subtotal, selectedPickupPointId);
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
            paymentMethod,
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
  }, [address, paymentMethod, requestedWeightKg, selectedPickupPointId, subtotal]);

  useEffect(() => {
    if (selectedDeliveryMethod === 'home' && !homeDelivery?.available && pickupDelivery?.available) {
      setSelectedDeliveryMethod('pickup');
    }
  }, [homeDelivery?.available, pickupDelivery?.available, selectedDeliveryMethod]);

  const selectedDeliveryOption = selectedDeliveryMethod === 'pickup' ? pickupDelivery : homeDelivery;
  const shipping = Number(selectedDeliveryOption?.estimatedCost ?? 0);
  const total = subtotal + shipping;
  const visibleHomeDeliveryError = getVisibleDeliveryError(homeDeliveryError, isAdmin);
  const visiblePickupPointsError = pickupPointsError
    ? getVisibleDeliveryError(pickupPointsError, isAdmin)
    : '';
  const visiblePickupDeliveryError = pickupDeliveryError
    ? getVisibleDeliveryError(pickupDeliveryError, isAdmin)
    : '';
  const isShippingLoading = selectedDeliveryMethod === 'pickup'
    ? pickupPointsLoading || pickupDeliveryLoading
    : homeDeliveryLoading;
  const canSubmit = cartItems.length > 0
    && !hasUnavailableItems
    && !loading
    && !isShippingLoading
    && (
      selectedDeliveryMethod === 'home'
        ? Boolean(homeDelivery?.available)
        : Boolean(selectedPickupPoint?.id && pickupDelivery?.available)
    );

  const resolveSelectedShippingAddress = () => {
    if (selectedDeliveryMethod === 'pickup' && selectedPickupPoint?.address) {
      return `ПВЗ: ${selectedPickupPoint.address}`;
    }

    return address.trim();
  };

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
      await FLOW.createOrder({
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
        },
      });

      await clearCart();

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
                        type="email"
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
                      type="tel"
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
                    <AddressAutocompleteInput
                      value={address}
                      onValueChange={(nextValue) => setAddress(nextValue)}
                      required
                      inputClassName="rounded-none border-black focus-visible:ring-black"
                      placeholder="Начните вводить адрес"
                    />
                    <p className="text-sm text-muted-foreground">
                      Доставку до двери считаем по этому адресу. Ниже покажем список ближайших ПВЗ, а тариф и срок посчитаем после выбора точки.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="border-b pb-2 text-xl font-bold uppercase tracking-wider">СПОСОБ ОПЛАТЫ</h2>
                  <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                    <div className="flex items-center space-x-2 border border-black p-4 rounded-none">
                      <RadioGroupItem value="cod" id="cod" />
                      <Label htmlFor="cod" className="font-bold">Оплата при получении</Label>
                    </div>
                    <div className="flex items-center space-x-2 border border-gray-200 p-4 rounded-none opacity-50 cursor-not-allowed">
                      <RadioGroupItem value="card" id="card" disabled />
                      <Label htmlFor="card">Банковская карта (скоро)</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 border-b pb-2">
                    <h2 className="text-xl font-bold uppercase tracking-wider">СПОСОБ ДОСТАВКИ</h2>
                    {isShippingLoading && <span className="text-sm text-muted-foreground">Расчет...</span>}
                  </div>

                  {!address.trim() && (
                    <p className="text-sm text-muted-foreground">
                      Укажите адрес, чтобы получить стоимость доставки до двери и список доступных ПВЗ.
                    </p>
                  )}

                  {address.trim() && (
                    <RadioGroup value={selectedDeliveryMethod} onValueChange={(value) => setSelectedDeliveryMethod(value as DeliveryMethod)}>
                      <div className={`space-y-3 border p-4 rounded-none ${selectedDeliveryMethod === 'home' ? 'border-black' : 'border-gray-200'}`}>
                        <div className="flex items-start gap-3">
                          <RadioGroupItem value="home" id="delivery-home" disabled={!homeDelivery?.available} />
                          <div className="flex-1 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <Label htmlFor="delivery-home" className="font-bold">До двери</Label>
                              <span className="font-black">
                                {homeDelivery?.available ? formatProductPrice(homeDelivery.estimatedCost ?? 0) : 'Недоступно'}
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {homeDelivery?.available
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

                      <div className={`space-y-4 border p-4 rounded-none ${selectedDeliveryMethod === 'pickup' ? 'border-black' : 'border-gray-200'}`}>
                        <div className="flex items-start gap-3">
                          <RadioGroupItem value="pickup" id="delivery-pickup" disabled={!pickupPointsLoading && pickupPoints.length === 0} />
                          <div className="flex-1 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <Label htmlFor="delivery-pickup" className="font-bold">ПВЗ</Label>
                              <span className="font-black">
                                {pickupDelivery?.available
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

                            {selectedPickupPoint?.id ? (
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
                                Выберите удобный пункт выдачи из списка. Стоимость и срок рассчитаем после выбора точки.
                              </p>
                            )}

                            {pickupPointsLoading && (
                              <p className="text-sm text-muted-foreground">
                                Подбираем ПВЗ рядом с вашим адресом...
                              </p>
                            )}

                            {pickupDeliveryError && selectedPickupPoint?.id && !pickupDeliveryLoading && (
                              <p className="text-sm text-red-700">
                                {visiblePickupDeliveryError}
                              </p>
                            )}

                            {pickupPointsError && (
                              <p className="text-sm text-red-700">
                                {visiblePickupPointsError}
                              </p>
                            )}

                            {pickupPoints.length > 0 && (
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
                                        onClick={() => {
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
                    </RadioGroup>
                  )}
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

              <div className="space-y-2 border-t border-gray-200 pt-4">
                <div className="flex justify-between text-sm">
                  <span>Промежуточный итог</span>
                  <span className="font-bold">{formatProductPrice(subtotal)}</span>
                </div>
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
