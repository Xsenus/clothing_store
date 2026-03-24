import React from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth, useAuthActions } from "@/context/AuthContext";
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { FLOW } from "@/lib/api-mapping";
import { fetchPublicSettings } from "@/lib/site-settings";
import PageSeo from "@/components/PageSeo";


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

  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [authTab, setAuthTab] = useState("signin");

  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramWidgetEnabled, setTelegramWidgetEnabled] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [yandexEnabled, setYandexEnabled] = useState(false);
  const [telegramBotUsername, setTelegramBotUsername] = useState("");
  const [telegramAuthState, setTelegramAuthState] = useState("");
  const [telegramAuthExpiresAt, setTelegramAuthExpiresAt] = useState(0);
  const [externalAuthSession, setExternalAuthSession] = useState(null);
  const telegramWidgetRef = useRef(null);
  const authPopupRef = useRef(null);
  const authSeoTitle = pendingEmail ? "Подтверждение email" : "Вход и регистрация";

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate("/profile", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    const loadAuthProviders = async () => {
      const settings = await fetchPublicSettings();
      const isEnabled = (value) => ["true", "1", "on", "yes"].includes(String(value || "").toLowerCase());
      setTelegramEnabled(isEnabled(settings?.telegram_login_enabled));
      setTelegramWidgetEnabled(isEnabled(settings?.telegram_widget_enabled));
      setGoogleEnabled(isEnabled(settings?.google_login_enabled));
      setYandexEnabled(isEnabled(settings?.yandex_login_enabled));
      setTelegramBotUsername(settings?.telegram_bot_username || "");
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
      window.open(started.authUrl, "_blank", "noopener,noreferrer");
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
      return undefined;
    }

    const callbackName = "__fashionDemonTelegramAuth";
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

    const container = telegramWidgetRef.current;
    container.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", telegramBotUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", `${callbackName}(user)`);
    container.appendChild(script);

    return () => {
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
          } catch (innerError) {
            return mapKnownErrorMessage(parsed.detail);
          }
        }
        return mapKnownErrorMessage(parsed.detail);
      }
    } catch (e) {
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

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
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
                {(googleEnabled || yandexEnabled || (telegramEnabled && telegramBotUsername)) && (
                  <div className="mb-5 space-y-3">
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Быстрый вход и регистрация</p>
                      {googleEnabled && (
                        <Button type="button" variant="outline" className="w-full h-9" onClick={() => handleExternalSignIn("google")} disabled={loading}>
                          Продолжить через Google
                        </Button>
                      )}
                      {yandexEnabled && (
                        <Button type="button" variant="outline" className="w-full h-9" onClick={() => handleExternalSignIn("yandex")} disabled={loading}>
                          Продолжить через Яндекс
                        </Button>
                      )}
                      {telegramWidgetEnabled && telegramBotUsername && (
                        <div className="rounded-md border border-dashed px-3 py-3">
                          <p className="mb-2 text-xs text-muted-foreground">Telegram widget: самый быстрый вход без переходов по боту.</p>
                          <div ref={telegramWidgetRef} className="flex justify-center" />
                        </div>
                      )}
                      {telegramEnabled && telegramBotUsername && (
                        <Button type="button" variant="outline" className="w-full h-9" onClick={handleTelegramSignIn} disabled={loading}>
                          Войти через Telegram в боте
                        </Button>
                      )}
                    </div>
                    {(telegramAuthState || externalAuthSession) && (
                      <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
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
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground">или по email</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  </div>
                )}
                <Tabs value={authTab} onValueChange={setAuthTab} defaultValue="signin" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="signin">Вход</TabsTrigger>
                  <TabsTrigger value="signup">Регистрация</TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-0">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input
                        id="signin-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="example@mail.com"
                        value={signInEmail}
                        onChange={(e) => setSignInEmail(e.target.value)}
                        required
                        className="h-9"
                      />
                    </div>
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
                        required
                        className="h-9"
                      />
                    </div>
                    <Button type="submit" className="w-full h-9" disabled={loading}>
                      {loading ? "Вход..." : "Войти"}
                    </Button>
                    {false && telegramEnabled && telegramBotUsername && (
                      <div className="pt-1 space-y-2">
                        <p className="text-xs text-muted-foreground">Или войдите через Telegram:</p>
                        <Button type="button" variant="outline" className="w-full h-9" onClick={handleTelegramSignIn} disabled={loading}>
                          Войти через Telegram
                        </Button>
                        {telegramAuthState && (
                          <p className="text-xs text-muted-foreground">
                            Ожидаем подтверждение в @{telegramBotUsername}. {telegramAuthExpiresAt ? "Ссылка действует 10 минут." : ""}
                          </p>
                        )}
                      </div>
                    )}
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
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <AuthMiniFooter />
    </div>
  );
}
