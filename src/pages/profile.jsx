import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { fetchPublicSettings } from "@/lib/site-settings";
import {
  YOO_KASSA_PAYMENT_METHOD_LABELS,
  YOO_KASSA_PAYMENT_STATUS_LABELS,
  YOO_MONEY_PAYMENT_METHOD_LABELS,
  YOO_MONEY_PAYMENT_STATUS_LABELS,
  submitHostedCheckout,
} from "@/lib/yoomoney";

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

ORDER_STATUS_LABELS.pending_payment = "Ожидает оплаты";
Object.assign(PAYMENT_METHOD_LABELS, YOO_MONEY_PAYMENT_METHOD_LABELS);
Object.assign(PAYMENT_METHOD_LABELS, YOO_KASSA_PAYMENT_METHOD_LABELS);

const SHIPPING_METHOD_LABELS = {
  home: "До двери",
  pickup: "ПВЗ",
  self_pickup: "Самовывоз",
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

const normalizePaymentStatus = (value) => String(value || "").trim().toLowerCase();

const formatPaymentStatus = (value) => {
  const normalized = normalizePaymentStatus(value);
  return YOO_MONEY_PAYMENT_STATUS_LABELS[normalized]
    || YOO_KASSA_PAYMENT_STATUS_LABELS[normalized]
    || value
    || "—";
};

const getPaymentStatusBadgeClassName = (value) => {
  switch (normalizePaymentStatus(value)) {
    case "paid":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "review_required":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "expired":
    case "canceled":
    case "cancelled":
    case "error":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
};

const getOrderPaymentSummaryText = (payment) => {
  if (!payment) {
    return "";
  }

  const status = normalizePaymentStatus(payment.status);

  if (status === "paid") {
    return payment.paidAt
      ? `Оплата подтверждена ${formatOrderDateTime(payment.paidAt)}.`
      : "Оплата подтверждена.";
  }

  if (status === "review_required") {
    return "Платеж найден, но требует ручной проверки менеджером.";
  }

  if (status === "expired") {
    return "Срок действия счета истек. Можно запросить форму оплаты заново.";
  }

  if (status === "canceled" || status === "cancelled") {
    return "Счет отменен.";
  }

  if (payment.expiresAt) {
    return `Счет ожидает оплату до ${formatOrderDateTime(payment.expiresAt)}.`;
  }

  return "Счет создан и ожидает оплату.";
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

const getOrderPromoCodeValue = (order) => {
  const normalized = String(order?.promoCode || "").trim();
  return normalized || "";
};

const getOrderPromoDiscountValue = (order) => {
  const value = Number(order?.promoDiscountAmount ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
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

const EXTERNAL_AUTH_PROVIDERS = [
  { id: "telegram", label: "Telegram" },
  { id: "google", label: "Google" },
  { id: "yandex", label: "Яндекс" },
];

const isPublicSettingEnabled = (value) => ["true", "1", "on", "yes"].includes(String(value || "").toLowerCase());

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

const getExternalProviderLabel = (provider) => {
  if (provider === "google") return "Google";
  if (provider === "yandex") return "Яндекс";
  return "Telegram";
};

export default function ProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => normalizeProfileTab(searchParams.get("tab")));
  const [loading, setLoading] = useState(true);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const confirmAction = useConfirmDialog();

  const [orders, setOrders] = useState([]);
  const [likedItems, setLikedItems] = useState([]);
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [availableExternalAuthProviders, setAvailableExternalAuthProviders] = useState({
    telegram: false,
    google: false,
    yandex: false,
  });
  const [linkingProvider, setLinkingProvider] = useState("");
  const [unlinkingProvider, setUnlinkingProvider] = useState("");
  const [telegramLinkState, setTelegramLinkState] = useState("");
  const [externalLinkSession, setExternalLinkSession] = useState(null);

  const [emailDraft, setEmailDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeRequested, setEmailCodeRequested] = useState(false);
  const [phoneVerifyState, setPhoneVerifyState] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [paymentActionOrderId, setPaymentActionOrderId] = useState("");
  const [paymentRefreshOrderId, setPaymentRefreshOrderId] = useState("");
  const handledPaymentReturnRef = useRef("");
  const authPopupRef = useRef(null);

  useEffect(() => {
    const nextTab = normalizeProfileTab(searchParams.get("tab"), isAdmin);
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, isAdmin, searchParams]);

  const loadOrders = async () => {
    const ordersRes = await FLOW.getUserOrders({ input: {} });
    const nextOrders = Array.isArray(ordersRes) ? ordersRes : [];
    setOrders(nextOrders);
    return nextOrders;
  };

  const buildPaymentReturnUrl = () => {
    if (typeof window === "undefined") {
      return null;
    }

    return `${window.location.origin}/profile?tab=orders`;
  };

  const refreshOrdersWithPaymentFeedback = async (orderId, successMessage) => {
    await FLOW.refreshOrderPayment({ input: { orderId } });
    await loadOrders();
    toast.success(successMessage);
  };

  const handleOpenPaymentCheckout = async (orderId) => {
    setPaymentActionOrderId(orderId);

    try {
      const response = await FLOW.getOrderPaymentCheckout({
        input: {
          orderId,
          returnUrl: buildPaymentReturnUrl(),
        },
      });

      if (!response?.checkout) {
        throw new Error("Счет для оплаты сейчас недоступен.");
      }

      submitHostedCheckout(response.checkout);
    } catch (error) {
      toast.error(error?.message || "Не удалось открыть форму оплаты ЮMoney.");
    } finally {
      setPaymentActionOrderId((current) => (current === orderId ? "" : current));
    }
  };

  const handleRefreshOrderPayment = async (orderId, successMessage = "Статус оплаты обновлен.") => {
    setPaymentRefreshOrderId(orderId);

    try {
      await refreshOrdersWithPaymentFeedback(orderId, successMessage);
    } catch (error) {
      toast.error(error?.message || "Не удалось обновить статус оплаты.");
    } finally {
      setPaymentRefreshOrderId((current) => (current === orderId ? "" : current));
    }
  };

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
        const [, likesRes, profileRes, publicSettings] = await Promise.all([
          loadOrders(),
          FLOW.getUserLikes({ input: {} }),
          FLOW.getProfile({ input: {} }),
          fetchPublicSettings().catch(() => ({})),
        ]);

        if (Array.isArray(likesRes)) {
          setLikedItems(likesRes.filter((like) => like?.product));
        }
        if (profileRes) {
          const shippingAddresses = sanitizeProfileAddresses(profileRes.shippingAddresses, profileRes.shippingAddress);
          setProfile({
            ...profileRes,
            externalIdentities: Array.isArray(profileRes.externalIdentities) ? profileRes.externalIdentities : [],
            shippingAddresses,
            shippingAddress: getDefaultProfileAddressValue(shippingAddresses, profileRes.shippingAddress),
          });
          setEmailDraft(profileRes.email || "");
          setPhoneDraft(profileRes.phone || "");
          setIsAdmin(!!profileRes.isAdmin);
        }

        setAvailableExternalAuthProviders({
          telegram: isPublicSettingEnabled(publicSettings?.telegram_login_enabled) || isPublicSettingEnabled(publicSettings?.telegram_widget_enabled),
          google: isPublicSettingEnabled(publicSettings?.google_login_enabled),
          yandex: isPublicSettingEnabled(publicSettings?.yandex_login_enabled),
        });
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

  useEffect(() => {
    const paymentStatus = searchParams.get("paymentStatus");
    const orderId = searchParams.get("orderId");
    const paymentId = searchParams.get("paymentId");

    if (paymentStatus !== "return" || !orderId) {
      return undefined;
    }

    const handledKey = `${paymentStatus}:${orderId}:${paymentId || ""}`;
    if (handledPaymentReturnRef.current === handledKey) {
      return undefined;
    }

    handledPaymentReturnRef.current = handledKey;
    setActiveTab("orders");

    let cancelled = false;

    const run = async () => {
      setPaymentRefreshOrderId(orderId);

      try {
        await FLOW.refreshOrderPayment({ input: { orderId } });
        if (!cancelled) {
          await loadOrders();
          toast.success("Возврат из ЮMoney выполнен. Статус оплаты обновлен.");
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error?.message || "Не удалось обновить оплату после возврата из ЮMoney.");
        }
      } finally {
        if (!cancelled) {
          setPaymentRefreshOrderId((current) => (current === orderId ? "" : current));
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("tab", "orders");
            next.delete("paymentStatus");
            next.delete("orderId");
            next.delete("paymentId");
            return next;
          }, { replace: true });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  const emailChanged = useMemo(
    () => String(emailDraft || "").trim().toLowerCase() !== String(profile?.email || "").trim().toLowerCase(),
    [emailDraft, profile?.email]
  );
  const phoneChanged = useMemo(
    () => normalizePhone(phoneDraft) !== normalizePhone(profile?.phone),
    [phoneDraft, profile?.phone]
  );
  const externalAuthMethods = useMemo(() => {
    const identities = Array.isArray(profile?.externalIdentities) ? profile.externalIdentities : [];

    return EXTERNAL_AUTH_PROVIDERS.map((provider) => {
      const identity = identities.find((item) => item?.provider === provider.id) || null;
      return {
        ...provider,
        identity,
        available: !!availableExternalAuthProviders[provider.id],
      };
    });
  }, [availableExternalAuthProviders, profile?.externalIdentities]);
  const visibleExternalAuthMethods = useMemo(
    () => externalAuthMethods.filter((method) => method.available || !!method.identity),
    [externalAuthMethods]
  );

  const closeExternalAuthPopup = () => {
    if (authPopupRef.current && !authPopupRef.current.closed) {
      authPopupRef.current.close();
    }
    authPopupRef.current = null;
  };

  const refreshExternalIdentityState = async () => {
    const profileRes = await FLOW.getProfile({ input: {} });
    const nextIdentities = Array.isArray(profileRes?.externalIdentities) ? profileRes.externalIdentities : [];

    setProfile((prev) => (
      prev
        ? {
            ...prev,
            email: profileRes?.email || "",
            phone: profileRes?.phone || "",
            emailVerified: !!profileRes?.emailVerified,
            phoneVerified: !!profileRes?.phoneVerified,
            externalIdentities: nextIdentities,
          }
        : profileRes
    ));

    if (!emailChanged) {
      setEmailDraft(profileRes?.email || "");
    }
    if (!phoneChanged) {
      setPhoneDraft(profileRes?.phone || "");
    }

    return profileRes;
  };

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
      } catch {
        setPhoneVerifyState("");
        clearInterval(timer);
        toast.error("Не удалось проверить статус подтверждения телефона");
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [phoneVerifyState]);

  useEffect(() => () => closeExternalAuthPopup(), []);

  useEffect(() => {
    if (!telegramLinkState) return undefined;

    const timer = setInterval(async () => {
      try {
        const status = await FLOW.telegramAuthStatus({ input: { state: telegramLinkState } });
        if (status?.completed && status?.linked) {
          setTelegramLinkState("");
          setLinkingProvider("");
          await refreshExternalIdentityState();
          toast.success("Telegram привязан к профилю");
          clearInterval(timer);
          return;
        }

        if (["expired", "consumed"].includes(String(status?.status || ""))) {
          setTelegramLinkState("");
          setLinkingProvider("");
          clearInterval(timer);
          if (status?.status === "expired") {
            toast.error("Сессия привязки Telegram истекла. Начните заново.");
          }
        }
      } catch (error) {
        setTelegramLinkState("");
        setLinkingProvider("");
        clearInterval(timer);
        toast.error(error?.message || "Не удалось завершить привязку Telegram");
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [telegramLinkState, emailChanged, phoneChanged]);

  useEffect(() => {
    if (!externalLinkSession?.state) return undefined;

    const timer = setInterval(async () => {
      try {
        const status = await FLOW.externalAuthStatus({ input: { state: externalLinkSession.state } });
        if (status?.completed && status?.linked) {
          clearInterval(timer);
          closeExternalAuthPopup();
          setExternalLinkSession(null);
          setLinkingProvider("");
          await refreshExternalIdentityState();
          toast.success(`${getExternalProviderLabel(status.provider || externalLinkSession.provider)} привязан к профилю`);
          return;
        }

        if (["expired", "consumed", "failed"].includes(String(status?.status || ""))) {
          clearInterval(timer);
          closeExternalAuthPopup();
          setExternalLinkSession(null);
          setLinkingProvider("");
          if (status?.status === "failed") {
            toast.error(status?.detail || `Не удалось привязать ${getExternalProviderLabel(externalLinkSession.provider)}`);
          } else if (status?.status === "expired") {
            toast.error(`Сессия привязки ${getExternalProviderLabel(externalLinkSession.provider)} истекла. Начните заново.`);
          }
        }
      } catch (error) {
        clearInterval(timer);
        closeExternalAuthPopup();
        setExternalLinkSession(null);
        setLinkingProvider("");
        toast.error(error?.message || `Не удалось завершить привязку ${getExternalProviderLabel(externalLinkSession.provider)}`);
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [externalLinkSession, emailChanged, phoneChanged]);

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

  const handleLinkExternal = async (provider) => {
    if (!provider || linkingProvider || unlinkingProvider) return;

    setLinkingProvider(provider);
    try {
      if (provider === "telegram") {
        const started = await FLOW.telegramStartAuth({ input: { returnUrl: "/profile?tab=settings", intent: "link" } });
        if (!started?.state || !started?.authUrl) {
          throw new Error("Не удалось начать привязку Telegram");
        }

        setTelegramLinkState(started.state);
        window.open(started.authUrl, "_blank", "noopener,noreferrer");
        toast.message("Открылся Telegram-бот. Подтвердите привязку и вернитесь на сайт.");
        return;
      }

      const started = await FLOW.externalAuthStart({
        input: {
          provider,
          returnUrl: "/profile?tab=settings",
          intent: "link",
        },
      });
      if (!started?.authUrl || !started?.state) {
        throw new Error(`Не удалось начать привязку ${getExternalProviderLabel(provider)}`);
      }

      setExternalLinkSession({
        provider,
        state: started.state,
        expiresAt: Number(started.expiresAt || 0),
      });

      const popup = window.open(started.authUrl, `${provider}-link`, "width=540,height=720");
      authPopupRef.current = popup;
      if (!popup) {
        window.location.assign(started.authUrl);
        return;
      }

      toast.message(`Открылось окно ${getExternalProviderLabel(provider)}. Подтвердите привязку и вернитесь на сайт.`);
    } catch (error) {
      closeExternalAuthPopup();
      setTelegramLinkState("");
      setExternalLinkSession(null);
      setLinkingProvider("");
      toast.error(error?.message || `Не удалось начать привязку ${getExternalProviderLabel(provider)}`);
    }
  };

  const handleUnlinkExternal = async (provider) => {
    if (!provider || linkingProvider || unlinkingProvider) return;

    const confirmed = await confirmAction({
      title: `Отвязать ${getExternalProviderLabel(provider)}?`,
      description: "Этот способ входа перестанет работать для текущего профиля. Если это последний способ входа, система не даст отвязать его без подтвержденного email или другой привязки.",
      confirmText: "Отвязать",
    });
    if (!confirmed) return;

    setUnlinkingProvider(provider);
    try {
      const result = await FLOW.unlinkExternalIdentity({ input: { provider } });
      const nextIdentities = Array.isArray(result?.externalIdentities) ? result.externalIdentities : [];
      setProfile((prev) => (
        prev
          ? {
              ...prev,
              externalIdentities: nextIdentities,
            }
          : prev
      ));
      toast.success(`${getExternalProviderLabel(provider)} отвязан`);
    } catch (error) {
      toast.error(error?.message || `Не удалось отвязать ${getExternalProviderLabel(provider)}`);
    } finally {
      setUnlinkingProvider("");
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

  const likedProducts = likedItems
    .map((item) => item?.product)
    .filter(Boolean);

  const handleWishlistLikeChange = (liked, product) => {
    if (liked) return;
    setLikedItems((prev) => prev.filter((item) => item.productId !== product._id));
  };

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
                              {getOrderPromoCodeValue(order) ? (
                                <div className="mt-2 space-y-1 text-xs text-gray-500">
                                  <div>
                                    Промокод: <span className="font-mono text-gray-900">{getOrderPromoCodeValue(order)}</span>
                                  </div>
                                  {getOrderPromoDiscountValue(order) > 0 ? (
                                    <div className="text-emerald-700">Скидка: -{formatRubles(getOrderPromoDiscountValue(order))}</div>
                                  ) : null}
                                </div>
                              ) : null}
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
                              {order.payment ? (
                                <div className="rounded-none border border-gray-200 bg-gray-50 p-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${getPaymentStatusBadgeClassName(order.payment.status)}`}>
                                      {formatPaymentStatus(order.payment.status)}
                                    </span>
                                    {order.payment.label ? (
                                      <span className="font-mono text-[11px] text-gray-500">
                                        {order.payment.label}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-2 text-sm text-gray-700">
                                    {getOrderPaymentSummaryText(order.payment)}
                                  </p>
                                  <div className="mt-2 space-y-1 text-xs text-gray-500">
                                    {Number.isFinite(Number(order.payment.chargeAmount)) ? (
                                      <div>К оплате: {formatRubles(order.payment.chargeAmount)}</div>
                                    ) : null}
                                    {order.payment.receiverMasked ? (
                                      <div>Кошелек получателя: {order.payment.receiverMasked}</div>
                                    ) : null}
                                    {order.payment.lastError ? (
                                      <div className="text-red-600">{order.payment.lastError}</div>
                                    ) : null}
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {order.payment.canPay ? (
                                      <Button
                                        type="button"
                                        className="h-10 rounded-none bg-black px-4 text-xs font-bold uppercase tracking-[0.18em] text-white hover:bg-gray-800"
                                        onClick={() => handleOpenPaymentCheckout(order.id)}
                                        disabled={paymentActionOrderId === order.id}
                                      >
                                        {paymentActionOrderId === order.id ? "Переход..." : "Оплатить"}
                                      </Button>
                                    ) : null}
                                    {order.payment.canRefresh ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-10 rounded-none px-4 text-xs font-bold uppercase tracking-[0.18em]"
                                        onClick={() => handleRefreshOrderPayment(order.id)}
                                        disabled={paymentRefreshOrderId === order.id}
                                      >
                                        {paymentRefreshOrderId === order.id ? "Проверяем..." : "Проверить оплату"}
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
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
                  {likedProducts.map((product) => (
                    <ProductCard
                      key={product._id}
                      product={product}
                      allowQuickAdd={!product.isHidden}
                      initialLiked
                      onLikeChange={handleWishlistLikeChange}
                    />
                  ))}
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
                          <Input id="profile-name" name="name" autoComplete="name" value={profile?.name || ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="rounded-none border-black focus-visible:ring-black" />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="profile-nickname">Ник</Label>
                          <Input id="profile-nickname" name="nickname" autoComplete="off" value={profile?.nickname || ""} onChange={(e) => setProfile({ ...profile, nickname: e.target.value })} className="rounded-none border-black focus-visible:ring-black" />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="profile-email">Email</Label>
                            {!(!emailChanged && profile?.emailVerified) && (
                              <Button type="button" variant="outline" className="h-10 rounded-none" onClick={handleStartEmailVerification} disabled={actionLoading}>Подтвердить email</Button>
                            )}
                          </div>
                          <Input id="profile-email" name="email" type="email" autoComplete="email" value={emailDraft} onChange={(e) => {
                            setEmailDraft(e.target.value);
                            setProfile((prev) => ({ ...(prev || {}), emailVerified: false }));
                          }} className="rounded-none border-black focus-visible:ring-black" placeholder="example@mail.com" />
                          {profile?.emailVerified && !emailChanged && <p className="text-xs text-emerald-600">Email подтвержден</p>}
                          {emailCodeRequested && (
                            <div className="flex gap-2">
                              <Label htmlFor="profile-email-code" className="sr-only">Код подтверждения email</Label>
                              <Input id="profile-email-code" name="email_verification_code" autoComplete="one-time-code" value={emailCode} onChange={(e) => setEmailCode(e.target.value)} placeholder="Код из письма" className="rounded-none border-black" />
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
                          <Input id="profile-phone" name="tel" type="tel" autoComplete="tel" value={phoneDraft} onChange={(e) => {
                            setPhoneDraft(e.target.value);
                            setProfile((prev) => ({ ...(prev || {}), phoneVerified: false }));
                          }} className="rounded-none border-black focus-visible:ring-black" />
                          {profile?.phoneVerified && !phoneChanged && <p className="text-xs text-emerald-600">Телефон подтвержден</p>}
                          {!!phoneVerifyState && <p className="text-xs text-muted-foreground">Ожидаем подтверждение номера в Telegram…</p>}
                        </div>

                        {visibleExternalAuthMethods.length > 0 ? (
                          <div className="space-y-4 rounded-none border border-gray-200 p-4">
                            <div className="text-sm font-semibold uppercase tracking-widest">Связанные способы входа</div>

                          <div className="grid gap-3 md:grid-cols-3">
                            {visibleExternalAuthMethods.map((method) => {
                              const connected = !!method.identity;
                              const isLinking = linkingProvider === method.id;
                              const isUnlinking = unlinkingProvider === method.id;
                              const cardClassName = connected
                                ? "space-y-2 rounded-none border border-emerald-200 bg-emerald-50 p-3"
                                : method.available
                                  ? "space-y-2 rounded-none border border-gray-200 bg-white p-3"
                                  : "space-y-2 rounded-none border border-amber-200 bg-amber-50 p-3";
                              const statusLabel = connected
                                ? "Подключен"
                                : method.available
                                  ? "Не подключен"
                                  : "Отключен";

                              return (
                                <div key={method.id} className={cardClassName}>
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="font-semibold">{method.label}</div>
                                    <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{statusLabel}</span>
                                  </div>

                                  {connected ? (
                                    <div className="space-y-1 text-sm text-gray-700">
                                      {method.identity.displayName && <div>{method.identity.displayName}</div>}
                                      {method.identity.providerUsername && <div>@{method.identity.providerUsername}</div>}
                                      {method.identity.providerEmail && <div className="break-all">{method.identity.providerEmail}</div>}
                                      {method.identity.lastUsedAt ? (
                                        <div className="text-xs text-muted-foreground">
                                          Последний вход: {formatOrderDateTime(method.identity.lastUsedAt)}
                                        </div>
                                      ) : (
                                        <div className="text-xs text-muted-foreground">Аккаунт уже связан с этим профилем.</div>
                                      )}
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="mt-2 h-10 w-full rounded-none"
                                        onClick={() => handleUnlinkExternal(method.id)}
                                        disabled={isUnlinking || !!linkingProvider}
                                      >
                                        {isUnlinking ? "Отвязываем..." : "Отвязать"}
                                      </Button>
                                    </div>
                                  ) : method.available ? (
                                    <>
                                    <p className="text-sm text-muted-foreground">
                                      Этот способ входа доступен, но пока не привязан к вашему аккаунту.
                                    </p>
                                    <Button
                                      type="button"
                                      className="h-10 w-full rounded-none bg-black text-white hover:bg-gray-800"
                                      onClick={() => handleLinkExternal(method.id)}
                                      disabled={isLinking || !!unlinkingProvider}
                                    >
                                      {isLinking ? "Подключаем..." : "Привязать"}
                                    </Button>
                                    </>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                          </div>
                        ) : null}

                        <div className="flex flex-col gap-3 pt-2 md:flex-row">
                          <Button type="submit" className="bg-black text-white hover:bg-gray-800 rounded-none font-bold uppercase tracking-widest px-8 py-6 md:flex-1">СОХРАНИТЬ ИЗМЕНЕНИЯ</Button>
                          <Button type="button" variant="outline" className="rounded-none font-bold uppercase tracking-widest px-8 py-6 md:min-w-[220px]" onClick={handleLogout}>ВЫЙТИ</Button>
                        </div>
                      </div>
                    </div>

                    <div className="profile-settings-addresses space-y-3">
                      <div className="profile-settings-addresses-panel space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-base font-medium leading-none">Адреса доставки</div>
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

                                <Label htmlFor={`profile-shipping-address-${address.id}`} className="sr-only">
                                  Адрес доставки {index + 1}
                                </Label>
                                <AddressAutocompleteInput
                                  id={`profile-shipping-address-${address.id}`}
                                  name={`shipping-address-${index + 1}`}
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
