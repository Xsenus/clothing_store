import React, { useEffect, useMemo, useState } from "react";
import AddressAutocompleteInput from "@/components/AddressAutocompleteInput";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FLOW } from "@/lib/api-mapping";
import { Authenticated, useAuthActions } from "@/context/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import { toast } from "sonner";
import AdminPage from "./admin";
import { useNavigate, useSearchParams } from "react-router";
import PageSeo from "@/components/PageSeo";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";

const normalizePhone = (value) => {
  const clean = String(value || "").trim();
  if (!clean) return "";
  const chars = Array.from(clean).filter((ch) => /[\d+]/.test(ch));
  let normalized = chars.join("");
  if (normalized && !normalized.startsWith("+")) normalized = `+${normalized}`;
  return normalized;
};

const createProfileAddressId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `addr_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const normalizeDraftProfileAddresses = (addresses) => {
  const draftAddresses = Array.isArray(addresses)
    ? addresses.map((address) => ({
        id: String(address?.id || createProfileAddressId()),
        value: String(address?.value || ""),
        isDefault: !!address?.isDefault,
      }))
    : [];

  if (draftAddresses.length === 0) {
    return [];
  }

  let defaultIndex = draftAddresses.findIndex((address) => address.isDefault);
  if (defaultIndex < 0) {
    defaultIndex = 0;
  }

  return draftAddresses.map((address, index) => ({
    ...address,
    isDefault: index === defaultIndex,
  }));
};

const sanitizeProfileAddresses = (addresses, fallbackAddress = "") => {
  const sanitized = normalizeDraftProfileAddresses(addresses)
    .map((address) => ({
      ...address,
      value: String(address.value || "").trim(),
    }))
    .filter((address) => address.value);

  if (sanitized.length === 0) {
    const fallback = String(fallbackAddress || "").trim();
    if (fallback) {
      return [{ id: createProfileAddressId(), value: fallback, isDefault: true }];
    }
    return [];
  }

  let defaultIndex = sanitized.findIndex((address) => address.isDefault);
  if (defaultIndex < 0) {
    defaultIndex = 0;
  }

  return sanitized.map((address, index) => ({
    ...address,
    isDefault: index === defaultIndex,
  }));
};

const getDefaultProfileAddressValue = (addresses, fallbackAddress = "") => {
  const sanitized = sanitizeProfileAddresses(addresses, fallbackAddress);
  return sanitized.find((address) => address.isDefault)?.value || sanitized[0]?.value || "";
};

const ORDER_STATUS_LABELS = {
  processing: "В обработке",
  created: "Оформлен",
  paid: "Оплачен",
  in_transit: "В пути",
  delivered: "Доставлен",
  completed: "Завершен",
  canceled: "Отменен",
  returned: "Возврат",
};

const PAYMENT_METHOD_LABELS = {
  cod: "Оплата при получении",
  card: "Банковская карта",
  sbp: "СБП",
  cash: "Наличные",
};

const SHIPPING_METHOD_LABELS = {
  home: "До двери",
  pickup: "ПВЗ",
};

const parseJsonArray = (raw) => {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const formatOrderDate = (raw) => {
  const value = Number(raw || 0);
  if (!value) return "—";
  const normalized = value > 10_000_000_000 ? value : value * 1000;
  return new Date(normalized).toLocaleDateString();
};

const formatOrderDateTime = (raw) => {
  const value = Number(raw || 0);
  if (!value) return "—";
  const normalized = value > 10_000_000_000 ? value : value * 1000;
  return new Date(normalized).toLocaleString("ru-RU");
};

const getYandexDeliveryStatusText = (order) => {
  const description = String(order?.yandexDeliveryStatusDescription || "").trim();
  if (description) return description;

  const statusCode = String(order?.yandexDeliveryStatus || "").trim();
  if (statusCode) return statusCode;

  if (String(order?.yandexRequestId || "").trim()) {
    return "Статус доставки обновится позже";
  }

  return "";
};

const formatRubles = (raw) => {
  const value = Number(raw || 0);
  if (!Number.isFinite(value)) return "вЂ”";
  return `${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ₽`;
};

const formatOrderDisplayNumber = (order) => {
  const explicitDisplayNumber = String(order?.displayOrderNumber || "").trim();
  if (explicitDisplayNumber) return explicitDisplayNumber;

  const numericOrderNumber = Number(order?.orderNumber || 0);
  if (Number.isFinite(numericOrderNumber) && numericOrderNumber > 0) {
    return String(Math.trunc(numericOrderNumber)).padStart(7, "0");
  }

  return order?.id || "вЂ”";
};

const normalizeProfileTab = (value, allowAdmin = false) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "wishlist" || normalized === "settings" || normalized === "orders") {
    return normalized;
  }

  if (allowAdmin && normalized === "admin") {
    return "admin";
  }

  return "orders";
};

export default function ProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => normalizeProfileTab(searchParams.get("tab")));
  const [loading, setLoading] = useState(true);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const confirmAction = useConfirmDialog();

  const [orders, setOrders] = useState([]);
  const [likedProductIds, setLikedProductIds] = useState([]);
  const [products, setProducts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [emailDraft, setEmailDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeRequested, setEmailCodeRequested] = useState(false);
  const [phoneVerifyState, setPhoneVerifyState] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const nextTab = normalizeProfileTab(searchParams.get("tab"), isAdmin);
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, isAdmin, searchParams]);

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem("authToken");
      const refreshToken = localStorage.getItem("refreshToken");
      if (!token && !refreshToken) {
        navigate("/", { replace: true });
        return;
      }

      setLoading(true);
      try {
        const [ordersRes, likesRes, productsRes, profileRes] = await Promise.all([
          FLOW.getUserOrders({ input: {} }),
          FLOW.getUserLikes({ input: {} }),
          FLOW.getAllProducts({ input: {} }),
          FLOW.getProfile({ input: {} }),
        ]);

        if (Array.isArray(ordersRes)) setOrders(ordersRes);
        if (Array.isArray(likesRes)) setLikedProductIds(likesRes.map((like) => like.productId));
        if (Array.isArray(productsRes)) setProducts(productsRes);
        if (profileRes) {
          const shippingAddresses = sanitizeProfileAddresses(profileRes.shippingAddresses, profileRes.shippingAddress);
          setProfile({
            ...profileRes,
            shippingAddresses,
            shippingAddress: getDefaultProfileAddressValue(shippingAddresses, profileRes.shippingAddress),
          });
          setEmailDraft(profileRes.email || "");
          setPhoneDraft(profileRes.phone || "");
          setIsAdmin(!!profileRes.isAdmin);
        }
      } catch (error) {
        const status = typeof error === "object" && error && "status" in error
          ? Number(error.status)
          : null;
        if (status === 401) {
          await signOut();
          navigate("/", { replace: true });
          return;
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate, signOut]);

  const emailChanged = useMemo(
    () => String(emailDraft || "").trim().toLowerCase() !== String(profile?.email || "").trim().toLowerCase(),
    [emailDraft, profile?.email]
  );
  const phoneChanged = useMemo(
    () => normalizePhone(phoneDraft) !== normalizePhone(profile?.phone),
    [phoneDraft, profile?.phone]
  );

  const emailVerifiedForSave = !emailChanged || !!profile?.emailVerified;
  const phoneVerifiedForSave = !phoneChanged || !!profile?.phoneVerified;

  useEffect(() => {
    if (!phoneVerifyState) return undefined;

    const timer = setInterval(async () => {
      try {
        const status = await FLOW.getPhoneVerificationStatus({ input: { state: phoneVerifyState } });
        if (status?.completed && status?.phoneVerified) {
          setPhoneVerifyState("");
          setProfile((prev) => ({ ...(prev || {}), phone: status.phone, phoneVerified: true }));
          setPhoneDraft(status.phone || "");
          toast.success("Телефон подтвержден");
          clearInterval(timer);
          return;
        }

        if (["expired", "consumed"].includes(String(status?.status || ""))) {
          setPhoneVerifyState("");
          clearInterval(timer);
          if (status?.status === "expired") {
            toast.error("Сессия подтверждения телефона истекла");
          }
        }
      } catch (error) {
        setPhoneVerifyState("");
        clearInterval(timer);
        toast.error("Не удалось проверить статус подтверждения телефона");
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [phoneVerifyState]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!profile) return;

    if (!emailVerifiedForSave) {
      toast.error("Подтвердите email перед сохранением");
      return;
    }

    if (!phoneVerifiedForSave) {
      toast.error("Подтвердите телефон перед сохранением");
      return;
    }

    const normalizedShippingAddresses = sanitizeProfileAddresses(profile.shippingAddresses, profile.shippingAddress);
    const defaultShippingAddress = getDefaultProfileAddressValue(normalizedShippingAddresses, profile.shippingAddress);

    try {
      await FLOW.updateProfile({
        input: {
          name: profile.name,
          phone: normalizePhone(phoneDraft),
          shippingAddress: defaultShippingAddress,
          shippingAddresses: normalizedShippingAddresses,
          nickname: profile.nickname,
          email: String(emailDraft || "").trim(),
        },
      });

      setProfile((prev) => ({
        ...(prev || {}),
        email: String(emailDraft || "").trim(),
        phone: normalizePhone(phoneDraft),
        shippingAddress: defaultShippingAddress,
        shippingAddresses: normalizedShippingAddresses,
      }));
      toast.success("Профиль обновлен");
    } catch (error) {
      toast.error(error?.message || "Не удалось обновить профиль");
    }
  };

  const handleStartEmailVerification = async () => {
    const value = String(emailDraft || "").trim();
    if (!value) {
      toast.error("Введите email");
      return;
    }

    setActionLoading(true);
    try {
      await FLOW.startEmailVerification({ input: { value } });
      setEmailCodeRequested(true);
      toast.success("Код подтверждения отправлен на email");
    } catch (error) {
      toast.error(error?.message || "Не удалось отправить код");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmEmailVerification = async () => {
    const value = String(emailDraft || "").trim();
    if (!value || !emailCode.trim()) {
      toast.error("Введите email и код подтверждения");
      return;
    }

    setActionLoading(true);
    try {
      await FLOW.confirmEmailVerification({ input: { value, code: emailCode.trim() } });
      setProfile((prev) => ({ ...(prev || {}), email: value, emailVerified: true }));
      setEmailCode("");
      setEmailCodeRequested(false);
      toast.success("Email подтвержден");
    } catch (error) {
      toast.error(error?.message || "Неверный код подтверждения");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartPhoneVerification = async () => {
    const value = normalizePhone(phoneDraft);
    if (!value) {
      toast.error("Введите номер телефона");
      return;
    }

    setActionLoading(true);
    try {
      const started = await FLOW.startPhoneVerification({ input: { value } });
      if (!started?.state || !started?.authUrl) throw new Error("Не удалось начать подтверждение");

      setPhoneVerifyState(started.state);
      window.open(started.authUrl, "_blank", "noopener,noreferrer");
      toast.message("Подтвердите номер в Telegram и вернитесь на сайт");
    } catch (error) {
      toast.error(error?.message || "Не удалось начать подтверждение телефона");
    } finally {
      setActionLoading(false);
    }
  };

  const updateProfileShippingAddresses = (updater) => {
    setProfile((prev) => {
      if (!prev) return prev;

      const nextAddresses = normalizeDraftProfileAddresses(
        typeof updater === "function" ? updater(prev.shippingAddresses || []) : updater
      );

      return {
        ...prev,
        shippingAddresses: nextAddresses,
        shippingAddress: getDefaultProfileAddressValue(nextAddresses, prev.shippingAddress),
      };
    });
  };

  const handleAddShippingAddress = () => {
    updateProfileShippingAddresses((currentAddresses) => ([
      ...currentAddresses,
      {
        id: createProfileAddressId(),
        value: "",
        isDefault: currentAddresses.length === 0,
      },
    ]));
  };

  const handleShippingAddressChange = (addressId, value) => {
    updateProfileShippingAddresses((currentAddresses) => currentAddresses.map((address) => (
      address.id === addressId ? { ...address, value } : address
    )));
  };

  const handleSetDefaultShippingAddress = async (addressId) => {
    const address = (profile?.shippingAddresses || []).find((item) => item.id === addressId);
    if (!address || address.isDefault) return;

    const confirmed = await confirmAction({
      title: "Сделать адрес основным?",
      description: "Этот адрес будет подставляться по умолчанию при оформлении заказа.",
      confirmText: "Сделать основным",
    });
    if (!confirmed) return;

    updateProfileShippingAddresses((currentAddresses) => currentAddresses.map((item) => ({
      ...item,
      isDefault: item.id === addressId,
    })));
  };

  const handleRemoveShippingAddress = async (addressId) => {
    const addresses = profile?.shippingAddresses || [];
    const address = addresses.find((item) => item.id === addressId);
    if (!address) return;

    const confirmed = await confirmAction({
      title: "Удалить адрес?",
      description: address.isDefault
        ? "Адрес будет удалён. Другой сохранённый адрес станет адресом по умолчанию."
        : "Адрес будет удалён из вашего профиля.",
      confirmText: "Удалить",
    });
    if (!confirmed) return;

    updateProfileShippingAddresses((currentAddresses) => currentAddresses.filter((item) => item.id !== addressId));
  };

  const handleLogout = async () => {
    const confirmed = await confirmAction({
      title: "Выйти из аккаунта?",
      description: "Текущая сессия будет завершена на этом устройстве.",
      confirmText: "Выйти",
    });
    if (!confirmed) return;

    await signOut();
    navigate("/", { replace: true });
  };

  const handleTabChange = (nextTab) => {
    const normalized = normalizeProfileTab(nextTab, isAdmin);
    setActiveTab(normalized);
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (normalized === "orders") {
        params.delete("tab");
      } else {
        params.set("tab", normalized);
      }
      return params;
    }, { replace: true });
  };

  const likedProducts = products.filter((product) => likedProductIds.includes(product._id));

  if (loading) return (
    <>
      <PageSeo
        title="Личный кабинет"
        description="Личный кабинет пользователя fashiondemon."
        canonicalPath="/profile"
        robots="noindex,nofollow"
      />
      <LoadingSpinner className="h-screen" />
    </>
  );

  return (
    <Authenticated>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <PageSeo
          title="Личный кабинет"
          description="Личный кабинет пользователя fashiondemon."
          canonicalPath="/profile"
          robots="noindex,nofollow"
        />
        <Header />

        <main className="flex-1 container mx-auto px-4 pb-8 pt-24 sm:pb-12 md:pb-12 md:pt-20">
          <h1 className="mb-6 text-3xl font-black uppercase tracking-tighter sm:text-4xl md:mb-8 md:text-5xl">МОЙ АККАУНТ</h1>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="mb-6 h-auto w-full justify-start gap-3 overflow-x-auto border-b border-gray-200 bg-transparent p-0 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mb-8 md:gap-8">
              <TabsTrigger value="orders" className="shrink-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-400 data-[state=active]:text-black transition-all sm:text-sm">ЗАКАЗЫ</TabsTrigger>
              <TabsTrigger value="wishlist" className="shrink-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-400 data-[state=active]:text-black transition-all sm:text-sm">ИЗБРАННОЕ</TabsTrigger>
              <TabsTrigger value="settings" className="shrink-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-400 data-[state=active]:text-black transition-all sm:text-sm">НАСТРОЙКИ</TabsTrigger>
              {isAdmin && <TabsTrigger value="admin" className="shrink-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-400 data-[state=active]:text-black transition-all sm:text-sm">АДМИН</TabsTrigger>}
            </TabsList>

            <TabsContent value="orders" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {orders.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 border border-dashed border-gray-300">
                  <h3 className="text-xl font-bold uppercase mb-2">Пока нет заказов</h3>
                  <p className="text-gray-500">Начните покупки, чтобы увидеть свои заказы.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => {
                    const orderItems = parseJsonArray(order.items);

                    return (
                      <div key={order.id} className="border border-gray-200 bg-white px-5 py-4 transition-shadow hover:shadow-md">
                        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_260px] xl:items-start">
                          <div className="space-y-4 xl:border-r xl:border-gray-100 xl:pr-5">
                            <div className="grid grid-cols-2 gap-4 xl:grid-cols-1">
                              <div>
                                <p className="mb-1 text-[11px] uppercase tracking-[0.28em] text-gray-400">Номер заказа</p>
                                <p className="font-mono text-lg font-bold leading-none">{formatOrderDisplayNumber(order)}</p>
                              </div>
                              <div className="text-right xl:text-left">
                                <p className="mb-1 text-[11px] uppercase tracking-[0.28em] text-gray-400">Дата</p>
                                <p className="text-sm font-bold">{formatOrderDate(order.createdAt)}</p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex rounded-full bg-black px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white">
                                {ORDER_STATUS_LABELS[order.status] || order.status || "В обработке"}
                              </span>
                            </div>

                            {String(order.yandexRequestId || "").trim() ? (
                              <div className="rounded-none border border-gray-200 bg-gray-50 p-3 text-sm">
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">Яндекс.Доставка</p>
                                <p className="font-medium">{getYandexDeliveryStatusText(order)}</p>
                                {order.yandexPickupCode ? (
                                  <p className="mt-1 text-gray-700">Код получения: <span className="font-semibold">{order.yandexPickupCode}</span></p>
                                ) : null}
                                {order.yandexDeliveryStatusUpdatedAt ? (
                                  <p className="mt-1 text-xs text-gray-500">Статус обновлен: {formatOrderDateTime(order.yandexDeliveryStatusUpdatedAt)}</p>
                                ) : null}
                                {order.yandexDeliveryTrackingUrl ? (
                                  <a
                                    href={order.yandexDeliveryTrackingUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-flex text-xs font-semibold uppercase tracking-[0.16em] underline underline-offset-2"
                                  >
                                    Отслеживать в Яндекс.Доставке
                                  </a>
                                ) : null}
                              </div>
                            ) : null}
                          </div>

                          <div className="min-w-0">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gray-400">Товары</p>
                            </div>

                            {orderItems.length === 0 ? (
                              <div className="border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500">
                                Состав заказа недоступен.
                              </div>
                            ) : (
                              <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-1 pr-1">
                                {orderItems.map((item, idx) => {
                                  const quantity = Math.max(1, Number(item.quantity || 1));
                                  const unitPrice = Number(item.unitPrice || 0);
                                  const lineTotal = Number(item.lineTotal || unitPrice * quantity);

                                  return (
                                    <div key={`${order.id}-${idx}`} className="flex min-w-[250px] max-w-[280px] items-center gap-3 border border-gray-200 p-3">
                                      <div className="h-20 w-20 shrink-0 overflow-hidden bg-gray-100">
                                        {item.productImageUrl ? (
                                          <img src={item.productImageUrl} alt={item.productName || "Товар"} className="h-full w-full object-cover" />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center bg-gray-900 px-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                                            Fashion
                                          </div>
                                        )}
                                      </div>

                                      <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-semibold leading-tight">{item.productName || item.productId || "Товар"}</div>
                                        <div className="mt-1 text-xs text-gray-500">{item.size ? `Размер: ${item.size}` : "Размер: —"}</div>
                                        <div className="mt-3 text-sm font-bold">{formatRubles(lineTotal)}</div>
                                        <div className="text-xs text-gray-500">{formatRubles(unitPrice)} × {quantity}</div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="space-y-4 border-t border-gray-100 pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
                            <div className="text-left xl:text-right">
                              <p className="mb-1 text-[11px] uppercase tracking-[0.28em] text-gray-400">Итого</p>
                              <p className="text-2xl font-black leading-none">{formatRubles(order.totalAmount)}</p>
                              <div className="mt-2 text-xs text-gray-500">
                                Доставка: {SHIPPING_METHOD_LABELS[order.shippingMethod] || order.shippingMethod || "—"}
                                {Number.isFinite(Number(order.shippingAmount))
                                  ? ` · ${formatRubles(order.shippingAmount)}`
                                  : ""}
                              </div>
                            </div>

                            <div className="space-y-2 text-sm">
                              <div>
                                <p className="mb-1 text-[11px] uppercase tracking-[0.28em] text-gray-400">Оплата</p>
                                <p className="font-medium">{PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod || "—"}</p>
                              </div>
                              <div>
                                <p className="mb-1 text-[11px] uppercase tracking-[0.28em] text-gray-400">Адрес</p>
                                <p className="break-words text-gray-700">{order.shippingAddress || "—"}</p>
                              </div>
                              {String(order.yandexRequestId || "").trim() ? (
                                <div>
                                  <p className="mb-1 text-[11px] uppercase tracking-[0.28em] text-gray-400">Статус доставки</p>
                                  <p className="break-words text-gray-700">{getYandexDeliveryStatusText(order)}</p>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="wishlist" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {likedProducts.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 border border-dashed border-gray-300">
                  <h3 className="text-xl font-bold uppercase mb-2">Ваш список избранного пуст</h3>
                  <p className="text-gray-500">Добавляйте товары в избранное, чтобы сохранить их.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {likedProducts.map((product) => <ProductCard key={product._id} product={product} />)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="settings" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="w-full max-w-none">
                <form onSubmit={handleUpdateProfile} className="space-y-8">
                  <div className="profile-settings-layout">
                    <div className="profile-settings-main">
                      <div className="profile-settings-main-panel space-y-6">
                        <div className="space-y-2">
                          <Label htmlFor="profile-name">Полное имя</Label>
                          <Input id="profile-name" value={profile?.name || ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="rounded-none border-black focus-visible:ring-black" />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="profile-nickname">Ник</Label>
                          <Input id="profile-nickname" value={profile?.nickname || ""} onChange={(e) => setProfile({ ...profile, nickname: e.target.value })} className="rounded-none border-black focus-visible:ring-black" />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="profile-email">Email</Label>
                            {!(!emailChanged && profile?.emailVerified) && (
                              <Button type="button" variant="outline" className="h-10 rounded-none" onClick={handleStartEmailVerification} disabled={actionLoading}>Подтвердить email</Button>
                            )}
                          </div>
                          <Input id="profile-email" value={emailDraft} onChange={(e) => {
                            setEmailDraft(e.target.value);
                            setProfile((prev) => ({ ...(prev || {}), emailVerified: false }));
                          }} className="rounded-none border-black focus-visible:ring-black" placeholder="example@mail.com" />
                          {profile?.emailVerified && !emailChanged && <p className="text-xs text-emerald-600">Email подтвержден</p>}
                          {emailCodeRequested && (
                            <div className="flex gap-2">
                              <Input value={emailCode} onChange={(e) => setEmailCode(e.target.value)} placeholder="Код из письма" className="rounded-none border-black" />
                              <Button type="button" className="h-10 rounded-none" onClick={handleConfirmEmailVerification} disabled={actionLoading}>Подтвердить</Button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="profile-phone">Телефон</Label>
                            {!(!phoneChanged && profile?.phoneVerified) && (
                              <Button type="button" variant="outline" className="h-10 rounded-none" onClick={handleStartPhoneVerification} disabled={actionLoading || !!phoneVerifyState}>Подтвердить в Telegram</Button>
                            )}
                          </div>
                          <Input id="profile-phone" value={phoneDraft} onChange={(e) => {
                            setPhoneDraft(e.target.value);
                            setProfile((prev) => ({ ...(prev || {}), phoneVerified: false }));
                          }} className="rounded-none border-black focus-visible:ring-black" />
                          {profile?.phoneVerified && !phoneChanged && <p className="text-xs text-emerald-600">Телефон подтвержден</p>}
                          {!!phoneVerifyState && <p className="text-xs text-muted-foreground">Ожидаем подтверждение номера в Telegram…</p>}
                        </div>

                        <div className="flex flex-col gap-3 pt-2 md:flex-row">
                          <Button type="submit" className="bg-black text-white hover:bg-gray-800 rounded-none font-bold uppercase tracking-widest px-8 py-6 md:flex-1">СОХРАНИТЬ ИЗМЕНЕНИЯ</Button>
                          <Button type="button" variant="outline" className="rounded-none font-bold uppercase tracking-widest px-8 py-6 md:min-w-[220px]" onClick={handleLogout}>ВЫЙТИ</Button>
                        </div>
                      </div>
                    </div>

                    <div className="profile-settings-addresses space-y-3">
                      <div className="profile-settings-addresses-panel space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <Label className="text-base">Адреса доставки</Label>
                          <Button type="button" variant="outline" className="h-10 rounded-none" onClick={handleAddShippingAddress}>
                            Добавить адрес
                          </Button>
                        </div>

                        <div className="space-y-3">
                          {(profile?.shippingAddresses || []).length === 0 ? (
                            <div className="border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500">
                              Добавьте адреса доставки. Один из них будет использоваться по умолчанию.
                            </div>
                          ) : (
                            (profile?.shippingAddresses || []).map((address, index) => (
                              <div key={address.id} className="space-y-3 border border-gray-200 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="pt-3 text-xs uppercase tracking-widest text-gray-400">
                                    Адрес {index + 1}
                                  </div>
                                  <div className="flex flex-wrap items-stretch gap-2">
                                    {address.isDefault ? (
                                      <span className="inline-flex h-10 min-w-[154px] items-center justify-center border border-black bg-black px-4 text-xs font-bold uppercase tracking-widest text-white">
                                        По умолчанию
                                      </span>
                                    ) : (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-10 min-w-[154px] rounded-none px-4 text-xs font-bold uppercase tracking-widest"
                                        onClick={() => handleSetDefaultShippingAddress(address.id)}
                                      >
                                        Сделать основным
                                      </Button>
                                    )}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-10 min-w-[104px] rounded-none px-4 text-xs font-bold uppercase tracking-widest"
                                      onClick={() => handleRemoveShippingAddress(address.id)}
                                    >
                                      Удалить
                                    </Button>
                                  </div>
                                </div>

                                <AddressAutocompleteInput
                                  value={address.value}
                                  onValueChange={(nextValue) => handleShippingAddressChange(address.id, nextValue)}
                                  inputClassName="rounded-none border-black focus-visible:ring-black"
                                  placeholder="Город, улица, дом, квартира"
                                />
                              </div>
                            ))
                          )}
                        </div>

                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </TabsContent>

            {isAdmin && <TabsContent value="admin" className="animate-in fade-in slide-in-from-bottom-4 duration-500"><AdminPage embedded /></TabsContent>}
          </Tabs>
        </main>

        <Footer />
      </div>
    </Authenticated>
  );
}
