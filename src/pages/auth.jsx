import React from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth, useAuthActions } from "@/context/AuthContext";
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { FLOW } from "@/lib/api-mapping";
import { fetchPublicSettings } from "@/lib/site-settings";
import PageSeo from "@/components/PageSeo";
import { cn } from "@/lib/utils";


function AuthMiniFooter() {
  return (
    <div className="w-full space-y-3 py-4 text-center text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Link className="underline-offset-2 hover:underline" to="/privacy">Политика конфиденциальности</Link>
        <span className="hidden sm:inline">•</span>
        <Link className="underline-offset-2 hover:underline" to="/terms">Соглашение</Link>
        <span className="hidden sm:inline">•</span>
        <Link className="underline-offset-2 hover:underline" to="/offer">Оферта</Link>
      </div>
      <p>© 2026 FASHION_DEMON</p>
    </div>
  );
}

function QuickAuthTile({ label, title, active = false, disabled = false, onClick, children }) {
  return (
    <Button
      type="button"
      variant="outline"
      title={title || label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={[
        "h-14 rounded-2xl border bg-white px-0 shadow-sm transition-all hover:bg-white",
        active
          ? "border-black/60 shadow-md"
          : "border-border/70 hover:-translate-y-0.5 hover:border-black/20 hover:shadow-md",
      ].join(" ")}
    >
      <span className="sr-only">{label}</span>
      {children}
    </Button>
  );
}

function GoogleBrandIcon() {
  return (
    <span
      aria-hidden="true"
      className="text-[28px] font-semibold leading-none"
      style={{
        backgroundImage:
          "linear-gradient(135deg, #4285F4 0%, #4285F4 34%, #EA4335 34%, #EA4335 57%, #FBBC05 57%, #FBBC05 74%, #34A853 74%, #34A853 100%)",
        WebkitBackgroundClip: "text",
        color: "transparent",
      }}
    >
      G
    </span>
  );
}

function VkBrandIcon() {
  return (
    <span aria-hidden="true" className="text-lg font-black uppercase tracking-tight text-[#0077FF]">
      VK
    </span>
  );
}

function YandexBrandIcon() {
  return (
    <span aria-hidden="true" className="text-[28px] font-black leading-none text-[#FC3F1D]">
      Я
    </span>
  );
}

function TelegramBrandIcon() {
  return (
    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path
        d="M20.67 4.34L3.95 10.79C2.81 11.24 2.82 11.87 3.74 12.15L8.03 13.49L9.68 18.67C9.89 19.31 10.06 19.55 10.46 19.55C10.77 19.55 10.9 19.41 11.08 19.1L13.16 15.72L17.49 18.91C18.29 19.35 18.86 19.13 19.06 18.17L21.91 4.73C22.2 3.55 21.47 3.01 20.67 4.34Z"
        fill="#229ED9"
      />
    </svg>
  );
}

const normalizeTelegramBotUsername = (value) =>
  String(value || "").trim().replace(/^@+/, "");

const PHONE_MODAL_INITIAL_STATE = {
  open: false,
  phone: "",
  maskedDestination: "",
  code: "",
  codeLength: 6,
  ttlSeconds: 300,
  resendInSeconds: 0,
};

const PHONE_MASK_PLACEHOLDER = "+7 (999) 123-45-67";

const getPhoneDigits = (value) => {
  let digits = String(value || "").replace(/\D+/g, "");
  if (!digits) {
    return "";
  }

  if (digits[0] === "8") {
    digits = `7${digits.slice(1)}`;
  } else if (digits[0] !== "7") {
    digits = `7${digits}`;
  }

  return digits.slice(0, 11);
};

const formatPhoneInput = (value) => {
  const digits = getPhoneDigits(value);
  if (!digits) {
    return "";
  }

  let result = "+7";
  if (digits.length > 1) result += ` (${digits.slice(1, 4)}`;
  if (digits.length >= 4) result += ")";
  if (digits.length > 4) result += ` ${digits.slice(4, 7)}`;
  if (digits.length > 7) result += `-${digits.slice(7, 9)}`;
  if (digits.length > 9) result += `-${digits.slice(9, 11)}`;
  return result;
};

const normalizePhoneInput = (value) => {
  const digits = getPhoneDigits(value);
  return digits ? `+${digits}` : "";
};

const getSignInIdentifierMode = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "idle";
  }

  if (trimmed.includes("@")) {
    return "email";
  }

  if (/^[0-9+\s()\-]+$/.test(trimmed) && /\d/.test(trimmed)) {
    return "phone";
  }

  return "idle";
};

const buildTelegramWidgetErrorMessage = (normalizedText) => {
  const currentHost = typeof window === "undefined" ? "" : window.location.hostname;

  if (normalizedText.includes("bot domain invalid") || normalizedText.includes("domain invalid")) {
    return currentHost
      ? `Telegram Widget не настроен для домена ${currentHost}. Укажите этот домен у BotFather через /setdomain.`
      : "Telegram Widget не настроен для текущего домена. Укажите домен сайта у BotFather через /setdomain.";
  }

  if (normalizedText.includes("bot username invalid") || normalizedText.includes("username invalid")) {
    return "Telegram Widget не может загрузиться: проверьте username login-бота в настройках интеграции.";
  }

  return "Telegram Widget сейчас недоступен. Проверьте username бота и домен сайта, заданный у BotFather через /setdomain.";
};

export default function AuthPage() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState(null);
  const [otp, setOtp] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetStep, setResetStep] = useState("request");

  const [timer, setTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);

  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [phoneLoginDialog, setPhoneLoginDialog] = useState(PHONE_MODAL_INITIAL_STATE);

  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [authTab, setAuthTab] = useState("signin");

  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramWidgetEnabled, setTelegramWidgetEnabled] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [vkEnabled, setVkEnabled] = useState(false);
  const [yandexEnabled, setYandexEnabled] = useState(false);
  const [telegramBotUsername, setTelegramBotUsername] = useState("");
  const [telegramWidgetStatus, setTelegramWidgetStatus] = useState("idle");
  const [telegramWidgetError, setTelegramWidgetError] = useState("");
  const [telegramAuthState, setTelegramAuthState] = useState("");
  const [telegramAuthExpiresAt, setTelegramAuthExpiresAt] = useState(0);
  const [telegramAuthUrl, setTelegramAuthUrl] = useState("");
  const [externalAuthSession, setExternalAuthSession] = useState(null);
  const telegramWidgetRef = useRef(null);
  const authPopupRef = useRef(null);
  const lastPhoneAutoSubmitRef = useRef("");
  const signInIdentifierMode = getSignInIdentifierMode(signInEmail);
  const signInWithPhone = signInIdentifierMode === "phone";
  const signInPhoneReady = getPhoneDigits(signInEmail).length === 11;
  const signInFieldPlaceholder = signInWithPhone ? PHONE_MASK_PLACEHOLDER : "name@example.com";
  const signInSubmitLabel = signInWithPhone ? "Получить код" : "Войти";
  const signInSubmitLoadingLabel = signInWithPhone ? "Отправляем код..." : "Вход...";
  const authSeoTitle = pendingEmail ? "Подтверждение email" : "Вход и регистрация";

  const handleSignInIdentifierChange = (event) => {
    const nextValue = event.target.value;
    const mode = getSignInIdentifierMode(nextValue);
    setSignInEmail(mode === "phone" ? formatPhoneInput(nextValue) : nextValue);
  };

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate("/profile", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    const loadAuthProviders = async () => {
      const settings = await fetchPublicSettings({ force: true });
      const isEnabled = (value) => ["true", "1", "on", "yes"].includes(String(value || "").toLowerCase());
      const nextTelegramEnabled = isEnabled(settings?.telegram_login_enabled);
      const nextTelegramWidgetEnabled = isEnabled(settings?.telegram_widget_enabled);
      const nextTelegramBotUsername = normalizeTelegramBotUsername(settings?.telegram_bot_username || "");

      setTelegramEnabled(nextTelegramEnabled);
      setTelegramWidgetEnabled(nextTelegramWidgetEnabled);
      setGoogleEnabled(isEnabled(settings?.google_login_enabled));
      setVkEnabled(isEnabled(settings?.vk_login_enabled));
      setYandexEnabled(isEnabled(settings?.yandex_login_enabled));
      setTelegramBotUsername(nextTelegramBotUsername);
      setTelegramWidgetStatus(nextTelegramWidgetEnabled && nextTelegramBotUsername ? "loading" : "idle");
      setTelegramWidgetError("");
    };
    loadAuthProviders();
  }, []);

  const closeAuthPopup = () => {
    if (authPopupRef.current && !authPopupRef.current.closed) {
      authPopupRef.current.close();
    }
    authPopupRef.current = null;
  };

  const getProviderLabel = (provider) => {
    if (provider === "google") return "Google";
    if (provider === "vk") return "VK";
    if (provider === "yandex") return "Яндекс";
    return "Telegram";
  };

  const handleExternalSignIn = async (provider) => {
    setLoading(true);
    try {
      const started = await FLOW.externalAuthStart({ input: { provider, returnUrl: "/profile" } });
      if (!started?.authUrl || !started?.state) {
        throw new Error("External auth start failed");
      }

      setExternalAuthSession({
        provider,
        state: started.state,
        expiresAt: Number(started.expiresAt || 0),
      });

      const popup = window.open(started.authUrl, `${provider}-auth`, "width=540,height=720");
      authPopupRef.current = popup;
      if (!popup) {
        window.location.assign(started.authUrl);
        return;
      }

      toast.message(`Открылось окно входа через ${getProviderLabel(provider)}.`);
    } catch (error) {
      toast.error(getErrorMessage(error, `Не удалось начать вход через ${getProviderLabel(provider)}`));
    } finally {
      setLoading(false);
    }
  };


  const handleTelegramSignIn = async () => {
    if (!telegramEnabled || !telegramBotUsername) return;
    setLoading(true);
    try {
      const started = await FLOW.telegramStartAuth({ input: { returnUrl: "/profile" } });
      if (!started?.authUrl || !started?.state) {
        throw new Error("Telegram auth start failed");
      }

      setTelegramAuthState(started.state);
      setTelegramAuthExpiresAt(Number(started.expiresAt || 0));
      setTelegramAuthUrl(started.authUrl);
      const popup = window.open(started.authUrl, "_blank");
      if (!popup) {
        window.location.assign(started.authUrl);
      }
      toast.message("Открылся бот Telegram. Подтвердите вход, затем вернитесь на сайт.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось начать вход через Telegram"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!telegramAuthState) return undefined;

    const timer = setInterval(async () => {
      try {
        const status = await FLOW.telegramAuthStatus({ input: { state: telegramAuthState } });
        if (status?.completed && status?.token) {
          clearInterval(timer);
          const formData = new FormData();
          formData.append("flow", "telegram-state");
          formData.append("token", status.token);
          formData.append("refreshToken", status.refreshToken || "");
          formData.append("user", JSON.stringify(status.user || null));
          await signIn("telegram", formData);
          setTelegramAuthState("");
          setTelegramAuthExpiresAt(0);
          toast.success("Вход через Telegram выполнен");
          navigate("/profile", { replace: true });
          return;
        }

        if (["expired", "consumed"].includes(String(status?.status || ""))) {
          clearInterval(timer);
          setTelegramAuthState("");
          setTelegramAuthExpiresAt(0);
          if (status?.status === "expired") {
            toast.error("Сессия авторизации через Telegram истекла. Начните заново.");
          }
        }
      } catch (error) {
        clearInterval(timer);
        setTelegramAuthState("");
        setTelegramAuthExpiresAt(0);
        toast.error(getErrorMessage(error, "Ошибка проверки статуса Telegram входа"));
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [telegramAuthState, navigate, signIn]);

  useEffect(() => {
    if (!telegramWidgetEnabled || !telegramBotUsername || !telegramWidgetRef.current) {
      setTelegramWidgetStatus("idle");
      setTelegramWidgetError("");
      return undefined;
    }

    const callbackName = "__fashionDemonTelegramAuth";
    const container = telegramWidgetRef.current;
    let cancelled = false;
    let readinessTimer = 0;

    const resolveWidgetState = () => {
      if (cancelled) {
        return;
      }

      const normalizedText = String(container.textContent || "").trim().toLowerCase();
      const hasKnownError = [
        "bot domain invalid",
        "bot username invalid",
        "domain invalid",
        "username invalid",
      ].some((pattern) => normalizedText.includes(pattern));

      if (hasKnownError) {
        setTelegramWidgetStatus("unavailable");
        setTelegramWidgetError(buildTelegramWidgetErrorMessage(normalizedText));
        container.innerHTML = "";
        return;
      }

      if (container.querySelector("iframe")) {
        setTelegramWidgetStatus("ready");
        setTelegramWidgetError("");
      }
    };

    setTelegramWidgetStatus("loading");
    setTelegramWidgetError("");
    window[callbackName] = async (payload) => {
      setLoading(true);
      try {
        const result = await FLOW.telegramLogin({ input: payload });
        const formData = new FormData();
        formData.append("flow", "telegram-state");
        formData.append("token", result?.token || "");
        formData.append("refreshToken", result?.refreshToken || "");
        formData.append("user", JSON.stringify(result?.user || null));
        await signIn("telegram", formData);
        toast.success("Вход через Telegram выполнен");
        navigate("/profile", { replace: true });
      } catch (error) {
        toast.error(getErrorMessage(error, "Не удалось выполнить вход через Telegram"));
      } finally {
        setLoading(false);
      }
    };

    container.innerHTML = "";
    const observer = new MutationObserver(() => resolveWidgetState());
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", telegramBotUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", `${callbackName}(user)`);
    script.onload = () => {
      readinessTimer = window.setTimeout(() => {
        resolveWidgetState();

        if (!cancelled && !container.querySelector("iframe")) {
          setTelegramWidgetStatus("unavailable");
          setTelegramWidgetError(buildTelegramWidgetErrorMessage(""));
          container.innerHTML = "";
        }
      }, 2500);
    };
    script.onerror = () => {
      if (cancelled) {
        return;
      }

      setTelegramWidgetStatus("unavailable");
      setTelegramWidgetError("Не удалось загрузить скрипт Telegram Widget. Попробуйте позже или войдите через Telegram-бота.");
      container.innerHTML = "";
    };
    container.appendChild(script);

    return () => {
      cancelled = true;
      if (readinessTimer) {
        window.clearTimeout(readinessTimer);
      }
      observer.disconnect();
      delete window[callbackName];
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [telegramBotUsername, telegramWidgetEnabled, navigate, signIn]);

  useEffect(() => {
    if (!externalAuthSession?.state) return undefined;

    const timer = setInterval(async () => {
      try {
        const status = await FLOW.externalAuthStatus({ input: { state: externalAuthSession.state } });
        if (status?.completed && status?.token) {
          clearInterval(timer);
          closeAuthPopup();
          const formData = new FormData();
          formData.append("flow", "external-state");
          formData.append("token", status.token);
          formData.append("refreshToken", status.refreshToken || "");
          formData.append("user", JSON.stringify(status.user || null));
          await signIn(status.provider || externalAuthSession.provider, formData);
          setExternalAuthSession(null);
          toast.success(`Вход через ${getProviderLabel(status.provider || externalAuthSession.provider)} выполнен`);
          navigate(status.returnUrl || "/profile", { replace: true });
          return;
        }

        if (["expired", "consumed", "failed"].includes(String(status?.status || ""))) {
          clearInterval(timer);
          closeAuthPopup();
          setExternalAuthSession(null);
          if (status?.status === "failed") {
            toast.error(status?.detail || `Не удалось выполнить вход через ${getProviderLabel(externalAuthSession.provider)}`);
          } else if (status?.status === "expired") {
            toast.error(`Сессия входа через ${getProviderLabel(externalAuthSession.provider)} истекла. Начните заново.`);
          }
        }
      } catch (error) {
        clearInterval(timer);
        closeAuthPopup();
        setExternalAuthSession(null);
        toast.error(getErrorMessage(error, `Ошибка проверки входа через ${getProviderLabel(externalAuthSession.provider)}`));
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [externalAuthSession, navigate, signIn]);

  const mapKnownErrorMessage = (rawMessage) => {
    const normalized = (rawMessage || "").toLowerCase();
    if (normalized.includes("email already in use") || normalized.includes("user already exists")) {
      return "Этот email уже используется";
    }
    if (normalized.includes("invalid credentials")) {
      return "Неверный email или пароль";
    }
    if (normalized.includes("email is not verified")) {
      return "Email не подтвержден";
    }
    if (normalized.includes("user is blocked")) {
      return "Аккаунт заблокирован";
    }
    if (normalized.includes("password is too weak")) {
      return "Пароль слишком простой";
    }
    if (normalized.includes("phone number invalid")) {
      return "Введите корректный номер телефона";
    }
    if (normalized.includes("verification request not found")) {
      return "Запрос подтверждения не найден";
    }
    if (normalized.includes("internal server error") || normalized.includes("request failed: 500")) {
      return "Внутренняя ошибка сервера. Попробуйте еще раз.";
    }
    return rawMessage;
  };

  const getErrorMessage = (error, fallback) => {
    const message = error?.message || "";
    try {
      const parsed = JSON.parse(message);
      if (parsed?.detail) {
        if (typeof parsed.detail === "string") {
          try {
            const nested = JSON.parse(parsed.detail);
            return mapKnownErrorMessage(nested?.message || parsed.detail);
          } catch {
            return mapKnownErrorMessage(parsed.detail);
          }
        }
        return mapKnownErrorMessage(parsed.detail);
      }
    } catch {
      return mapKnownErrorMessage(message) || fallback;
    }
    return fallback;
  };

  useEffect(() => {
    let interval;
    if (pendingEmail && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else if (timer === 0) {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [pendingEmail, timer]);

  useEffect(() => {
    if (!phoneLoginDialog.open || phoneLoginDialog.resendInSeconds <= 0) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setPhoneLoginDialog((prev) => {
        if (!prev.open || prev.resendInSeconds <= 1) {
          return { ...prev, resendInSeconds: 0 };
        }

        return { ...prev, resendInSeconds: prev.resendInSeconds - 1 };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [phoneLoginDialog.open, phoneLoginDialog.resendInSeconds]);

  const openPhoneLoginDialog = (started, phone) => {
    lastPhoneAutoSubmitRef.current = "";
    setPhoneLoginDialog({
      open: true,
      phone,
      maskedDestination: String(started?.maskedDestination || phone),
      code: "",
      codeLength: Number(started?.codeLength || 6),
      ttlSeconds: Number(started?.ttlSeconds || 300),
      resendInSeconds: Number(started?.resendInSeconds || 60),
    });
  };

  const closePhoneLoginDialog = (open) => {
    if (open) {
      return;
    }

    lastPhoneAutoSubmitRef.current = "";
    setPhoneLoginDialog(PHONE_MODAL_INITIAL_STATE);
  };

  const startPhoneLogin = async (phone) => {
    const started = await FLOW.startPhoneSignIn({ input: { phone } });
    openPhoneLoginDialog(started, phone);
    return started;
  };

  const submitPhoneLoginCode = async () => {
    if (!phoneLoginDialog.phone || !phoneLoginDialog.code) {
      return;
    }

    setLoading(true);
    try {
      const result = await FLOW.confirmPhoneSignIn({
        input: {
          phone: phoneLoginDialog.phone,
          code: phoneLoginDialog.code,
        },
      });

      const formData = new FormData();
      formData.append("flow", "session");
      formData.append("token", result?.token || "");
      formData.append("refreshToken", result?.refreshToken || "");
      formData.append("user", JSON.stringify(result?.user || null));
      await signIn("phone", formData);

      setPhoneLoginDialog(PHONE_MODAL_INITIAL_STATE);
      setSignInPassword("");
      toast.success(result?.created ? "Аккаунт создан, вход выполнен" : "Вход выполнен");
      navigate("/");
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось подтвердить код"));
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneLoginConfirm = async (e) => {
    e.preventDefault();
    await submitPhoneLoginCode();
  };

  const handlePhoneLoginResend = async () => {
    if (!phoneLoginDialog.phone || phoneLoginDialog.resendInSeconds > 0) {
      return;
    }

    lastPhoneAutoSubmitRef.current = "";
    setLoading(true);
    try {
      await startPhoneLogin(phoneLoginDialog.phone);
      toast.success("Код отправлен повторно");
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось отправить код"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!phoneLoginDialog.open || loading) {
      return;
    }

    const expectedLength = Math.max(4, Math.min(phoneLoginDialog.codeLength || 6, 8));
    const normalizedCode = String(phoneLoginDialog.code || "").trim();
    if (normalizedCode.length !== expectedLength) {
      lastPhoneAutoSubmitRef.current = "";
      return;
    }

    const autoSubmitKey = `${phoneLoginDialog.phone}:${normalizedCode}`;
    if (lastPhoneAutoSubmitRef.current === autoSubmitKey) {
      return;
    }

    lastPhoneAutoSubmitRef.current = autoSubmitKey;
    void submitPhoneLoginCode();
  }, [
    loading,
    phoneLoginDialog.code,
    phoneLoginDialog.codeLength,
    phoneLoginDialog.open,
    phoneLoginDialog.phone,
  ]);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (signInWithPhone) {
        if (!signInPhoneReady) {
          toast.error("Введите номер телефона полностью.");
          return;
        }

        const normalizedPhone = normalizePhoneInput(signInEmail);
        await startPhoneLogin(normalizedPhone);
        toast.message("Код отправлен в чат Verification Codes в Telegram.");
        return;
      }

      const formData = new FormData();
      formData.append("email", signInEmail);
      formData.append("password", signInPassword);
      formData.append("flow", "signIn");
      const res = await signIn("password", formData);
      if (res.signingIn) {
        toast.success("С возвращением");
        navigate("/");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось войти"));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("email", signUpEmail);
      formData.append("password", signUpPassword);
      formData.append("flow", "signUp");
      const res = await signIn("password", formData);
      if (!res.signingIn) {
        setPendingEmail(signUpEmail);
        setTimer(30);
        setCanResend(false);
        toast.message("Мы отправили код на email. Введите его ниже.");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось создать аккаунт"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("email", pendingEmail);
      formData.append("password", otp);
      formData.append("flow", "email-verification");
      
      const res = await signIn("password", formData);
      
      if (res.signingIn) {
        toast.success("Email подтвержден");
        navigate("/");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Ошибка проверки кода"));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!canResend) return;
    setLoading(true);
    try {
      await FLOW.resendCode({ input: { email: pendingEmail } });
      toast.success("Код отправлен повторно");
      setTimer(30);
      setCanResend(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось отправить код"));
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await FLOW.requestPasswordReset({ input: { email: resetEmail } });
      setResetStep("verify");
      toast.success("Код отправлен на почту");
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось отправить код"));
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await FLOW.confirmPasswordReset({
        input: { email: resetEmail, code: resetCode, newPassword: resetNewPassword },
      });
      toast.success("Пароль обновлен");
      setShowReset(false);
      setResetStep("request");
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось обновить пароль"));
    } finally {
      setLoading(false);
    }
  };

  const quickAuthProviders = [];
  if (googleEnabled) {
    quickAuthProviders.push({
      id: "google",
      label: "Продолжить через Google",
      active: externalAuthSession?.provider === "google",
      onClick: () => handleExternalSignIn("google"),
      icon: <GoogleBrandIcon />,
    });
  }
  if (vkEnabled) {
    quickAuthProviders.push({
      id: "vk",
      label: "Продолжить через VK",
      active: externalAuthSession?.provider === "vk",
      onClick: () => handleExternalSignIn("vk"),
      icon: <VkBrandIcon />,
    });
  }
  if (yandexEnabled) {
    quickAuthProviders.push({
      id: "yandex",
      label: "Продолжить через Яндекс",
      active: externalAuthSession?.provider === "yandex",
      onClick: () => handleExternalSignIn("yandex"),
      icon: <YandexBrandIcon />,
    });
  }
  if (telegramEnabled && telegramBotUsername) {
    quickAuthProviders.push({
      id: "telegram",
      label: "Войти через Telegram",
      active: Boolean(telegramAuthState),
      onClick: handleTelegramSignIn,
      icon: <TelegramBrandIcon />,
    });
  }

  const quickAuthGridColumns = Math.max(1, Math.min(quickAuthProviders.length, 4));
  const shouldAttemptTelegramWidget = telegramWidgetEnabled && telegramBotUsername;
  const hasQuickAuthSection = quickAuthProviders.length > 0
    || (shouldAttemptTelegramWidget && telegramWidgetStatus !== "unavailable");

  if (showReset) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <PageSeo
          title="Восстановление пароля"
          description="Восстановление доступа к аккаунту fashiondemon."
          canonicalPath="/auth"
          robots="noindex,nofollow"
        />
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 pt-28 md:py-10 md:pt-0 flex items-center justify-center">
          <Card
            className="mx-auto w-full shadow-lg" style={{ width: "min(100%, 400px)" }}
          >
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Восстановление пароля</CardTitle>
              <CardDescription className="text-sm">
                {resetStep === "request"
                  ? "Введите email для получения кода"
                  : "Введите код и новый пароль"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resetStep === "request" ? (
                <form onSubmit={handleResetRequest} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      className="h-9"
                    />
                  </div>
                  <Button type="submit" className="w-full h-9" disabled={loading}>
                    {loading ? "Отправка..." : "Отправить код"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleResetConfirm} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-code">Код из письма</Label>
                    <Input
                      id="reset-code"
                      name="reset_code"
                      autoComplete="one-time-code"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      required
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-password">Новый пароль</Label>
                    <Input
                      id="reset-password"
                      name="new_password"
                      type="password"
                      autoComplete="new-password"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      required
                      className="h-9"
                    />
                  </div>
                  <Button type="submit" className="w-full h-9" disabled={loading}>
                    {loading ? "Сохранение..." : "Сохранить новый пароль"}
                  </Button>
                </form>
              )}
            </CardContent>
            <div className="p-6 pt-0">
              <Button variant="ghost" className="w-full h-9" onClick={() => setShowReset(false)}>
                Назад ко входу
              </Button>
            </div>
          </Card>
        </main>
        <AuthMiniFooter />
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <PageSeo
          title={authSeoTitle}
          description="Вход и регистрация в магазине fashiondemon."
          canonicalPath="/auth"
          robots="noindex,nofollow"
        />
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 pt-28 md:py-10 md:pt-0 flex items-center justify-center">
          <div className="text-sm text-gray-500">Проверяем сессию…</div>
        </main>
        <AuthMiniFooter />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PageSeo
        title={authSeoTitle}
        description="Вход и регистрация в магазине fashiondemon."
        canonicalPath="/auth"
        robots="noindex,nofollow"
      />
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 pt-28 md:py-10 md:pt-0 flex items-center justify-center">
        <Card className="mx-auto w-full shadow-lg" style={{ width: "min(100%, 400px)" }}>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl text-center">Вход в аккаунт</CardTitle>
            <CardDescription className="text-center text-sm">
              Войдите или зарегистрируйтесь для продолжения
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingEmail ? (
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pending-email">Email</Label>
                  <Input id="pending-email" name="email" type="email" autoComplete="email" value={pendingEmail} disabled className="h-9" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="otp">Код подтверждения</Label>
                  <Input
                    id="otp"
                    name="otp"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="123456"
                    required
                    className="h-9"
                  />
                </div>
                <Button type="submit" className="w-full h-9" disabled={loading}>
                  {loading ? "Проверка..." : "Подтвердить"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-9"
                  onClick={handleResendCode}
                  disabled={!canResend || loading}
                >
                  {canResend ? "Отправить код повторно" : `Отправить повторно через ${timer}с`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full h-9"
                  onClick={() => {
                    setPendingEmail(null);
                    setOtp("");
                    setTimer(30);
                    setCanResend(false);
                  }}
                >
                  Назад
                </Button>
              </form>
            ) : (
              <>
                <Tabs value={authTab} onValueChange={setAuthTab} defaultValue="signin" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="signin">Вход</TabsTrigger>
                  <TabsTrigger value="signup">Регистрация</TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-0">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email или телефон</Label>
                      <Input
                        id="signin-email"
                        name="email"
                        type="text"
                        autoComplete="username"
                        inputMode={signInWithPhone ? "tel" : "email"}
                        placeholder={signInFieldPlaceholder}
                        value={signInEmail}
                        onChange={handleSignInIdentifierChange}
                        required
                        className={cn(
                          "h-9",
                          signInWithPhone && "text-center font-medium tracking-[0.14em] placeholder:tracking-normal sm:text-[15px]"
                        )}
                      />
                    </div>
                    {!signInWithPhone && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label htmlFor="signin-password">Пароль</Label>
                          <Button
                            variant="link"
                            className="px-0 h-auto text-xs"
                            type="button"
                            onClick={() => setShowReset(true)}
                          >
                            Забыли пароль?
                          </Button>
                        </div>
                        <Input
                          id="signin-password"
                          name="password"
                          type="password"
                          autoComplete="current-password"
                          value={signInPassword}
                          onChange={(e) => setSignInPassword(e.target.value)}
                          required={!signInWithPhone}
                          className="h-9"
                        />
                      </div>
                    )}
                    <Button
                      type="submit"
                      className="w-full h-9"
                      disabled={loading || (signInWithPhone && !signInPhoneReady)}
                    >
                      {loading ? signInSubmitLoadingLabel : signInSubmitLabel}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="mt-0">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="example@mail.com"
                        value={signUpEmail}
                        onChange={(e) => setSignUpEmail(e.target.value)}
                        required
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Пароль</Label>
                      <Input
                        id="signup-password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Введите пароль"
                        value={signUpPassword}
                        onChange={(e) => setSignUpPassword(e.target.value)}
                        required
                        className="h-9"
                      />
                    </div>
                    <Button type="submit" className="w-full h-9" disabled={loading}>
                      {loading ? "Регистрация..." : "Зарегистрироваться"}
                    </Button>
                  </form>
                </TabsContent>
                </Tabs>
                {hasQuickAuthSection && (
                  <div className="mt-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground">или быстрый вход</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    {quickAuthProviders.length > 0 && (
                      <div
                        className="grid gap-3"
                        style={{ gridTemplateColumns: `repeat(${quickAuthGridColumns}, minmax(0, 1fr))` }}
                      >
                        {quickAuthProviders.map((provider) => (
                          <QuickAuthTile
                            key={provider.id}
                            label={provider.label}
                            title={provider.label}
                            active={provider.active}
                            disabled={loading}
                            onClick={provider.onClick}
                          >
                            {provider.icon}
                          </QuickAuthTile>
                        ))}
                        {false && (
                          <QuickAuthTile
                            label="Продолжить через Google"
                            active={externalAuthSession?.provider === "google"}
                            disabled={loading}
                            onClick={() => handleExternalSignIn("google")}
                          >
                            <GoogleBrandIcon />
                          </QuickAuthTile>
                        )}
                        {false && (
                          <QuickAuthTile
                            label="Продолжить через VK"
                            active={externalAuthSession?.provider === "vk"}
                            disabled={loading}
                            onClick={() => handleExternalSignIn("vk")}
                          >
                            <VkBrandIcon />
                          </QuickAuthTile>
                        )}
                        {false && (
                          <QuickAuthTile
                            label="Продолжить через Яндекс"
                            active={externalAuthSession?.provider === "yandex"}
                            disabled={loading}
                            onClick={() => handleExternalSignIn("yandex")}
                          >
                            <YandexBrandIcon />
                          </QuickAuthTile>
                        )}
                      </div>
                    )}

                    {shouldAttemptTelegramWidget && (
                      <div
                        className={telegramWidgetStatus === "ready"
                          ? "rounded-2xl border border-dashed border-border/70 px-3 py-3"
                          : "hidden"}
                        aria-hidden={telegramWidgetStatus !== "ready"}
                      >
                        <div ref={telegramWidgetRef} className="flex min-h-[50px] justify-center" />
                      </div>
                    )}

                    {shouldAttemptTelegramWidget && telegramWidgetStatus === "unavailable" && telegramWidgetError && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                        {telegramWidgetError}
                      </div>
                    )}

                    {false && (
                      <QuickAuthTile
                        label="Войти через Telegram"
                        title="Войти через Telegram"
                        active={Boolean(telegramAuthState)}
                        disabled={loading}
                        onClick={handleTelegramSignIn}
                      >
                        <TelegramBrandIcon />
                      </QuickAuthTile>
                    )}

                    {false && (
                      <div className="rounded-2xl border border-dashed border-border/70 px-3 py-3">
                        <p className="mb-3 text-center text-xs text-muted-foreground">
                          Мгновенный вход через Telegram widget
                        </p>
                        <div ref={telegramWidgetRef} className="flex justify-center" />
                      </div>
                    )}

                    {(telegramAuthState || externalAuthSession) && (
                      <div className="space-y-1 rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        {telegramAuthState && (
                          <p>
                            Ожидаем подтверждение входа в @{telegramBotUsername}. {telegramAuthExpiresAt ? "Ссылка действует 10 минут." : ""}
                          </p>
                        )}
                        {externalAuthSession && (
                          <p>
                            Ожидаем завершение входа через {getProviderLabel(externalAuthSession.provider)}.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <Dialog open={phoneLoginDialog.open} onOpenChange={closePhoneLoginDialog}>
                  <DialogContent className="max-w-[440px] overflow-hidden rounded-[28px] border border-black/10 p-0 shadow-[0_28px_90px_rgba(15,23,42,0.28)]">
                    <div className="border-b border-border/70 bg-[#f8fafc] px-6 py-5">
                      <DialogHeader className="space-y-4 text-center">
                        <div className="inline-flex w-fit items-center gap-2 self-center rounded-full border border-[#229ED9]/20 bg-[#229ED9]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#229ED9]">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Telegram Gateway
                        </div>
                        <div className="space-y-2">
                          <DialogTitle className="text-xl font-black uppercase tracking-wide">Подтверждение входа</DialogTitle>
                          <DialogDescription className="mt-2 text-sm leading-6 text-muted-foreground">
                            {phoneLoginDialog.maskedDestination
                              ? `Код отправлен в чат Verification Codes в Telegram для ${phoneLoginDialog.maskedDestination}.`
                              : "Введите код из Telegram, чтобы продолжить вход."}
                          </DialogDescription>
                        </div>
                      </DialogHeader>
                    </div>
                    <form onSubmit={handlePhoneLoginConfirm} className="space-y-5 px-6 py-6">
                      <div className="space-y-2">
                        <Label htmlFor="phone-login-code">Код подтверждения</Label>
                        <Input
                          id="phone-login-code"
                          name="phone_login_code"
                          autoComplete="one-time-code"
                          inputMode="numeric"
                          placeholder={"•".repeat(Math.max(4, Math.min(phoneLoginDialog.codeLength || 6, 8)))}
                          value={phoneLoginDialog.code}
                          onChange={(e) =>
                            setPhoneLoginDialog((prev) => ({
                              ...prev,
                              code: e.target.value
                                .replace(/\D+/g, "")
                                .slice(0, Math.max(4, Math.min(prev.codeLength || 6, 8))),
                            }))
                          }
                          required
                          className="h-14 rounded-2xl border-black/15 text-center text-lg font-semibold tracking-[0.36em] placeholder:tracking-[0.36em] focus-visible:ring-black/20"
                        />
                      </div>
                      <DialogFooter className="grid gap-3 sm:grid-cols-2 sm:space-x-0">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 min-w-0 rounded-2xl border-black/15 px-4 text-sm"
                          onClick={handlePhoneLoginResend}
                          disabled={loading || phoneLoginDialog.resendInSeconds > 0}
                        >
                          {phoneLoginDialog.resendInSeconds > 0
                            ? `Повторить ${phoneLoginDialog.resendInSeconds}с`
                            : "Повторить"}
                        </Button>
                        <Button
                          type="submit"
                          className="h-11 min-w-0 rounded-2xl px-4 text-sm"
                          disabled={loading || !phoneLoginDialog.code.trim()}
                        >
                          {loading ? "Проверяем..." : "Подтвердить"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <AuthMiniFooter />
    </div>
  );
}
