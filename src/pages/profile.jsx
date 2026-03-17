import React, { useEffect, useMemo, useState } from "react";
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
import { useNavigate } from "react-router";
import PageSeo from "@/components/PageSeo";

const normalizePhone = (value) => {
  const clean = String(value || "").trim();
  if (!clean) return "";
  const chars = Array.from(clean).filter((ch) => /[\d+]/.test(ch));
  let normalized = chars.join("");
  if (normalized && !normalized.startsWith("+")) normalized = `+${normalized}`;
  return normalized;
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

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState("orders");
  const [loading, setLoading] = useState(true);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

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
          setProfile(profileRes);
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

    try {
      await FLOW.updateProfile({
        input: {
          name: profile.name,
          phone: normalizePhone(phoneDraft),
          shippingAddress: profile.shippingAddress,
          nickname: profile.nickname,
          email: String(emailDraft || "").trim(),
        },
      });

      setProfile((prev) => ({
        ...(prev || {}),
        email: String(emailDraft || "").trim(),
        phone: normalizePhone(phoneDraft),
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

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/";
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

        <main className="flex-1 container mx-auto px-4 py-12">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-8">МОЙ АККАУНТ</h1>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-transparent border-b border-gray-200 w-full justify-start rounded-none h-auto p-0 mb-8 gap-8">
              <TabsTrigger value="orders" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest text-gray-400 data-[state=active]:text-black transition-all">ЗАКАЗЫ</TabsTrigger>
              <TabsTrigger value="wishlist" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest text-gray-400 data-[state=active]:text-black transition-all">ИЗБРАННОЕ</TabsTrigger>
              <TabsTrigger value="settings" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest text-gray-400 data-[state=active]:text-black transition-all">НАСТРОЙКИ</TabsTrigger>
              {isAdmin && <TabsTrigger value="admin" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest text-gray-400 data-[state=active]:text-black transition-all">АДМИН</TabsTrigger>}
            </TabsList>

            <TabsContent value="orders" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {orders.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 border border-dashed border-gray-300">
                  <h3 className="text-xl font-bold uppercase mb-2">Пока нет заказов</h3>
                  <p className="text-gray-500">Начните покупки, чтобы увидеть свои заказы.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {orders.map((order) => (
                    <div key={order.id} className="border border-gray-200 p-6 bg-white hover:shadow-lg transition-shadow">
                      <div className="flex justify-between items-start mb-4">
                        <div><p className="text-xs text-gray-400 uppercase tracking-widest mb-1">НОМЕР ЗАКАЗА</p><p className="font-mono font-bold text-sm">{order.id}</p></div>
                        <div className="text-right"><p className="text-xs text-gray-400 uppercase tracking-widest mb-1">ДАТА</p><p className="font-bold text-sm">{formatOrderDate(order.createdAt)}</p></div>
                      </div>
                      <div className="flex justify-between items-end border-t border-gray-100 pt-4">
                        <div><p className="text-xs text-gray-400 uppercase tracking-widest mb-1">СТАТУС</p><span className="inline-block px-3 py-1 bg-black text-white text-xs font-bold uppercase tracking-widest rounded-full">{ORDER_STATUS_LABELS[order.status] || order.status || "В обработке"}</span></div>
                        <div className="text-right"><p className="text-xs text-gray-400 uppercase tracking-widest mb-1">ИТОГО</p><p className="text-2xl font-black">${Number(order.totalAmount).toFixed(2)}</p></div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm border-t border-gray-100 pt-4">
                        <p><span className="font-semibold">Способ оплаты:</span> {PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod || "—"}</p>
                        <p><span className="font-semibold">Адрес доставки:</span> {order.shippingAddress || "—"}</p>
                      </div>
                      <div className="mt-3 text-sm">
                        <p className="font-semibold mb-1">Товары:</p>
                        <ul className="list-disc pl-5 space-y-1">
                          {parseJsonArray(order.items).map((item, idx) => (
                            <li key={`${order.id}-${idx}`}>
                              {item.productName || item.productId || "Товар"} {item.size ? `(размер ${item.size})` : ""} × {Number(item.quantity || 1)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
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
              <div className="max-w-xl">
                <form onSubmit={handleUpdateProfile} className="space-y-6">
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
                        <Button type="button" variant="outline" className="h-8 rounded-none" onClick={handleStartEmailVerification} disabled={actionLoading}>Подтвердить email</Button>
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
                        <Button type="button" className="rounded-none" onClick={handleConfirmEmailVerification} disabled={actionLoading}>Подтвердить</Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="profile-phone">Телефон</Label>
                      {!(!phoneChanged && profile?.phoneVerified) && (
                        <Button type="button" variant="outline" className="h-8 rounded-none" onClick={handleStartPhoneVerification} disabled={actionLoading || !!phoneVerifyState}>Подтвердить в Telegram</Button>
                      )}
                    </div>
                    <Input id="profile-phone" value={phoneDraft} onChange={(e) => {
                      setPhoneDraft(e.target.value);
                      setProfile((prev) => ({ ...(prev || {}), phoneVerified: false }));
                    }} className="rounded-none border-black focus-visible:ring-black" />
                    {profile?.phoneVerified && !phoneChanged && <p className="text-xs text-emerald-600">Телефон подтвержден</p>}
                    {!!phoneVerifyState && <p className="text-xs text-muted-foreground">Ожидаем подтверждение номера в Telegram…</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profile-address">Адрес доставки по умолчанию</Label>
                    <Input id="profile-address" value={profile?.shippingAddress || ""} onChange={(e) => setProfile({ ...profile, shippingAddress: e.target.value })} className="rounded-none border-black focus-visible:ring-black" />
                  </div>

                  <div className="flex flex-col gap-3">
                    <Button type="submit" className="bg-black text-white hover:bg-gray-800 rounded-none font-bold uppercase tracking-widest px-8 py-6">СОХРАНИТЬ ИЗМЕНЕНИЯ</Button>
                    <Button type="button" variant="outline" className="rounded-none font-bold uppercase tracking-widest px-8 py-6" onClick={handleLogout}>ВЫЙТИ</Button>
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
