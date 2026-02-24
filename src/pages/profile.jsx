import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FLOW } from "@/lib/api-mapping";
import { useEffect, useState } from "react";
import { Authenticated, useAuthActions } from "@/context/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import { toast } from "sonner";
import AdminPage from "./admin";

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState("orders");
  const [loading, setLoading] = useState(true);
  const { signOut } = useAuthActions();

  const [orders, setOrders] = useState([]);
  const [likedProductIds, setLikedProductIds] = useState([]);
  const [products, setProducts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
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
          setIsAdmin(!!profileRes.isAdmin);
        }
      } catch (error) {
        console.error("Failed to fetch profile data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!profile) return;

    try {
      await FLOW.updateProfile({
        input: {
          name: profile.name,
          phone: profile.phone,
          shippingAddress: profile.shippingAddress,
              nickname: profile.nickname,
        },
      });
      toast.success("Профиль обновлен");
    } catch (error) {
      toast.error("Не удалось обновить профиль");
    }
  };

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/";
  };

  const likedProducts = products.filter((product) => likedProductIds.includes(product._id));

  if (loading) return <LoadingSpinner className="h-screen" />;

  return (
    <Authenticated>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <Header />

        <main className="flex-1 container mx-auto px-4 py-12">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-8">МОЙ АККАУНТ</h1>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-transparent border-b border-gray-200 w-full justify-start rounded-none h-auto p-0 mb-8 gap-8">
              <TabsTrigger
                value="orders"
                className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest text-gray-400 data-[state=active]:text-black transition-all"
              >
                ЗАКАЗЫ
              </TabsTrigger>
              <TabsTrigger
                value="wishlist"
                className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest text-gray-400 data-[state=active]:text-black transition-all"
              >
                ИЗБРАННОЕ
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest text-gray-400 data-[state=active]:text-black transition-all"
              >
                НАСТРОЙКИ
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger
                  value="admin"
                  className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest text-gray-400 data-[state=active]:text-black transition-all"
                >
                  АДМИН
                </TabsTrigger>
              )}
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
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">НОМЕР ЗАКАЗА</p>
                          <p className="font-mono font-bold text-sm">{order.id}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">ДАТА</p>
                          <p className="font-bold text-sm">
                            {new Date(order.createdAt * 1000).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-between items-end border-t border-gray-100 pt-4">
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">СТАТУС</p>
                          <span className="inline-block px-3 py-1 bg-black text-white text-xs font-bold uppercase tracking-widest rounded-full">
                            {order.status || "В обработке"}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">ИТОГО</p>
                          <p className="text-2xl font-black">${Number(order.totalAmount).toFixed(2)}</p>
                        </div>
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
                  {likedProducts.map((product) => (
                    <ProductCard key={product._id} product={product} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="settings" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="max-w-xl">
                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Полное имя</Label>
                    <Input
                      id="profile-name"
                      value={profile?.name || ""}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className="rounded-none border-black focus-visible:ring-black"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profile-nickname">Ник</Label>
                    <Input
                      id="profile-nickname"
                      value={profile?.nickname || ""}
                      onChange={(e) => setProfile({ ...profile, nickname: e.target.value })}
                      className="rounded-none border-black focus-visible:ring-black"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profile-email">Email</Label>
                    <Input
                      id="profile-email"
                      value={profile?.email || ""}
                      disabled
                      className="rounded-none bg-gray-100 border-gray-200 cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profile-phone">Телефон</Label>
                    <Input
                      id="profile-phone"
                      value={profile?.phone || ""}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      className="rounded-none border-black focus-visible:ring-black"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profile-address">Адрес доставки по умолчанию</Label>
                    <Input
                      id="profile-address"
                      value={profile?.shippingAddress || ""}
                      onChange={(e) => setProfile({ ...profile, shippingAddress: e.target.value })}
                      className="rounded-none border-black focus-visible:ring-black"
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <Button
                      type="submit"
                      className="bg-black text-white hover:bg-gray-800 rounded-none font-bold uppercase tracking-widest px-8 py-6"
                    >
                      СОХРАНИТЬ ИЗМЕНЕНИЯ
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-none font-bold uppercase tracking-widest px-8 py-6"
                      onClick={handleLogout}
                    >
                      ВЫЙТИ
                    </Button>
                  </div>
                </form>
              </div>
            </TabsContent>

            {isAdmin && (
              <TabsContent value="admin" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <AdminPage embedded />
              </TabsContent>
            )}
          </Tabs>
        </main>

        <Footer />
      </div>
    </Authenticated>
  );
}
