import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthActions } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { FLOW } from "@/lib/api-mapping";

export default function AuthPage() {
  const { signIn } = useAuthActions();
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

  const getErrorMessage = (error, fallback) => {
    const message = error?.message || "";
    try {
      const parsed = JSON.parse(message);
      if (parsed?.detail) {
        if (typeof parsed.detail === "string") {
          try {
            const nested = JSON.parse(parsed.detail);
            return nested?.message || parsed.detail;
          } catch (innerError) {
            return parsed.detail;
          }
        }
        return parsed.detail;
      }
    } catch (e) {
      return message || fallback;
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
      toast.error("Неверные данные или требуется подтверждение email");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (signUpPassword.length < 8) {
      toast.error("Пароль должен быть не менее 8 символов");
      return;
    }
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
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 flex items-center justify-center">
          <Card
            className="w-full max-w-[400px] shadow-lg !max-w-[400px]"
            style={{ width: "400px", maxWidth: "400px" }}
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
                      type="email"
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
                      type="password"
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
      <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 flex items-center justify-center">
        <div className="w-full max-w-[400px] !max-w-[400px]" style={{ width: "400px", maxWidth: "400px" }}>
          <Card className="w-full shadow-lg" style={{ width: "400px", maxWidth: "400px" }}>
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
                  <Label>Email</Label>
                  <Input value={pendingEmail} disabled className="h-9" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="otp">Код подтверждения</Label>
                  <Input
                    id="otp"
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
                        type="email"
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
                        type="password"
                        value={signInPassword}
                        onChange={(e) => setSignInPassword(e.target.value)}
                        required
                        className="h-9"
                      />
                    </div>
                    <Button type="submit" className="w-full h-9" disabled={loading}>
                      {loading ? "Вход..." : "Войти"}
                    </Button>
                    <div className="text-[11px] leading-snug text-center text-gray-500">
                      Входя, вы принимаете{" "}
                      <Link className="underline hover:text-gray-700" to="/privacy">
                        политику конфиденциальности
                      </Link>
                      ,{" "}
                      <Link className="underline hover:text-gray-700" to="/agreement">
                        соглашение
                      </Link>{" "}
                      и{" "}
                      <Link className="underline hover:text-gray-700" to="/offer">
                        оферту
                      </Link>
                    </div>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="mt-0">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
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
                        type="password"
                        placeholder="Минимум 8 символов"
                        value={signUpPassword}
                        onChange={(e) => setSignUpPassword(e.target.value)}
                        required
                        minLength={8}
                        className="h-9"
                      />
                    </div>
                    <Button type="submit" className="w-full h-9" disabled={loading}>
                      {loading ? "Регистрация..." : "Зарегистрироваться"}
                    </Button>
                    <div className="text-[11px] leading-snug text-center text-gray-500">
                      Регистрируясь, вы принимаете{" "}
                      <Link className="underline hover:text-gray-700" to="/privacy">
                        политику конфиденциальности
                      </Link>
                      ,{" "}
                      <Link className="underline hover:text-gray-700" to="/agreement">
                        соглашение
                      </Link>{" "}
                      и{" "}
                      <Link className="underline hover:text-gray-700" to="/offer">
                        оферту
                      </Link>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
