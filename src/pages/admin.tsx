import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FLOW } from '@/lib/api-mapping';
import { useEffect, useState } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router';

interface Product {
  _id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  images: string[];
  videos?: string[];
  media?: { type: "image" | "video"; url: string }[];
  sizes: string[];
  category: string;
  isNew: boolean;
  isPopular: boolean;
  likesCount: number;
  sku?: string;
  material?: string;
  printType?: string;
  fit?: string;
  gender?: string;
  color?: string;
  shipping?: string;
  reviews?: { author: string; date: string; text: string }[];
  sizeStock?: Record<string, number>;
}


const DEFAULT_APP_SETTINGS: Record<string, string> = {
  storeName: "",
  privacy_policy: "",
  user_agreement: "",
  public_offer: "",
  cookie_consent_text: "",
  auth_password_policy_enabled: "true",
  auth_session_ttl_hours: "720",
  auth_refresh_session_ttl_hours: "2160",
  auth_session_sliding_update_minutes: "5",
  auth_admin_session_ttl_hours: "168",
  smtp_enabled: "false",
  smtp_host: "",
  smtp_port: "587",
  smtp_username: "",
  smtp_password: "",
  smtp_from_email: "",
  smtp_from_name: "Fashion Demon",
  smtp_use_ssl: "true",
  metrics_yandex_metrika_enabled: "false",
  metrics_yandex_metrika_code: "",
  metrics_google_analytics_enabled: "false",
  metrics_google_analytics_code: "",
  metrics_vk_pixel_enabled: "false",
  metrics_vk_pixel_code: "",
  telegram_login_enabled: "false",
  telegram_bot_username: "",
  telegram_bot_token: "",
  dadata_api_key: "",
  yandex_delivery_base_cost: "350",
  yandex_delivery_cost_per_kg: "40",
  yandex_delivery_markup_percent: "0"
};

export default function AdminPage({ embedded = false }: { embedded?: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedSettingsGroup, setSelectedSettingsGroup] = useState("auth");
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [isSeedDialogOpen, setIsSeedDialogOpen] = useState(false);
  const navigate = useNavigate();

  // Form State
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    price: "",
    category: "",
    images: "",
    videos: "",
    media: [] as { type: "image" | "video"; url: string }[],
    sizes: [] as string[],
    isNew: false,
    isPopular: false,
    sku: "",
    material: "",
    printType: "",
    fit: "",
    gender: "",
    color: "",
    shipping: "",
    sizeStock: {} as Record<string, number>
  });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [uploading, setUploading] = useState(false);
  const mediaSlots = [1, 2, 3, 4, 5, 6, 7, 8];

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await FLOW.adminMe();
        setIsAdmin(true);
        await Promise.all([fetchProducts(), fetchAdminData()]);
      } catch (error) {
        if (!embedded) {
          navigate("/profile");
        }
      }
    };
    checkAuth();
  }, [embedded, navigate]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await FLOW.getAllProducts({ input: {} });
      if (Array.isArray(res)) setProducts(res);
    } catch (error) {
      console.error("Failed to fetch products");
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminData = async () => {
    try {
      const [usersRes, ordersRes, settingsRes] = await Promise.all([
        FLOW.adminGetUsers(),
        FLOW.adminGetOrders(),
        FLOW.adminGetSettings()
      ]);
      setUsers(Array.isArray(usersRes) ? usersRes : []);
      setOrders(Array.isArray(ordersRes) ? ordersRes : []);
      setSettings({ ...DEFAULT_APP_SETTINGS, ...(settingsRes || {}) });
    } catch (error) {
      toast.error("Не удалось загрузить раздел пользователей/заказов/настроек");
    }
  };

  const toggleUserBlock = async (user: any) => {
    try {
      await FLOW.adminUpdateUser({ input: { userId: user.id, isBlocked: !user.isBlocked } });
      await fetchAdminData();
    } catch (error) {
      toast.error("Не удалось изменить блокировку");
    }
  };

  const toggleUserAdmin = async (user: any) => {
    try {
      await FLOW.adminUpdateUser({ input: { userId: user.id, isAdmin: !user.isAdmin } });
      await fetchAdminData();
    } catch (error) {
      toast.error("Не удалось изменить права");
    }
  };

  const deleteUser = async (user: any) => {
    if (!confirm(`Удалить пользователя ${user.email}?`)) return;
    try {
      await FLOW.adminDeleteUser({ input: { userId: user.id } });
      await fetchAdminData();
    } catch (error) {
      toast.error("Не удалось удалить пользователя");
    }
  };

  const saveSettings = async () => {
    try {
      const currentRemote = await FLOW.adminGetSettings();
      const mergedSettings = {
        ...DEFAULT_APP_SETTINGS,
        ...(currentRemote || {}),
        ...settings
      };

      await FLOW.adminSaveSettings({ input: mergedSettings });
      setSettings(mergedSettings);
      toast.success("Настройки сохранены");
    } catch (error) {
      toast.error("Не удалось сохранить настройки");
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const isSettingEnabled = (key: string, fallback = false) => {
    const value = (settings[key] ?? (fallback ? "true" : "false")).toLowerCase();
    return value === "true" || value === "1" || value === "on";
  };

  const settingsGroups = [
    { id: "auth", label: "Авторизация" },
    { id: "operations", label: "Регламентные операции" },
    { id: "smtp", label: "Почта (SMTP)" },
    { id: "metrics", label: "Метрики" },
    { id: "integrations", label: "Интеграции" },
    { id: "delivery", label: "Доставка" },
    { id: "legal", label: "Юридические тексты" },
    { id: "general", label: "Общие" }
  ] as const;

  const buildMediaFromProduct = (product: Product) => {
    if (product.media && product.media.length > 0) return product.media;
    const images = (product.images || []).map((url) => ({ type: "image" as const, url }));
    const videos = (product.videos || []).map((url) => ({ type: "video" as const, url }));
    return [...images, ...videos];
  };

  const handleOpen = (product?: Product) => {
    if (product) {
      setEditingId(product._id);
      setEditingProduct(product);
      const mediaList = buildMediaFromProduct(product);
      setFormData({
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: product.price.toString(),
        category: product.category,
        images: product.images.join(','),
        videos: (product.videos || []).join(','),
        media: mediaList,
        sizes: product.sizes,
        isNew: product.isNew,
        isPopular: product.isPopular,
        sku: product.sku || "",
        material: product.material || "",
        printType: product.printType || "",
        fit: product.fit || "",
        gender: product.gender || "",
        color: product.color || "",
        shipping: product.shipping || "",
        sizeStock: product.sizeStock || {}
      });
    } else {
      setEditingId(null);
      setEditingProduct(null);
      setFormData({
        name: "",
        slug: "",
        description: "",
        price: "",
        category: "",
        images: "",
        videos: "",
        media: [],
        sizes: [],
        isNew: false,
        isPopular: false,
        sku: "",
        material: "",
        printType: "",
        fit: "",
        gender: "",
        color: "",
        shipping: "",
        sizeStock: {}
      });
    }
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const mediaList = formData.media.filter(item => item.url);
      const imagesFromMedia = mediaList.filter(item => item.type === "image").map(item => item.url);
      const videosFromMedia = mediaList.filter(item => item.type === "video").map(item => item.url);
      const payload = {
        name: formData.name,
        slug: formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-'),
        description: formData.description,
        price: parseFloat(formData.price),
        category: formData.category,
        images: imagesFromMedia,
        videos: videosFromMedia,
        media: mediaList,
        sizes: formData.sizes,
        isNew: formData.isNew,
        isPopular: formData.isPopular,
        sku: formData.sku,
        material: formData.material,
        printType: formData.printType,
        fit: formData.fit,
        gender: formData.gender,
        color: formData.color,
        shipping: formData.shipping,
        sizeStock: formData.sizeStock
      };

      if (editingId) {
        const targetProduct = products.find((p) => p._id === editingId || (p as any).id === editingId);
        await FLOW.updateProduct({
          input: {
            id: editingId,
            _id: editingId,
            likesCount: targetProduct?.likesCount ?? 0,
            creationTime: (targetProduct as any)?._creationTime || Date.now(),
            ...payload
          }
        });
        toast.success("Товар обновлен");
      } else {
        await FLOW.createProduct({
          input: payload
        });
        toast.success("Товар создан");
      }
      
      setIsOpen(false);
      fetchProducts();
    } catch (error) {
      toast.error("Операция не удалась. Проверьте формат данных.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Вы уверены, что хотите удалить этот товар?")) return;
    try {
      await FLOW.deleteProduct({ input: { id } });
      toast.success("Товар удален");
      fetchProducts();
    } catch (error) {
      toast.error("Не удалось удалить");
    }
  };

  const toggleSize = (size: string) => {
    setFormData(prev => ({
      ...prev,
      sizes: prev.sizes.includes(size) 
        ? prev.sizes.filter(s => s !== size)
        : [...prev.sizes, size]
    }));
  };

  useEffect(() => {
    if (formData.sizes.length === 0) return;
    setFormData(prev => {
      const nextStock = { ...prev.sizeStock };
      prev.sizes.forEach((size) => {
        if (nextStock[size] === undefined) {
          nextStock[size] = 0;
        }
      });
      Object.keys(nextStock).forEach((size) => {
        if (!prev.sizes.includes(size)) {
          delete nextStock[size];
        }
      });
      return { ...prev, sizeStock: nextStock };
    });
  }, [formData.sizes]);

  const updateSizeStock = (size: string, value: string) => {
    const numeric = Math.max(0, Number(value || 0));
    setFormData(prev => ({
      ...prev,
      sizeStock: { ...prev.sizeStock, [size]: numeric }
    }));
  };

  const setMediaSlot = (index: number, type: "image" | "video", url: string) => {
    setFormData(prev => {
      const media = [...prev.media];
      while (media.length < index) {
        media.push({ type: "image", url: "" });
      }
      media[index - 1] = { type, url };
      return { ...prev, media };
    });
  };

  const handleUploadSlot = async (file: File | null, index: number) => {
    if (!file) return;
    setUploading(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append("files", file);
      const res = await FLOW.adminUpload({ input: formDataUpload });
      const urls = res?.urls || [];
      if (urls[0]) {
        const nextType = file.type.startsWith("video") ? "video" : "image";
        setMediaSlot(index, nextType, urls[0]);
      }
    } catch (error) {
      toast.error("Не удалось загрузить файлы");
    } finally {
      setUploading(false);
    }
  };

  const updateMediaSlot = (index: number, next: Partial<{ type: "image" | "video"; url: string }>) => {
    setFormData(prev => {
      const media = [...prev.media];
      while (media.length < index) {
        media.push({ type: "image", url: "" });
      }
      const current = media[index - 1] || { type: "image", url: "" };
      media[index - 1] = { ...current, ...next };
      return { ...prev, media };
    });
  };

  const runSeedDemoData = async () => {
    setOperationsLoading(true);
    try {
      const result = await FLOW.adminRunSeedDemoData();
      setIsSeedDialogOpen(false);
      toast.success(`Преднаполнение выполнено: товаров ${result?.products ?? 0}, пользователей ${result?.users ?? 0}, заказов ${result?.orders ?? 0}`);
      await Promise.all([fetchProducts(), fetchAdminData()]);
    } catch (error) {
      let errorMessage = "Не удалось выполнить преднаполнение базы данных";
      if (error instanceof Error && error.message) {
        try {
          const parsedError = JSON.parse(error.message);
          if (parsedError?.detail) {
            errorMessage = `Преднаполнение не выполнено: ${parsedError.detail}`;
          }
        } catch {
          errorMessage = `Преднаполнение не выполнено: ${error.message}`;
        }
      }
      toast.error(errorMessage);
    } finally {
      setOperationsLoading(false);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!editingProduct) return;
    try {
      await FLOW.deleteProductReview({ input: { productId: editingProduct._id, reviewId } });
      const nextReviews = (editingProduct.reviews || []).filter((review: any) => review.id !== reviewId);
      setEditingProduct({ ...editingProduct, reviews: nextReviews });
      toast.success("Отзыв удален");
    } catch (error) {
      toast.error("Не удалось удалить отзыв");
    }
  };

  if (loading) return <LoadingSpinner className={embedded ? "h-56" : "h-screen"} />;
  if (!isAdmin) return null;

  return (
      <div className={embedded ? "" : "min-h-screen flex flex-col bg-background text-foreground"}>
        {!embedded && <Header />}
        
        <main className={embedded ? "" : "flex-1 container mx-auto px-4 py-12"}>
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-black uppercase tracking-tighter">ПАНЕЛЬ АДМИНИСТРАТОРА</h1>
            <div className="flex items-center gap-3">
              {!embedded && <Button variant="outline" className="rounded-none font-bold uppercase tracking-widest" onClick={async () => {
                await FLOW.adminLogout();
                navigate("/profile");
              }}>
                ВЫЙТИ
              </Button>}
              <Button onClick={() => handleOpen()} className="bg-black text-white hover:bg-gray-800 rounded-none font-bold uppercase tracking-widest">
                <Plus className="w-4 h-4 mr-2" /> ДОБАВИТЬ ТОВАР
              </Button>
            </div>
          </div>

          <Tabs defaultValue="products" className="w-full">
            <TabsList className="bg-transparent border-b border-gray-200 w-full justify-start rounded-none h-auto p-0 mb-8 gap-8">
              <TabsTrigger value="products" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest">ТОВАРЫ</TabsTrigger>
              <TabsTrigger value="orders" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest">ЗАКАЗЫ</TabsTrigger>
              <TabsTrigger value="users" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest">ПОЛЬЗОВАТЕЛИ</TabsTrigger>
              <TabsTrigger value="settings" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest">НАСТРОЙКИ</TabsTrigger>
            </TabsList>

          <TabsContent value="products" className="mt-0">
          <div className="border border-gray-200 rounded-none overflow-hidden">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="w-[100px]">Изображение</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Цена</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead>Метки</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product._id}>
                    <TableCell>
                      {product.images?.[0] ? (
                        <img src={product.images[0]} alt={product.name} className="w-12 h-16 object-cover bg-gray-100" />
                      ) : (
                        <div className="w-12 h-16 bg-gray-200" />
                      )}
                    </TableCell>
                    <TableCell className="font-bold">{product.name}</TableCell>
                    <TableCell>{Math.round(product.price)}₽</TableCell>
                    <TableCell className="uppercase text-xs tracking-wide">{product.category}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {product.isNew && <span className="px-2 py-0.5 bg-black text-white text-[10px] uppercase font-bold">Новинка</span>}
                        {product.isPopular && <span className="px-2 py-0.5 bg-gray-200 text-black text-[10px] uppercase font-bold">Хит</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpen(product)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(product._id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </TabsContent>

          <TabsContent value="users" className="mt-0">
            <div className="border border-gray-200 p-4">
              <h2 className="text-2xl font-black uppercase mb-4">Пользователи и права</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Роль</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.isAdmin ? "Админ" : "Пользователь"}{user.isSystem ? " (system)" : ""}</TableCell>
                      <TableCell>{user.isBlocked ? "Заблокирован" : "Активен"}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => toggleUserBlock(user)}>
                          {user.isBlocked ? "Разблокировать" : "Блокировать"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleUserAdmin(user)} disabled={user.isSystem}>
                          {user.isAdmin ? "Снять админа" : "Сделать админом"}
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteUser(user)} disabled={user.isSystem}>
                          Удалить
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="orders" className="mt-0">
            <div className="border border-gray-200 p-4">
              <h2 className="text-2xl font-black uppercase mb-4">История заказов</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Пользователь</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Сумма</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="max-w-[180px] truncate">{order.id}</TableCell>
                      <TableCell>{order.userEmail || order.userId}</TableCell>
                      <TableCell>{order.status}</TableCell>
                      <TableCell>{order.totalAmount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <div className="border border-gray-200 p-4">
              <h2 className="text-2xl font-black uppercase mb-4">Настройки</h2>

              <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                <div className="order-1 lg:order-1">
                  <div className="border p-3 space-y-2 lg:sticky lg:top-4">
                    <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Группы</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
                      {settingsGroups.map((group) => (
                        <Button
                          key={group.id}
                          variant={selectedSettingsGroup === group.id ? "default" : "outline"}
                          className="justify-start"
                          onClick={() => setSelectedSettingsGroup(group.id)}
                        >
                          {group.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="order-2 space-y-4 lg:order-2">
                  {selectedSettingsGroup === "auth" && (
                    <div className="space-y-3 border p-3">
                      <h3 className="font-semibold">Авторизация</h3>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="auth-password-policy"
                          checked={isSettingEnabled("auth_password_policy_enabled", true)}
                          onCheckedChange={(checked) => updateSetting("auth_password_policy_enabled", checked ? "true" : "false")}
                        />
                        <Label htmlFor="auth-password-policy">Строгая проверка пароля (10+ символов, A-Z, a-z, цифра)</Label>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor="auth-session-ttl-hours">Сессия пользователя (часы)</Label>
                          <Input id="auth-session-ttl-hours" type="number" min={1} value={settings["auth_session_ttl_hours"] || "720"} onChange={(e) => updateSetting("auth_session_ttl_hours", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="auth-refresh-ttl-hours">Refresh-сессия (часы)</Label>
                          <Input id="auth-refresh-ttl-hours" type="number" min={1} value={settings["auth_refresh_session_ttl_hours"] || "2160"} onChange={(e) => updateSetting("auth_refresh_session_ttl_hours", e.target.value)} />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label htmlFor="auth-admin-session-ttl-hours">Админ-сессия (часы)</Label>
                          <Input id="auth-admin-session-ttl-hours" type="number" min={1} value={settings["auth_admin_session_ttl_hours"] || "168"} onChange={(e) => updateSetting("auth_admin_session_ttl_hours", e.target.value)} />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label htmlFor="auth-session-sliding-minutes">Скользящее обновление сессии (минуты)</Label>
                          <Input id="auth-session-sliding-minutes" type="number" min={1} value={settings["auth_session_sliding_update_minutes"] || "5"} onChange={(e) => updateSetting("auth_session_sliding_update_minutes", e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedSettingsGroup === "operations" && (
                    <div className="space-y-3 border p-3">
                      <h3 className="font-semibold">Регламентные операции</h3>
                      <p className="text-sm text-muted-foreground max-w-3xl">
                        Сервисные действия для быстрого запуска полностью рабочего демо-магазина:
                        предзаполненные товары, пользователи, корзины, лайки, заказы и отзывы.
                      </p>
                      <div className="border border-dashed p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <h4 className="font-bold uppercase tracking-wide">Преднаполнение БД</h4>
                          <p className="text-sm text-muted-foreground">Создает 50 товаров и связанный демо-набор пользователей, заказов, корзин, лайков, комментариев и отзывов.</p>
                        </div>
                        <Dialog open={isSeedDialogOpen} onOpenChange={setIsSeedDialogOpen}>
                          <DialogTrigger asChild>
                            <Button disabled={operationsLoading} className="rounded-none font-bold uppercase tracking-widest">
                              {operationsLoading ? "ВЫПОЛНЯЕТСЯ..." : "ЗАПУСТИТЬ ПРЕДНАПОЛНЕНИЕ"}
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Подтвердите преднаполнение БД</DialogTitle>
                            </DialogHeader>
                            <p className="text-sm text-muted-foreground">
                              Текущие товары, пользователи, корзины, заказы и лайки (кроме системного администратора) будут заменены.
                            </p>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setIsSeedDialogOpen(false)} disabled={operationsLoading}>Отмена</Button>
                              <Button onClick={runSeedDemoData} disabled={operationsLoading}>Подтвердить</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  )}

                  {selectedSettingsGroup === "smtp" && (
                    <div className="space-y-3 border p-3">
                      <h3 className="font-semibold">Почта (SMTP)</h3>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="smtp-enabled"
                          checked={isSettingEnabled("smtp_enabled")}
                          onCheckedChange={(checked) => updateSetting("smtp_enabled", checked ? "true" : "false")}
                        />
                        <Label htmlFor="smtp-enabled">Включить отправку email</Label>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor="smtp-host">SMTP Host</Label>
                          <Input id="smtp-host" value={settings["smtp_host"] || ""} onChange={(e) => updateSetting("smtp_host", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="smtp-port">SMTP Port</Label>
                          <Input id="smtp-port" value={settings["smtp_port"] || "587"} onChange={(e) => updateSetting("smtp_port", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="smtp-username">SMTP Username</Label>
                          <Input id="smtp-username" value={settings["smtp_username"] || ""} onChange={(e) => updateSetting("smtp_username", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="smtp-password">SMTP Password</Label>
                          <Input id="smtp-password" type="password" value={settings["smtp_password"] || ""} onChange={(e) => updateSetting("smtp_password", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="smtp-from-email">From Email</Label>
                          <Input id="smtp-from-email" value={settings["smtp_from_email"] || ""} onChange={(e) => updateSetting("smtp_from_email", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="smtp-from-name">From Name</Label>
                          <Input id="smtp-from-name" value={settings["smtp_from_name"] || "Fashion Demon"} onChange={(e) => updateSetting("smtp_from_name", e.target.value)} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="smtp-use-ssl"
                          checked={isSettingEnabled("smtp_use_ssl", true)}
                          onCheckedChange={(checked) => updateSetting("smtp_use_ssl", checked ? "true" : "false")}
                        />
                        <Label htmlFor="smtp-use-ssl">Использовать SSL/TLS</Label>
                      </div>
                    </div>
                  )}


                  {selectedSettingsGroup === "metrics" && (
                    <div className="space-y-3 border p-3">
                      <h3 className="font-semibold">Метрики</h3>
                      {[ 
                        ["metrics_yandex_metrika", "Яндекс Метрика"],
                        ["metrics_google_analytics", "Google Analytics"],
                        ["metrics_vk_pixel", "VK Pixel"]
                      ].map(([prefix, label]) => (
                        <div key={prefix} className="space-y-2 border p-3">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`${prefix}-enabled`}
                              checked={isSettingEnabled(`${prefix}_enabled`)}
                              onCheckedChange={(checked) => updateSetting(`${prefix}_enabled`, checked ? "true" : "false")}
                            />
                            <Label htmlFor={`${prefix}-enabled`}>Включить {label}</Label>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`${prefix}-code`}>Код/сниппет</Label>
                            <Textarea
                              id={`${prefix}-code`}
                              value={settings[`${prefix}_code`] || ""}
                              onChange={(e) => updateSetting(`${prefix}_code`, e.target.value)}
                              className="min-h-[120px]"
                              placeholder="Вставьте код счётчика"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedSettingsGroup === "integrations" && (
                    <div className="space-y-3 border p-3">
                      <h3 className="font-semibold">Интеграции</h3>
                      <div className="space-y-2 border p-3">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="telegram-login-enabled"
                            checked={isSettingEnabled("telegram_login_enabled")}
                            onCheckedChange={(checked) => updateSetting("telegram_login_enabled", checked ? "true" : "false")}
                          />
                          <Label htmlFor="telegram-login-enabled">Включить авторизацию через Telegram</Label>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="telegram-bot-username">Telegram Bot Username</Label>
                          <Input id="telegram-bot-username" value={settings["telegram_bot_username"] || ""} onChange={(e) => updateSetting("telegram_bot_username", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="telegram-bot-token">Telegram Bot Token</Label>
                          <Input id="telegram-bot-token" type="password" value={settings["telegram_bot_token"] || ""} onChange={(e) => updateSetting("telegram_bot_token", e.target.value)} />
                        </div>
                      </div>

                      <div className="space-y-1 border p-3">
                        <Label htmlFor="dadata-api-key">DaData API Key</Label>
                        <Input id="dadata-api-key" type="password" value={settings["dadata_api_key"] || ""} onChange={(e) => updateSetting("dadata_api_key", e.target.value)} />
                      </div>
                    </div>
                  )}

                  {selectedSettingsGroup === "delivery" && (
                    <div className="space-y-3 border p-3">
                      <h3 className="font-semibold">Яндекс Доставка (расчет)</h3>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="space-y-1">
                          <Label htmlFor="yandex-delivery-base-cost">Базовая стоимость (₽)</Label>
                          <Input id="yandex-delivery-base-cost" value={settings["yandex_delivery_base_cost"] || "350"} onChange={(e) => updateSetting("yandex_delivery_base_cost", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="yandex-delivery-cost-per-kg">Стоимость за кг (₽)</Label>
                          <Input id="yandex-delivery-cost-per-kg" value={settings["yandex_delivery_cost_per_kg"] || "40"} onChange={(e) => updateSetting("yandex_delivery_cost_per_kg", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="yandex-delivery-markup">Наценка (%)</Label>
                          <Input id="yandex-delivery-markup" value={settings["yandex_delivery_markup_percent"] || "0"} onChange={(e) => updateSetting("yandex_delivery_markup_percent", e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedSettingsGroup === "legal" && (
                    <div className="space-y-3 border p-3">
                      <h3 className="font-semibold">Юридические тексты</h3>
                      {[
                        ["privacy_policy", "Политика конфиденциальности"],
                        ["user_agreement", "Пользовательское соглашение"],
                        ["public_offer", "Публичная оферта"],
                        ["cookie_consent_text", "Текст cookie-согласия"]
                      ].map(([key, label]) => (
                        <div key={key} className="space-y-1">
                          <Label>{label}</Label>
                          <Textarea
                            value={settings[key] || ""}
                            onChange={(e) => updateSetting(key, e.target.value)}
                            className="min-h-[120px]"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedSettingsGroup === "general" && (
                    <div className="space-y-3 border p-3">
                      <h3 className="font-semibold">Общие настройки</h3>
                      <div className="space-y-1">
                        <Label htmlFor="store-name">Название магазина</Label>
                        <Input id="store-name" value={settings.storeName || ""} onChange={(e) => updateSetting("storeName", e.target.value)} />
                      </div>
                    </div>
                  )}

                </div>

              </div>


              <div className="mt-3 flex gap-2">
                <Button onClick={saveSettings}>Сохранить настройки</Button>
              </div>
            </div>
          </TabsContent>
          </Tabs>

          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-none border-black">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black uppercase tracking-tighter">
                  {editingId ? 'Редактировать товар' : 'Добавить новый товар'}
                </DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prod-name">Название</Label>
                    <Input 
                      id="prod-name" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      required
                      className="rounded-none border-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-slug">URL (автоматически, если пусто)</Label>
                    <Input 
                      id="prod-slug" 
                      value={formData.slug}
                      onChange={(e) => setFormData({...formData, slug: e.target.value})}
                      className="rounded-none border-black"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prod-desc">Описание</Label>
                  <Textarea 
                    id="prod-desc" 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="rounded-none border-black min-h-[100px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prod-price">Цена (₽)</Label>
                    <Input 
                      id="prod-price" 
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({...formData, price: e.target.value})}
                      required
                      className="rounded-none border-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-cat">Категория</Label>
                    <Input 
                      id="prod-cat" 
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value})}
                      required
                      className="rounded-none border-black"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Медиа (по порядку)</Label>
                  <div className="space-y-3">
                    {mediaSlots.map((slot) => {
                      const item = formData.media[slot - 1] || { type: "image", url: "" };
                      return (
                        <div key={`media-slot-${slot}`} className="grid grid-cols-[40px_120px_1fr_120px] items-center gap-3">
                          <div className="w-10 h-10 border border-black flex items-center justify-center font-bold">
                            {slot}
                          </div>
                          <select
                            value={item.type}
                            onChange={(e) => updateMediaSlot(slot, { type: e.target.value as "image" | "video" })}
                            className="h-10 border border-black px-2"
                          >
                            <option value="image">Фото</option>
                            <option value="video">Видео</option>
                          </select>
                          <Input
                            placeholder="URL"
                            value={item.url}
                            onChange={(e) => updateMediaSlot(slot, { url: e.target.value })}
                            className="rounded-none border-black"
                          />
                          <label className="inline-flex items-center justify-center h-10 border border-black font-bold cursor-pointer">
                            Файл
                            <input
                              type="file"
                              accept="image/*,video/*"
                              className="hidden"
                              onChange={(e) => handleUploadSlot(e.target.files?.[0] || null, slot)}
                              disabled={uploading}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Размеры</Label>
                  <div className="flex flex-wrap gap-4">
                    {['S', 'M', 'L', 'XL', 'XXL'].map((size) => (
                      <div key={size} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`size-${size}`} 
                          checked={formData.sizes.includes(size)}
                          onCheckedChange={() => toggleSize(size)}
                        />
                        <Label htmlFor={`size-${size}`} className="cursor-pointer">{size}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Остатки по размерам</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {['S', 'M', 'L', 'XL', 'XXL'].map((size) => (
                      <div key={`stock-${size}`} className="space-y-1">
                        <Label htmlFor={`stock-${size}`} className="text-xs">{size}</Label>
                        <Input
                          id={`stock-${size}`}
                          type="number"
                          min="0"
                          value={formData.sizeStock[size] ?? 0}
                          onChange={(e) => updateSizeStock(size, e.target.value)}
                          className="rounded-none border-black"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-8">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="is-new" 
                      checked={formData.isNew}
                      onCheckedChange={(c) => setFormData({...formData, isNew: !!c})}
                    />
                    <Label htmlFor="is-new" className="cursor-pointer font-bold uppercase">Новинка</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="is-pop" 
                      checked={formData.isPopular}
                      onCheckedChange={(c) => setFormData({...formData, isPopular: !!c})}
                    />
                    <Label htmlFor="is-pop" className="cursor-pointer font-bold uppercase">Популярный / Хит</Label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prod-sku">Артикул</Label>
                    <Input
                      id="prod-sku"
                      value={formData.sku}
                      onChange={(e) => setFormData({...formData, sku: e.target.value})}
                      className="rounded-none border-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-material">Материал</Label>
                    <Input
                      id="prod-material"
                      value={formData.material}
                      onChange={(e) => setFormData({...formData, material: e.target.value})}
                      className="rounded-none border-black"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prod-print">Принт</Label>
                    <Input
                      id="prod-print"
                      value={formData.printType}
                      onChange={(e) => setFormData({...formData, printType: e.target.value})}
                      className="rounded-none border-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-fit">Лекала</Label>
                    <Input
                      id="prod-fit"
                      value={formData.fit}
                      onChange={(e) => setFormData({...formData, fit: e.target.value})}
                      className="rounded-none border-black"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prod-gender">Пол</Label>
                    <Input
                      id="prod-gender"
                      value={formData.gender}
                      onChange={(e) => setFormData({...formData, gender: e.target.value})}
                      className="rounded-none border-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-color">Цвет</Label>
                    <Input
                      id="prod-color"
                      value={formData.color}
                      onChange={(e) => setFormData({...formData, color: e.target.value})}
                      className="rounded-none border-black"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prod-shipping">Отправка</Label>
                  <Input
                    id="prod-shipping"
                    value={formData.shipping}
                    onChange={(e) => setFormData({...formData, shipping: e.target.value})}
                    className="rounded-none border-black"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Отзывы</Label>
                  {editingProduct?.reviews && editingProduct.reviews.length > 0 ? (
                    <div className="space-y-3">
                      {editingProduct.reviews.map((review: any) => (
                        <div key={review.id || `${review.author}-${review.date}`} className="border border-gray-200 p-3">
                          <div className="text-sm font-bold">{review.author}</div>
                          <div className="text-xs text-gray-500">{review.date}</div>
                          <div className="text-sm text-gray-700 mt-2">{review.text}</div>
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-3 rounded-none"
                            onClick={() => handleDeleteReview(review.id)}
                          >
                            Удалить
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">Отзывов пока нет</div>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="rounded-none">
                    ОТМЕНА
                  </Button>
                  <Button type="submit" className="bg-black text-white hover:bg-gray-800 rounded-none font-bold uppercase tracking-widest">
                    {editingId ? 'ОБНОВИТЬ ТОВАР' : 'СОЗДАТЬ ТОВАР'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </main>
        {!embedded && <Footer />}
      </div>
  );
}
