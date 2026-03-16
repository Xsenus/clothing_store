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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FLOW } from '@/lib/api-mapping';
import { useEffect, useRef, useState } from 'react';
import { setCachedPublicSettings } from '@/lib/site-settings';
import LoadingSpinner from '@/components/LoadingSpinner';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X, Upload, ShieldCheck, Play, Pause, Copy, RefreshCcw, Check, Ban, ImagePlus, Images, PlusCircle, MinusCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';

interface TelegramBotCommand {
  command: string;
  description: string;
}

interface TelegramBotReplyTemplate {
  key: string;
  label: string;
  description?: string | null;
  enabled: boolean;
  text: string;
}

interface TelegramBot {
  id: string;
  name: string;
  description: string;
  shortDescription?: string | null;
  imageUrl?: string | null;
  username?: string | null;
  tokenMasked?: string;
  hasToken?: boolean;
  enabled: boolean;
  updateMode?: "polling" | "webhook";
  useForLogin?: boolean;
  autoRepliesEnabled?: boolean;
  commands: TelegramBotCommand[];
  replyTemplates?: TelegramBotReplyTemplate[];
  botInfo?: any;
}

const TELEGRAM_BOT_LIMITS = {
  name: 64,
  description: 512,
  shortDescription: 120,
  maxCommands: 100,
  command: 32,
  commandDescription: 256,
  replyText: 4096,
  imageUploadBytes: 10 * 1024 * 1024
} as const;

const DEFAULT_TELEGRAM_BOT_REPLY_TEMPLATES: TelegramBotReplyTemplate[] = [
  {
    key: "welcome",
    label: "Приветствие",
    description: "Отправляется при первом сообщении пользователю.",
    enabled: true,
    text: "Привет! Я бот {bot_name}. Используйте команды из меню."
  },
  {
    key: "known_command",
    label: "Ответ на известную команду",
    description: "Срабатывает для настроенной команды без отдельной логики.",
    enabled: false,
    text: "Команда {command} получена. Скоро здесь появится отдельное действие."
  },
  {
    key: "unknown_command",
    label: "Неизвестная команда",
    description: "Срабатывает, если пользователь вызвал несуществующую команду.",
    enabled: true,
    text: "Команда не распознана. Используйте меню Telegram или /check."
  },
  {
    key: "auth_only",
    label: "Бот только для авторизации",
    description: "Ответ на обычное сообщение, если бот используется для Telegram Login.",
    enabled: true,
    text: "Этот бот используется для авторизации через Telegram. Для входа откройте сайт и нажмите кнопку \"Войти через Telegram\"."
  },
  {
    key: "text_fallback",
    label: "Ответ на обычный текст",
    description: "Ответ на произвольное сообщение без команды у обычного бота.",
    enabled: false,
    text: "Сейчас я понимаю только системные и настроенные команды."
  },
  {
    key: "order_created",
    label: "Шаблон: новый заказ",
    description: "Заготовка для будущих уведомлений о создании заказа.",
    enabled: false,
    text: "Заказ {order_number} создан. Мы сообщим, когда начнем его собирать."
  },
  {
    key: "order_status_changed",
    label: "Шаблон: статус заказа",
    description: "Заготовка для будущих уведомлений о смене статуса заказа.",
    enabled: false,
    text: "Статус заказа {order_number} изменился: {status}."
  },
  {
    key: "discount_broadcast",
    label: "Шаблон: скидки и акции",
    description: "Заготовка для будущих массовых уведомлений о скидках.",
    enabled: false,
    text: "Для вас есть новое предложение: {discount_name}."
  }
];

const createEmptyTelegramBotCommand = (): TelegramBotCommand => ({
  command: "",
  description: ""
});

const cloneTelegramBotReplyTemplates = (templates?: TelegramBotReplyTemplate[]) => {
  const templateMap = new Map((templates || []).map((item) => [item.key, item]));
  return DEFAULT_TELEGRAM_BOT_REPLY_TEMPLATES.map((template) => {
    const existing = templateMap.get(template.key);
    return {
      ...template,
      enabled: existing?.enabled ?? template.enabled,
      text: existing?.text ?? template.text
    };
  });
};

const getInitialTelegramBotForm = () => ({
  name: "",
  description: "",
  shortDescription: "",
  imageUrl: "",
  token: "",
  username: "",
  tokenMasked: "",
  enabled: true,
  updateMode: "polling" as "polling" | "webhook",
  useForLogin: false,
  autoRepliesEnabled: true,
  commands: [createEmptyTelegramBotCommand()],
  replyTemplates: cloneTelegramBotReplyTemplates()
});

const normalizeTelegramCommandForValidation = (command: string) => command.trim().replace(/^\//, "");

const getTelegramBotFormErrors = (form: ReturnType<typeof getInitialTelegramBotForm>) => {
  const errors: string[] = [];
  const trimmedName = form.name.trim();
  const trimmedDescription = form.description.trim();
  const trimmedShortDescription = form.shortDescription.trim();
  const populatedCommands = form.commands.filter((item) => item.command.trim() || item.description.trim());

  if (!trimmedName) {
    errors.push("Название бота обязательно.");
  } else if (trimmedName.length > TELEGRAM_BOT_LIMITS.name) {
    errors.push(`Название бота должно быть не длиннее ${TELEGRAM_BOT_LIMITS.name} символов.`);
  }

  if (trimmedDescription.length > TELEGRAM_BOT_LIMITS.description) {
    errors.push(`Описание должно быть не длиннее ${TELEGRAM_BOT_LIMITS.description} символов.`);
  }

  if (trimmedShortDescription.length > TELEGRAM_BOT_LIMITS.shortDescription) {
    errors.push(`Краткое описание должно быть не длиннее ${TELEGRAM_BOT_LIMITS.shortDescription} символов.`);
  }

  if (populatedCommands.length > TELEGRAM_BOT_LIMITS.maxCommands) {
    errors.push(`Telegram поддерживает не более ${TELEGRAM_BOT_LIMITS.maxCommands} команд.`);
  }

  populatedCommands.forEach((item, index) => {
    const command = normalizeTelegramCommandForValidation(item.command);
    const description = item.description.trim();
    if (!command) {
      errors.push(`Команда #${index + 1}: укажите название команды.`);
      return;
    }

    if (!/^[a-z0-9_]{1,32}$/.test(command)) {
      errors.push(`Команда #${index + 1}: используйте только строчные латинские буквы, цифры и _.`);
    }

    if (!description) {
      errors.push(`Команда #${index + 1}: укажите описание.`);
    } else if (description.length > TELEGRAM_BOT_LIMITS.commandDescription) {
      errors.push(`Команда #${index + 1}: описание должно быть не длиннее ${TELEGRAM_BOT_LIMITS.commandDescription} символов.`);
    }
  });

  form.replyTemplates.forEach((template) => {
    const text = template.text.trim();
    if (template.enabled && !text) {
      errors.push(`Шаблон «${template.label}» включен, но текст пустой.`);
    }

    if (text.length > TELEGRAM_BOT_LIMITS.replyText) {
      errors.push(`Шаблон «${template.label}» должен быть не длиннее ${TELEGRAM_BOT_LIMITS.replyText} символов.`);
    }
  });

  return errors;
};

interface Product {
  _id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  basePrice?: number;
  discountPercent?: number;
  discountedPrice?: number;
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

interface GalleryImage {
  id: string;
  name: string;
  description?: string | null;
  url: string;
  fileSize: number;
  existsOnDisk: boolean;
  createdAt?: number;
}

const ORDER_STATUS_OPTIONS = [
  { value: "created", label: "Оформлен" },
  { value: "paid", label: "Оплачен" },
  { value: "in_transit", label: "В пути" },
  { value: "delivered", label: "Доставлен" },
  { value: "canceled", label: "Отменен" },
  { value: "returned", label: "Возврат" },
] as const;

const ORDER_STATUS_LABELS = Object.fromEntries(ORDER_STATUS_OPTIONS.map((item) => [item.value, item.label])) as Record<string, string>;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: "Оплата при получении",
  card: "Банковская карта",
  sbp: "СБП",
  cash: "Наличные",
};

const parseOrderItems = (raw: any) => {
  try {
    const source = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(source) ? source : [];
  } catch {
    return [];
  }
};

const parseOrderStatusHistory = (raw: any) => {
  try {
    const source = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(source) ? source : [];
  } catch {
    return [];
  }
};


type DictionaryKind = "sizes" | "materials" | "colors" | "categories";

interface DictionaryDeleteDialogState {
  open: boolean;
  kind: DictionaryKind;
  item: any | null;
  submitting: boolean;
  error: string;
}

interface ActionNoticeState {
  open: boolean;
  title: string;
  message: string;
  isError?: boolean;
}


const DEFAULT_APP_SETTINGS: Record<string, string> = {
  storeName: "",
  site_title: "fashiondemon",
  site_favicon_url: "",
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
  catalog_filter_categories_enabled: "true",
  catalog_filter_sizes_enabled: "true",
  dadata_api_key: "",
  yandex_delivery_base_cost: "350",
  yandex_delivery_cost_per_kg: "40",
  yandex_delivery_markup_percent: "0"
};

const DICTIONARY_FILTER_SETTING_KEYS: Partial<Record<DictionaryKind, string>> = {
  categories: "catalog_filter_categories_enabled",
  sizes: "catalog_filter_sizes_enabled"
};

export default function AdminPage({ embedded = false }: { embedded?: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [telegramBots, setTelegramBots] = useState<TelegramBot[]>([]);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [dictionaries, setDictionaries] = useState<any>({ sizes: [], materials: [], colors: [], categories: [] });
  const [dictionaryDrafts, setDictionaryDrafts] = useState<Record<string, { name: string; color: string; description: string; isActive: boolean }>>({});
  const [selectedDictionaryGroup, setSelectedDictionaryGroup] = useState<DictionaryKind>("sizes");
  const [editingDictionaryItemId, setEditingDictionaryItemId] = useState<string | null>(null);
  const [dictionaryDeleteDialog, setDictionaryDeleteDialog] = useState<DictionaryDeleteDialogState>({
    open: false,
    kind: "sizes",
    item: null,
    submitting: false,
    error: ""
  });
  const [actionNotice, setActionNotice] = useState<ActionNoticeState>({ open: false, title: "", message: "", isError: false });
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderForm, setOrderForm] = useState({
    status: "created",
    shippingAddress: "",
    paymentMethod: "cod",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    managerComment: "",
  });
  const [selectedSettingsGroup, setSelectedSettingsGroup] = useState("auth");
  const [selectedIntegrationCatalog, setSelectedIntegrationCatalog] = useState("telegram");
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [isSeedDialogOpen, setIsSeedDialogOpen] = useState(false);
  const [telegramBotForm, setTelegramBotForm] = useState(getInitialTelegramBotForm);
  const [isTelegramBotDialogOpen, setIsTelegramBotDialogOpen] = useState(false);
  const [editingTelegramBotId, setEditingTelegramBotId] = useState<string | null>(null);
  const [telegramBotSaving, setTelegramBotSaving] = useState(false);
  const [telegramBotChecking, setTelegramBotChecking] = useState(false);
  const [telegramBotCheckInfo, setTelegramBotCheckInfo] = useState<any | null>(null);
  const [telegramBotValidationError, setTelegramBotValidationError] = useState("");
  const [telegramBotTokenVisible, setTelegramBotTokenVisible] = useState(false);
  const telegramBotImageInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isStandaloneAdmin = !embedded;
  const isCreateProductRoute = isStandaloneAdmin && location.pathname === "/admin/products/new";
  const editProductRouteMatch = isStandaloneAdmin
    ? location.pathname.match(/^\/admin\/products\/([^/]+)\/edit$/)
    : null;
  const routeEditingProductId = editProductRouteMatch?.[1] || null;

  // Form State
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    basePrice: "",
    discountPercent: "0",
    discountedPrice: "",
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
  const [faviconUploading, setFaviconUploading] = useState(false);
  const faviconUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFaviconFileName, setSelectedFaviconFileName] = useState("");
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryName, setGalleryName] = useState("");
  const [galleryDescription, setGalleryDescription] = useState("");
  const [gallerySearch, setGallerySearch] = useState("");
  const [galleryViewMode, setGalleryViewMode] = useState<"grid" | "table">("grid");
  const [editingGalleryImageId, setEditingGalleryImageId] = useState<string | null>(null);
  const [editingGalleryName, setEditingGalleryName] = useState("");
  const [editingGalleryDescription, setEditingGalleryDescription] = useState("");
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedGalleryFileName, setSelectedGalleryFileName] = useState("");
  const [isMediaGalleryPickerOpen, setIsMediaGalleryPickerOpen] = useState(false);
  const [mediaGallerySlot, setMediaGallerySlot] = useState<number | null>(null);
  const [mediaGallerySearch, setMediaGallerySearch] = useState("");
  const mediaGalleryUploadInputRef = useRef<HTMLInputElement | null>(null);

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
      const [usersRes, ordersRes, settingsRes, botsRes, galleryRes, dictionariesRes] = await Promise.all([
        FLOW.adminGetUsers(),
        FLOW.adminGetOrders(),
        FLOW.adminGetSettings(),
        FLOW.adminGetTelegramBots(),
        FLOW.getAdminGalleryImages(),
        FLOW.adminGetDictionaries()
      ]);
      setUsers(Array.isArray(usersRes) ? usersRes : []);
      setOrders(Array.isArray(ordersRes) ? ordersRes : []);
      setSettings({ ...DEFAULT_APP_SETTINGS, ...(settingsRes || {}) });
      setTelegramBots(Array.isArray(botsRes) ? botsRes : []);
      setGalleryImages(Array.isArray(galleryRes) ? galleryRes : []);
      setDictionaries(dictionariesRes || { sizes: [], materials: [], colors: [], categories: [] });
    } catch (error) {
      toast.error("Не удалось загрузить раздел пользователей/заказов/настроек");
    }
  };

  const formatOrderStatus = (value: string) => ORDER_STATUS_LABELS[value] || value || "—";

  const getOrderItemsSummary = (order: any) => {
    const items = parseOrderItems(order?.itemsJson || order?.items);
    if (!items.length) return "—";

    return items.map((item: any) => {
      const qty = Number(item?.quantity || 1);
      const product = products.find((entry) => entry._id === item?.productId);
      const title = item?.productName || product?.name || item?.productId || "Товар";
      const size = item?.size ? ` (${item.size})` : "";
      return `${title}${size} × ${qty}`;
    }).join(", ");
  };

  const openOrderEditor = (order: any) => {
    setEditingOrder(order);
    setOrderForm({
      status: order?.status || "created",
      shippingAddress: order?.shippingAddress || "",
      paymentMethod: order?.paymentMethod || "cod",
      customerName: order?.customerName || "",
      customerEmail: order?.customerEmail || "",
      customerPhone: order?.customerPhone || "",
      managerComment: "",
    });
    setIsOrderDialogOpen(true);
  };

  const saveOrder = async () => {
    if (!editingOrder?.id) return;

    setOrderSaving(true);
    try {
      await FLOW.adminUpdateOrder({
        input: {
          orderId: editingOrder.id,
          payload: {
            status: orderForm.status,
            shippingAddress: orderForm.shippingAddress,
            paymentMethod: orderForm.paymentMethod,
            customerName: orderForm.customerName,
            customerEmail: orderForm.customerEmail,
            customerPhone: orderForm.customerPhone,
            managerComment: orderForm.managerComment,
          },
        },
      });
      toast.success("Заказ обновлен");
      setIsOrderDialogOpen(false);
      await fetchAdminData();
    } catch (error) {
      toast.error("Не удалось сохранить заказ");
    } finally {
      setOrderSaving(false);
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
      setCachedPublicSettings(mergedSettings);
      toast.success("Настройки сохранены");
    } catch (error) {
      toast.error("Не удалось сохранить настройки");
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateDictionaryFilterVisibility = (kind: DictionaryKind, enabled: boolean) => {
    const key = DICTIONARY_FILTER_SETTING_KEYS[kind];
    if (!key) return;
    updateSetting(key, enabled ? "true" : "false");
  };

  const createDictionaryItem = async (kind: DictionaryKind) => {
    const name = window.prompt("Введите значение словаря");
    if (!name) return;
    try {
      await FLOW.adminCreateDictionaryItem({ input: { kind, name, isActive: true } });
      await fetchAdminData();
      toast.success("Элемент словаря добавлен");
      if (kind === "sizes") setFormData((prev) => ({ ...prev, sizes: [...new Set([...prev.sizes, name])] }));
      if (kind === "materials") setFormData((prev) => ({ ...prev, material: name }));
      if (kind === "colors") setFormData((prev) => ({ ...prev, color: name }));
      if (kind === "categories") setFormData((prev) => ({ ...prev, category: name }));
    } catch (error) {
      toast.error((error as Error)?.message || "Не удалось добавить элемент словаря");
    }
  };

  const getDictionaryDraftDefaults = (item: any) => ({
    name: item.name || "",
    color: item.color || getDictionaryDotColor(item.name || ""),
    description: item.description || "",
    isActive: item.isActive ?? true
  });

  const startEditDictionaryItem = (item: any) => {
    setEditingDictionaryItemId(item.id);
    setDictionaryDrafts((prev) => ({ ...prev, [item.id]: getDictionaryDraftDefaults(item) }));
  };

  const cancelEditDictionaryItem = (item: any) => {
    setEditingDictionaryItemId(null);
    setDictionaryDrafts((prev) => {
      const copy = { ...prev };
      delete copy[item.id];
      return copy;
    });
  };

  const requestDeleteDictionaryItem = (kind: DictionaryKind, item: any) => {
    setDictionaryDeleteDialog({
      open: true,
      kind,
      item,
      submitting: false,
      error: ""
    });
  };

  const closeDeleteDictionaryDialog = () => {
    setDictionaryDeleteDialog((prev) => ({ ...prev, open: false, submitting: false, error: "" }));
  };

  const confirmDeleteDictionaryItem = async () => {
    if (!dictionaryDeleteDialog.item) return;

    setDictionaryDeleteDialog((prev) => ({ ...prev, submitting: true, error: "" }));
    try {
      await FLOW.adminDeleteDictionaryItem({ input: { kind: dictionaryDeleteDialog.kind, id: dictionaryDeleteDialog.item.id } });
      await fetchAdminData();
      closeDeleteDictionaryDialog();
      setActionNotice({
        open: true,
        title: "Готово",
        message: `Элемент «${dictionaryDeleteDialog.item.name}» успешно удален.`,
        isError: false
      });
    } catch (error) {
      const message = (error as Error)?.message || "Не удалось удалить элемент словаря";
      setDictionaryDeleteDialog((prev) => ({ ...prev, submitting: false, error: message }));
    }
  };

  const updateDictionaryItem = async (kind: DictionaryKind, item: any) => {
    const draft = dictionaryDrafts[item.id] ?? getDictionaryDraftDefaults(item);
    const nextName = (draft.name ?? item.name ?? "").trim();
    if (!nextName) {
      toast.error("Название обязательно");
      return;
    }
    try {
      await FLOW.adminUpdateDictionaryItem({
        input: {
          kind,
          id: item.id,
          name: nextName,
          color: draft.color,
          description: draft.description,
          isActive: draft.isActive
        }
      });
      await fetchAdminData();
      setDictionaryDrafts((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      toast.success("Элемент словаря обновлен");
      setEditingDictionaryItemId(null);
    } catch (error) {
      toast.error((error as Error)?.message || "Не удалось обновить элемент словаря");
    }
  };

  const handleFaviconUpload = async (file: File | null) => {
    if (!file) return;
    setFaviconUploading(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append("files", file);
      const res = await FLOW.adminUploadFavicon({ input: formDataUpload });
      const uploadedUrl = res?.url;
      if (!uploadedUrl) {
        toast.error("Не удалось получить URL загруженной иконки");
        return;
      }

      updateSetting("site_favicon_url", uploadedUrl);
      setSelectedFaviconFileName("");
      if (faviconUploadInputRef.current) {
        faviconUploadInputRef.current.value = "";
      }
      toast.success("Иконка вкладки загружена");
    } catch (error) {
      toast.error("Не удалось загрузить иконку");
    } finally {
      setFaviconUploading(false);
    }
  };

  const isSettingEnabled = (key: string, fallback = false) => {
    const value = (settings[key] ?? (fallback ? "true" : "false")).toLowerCase();
    return value === "true" || value === "1" || value === "on";
  };

  const formatBytes = (value?: number) => {
    if (!value || value <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const size = value / (1024 ** index);
    return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  };

  const uploadGalleryImage = async (file: File | null) => {
    if (!file) return;

    setGalleryUploading(true);
    try {
      const payload = new FormData();
      payload.append("file", file);
      payload.append("name", galleryName || file.name);
      payload.append("description", galleryDescription);
      await FLOW.uploadAdminGalleryImage({ input: payload });
      setGalleryName("");
      setGalleryDescription("");
      setSelectedGalleryFileName("");
      if (galleryFileInputRef.current) {
        galleryFileInputRef.current.value = "";
      }
      await fetchAdminData();
      toast.success("Изображение добавлено в галерею");
    } catch {
      toast.error("Не удалось загрузить изображение в галерею");
    } finally {
      setGalleryUploading(false);
    }
  };

  const deleteGalleryImage = async (image: GalleryImage) => {
    if (!confirm(`Удалить изображение «${image.name}»?`)) return;
    try {
      await FLOW.deleteAdminGalleryImage({ input: { id: image.id } });
      await fetchAdminData();
      toast.success("Изображение удалено");
    } catch {
      toast.error("Не удалось удалить изображение");
    }
  };

  const copyGalleryImageToDisk = async (image: GalleryImage) => {
    try {
      await FLOW.copyAdminGalleryImageToDisk({ input: { id: image.id } });
      await fetchAdminData();
      toast.success("Изображение скопировано на диск");
    } catch {
      toast.error("Не удалось скопировать изображение");
    }
  };

  const restoreMissingGalleryImages = async () => {
    try {
      const result = await FLOW.restoreMissingAdminGalleryImages();
      await fetchAdminData();
      toast.success(`Восстановлено файлов: ${result?.restored ?? 0}`);
    } catch {
      toast.error("Не удалось восстановить изображения");
    }
  };

  const startEditGalleryImage = (image: GalleryImage) => {
    setEditingGalleryImageId(image.id);
    setEditingGalleryName(image.name || "");
    setEditingGalleryDescription(image.description || "");
  };

  const cancelEditGalleryImage = () => {
    setEditingGalleryImageId(null);
    setEditingGalleryName("");
    setEditingGalleryDescription("");
  };

  const saveGalleryImageMeta = async () => {
    if (!editingGalleryImageId) return;
    try {
      await FLOW.updateAdminGalleryImage({
        input: {
          id: editingGalleryImageId,
          name: editingGalleryName,
          description: editingGalleryDescription
        }
      });
      await fetchAdminData();
      toast.success("Изображение обновлено");
      cancelEditGalleryImage();
    } catch {
      toast.error("Не удалось обновить метаданные изображения");
    }
  };

  const filteredGalleryImages = galleryImages.filter((image) => {
    const q = gallerySearch.trim().toLowerCase();
    if (!q) return true;
    return `${image.name} ${image.description || ""}`.toLowerCase().includes(q);
  });

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    if (typeof error === "string" && error.trim()) {
      return error;
    }

    return fallback;
  };

  const maskTokenPreview = (token: string) => {
    const value = token.trim();
    if (!value) return "";
    if (value.length <= 4) return "*".repeat(value.length);
    if (value.length <= 8) return `${value.slice(0, 2)}****${value.slice(-2)}`;
    return `${value.slice(0, 4)}****${value.slice(-4)}`;
  };

  const getMaskedTokenInputValue = () => {
    if (!telegramBotForm.token.trim()) {
      return "";
    }

    return telegramBotTokenVisible
      ? telegramBotForm.token
      : maskTokenPreview(telegramBotForm.token);
  };

  const resetTelegramBotForm = () => {
    setTelegramBotForm(getInitialTelegramBotForm());
    setEditingTelegramBotId(null);
    setTelegramBotCheckInfo(null);
    setTelegramBotValidationError("");
    setTelegramBotTokenVisible(false);
  };

  const addTelegramBotCommand = () => {
    setTelegramBotForm((prev) => {
      if (prev.commands.length >= TELEGRAM_BOT_LIMITS.maxCommands) {
        toast.error(`Telegram поддерживает не более ${TELEGRAM_BOT_LIMITS.maxCommands} команд.`);
        return prev;
      }

      return {
        ...prev,
        commands: [...prev.commands, createEmptyTelegramBotCommand()]
      };
    });
  };

  const updateTelegramBotCommand = (index: number, field: keyof TelegramBotCommand, value: string) => {
    setTelegramBotForm((prev) => ({
      ...prev,
      commands: prev.commands.map((command, commandIndex) =>
        commandIndex === index ? { ...command, [field]: value } : command
      )
    }));
  };

  const removeTelegramBotCommand = (index: number) => {
    setTelegramBotForm((prev) => {
      const nextCommands = prev.commands.filter((_, commandIndex) => commandIndex !== index);
      return {
        ...prev,
        commands: nextCommands.length > 0 ? nextCommands : [createEmptyTelegramBotCommand()]
      };
    });
  };

  const updateTelegramBotReplyTemplate = (
    key: string,
    field: "enabled" | "text",
    value: boolean | string
  ) => {
    setTelegramBotForm((prev) => ({
      ...prev,
      replyTemplates: prev.replyTemplates.map((template) =>
        template.key === key ? { ...template, [field]: value } : template
      )
    }));
  };

  const openCreateTelegramBotDialog = () => {
    resetTelegramBotForm();
    setIsTelegramBotDialogOpen(true);
  };

  const openEditTelegramBotDialog = (bot: TelegramBot) => {
    setEditingTelegramBotId(bot.id);
    setTelegramBotCheckInfo(bot.botInfo || null);
    setTelegramBotValidationError("");
    setTelegramBotTokenVisible(false);
    setTelegramBotForm({
      name: bot.name || "",
      description: bot.description || "",
      shortDescription: bot.shortDescription || "",
      imageUrl: bot.imageUrl || "",
      token: "",
      username: bot.username || "",
      tokenMasked: bot.tokenMasked || "",
      enabled: bot.enabled,
      updateMode: bot.updateMode === "webhook" ? "webhook" : "polling",
      useForLogin: !!bot.useForLogin,
      autoRepliesEnabled: bot.autoRepliesEnabled ?? true,
      commands: Array.isArray(bot.commands) && bot.commands.length > 0 ? bot.commands : [createEmptyTelegramBotCommand()],
      replyTemplates: cloneTelegramBotReplyTemplates(bot.replyTemplates)
    });
    setIsTelegramBotDialogOpen(true);
  };

  const validateTelegramToken = async (tokenInput?: string) => {
    const token = (tokenInput ?? telegramBotForm.token).trim();
    if (!token) {
      const message = "Токен бота обязателен";
      setTelegramBotValidationError(message);
      toast.error(message);
      return null;
    }

    setTelegramBotValidationError("");
    setTelegramBotCheckInfo(null);
    setTelegramBotChecking(true);
    try {
      const info = await FLOW.adminValidateTelegramBot({ input: { token } });
      setTelegramBotCheckInfo(info || null);
      setTelegramBotValidationError("");
      if (info?.username) {
        setTelegramBotForm((prev) => ({ ...prev, username: info.username }));
      }
      if (!telegramBotForm.name && info?.first_name) {
        setTelegramBotForm((prev) => ({ ...prev, name: info.first_name }));
      }
      toast.success("Токен подтверждён через getMe");
      return info;
    } catch (error) {
      const message = getErrorMessage(error, "Проверка getMe не прошла");
      setTelegramBotValidationError(message);
      toast.error(message);
      return null;
    } finally {
      setTelegramBotChecking(false);
    }
  };

  const uploadTelegramBotImage = async (file?: File) => {
    if (!file) return;

    const normalizedType = file.type.toLowerCase();
    const isJpeg = normalizedType === "image/jpeg" || normalizedType === "image/jpg";
    if (!isJpeg) {
      toast.error("Для фото профиля Telegram используйте JPG/JPEG.");
      return;
    }

    if (file.size > TELEGRAM_BOT_LIMITS.imageUploadBytes) {
      toast.error("Файл слишком большой для безопасной загрузки в Telegram.");
      return;
    }

    try {
      const formDataUpload = new FormData();
      formDataUpload.append("files", file);
      const res = await FLOW.adminUpload({ input: formDataUpload });
      const first = Array.isArray(res?.urls) ? res.urls[0] : null;
      if (!first) {
        toast.error("Не удалось загрузить изображение");
        return;
      }

      setTelegramBotForm((prev) => ({ ...prev, imageUrl: first }));
      toast.success("Изображение загружено");
    } catch (error) {
      toast.error(getErrorMessage(error, "Ошибка загрузки изображения"));
    }
  };

  const saveTelegramBot = async () => {
    const enteredToken = telegramBotForm.token.trim();
    const formErrors = getTelegramBotFormErrors(telegramBotForm);

    if (!enteredToken && !editingTelegramBotId) {
      toast.error("Токен бота обязателен");
      return;
    }

    if (formErrors.length > 0) {
      toast.error(formErrors[0]);
      return;
    }

    setTelegramBotSaving(true);
    try {
      if (enteredToken) {
        const preCheck = await validateTelegramToken(enteredToken);
        if (!preCheck) return;
      }

      const payload = {
        name: telegramBotForm.name.trim(),
        description: telegramBotForm.description.trim(),
        shortDescription: telegramBotForm.shortDescription.trim(),
        imageUrl: telegramBotForm.imageUrl.trim(),
        token: enteredToken || undefined,
        enabled: telegramBotForm.enabled,
        updateMode: telegramBotForm.updateMode,
        useForLogin: telegramBotForm.useForLogin,
        autoRepliesEnabled: telegramBotForm.autoRepliesEnabled,
        commands: telegramBotForm.commands
          .filter((item) => item.command.trim() || item.description.trim())
          .map((item) => ({
            command: item.command.trim(),
            description: item.description.trim()
          })),
        replyTemplates: telegramBotForm.replyTemplates.map((template) => ({
          key: template.key,
          label: template.label,
          description: template.description || "",
          enabled: template.enabled,
          text: template.text
        }))
      };

      let savedBot: any;
      if (editingTelegramBotId) {
        savedBot = await FLOW.adminUpdateTelegramBot({ input: { id: editingTelegramBotId, payload } });
      } else {
        savedBot = await FLOW.adminCreateTelegramBot({ input: { ...payload, token: enteredToken } });
      }

      toast.success(editingTelegramBotId ? "Бот обновлён и запущен" : "Бот добавлен и запущен");
      setIsTelegramBotDialogOpen(false);
      resetTelegramBotForm();
      await fetchAdminData();
      setTelegramBotCheckInfo(savedBot?.botInfo || null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось сохранить Telegram-бота"));
    } finally {
      setTelegramBotSaving(false);
    }
  };

  const toggleTelegramBot = async (bot: TelegramBot) => {
    try {
      await FLOW.adminUpdateTelegramBot({ input: { id: bot.id, payload: { enabled: !bot.enabled } } });
      await fetchAdminData();
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось изменить состояние бота"));
    }
  };

  const checkTelegramBot = async (bot: TelegramBot) => {
    try {
      await FLOW.adminCheckTelegramBot({ input: { id: bot.id } });
      toast.success("Проверка бота выполнена");
      await fetchAdminData();
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось проверить бота"));
    }
  };

  const deleteTelegramBot = async (bot: TelegramBot) => {
    if (!confirm(`Удалить бота ${bot.name}?`)) return;
    try {
      await FLOW.adminDeleteTelegramBot({ input: { id: bot.id } });
      await fetchAdminData();
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось удалить бота"));
    }
  };

  const telegramBotFormErrors = getTelegramBotFormErrors(telegramBotForm);

  const settingsGroups = [
    { id: "auth", label: "Авторизация" },
    { id: "operations", label: "Регламентные операции" },
    { id: "smtp", label: "Почта (SMTP)" },
    { id: "metrics", label: "Метрики" },
    { id: "integrations", label: "Интеграции" },
    { id: "legal", label: "Юридические тексты" },
    { id: "general", label: "Общие" }
  ] as const;

  const dictionaryGroups = [
    { key: "sizes", label: "Размеры" },
    { key: "materials", label: "Материалы" },
    { key: "colors", label: "Цвета" },
    { key: "categories", label: "Категории" }
  ] as const;

  const activeDictionaryGroup = dictionaryGroups.find((group) => group.key === selectedDictionaryGroup) || dictionaryGroups[0];

  const getDictionaryDotColor = (name: string) => {
    const colors = ["#3b82f6", "#22c55e", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f59e0b"];
    const idx = Array.from(name || "").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % colors.length;
    return colors[idx];
  };

  const buildMediaFromProduct = (product: Product) => {
    if (product.media && product.media.length > 0) return product.media;
    const images = (product.images || []).map((url) => ({ type: "image" as const, url }));
    const videos = (product.videos || []).map((url) => ({ type: "video" as const, url }));
    return [...images, ...videos];
  };

  const openProductForm = (product?: Product) => {
    if (product) {
      setEditingId(product._id);
      setEditingProduct(product);
      const mediaList = buildMediaFromProduct(product);
      setFormData({
        name: product.name,
        slug: product.slug,
        description: product.description,
        basePrice: String(product.basePrice ?? product.price ?? ""),
        discountPercent: String(product.discountPercent ?? 0),
        discountedPrice: String(product.discountedPrice ?? product.price ?? ""),
        category: product.category,
        images: product.images.join(','),
        videos: (product.videos || []).join(','),
        media: mediaList.length > 0 ? mediaList : [{ type: "image", url: "" }],
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
        basePrice: "",
        discountPercent: "0",
        discountedPrice: "",
        category: "",
        images: "",
        videos: "",
        media: [{ type: "image", url: "" }],
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

  const closeProductForm = () => {
    setIsOpen(false);
    if (isStandaloneAdmin && location.pathname !== "/admin") {
      navigate("/admin");
    }
  };

  const handleOpen = (product?: Product) => {
    if (isStandaloneAdmin) {
      if (product?._id) {
        navigate(`/admin/products/${product._id}/edit`);
      } else {
        navigate('/admin/products/new');
      }
      return;
    }
    openProductForm(product);
  };

  useEffect(() => {
    if (!isStandaloneAdmin) return;

    if (isCreateProductRoute) {
      openProductForm();
      return;
    }

    if (routeEditingProductId) {
      const targetProduct = products.find((p) => p._id === routeEditingProductId || (p as any).id === routeEditingProductId);
      if (targetProduct) {
        openProductForm(targetProduct);
      } else if (!loading) {
        toast.error('Товар не найден');
        navigate('/admin');
      }
      return;
    }

    setIsOpen(false);
  }, [isStandaloneAdmin, isCreateProductRoute, routeEditingProductId, products, loading, navigate]);

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
        basePrice: parseFloat(formData.basePrice || "0"),
        discountPercent: parseFloat(formData.discountPercent || "0"),
        discountedPrice: parseFloat(formData.discountedPrice || "0"),
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
      
      if (isStandaloneAdmin) {
        navigate('/admin');
      } else {
        setIsOpen(false);
      }
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

  useEffect(() => {
    const base = Number(formData.basePrice || 0);
    const discount = Math.min(100, Math.max(0, Number(formData.discountPercent || 0)));
    const discounted = discount > 0 ? Math.max(0, Math.round(base * (1 - discount / 100))) : base;
    setFormData((prev) => ({ ...prev, discountedPrice: String(discounted) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.basePrice, formData.discountPercent]);

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

  const addMediaSlot = () => {
    setFormData((prev) => ({
      ...prev,
      media: [...prev.media, { type: "image", url: "" }]
    }));
  };

  const removeMediaSlot = (index: number) => {
    setFormData((prev) => {
      const nextMedia = prev.media.filter((_, mediaIndex) => mediaIndex !== index - 1);
      return {
        ...prev,
        media: nextMedia.length > 0 ? nextMedia : [{ type: "image", url: "" }]
      };
    });
  };

  const openMediaGalleryPicker = (slot: number) => {
    setMediaGallerySlot(slot);
    setMediaGallerySearch("");
    setIsMediaGalleryPickerOpen(true);
  };

  const selectMediaFromGallery = (url: string) => {
    if (!mediaGallerySlot) return;
    setMediaSlot(mediaGallerySlot, "image", url);
    setIsMediaGalleryPickerOpen(false);
    setMediaGallerySlot(null);
  };

  const uploadMediaToGalleryAndAssign = async (file: File | null, slot: number) => {
    if (!file) return;
    setUploading(true);
    try {
      const payload = new FormData();
      payload.append("file", file);
      payload.append("name", file.name);
      const uploaded = await FLOW.uploadAdminGalleryImage({ input: payload });
      if (uploaded?.url) {
        setMediaSlot(slot, file.type.startsWith("video") ? "video" : "image", uploaded.url);
        await fetchAdminData();
        toast.success("Файл загружен в галерею и выбран");
      }
    } catch {
      toast.error("Не удалось загрузить файл в галерею");
    } finally {
      setUploading(false);
    }
  };

  const uploadFromPickerToGallery = async (file: File | null) => {
    if (!file || !mediaGallerySlot) return;
    await uploadMediaToGalleryAndAssign(file, mediaGallerySlot);
    setIsMediaGalleryPickerOpen(false);
    setMediaGallerySlot(null);
  };

  const filteredGalleryPickerImages = galleryImages.filter((image) => {
    const q = mediaGallerySearch.trim().toLowerCase();
    if (!q) return true;
    return `${image.name} ${image.description || ""}`.toLowerCase().includes(q);
  });

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
              <TabsTrigger value="gallery" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest">ГАЛЕРЕЯ</TabsTrigger>
              <TabsTrigger value="dictionaries" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest">СЛОВАРИ</TabsTrigger>
              <TabsTrigger value="settings" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest">НАСТРОЙКИ</TabsTrigger>
            </TabsList>

          <TabsContent value="products" className="mt-0">
          {!isOpen && (
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
                        {(product.images?.[0] || product.media?.find((m) => m.type === "image")?.url) ? (
                          <img src={product.images?.[0] || product.media?.find((m) => m.type === "image")?.url} alt={product.name} className="w-12 h-16 object-cover bg-gray-100" />
                        ) : (
                          <div className="w-12 h-16 bg-gray-200" />
                        )}
                      </TableCell>
                      <TableCell className="font-bold">{product.name}</TableCell>
                      <TableCell>{Math.round(product.discountPercent ? (product.discountedPrice || product.price) : (product.basePrice || product.price))}₽</TableCell>
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
          )}
          </TabsContent>

          <TabsContent value="gallery" className="mt-0">
            <div className="space-y-4">
              <div className="border border-gray-200 p-4 space-y-3">
                <h2 className="text-2xl font-black uppercase">Галерея изображений</h2>
                <div className="grid md:grid-cols-4 gap-3">
                  <Input
                    placeholder="Наименование"
                    value={galleryName}
                    onChange={(e) => setGalleryName(e.target.value)}
                    className="rounded-none"
                  />
                  <Input
                    placeholder="Описание"
                    value={galleryDescription}
                    onChange={(e) => setGalleryDescription(e.target.value)}
                    className="rounded-none"
                  />
                  <Input
                    placeholder="Поиск по имени/описанию"
                    value={gallerySearch}
                    onChange={(e) => setGallerySearch(e.target.value)}
                    className="rounded-none"
                  />
                  <div className="flex gap-2 items-center">
                    <input
                      ref={galleryFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setSelectedGalleryFileName(file?.name || "");
                        uploadGalleryImage(file);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-none"
                      disabled={galleryUploading}
                      onClick={() => galleryFileInputRef.current?.click()}
                    >
                      <ImagePlus className="w-4 h-4 mr-2" />
                      {galleryUploading ? "Загрузка..." : (selectedGalleryFileName ? `Файл: ${selectedGalleryFileName}` : "Загрузить файл")}
                    </Button>
                    <Button type="button" variant="outline" className="rounded-none" onClick={restoreMissingGalleryImages}>
                      <RefreshCcw className="w-4 h-4 mr-1" />
                      Восстановить
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={galleryViewMode === "grid" ? "default" : "outline"}
                    className="rounded-none"
                    onClick={() => setGalleryViewMode("grid")}
                  >
                    Плитка
                  </Button>
                  <Button
                    type="button"
                    variant={galleryViewMode === "table" ? "default" : "outline"}
                    className="rounded-none"
                    onClick={() => setGalleryViewMode("table")}
                  >
                    Таблица
                  </Button>
                </div>
              </div>

              {galleryViewMode === "grid" ? (
                <div className="grid md:grid-cols-3 gap-4">
                  {filteredGalleryImages.map((image) => (
                  <div key={image.id} className="border border-gray-200 p-3 space-y-2">
                    <img src={image.url} alt={image.name} className="w-full h-52 object-cover bg-gray-100" />
                    {editingGalleryImageId === image.id ? (
                      <div className="space-y-2">
                        <Input value={editingGalleryName} onChange={(e) => setEditingGalleryName(e.target.value)} className="rounded-none" />
                        <Textarea value={editingGalleryDescription} onChange={(e) => setEditingGalleryDescription(e.target.value)} className="rounded-none min-h-20" />
                      </div>
                    ) : (
                      <>
                        <div className="font-semibold">{image.name}</div>
                        <div className="text-sm text-muted-foreground">{image.description || "Без описания"}</div>
                      </>
                    )}
                    <div className="text-xs text-muted-foreground">{formatBytes(image.fileSize)} · {image.existsOnDisk ? "На диске" : "Только в БД"}</div>
                    <div className="flex gap-2">
                      {editingGalleryImageId === image.id ? (
                        <>
                          <Button size="icon" variant="default" className="rounded-none" onClick={saveGalleryImageMeta} aria-label="Сохранить">
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="outline" className="rounded-none" onClick={cancelEditGalleryImage} aria-label="Отмена">
                            <Ban className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <Button size="icon" variant="outline" className="rounded-none" onClick={() => startEditGalleryImage(image)} aria-label="Изменить">
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="outline" className="rounded-none" onClick={() => copyGalleryImageToDisk(image)} aria-label="Копировать на диск">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="destructive" className="rounded-none" onClick={() => deleteGalleryImage(image)} aria-label="Удалить">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  ))}
                </div>
              ) : (
                <div className="border border-gray-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Превью</TableHead>
                        <TableHead>Файл</TableHead>
                        <TableHead>Описание</TableHead>
                        <TableHead>Размер</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead className="text-right">Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredGalleryImages.map((image) => (
                        <TableRow key={image.id}>
                          <TableCell><img src={image.url} alt={image.name} className="w-16 h-12 object-cover bg-gray-100" /></TableCell>
                          <TableCell className="font-semibold">
                            {editingGalleryImageId === image.id ? (
                              <Input value={editingGalleryName} onChange={(e) => setEditingGalleryName(e.target.value)} className="rounded-none" />
                            ) : image.name}
                          </TableCell>
                          <TableCell>
                            {editingGalleryImageId === image.id ? (
                              <Textarea value={editingGalleryDescription} onChange={(e) => setEditingGalleryDescription(e.target.value)} className="rounded-none min-h-20" />
                            ) : (image.description || "—")}
                          </TableCell>
                          <TableCell>{formatBytes(image.fileSize)}</TableCell>
                          <TableCell>{image.existsOnDisk ? "На диске" : "Только в БД"}</TableCell>
                          <TableCell className="text-right space-x-2">
                            {editingGalleryImageId === image.id ? (
                              <>
                                <Button size="icon" variant="default" className="rounded-none" onClick={saveGalleryImageMeta} aria-label="Сохранить">
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="outline" className="rounded-none" onClick={cancelEditGalleryImage} aria-label="Отмена">
                                  <Ban className="w-4 h-4" />
                                </Button>
                              </>
                            ) : (
                              <Button size="icon" variant="outline" className="rounded-none" onClick={() => startEditGalleryImage(image)} aria-label="Изменить">
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            <Button size="icon" variant="outline" className="rounded-none" onClick={() => copyGalleryImageToDisk(image)} aria-label="Копировать на диск">
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="destructive" className="rounded-none" onClick={() => deleteGalleryImage(image)} aria-label="Удалить">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
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
                    <TableHead>Товары</TableHead>
                    <TableHead>Как купил</TableHead>
                    <TableHead>Куда отправили</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="max-w-[180px] truncate">{order.id}</TableCell>
                      <TableCell>{order.userEmail || order.userId}</TableCell>
                      <TableCell className="max-w-[280px] text-xs">{getOrderItemsSummary(order)}</TableCell>
                      <TableCell>{PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod || "—"}</TableCell>
                      <TableCell className="max-w-[220px] text-xs">{order.shippingAddress || "—"}</TableCell>
                      <TableCell>{formatOrderStatus(order.status)}</TableCell>
                      <TableCell>{Number(order.totalAmount || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="outline" size="sm" onClick={() => openOrderEditor(order)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Dialog open={isOrderDialogOpen} onOpenChange={setIsOrderDialogOpen}>
                <DialogContent className="max-w-3xl rounded-none">
                  <DialogHeader>
                    <DialogTitle className="uppercase">Редактирование заказа</DialogTitle>
                  </DialogHeader>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Статус заказа</Label>
                      <select className="w-full h-10 border border-black px-3 bg-white" value={orderForm.status} onChange={(e) => setOrderForm((prev) => ({ ...prev, status: e.target.value }))}>
                        {ORDER_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Способ оплаты</Label>
                      <Input value={orderForm.paymentMethod} onChange={(e) => setOrderForm((prev) => ({ ...prev, paymentMethod: e.target.value }))} className="rounded-none border-black" />
                    </div>
                    <div className="space-y-2">
                      <Label>Получатель</Label>
                      <Input value={orderForm.customerName} onChange={(e) => setOrderForm((prev) => ({ ...prev, customerName: e.target.value }))} className="rounded-none border-black" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input value={orderForm.customerEmail} onChange={(e) => setOrderForm((prev) => ({ ...prev, customerEmail: e.target.value }))} className="rounded-none border-black" />
                    </div>
                    <div className="space-y-2">
                      <Label>Телефон</Label>
                      <Input value={orderForm.customerPhone} onChange={(e) => setOrderForm((prev) => ({ ...prev, customerPhone: e.target.value }))} className="rounded-none border-black" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Адрес доставки</Label>
                      <Textarea value={orderForm.shippingAddress} onChange={(e) => setOrderForm((prev) => ({ ...prev, shippingAddress: e.target.value }))} className="rounded-none border-black" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Комментарий к смене статуса</Label>
                      <Textarea value={orderForm.managerComment} onChange={(e) => setOrderForm((prev) => ({ ...prev, managerComment: e.target.value }))} placeholder="Например: Передан в службу доставки" className="rounded-none border-black" />
                    </div>
                  </div>

                  <div className="border border-gray-200 p-3 max-h-48 overflow-auto">
                    <p className="font-bold uppercase text-sm mb-2">Хроника статусов</p>
                    <div className="space-y-2 text-sm">
                      {parseOrderStatusHistory(editingOrder?.statusHistoryJson).length === 0 && <p className="text-muted-foreground">История пока пуста</p>}
                      {parseOrderStatusHistory(editingOrder?.statusHistoryJson).slice().reverse().map((entry: any, index: number) => (
                        <div key={`${entry?.changedAt || "row"}-${index}`} className="border-b border-gray-100 pb-2">
                          <div className="font-semibold">{formatOrderStatus(String(entry?.status || ""))}</div>
                          <div className="text-xs text-gray-500">{entry?.changedAt ? new Date(Number(entry.changedAt)).toLocaleString() : ""} · {entry?.changedBy || "system"}</div>
                          {entry?.comment && <div className="text-xs">{String(entry.comment)}</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" className="rounded-none" onClick={() => setIsOrderDialogOpen(false)}>Отмена</Button>
                    <Button type="button" className="rounded-none bg-black text-white" onClick={saveOrder} disabled={orderSaving}>{orderSaving ? "Сохранение..." : "Сохранить"}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </TabsContent>


          <TabsContent value="dictionaries" className="mt-0">
            <div className="space-y-4">
              <h2 className="text-5xl font-black tracking-tight">Справочники</h2>
              <p className="text-lg text-muted-foreground">Управляйте справочниками системы</p>

              <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                <div className="rounded-xl border border-gray-200 bg-[#f8fafc] p-3">
                  <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Наименования</div>
                  <div className="space-y-1">
                    {dictionaryGroups.map((group) => {
                      const isSelected = selectedDictionaryGroup === group.key;
                      const records = dictionaries[group.key] || [];
                      const count = records.length;
                      const activeCount = records.filter((entry: any) => entry.isActive !== false).length;
                      const inactiveCount = Math.max(count - activeCount, 0);
                      return (
                        <button
                          key={group.key}
                          type="button"
                          onClick={() => setSelectedDictionaryGroup(group.key)}
                          className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${isSelected ? "border-slate-900 bg-slate-900 text-white" : "border-transparent hover:bg-slate-100"}`}
                        >
                          <div className="font-semibold">{group.label}</div>
                          <div className={`text-xs ${isSelected ? "text-slate-300" : "text-slate-500"}`}>{count} записей</div>
                          <div className={`text-xs ${isSelected ? "text-slate-300" : "text-slate-500"}`}>Активно: {activeCount} · Отключено: {inactiveCount}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-[#f8fafc] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-3xl font-black tracking-tight">{activeDictionaryGroup.label}</h3>
                      <p className="text-sm text-muted-foreground">Всего: {(dictionaries[selectedDictionaryGroup] || []).length}</p>
                    </div>
                    <Button type="button" className="rounded-none bg-slate-900 text-white hover:bg-slate-800" onClick={() => createDictionaryItem(selectedDictionaryGroup)}>
                      <Plus className="mr-2 h-4 w-4" /> Добавить
                    </Button>
                  </div>

                  {DICTIONARY_FILTER_SETTING_KEYS[selectedDictionaryGroup] && (
                    <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                      <div>
                        <p className="text-sm font-semibold">Показывать фильтр в каталоге</p>
                        <p className="text-xs text-muted-foreground">Управляет отображением блока «{activeDictionaryGroup.label}» на странице каталога.</p>
                      </div>
                      <Checkbox
                        checked={isSettingEnabled(DICTIONARY_FILTER_SETTING_KEYS[selectedDictionaryGroup] as string, true)}
                        onCheckedChange={(checked) => updateDictionaryFilterVisibility(selectedDictionaryGroup, !!checked)}
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    {(dictionaries[selectedDictionaryGroup] || []).map((item: any) => {
                      const isEditing = editingDictionaryItemId === item.id;
                      const draft = dictionaryDrafts[item.id] ?? getDictionaryDraftDefaults(item);
                      return (
                        <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-3">
                          {isEditing ? (
                            <div className="space-y-3">
                              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_auto] xl:items-end">
                                <div className="space-y-1">
                                  <Label className="mb-1 block text-xs">Название *</Label>
                                  <Input
                                    value={draft.name}
                                    onChange={(e) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, name: e.target.value } }))}
                                    className="rounded-md border-slate-300"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="mb-1 block text-xs">Цвет</Label>
                                  <div className="grid grid-cols-[minmax(0,1fr)_42px] gap-2">
                                    <Input
                                      value={draft.color}
                                      onChange={(e) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, color: e.target.value } }))}
                                      className="rounded-md border-slate-300"
                                      placeholder="#3b82f6"
                                    />
                                    <input
                                      type="color"
                                      value={draft.color || "#3b82f6"}
                                      onChange={(e) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, color: e.target.value } }))}
                                      className="h-10 w-10 cursor-pointer rounded border border-slate-300 bg-white p-1"
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                                  <div className="mr-2 flex items-center gap-2">
                                    <Checkbox
                                      id={`dict-active-${item.id}`}
                                      checked={draft.isActive}
                                      onCheckedChange={(checked) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, isActive: !!checked } }))}
                                    />
                                    <Label htmlFor={`dict-active-${item.id}`} className="text-sm">Активно</Label>
                                  </div>
                                  <Button type="button" variant="outline" className="min-w-[110px] rounded-none" onClick={() => cancelEditDictionaryItem(item)}>
                                    <X className="mr-2 h-4 w-4" /> Сброс
                                  </Button>
                                  <Button type="button" className="min-w-[130px] rounded-none bg-slate-900 text-white hover:bg-slate-800" onClick={() => updateDictionaryItem(selectedDictionaryGroup, item)}>
                                    <Check className="mr-2 h-4 w-4" /> Сохранить
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="mb-1 block text-xs">Описание</Label>
                                <Textarea
                                  value={draft.description}
                                  onChange={(e) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, description: e.target.value } }))}
                                  className="min-h-[76px] rounded-md border-slate-300"
                                  placeholder="Описание словарного значения"
                                />
                              </div>
                              <div className="text-xs text-muted-foreground">Создано: {item.createdAt ? new Date(item.createdAt).toLocaleString("ru-RU") : "—"}</div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 font-semibold">
                                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color || getDictionaryDotColor(item.name) }} />
                                  {item.name}
                                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${item.isActive === false ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                                    {item.isActive === false ? "неактивно" : "активно"}
                                  </span>
                                </div>
                                {item.description && (
                                  <div className="mt-1 text-sm text-slate-600">{item.description}</div>
                                )}
                                <div className="mt-1 text-xs text-muted-foreground">Создано: {item.createdAt ? new Date(item.createdAt).toLocaleString("ru-RU") : "—"}</div>
                              </div>
                              <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-none" onClick={() => startEditDictionaryItem(item)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-none text-red-500" onClick={() => requestDeleteDictionaryItem(selectedDictionaryGroup, item)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
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
                      <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
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
                      <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
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
                      <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
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
                          <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
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
                      <p className="text-sm text-muted-foreground">Разделены по каталогам, чтобы Telegram, DaData и Яндекс.Доставка можно было независимо обновлять и настраивать.</p>

                      <Tabs value={selectedIntegrationCatalog} onValueChange={setSelectedIntegrationCatalog} className="w-full">
                        <TabsList className="w-full justify-start gap-2 rounded-none border-b bg-transparent p-0">
                          <TabsTrigger value="telegram" className="rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-black">Telegram</TabsTrigger>
                          <TabsTrigger value="dadata" className="rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-black">DaData</TabsTrigger>
                          <TabsTrigger value="yandex" className="rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-black">Яндекс.Доставка</TabsTrigger>
                        </TabsList>

                        <TabsContent value="telegram" className="mt-3 space-y-3">
                          <div className="space-y-3 border p-3">
                            <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                              <Checkbox
                                id="telegram-login-enabled"
                                checked={isSettingEnabled("telegram_login_enabled")}
                                onCheckedChange={(checked) => updateSetting("telegram_login_enabled", checked ? "true" : "false")}
                              />
                              <Label htmlFor="telegram-login-enabled">Включить авторизацию через Telegram</Label>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="telegram-bot-username">Username бота для Telegram Login</Label>
                              <Input id="telegram-bot-username" value={settings["telegram_bot_username"] || ""} onChange={(e) => updateSetting("telegram_bot_username", e.target.value)} />
                              <p className="text-xs text-muted-foreground">
                                Необязательное поле. Если оставить пустым, для кнопки входа через Telegram будет использован username последнего активного бота из списка ниже.
                              </p>
                            </div>

                            <TooltipProvider delayDuration={150}>
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {telegramBots.map((bot) => (
                                  <div key={bot.id} className="rounded-lg border border-slate-700 bg-slate-900/80 text-slate-100 overflow-hidden">
                                    <div className="h-28 border-b border-slate-700/80 bg-slate-800/80 flex items-center justify-center text-slate-400 text-xs">
                                      {bot.imageUrl ? <img src={bot.imageUrl} alt={bot.name} className="h-full w-full object-cover" /> : "TELEGRAM BOT"}
                                    </div>
                                    <div className="p-3 space-y-2">
                                      <div>
                                        <div className="font-semibold truncate">{bot.name}</div>
                                        <div className="text-xs text-slate-400 truncate">{bot.username ? `@${bot.username}` : "username не задан"}</div>
                                        <div className="text-xs text-slate-500">ID: {bot.botInfo?.id || bot.id}</div>
                                        <div className="text-xs text-slate-400">Токен: {bot.tokenMasked || "********"}</div>
                                        <div className="text-xs text-slate-400">Режим: {bot.updateMode === "webhook" ? "Webhook" : "Polling"}</div>
                                        {bot.useForLogin && (
                                          <div className="mt-1 inline-flex rounded border border-emerald-500 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                                            Используется для авторизации
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className={`text-xs ${bot.enabled ? "text-emerald-400" : "text-amber-300"}`}>{bot.enabled ? "Активен" : "Остановлен"}</span>
                                        <div className="flex gap-2">
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button type="button" size="icon" className="h-8 w-8 border border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700" onClick={() => openEditTelegramBotDialog(bot)}>
                                                <Pencil className="h-3.5 w-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Редактировать бота</TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button type="button" size="icon" className="h-8 w-8 border border-emerald-500 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-800/50" onClick={() => checkTelegramBot(bot)}>
                                                <ShieldCheck className="h-3.5 w-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Проверить и синхронизировать с Telegram</TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button type="button" size="icon" className="h-8 w-8 border border-sky-500 bg-sky-900/30 text-sky-300 hover:bg-sky-800/50" onClick={() => toggleTelegramBot(bot)}>
                                                {bot.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>{bot.enabled ? "Остановить бота" : "Запустить бота"}</TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button type="button" size="icon" className="h-8 w-8 border border-red-500 bg-red-900/30 text-red-300 hover:bg-red-800/50" onClick={() => deleteTelegramBot(bot)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Удалить бота</TooltipContent>
                                          </Tooltip>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={openCreateTelegramBotDialog}
                                      className="rounded-lg border border-slate-700 bg-slate-950/80 min-h-[184px] flex items-center justify-center text-slate-300 hover:text-white hover:border-slate-500 transition"
                                    >
                                      <Plus className="h-10 w-10" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Добавить нового Telegram-бота</TooltipContent>
                                </Tooltip>
                              </div>
                            </TooltipProvider>
                          </div>
                        </TabsContent>

                        <TabsContent value="dadata" className="mt-3">
                          <div className="space-y-1 border p-3">
                            <Label htmlFor="dadata-api-key">DaData API Key</Label>
                            <Input id="dadata-api-key" type="password" value={settings["dadata_api_key"] || ""} onChange={(e) => updateSetting("dadata_api_key", e.target.value)} />
                          </div>
                        </TabsContent>

                        <TabsContent value="yandex" className="mt-3">
                          <div className="space-y-3 border p-3">
                            <h4 className="font-semibold">Яндекс Доставка (расчёт)</h4>
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
                        </TabsContent>
                      </Tabs>
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
                      <div className="space-y-1">
                        <Label htmlFor="site-title">Название вкладки браузера</Label>
                        <Input
                          id="site-title"
                          value={settings.site_title || ""}
                          onChange={(e) => updateSetting("site_title", e.target.value)}
                          placeholder="Например: Fashion Demon"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="site-favicon-url">URL иконки вкладки (favicon)</Label>
                        <Input
                          id="site-favicon-url"
                          value={settings.site_favicon_url || ""}
                          onChange={(e) => updateSetting("site_favicon_url", e.target.value)}
                          placeholder="https://cdn.example.com/favicon.ico"
                        />
                        {!!settings.site_favicon_url && (
                          <div className="flex items-center gap-3 border border-gray-200 p-2 max-w-md">
                            <img
                              src={settings.site_favicon_url}
                              alt="favicon preview"
                              className="w-8 h-8 object-contain bg-gray-50"
                            />
                            <span className="text-xs text-muted-foreground truncate">{settings.site_favicon_url}</span>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={faviconUploadInputRef}
                            type="file"
                            accept=".ico,image/x-icon"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              setSelectedFaviconFileName(file?.name || "");
                              handleFaviconUpload(file);
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-none"
                            onClick={() => faviconUploadInputRef.current?.click()}
                            disabled={faviconUploading}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            {faviconUploading ? "Загрузка..." : (selectedFaviconFileName ? `Файл: ${selectedFaviconFileName}` : "Загрузить файл")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-none"
                            onClick={() => faviconUploadInputRef.current?.click()}
                            disabled={faviconUploading}
                          >
                            <Images className="w-4 h-4 mr-2" /> Заменить favicon.ico
                          </Button>
                          {faviconUploading && (
                            <span className="text-sm text-muted-foreground">Загрузка...</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Для этого поля поддерживается прямая загрузка только файла <b>favicon.ico</b>. Файл используется только как иконка вкладки.
                        </p>
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

          <Dialog
            open={isTelegramBotDialogOpen}
            onOpenChange={(open) => {
              setIsTelegramBotDialogOpen(open);
              if (!open) resetTelegramBotForm();
            }}
          >
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-none border-black">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase tracking-wide">
                  {editingTelegramBotId ? "Редактирование Telegram-бота" : "Добавление Telegram-бота"}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <Label>Название бота *</Label>
                      <span className="text-xs text-muted-foreground">
                        {telegramBotForm.name.trim().length}/{TELEGRAM_BOT_LIMITS.name}
                      </span>
                    </div>
                    <Input
                      value={telegramBotForm.name}
                      onChange={(e) => setTelegramBotForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Например: Fashion Demon Bot"
                      maxLength={TELEGRAM_BOT_LIMITS.name}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <Label>Username</Label>
                      <span className="text-xs text-muted-foreground">
                        {telegramBotForm.username.trim().length}/{TELEGRAM_BOT_LIMITS.username}
                      </span>
                    </div>
                    <Input
                      value={telegramBotForm.username}
                      placeholder="@my_bot"
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>URL картинки</Label>
                  <Input
                    type="url"
                    value={telegramBotForm.imageUrl}
                    onChange={(e) => setTelegramBotForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                    placeholder="https://..."
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Telegram для фото профиля бота ожидает статичную JPG-картинку. Если укажете URL, сервер проверит формат при сохранении.
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => telegramBotImageInputRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" />
                      Загрузить на сайт
                    </Button>
                    <input
                      ref={telegramBotImageInputRef}
                      type="file"
                      accept=".jpg,.jpeg,image/jpeg"
                      className="hidden"
                      onChange={(e) => uploadTelegramBotImage(e.target.files?.[0])}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Токен бота *</Label>
                  <Input
                    type="text"
                    value={getMaskedTokenInputValue()}
                    onChange={(e) => {
                      setTelegramBotForm((prev) => ({ ...prev, token: e.target.value }));
                      setTelegramBotValidationError("");
                    }}
                    onFocus={() => setTelegramBotTokenVisible(true)}
                    onBlur={() => setTelegramBotTokenVisible(false)}
                    placeholder={editingTelegramBotId ? (telegramBotForm.tokenMasked || "Оставьте пустым, чтобы не менять токен") : "12345:AA..."}
                    required={!editingTelegramBotId}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                  />
                  <div className="min-h-5 text-xs text-muted-foreground">
                    {!telegramBotForm.token.trim() && editingTelegramBotId && telegramBotForm.tokenMasked && (
                      <span>
                        Текущий токен: <span className="font-mono">{telegramBotForm.tokenMasked}</span>
                      </span>
                    )}
                    {telegramBotForm.token.trim() && !telegramBotTokenVisible && (
                      <span>Токен замаскирован. Нажмите на поле, чтобы изменить его.</span>
                    )}
                    {telegramBotForm.token.trim() && telegramBotTokenVisible && (
                      <span>Режим редактирования токена.</span>
                    )}
                  </div>
                  {editingTelegramBotId && (
                    <p className="text-xs text-muted-foreground">Если токен не меняли, оставьте поле пустым — сохранится текущий токен.</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void validateTelegramToken();
                    }}
                    disabled={telegramBotChecking}
                  >
                    {telegramBotChecking ? "Проверка..." : "Проверить (getMe)"}
                  </Button>
                  {telegramBotValidationError && (
                    <div className="border border-red-300 bg-red-50 p-2 text-xs text-red-700">
                      {telegramBotValidationError}
                    </div>
                  )}
                </div>

                {telegramBotCheckInfo && (
                  <div className="border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
                    ID: {telegramBotCheckInfo.id || "—"}, username: {telegramBotCheckInfo.username || "—"}, name: {telegramBotCheckInfo.first_name || telegramBotCheckInfo.last_name || "—"}
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Описание</Label>
                    <span className="text-xs text-muted-foreground">
                      {telegramBotForm.description.trim().length}/{TELEGRAM_BOT_LIMITS.description}
                    </span>
                  </div>
                  <Textarea
                    value={telegramBotForm.description}
                    onChange={(e) => setTelegramBotForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Описание бота (setMyDescription)"
                    maxLength={TELEGRAM_BOT_LIMITS.description}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Краткое описание</Label>
                    <span className="text-xs text-muted-foreground">
                      {telegramBotForm.shortDescription.trim().length}/{TELEGRAM_BOT_LIMITS.shortDescription}
                    </span>
                  </div>
                  <Input
                    value={telegramBotForm.shortDescription}
                    onChange={(e) => setTelegramBotForm((prev) => ({ ...prev, shortDescription: e.target.value }))}
                    placeholder="Краткое описание (setMyShortDescription)"
                    maxLength={TELEGRAM_BOT_LIMITS.shortDescription}
                  />
                </div>

                <div className="space-y-3 rounded border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">Команды</div>
                      <p className="text-xs text-muted-foreground">
                        В Telegram можно задать до {TELEGRAM_BOT_LIMITS.maxCommands} команд. Служебная команда <span className="font-mono">/check</span> работает всегда и в меню не добавляется.
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {telegramBotForm.commands.filter((item) => item.command.trim() || item.description.trim()).length}/{TELEGRAM_BOT_LIMITS.maxCommands}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {telegramBotForm.commands.map((command, index) => (
                      <div key={`command-${index}`} className="grid grid-cols-1 gap-3 rounded border p-3 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <Label>Команда</Label>
                            <span className="text-xs text-muted-foreground">
                              {normalizeTelegramCommandForValidation(command.command).length}/{TELEGRAM_BOT_LIMITS.command}
                            </span>
                          </div>
                          <Input
                            value={command.command}
                            onChange={(e) => updateTelegramBotCommand(index, "command", e.target.value.toLowerCase())}
                            placeholder="/start"
                            maxLength={TELEGRAM_BOT_LIMITS.command + 1}
                            className="font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <Label>Описание</Label>
                            <span className="text-xs text-muted-foreground">
                              {command.description.trim().length}/{TELEGRAM_BOT_LIMITS.commandDescription}
                            </span>
                          </div>
                          <Input
                            value={command.description}
                            onChange={(e) => updateTelegramBotCommand(index, "description", e.target.value)}
                            placeholder="Например: Начать работу"
                            maxLength={TELEGRAM_BOT_LIMITS.commandDescription}
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50 md:w-auto"
                            onClick={() => removeTelegramBotCommand(index)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Удалить
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" onClick={addTelegramBotCommand}>
                    <Plus className="mr-2 h-4 w-4" />
                    Добавить команду
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                  <Checkbox
                    id="telegram-bot-enabled"
                    checked={telegramBotForm.enabled}
                    onCheckedChange={(checked) => setTelegramBotForm((prev) => ({ ...prev, enabled: !!checked }))}
                  />
                  <Label htmlFor="telegram-bot-enabled">Запустить бота сразу после сохранения</Label>
                </div>

                <div className="space-y-2 rounded border p-3">
                  <div className="font-medium">Режим получения событий</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="flex items-start gap-2 rounded border p-2">
                      <input
                        type="radio"
                        name="telegram-update-mode"
                        checked={telegramBotForm.updateMode === "polling"}
                        onChange={() => setTelegramBotForm((prev) => ({ ...prev, updateMode: "polling" }))}
                      />
                      <span className="text-sm">
                        <span className="font-medium">Polling</span>
                        <span className="block text-xs text-muted-foreground">Сервер сам постоянно запрашивает обновления у Telegram (getUpdates).</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 rounded border p-2">
                      <input
                        type="radio"
                        name="telegram-update-mode"
                        checked={telegramBotForm.updateMode === "webhook"}
                        onChange={() => setTelegramBotForm((prev) => ({ ...prev, updateMode: "webhook" }))}
                      />
                      <span className="text-sm">
                        <span className="font-medium">Webhook</span>
                        <span className="block text-xs text-muted-foreground">Telegram отправляет события на наш endpoint. Требуется публичный HTTPS адрес.</span>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                  <Checkbox
                    id="telegram-bot-use-for-login"
                    checked={telegramBotForm.useForLogin}
                    onCheckedChange={(checked) => setTelegramBotForm((prev) => ({ ...prev, useForLogin: !!checked }))}
                  />
                  <Label htmlFor="telegram-bot-use-for-login">Использовать этого бота для авторизации через Telegram</Label>
                </div>

                <div className="space-y-3 rounded border p-3">
                  <div>
                    <div className="font-medium">Автоответы и шаблоны</div>
                    <p className="text-xs text-muted-foreground">
                      Поддерживаются переменные: <span className="font-mono">{`{bot_name}`}</span>, <span className="font-mono">{`{command}`}</span>, <span className="font-mono">{`{username}`}</span>, <span className="font-mono">{`{first_name}`}</span>, <span className="font-mono">{`{order_number}`}</span>, <span className="font-mono">{`{status}`}</span>, <span className="font-mono">{`{discount_name}`}</span>.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                    <Checkbox
                      id="telegram-bot-auto-replies"
                      checked={telegramBotForm.autoRepliesEnabled}
                      onCheckedChange={(checked) => setTelegramBotForm((prev) => ({ ...prev, autoRepliesEnabled: !!checked }))}
                    />
                    <Label htmlFor="telegram-bot-auto-replies">Включить автоответы бота</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Если выключить автоответы, бот продолжит отвечать только на служебную проверку <span className="font-mono">/check</span>.
                  </p>
                  <div className="space-y-3">
                    {telegramBotForm.replyTemplates.map((template) => (
                      <div key={template.key} className="space-y-2 rounded border p-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1">
                            <div className="font-medium">{template.label}</div>
                            {template.description && (
                              <p className="text-xs text-muted-foreground">{template.description}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                            <Checkbox
                              id={`telegram-template-${template.key}`}
                              checked={template.enabled}
                              onCheckedChange={(checked) => updateTelegramBotReplyTemplate(template.key, "enabled", !!checked)}
                            />
                            <Label htmlFor={`telegram-template-${template.key}`}>Включен</Label>
                          </div>
                        </div>
                        <Textarea
                          value={template.text}
                          onChange={(e) => updateTelegramBotReplyTemplate(template.key, "text", e.target.value)}
                          maxLength={TELEGRAM_BOT_LIMITS.replyText}
                          disabled={!telegramBotForm.autoRepliesEnabled}
                          className="min-h-[100px]"
                        />
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span>Ключ шаблона: <span className="font-mono">{template.key}</span></span>
                          <span>{template.text.trim().length}/{TELEGRAM_BOT_LIMITS.replyText}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {telegramBotFormErrors.length > 0 && (
                  <div className="space-y-1 border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {telegramBotFormErrors.slice(0, 6).map((error) => (
                      <div key={error}>• {error}</div>
                    ))}
                    {telegramBotFormErrors.length > 6 && (
                      <div>• И еще {telegramBotFormErrors.length - 6} ошибок.</div>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsTelegramBotDialogOpen(false)} disabled={telegramBotSaving || telegramBotChecking}>Отмена</Button>
                <Button type="button" onClick={saveTelegramBot} disabled={telegramBotSaving || telegramBotChecking || telegramBotFormErrors.length > 0}>
                  {telegramBotSaving ? "Сохранение..." : "Сохранить"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {isOpen && (
          <section className="mt-8 border border-black p-6">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-black uppercase tracking-tighter">
                {editingId ? 'Редактировать товар' : 'Добавить новый товар'}
              </h2>
              <Button type="button" variant="outline" onClick={closeProductForm} className="rounded-none">
                НАЗАД К СПИСКУ
              </Button>
            </div>
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
                    <Label htmlFor="prod-discount">Скидка (%)</Label>
                    <Input id="prod-discount" type="number" min="0" max="100" value={formData.discountPercent} onChange={(e) => setFormData({...formData, discountPercent: e.target.value})} className="rounded-none border-black"/>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-discounted">Цена со скидкой</Label>
                    <Input id="prod-discounted" type="number" value={formData.discountedPrice} onChange={(e) => setFormData({...formData, discountedPrice: e.target.value})} className="rounded-none border-black"/>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-cat">Категория</Label>
                    <div className="flex gap-2">
                      <select id="prod-cat" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="h-10 flex-1 border border-black px-3">
                        <option value="">Выберите категорию</option>
                        {(dictionaries.categories || []).map((item: any) => <option key={item.id} value={item.name}>{item.name}</option>)}
                      </select>
                      <Button type="button" variant="outline" className="rounded-none" onClick={() => createDictionaryItem("categories")}>+</Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Медиа (по порядку)</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Можно добавить любое количество фото/видео. Поддерживается выбор из галереи.</p>
                    <Button type="button" size="sm" variant="outline" className="rounded-none" onClick={addMediaSlot}>
                      <PlusCircle className="w-4 h-4 mr-1" /> Добавить блок
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {formData.media.map((item, mediaIndex) => {
                      const slot = mediaIndex + 1;
                      return (
                        <div key={`media-slot-${slot}`} className="grid grid-cols-[40px_120px_1fr_120px_120px_40px] items-center gap-3">
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
                          <label className="inline-flex items-center justify-center h-10 border border-black font-bold cursor-pointer">
                            В галерею
                            <input
                              type="file"
                              accept="image/*,video/*"
                              className="hidden"
                              onChange={(e) => uploadMediaToGalleryAndAssign(e.target.files?.[0] || null, slot)}
                              disabled={uploading}
                            />
                          </label>
                          <Button type="button" size="icon" variant="outline" className="rounded-none h-10 w-10" onClick={() => removeMediaSlot(slot)}>
                            <MinusCircle className="w-4 h-4" />
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="rounded-none col-span-6 justify-start" onClick={() => openMediaGalleryPicker(slot)}>
                            <Images className="w-4 h-4 mr-2" /> Выбрать из галереи
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Размеры</Label>
                  <div className="flex flex-wrap gap-4">
                    {(dictionaries.sizes || []).map((sizeItem: any) => (
                      <div key={sizeItem.name} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`size-${sizeItem.name}`} 
                          checked={formData.sizes.includes(sizeItem.name)}
                          onCheckedChange={() => toggleSize(sizeItem.name)}
                        />
                        <Label htmlFor={`size-${sizeItem.name}`} className="cursor-pointer">{sizeItem.name}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Остатки по размерам</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {(dictionaries.sizes || []).map((sizeItem: any) => {
                      const size = sizeItem.name;
                      return (
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
                      );
                    })}
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
                    <div className="flex gap-2">
                      <select id="prod-material" value={formData.material} onChange={(e) => setFormData({...formData, material: e.target.value})} className="h-10 flex-1 border border-black px-3">
                        <option value="">Выберите материал</option>
                        {(dictionaries.materials || []).map((item: any) => <option key={item.id} value={item.name}>{item.name}</option>)}
                      </select>
                      <Button type="button" variant="outline" className="rounded-none" onClick={() => createDictionaryItem("materials")}>+</Button>
                    </div>
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
                    <select id="prod-gender" value={formData.gender} onChange={(e) => setFormData({...formData, gender: e.target.value})} className="h-10 w-full border border-black px-3">
                      <option value="">Выберите пол</option>
                      <option value="male">мужской</option>
                      <option value="female">женский</option>
                      <option value="unisex">unisex</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-color">Цвет</Label>
                    <div className="flex gap-2">
                      <select id="prod-color" value={formData.color} onChange={(e) => setFormData({...formData, color: e.target.value})} className="h-10 flex-1 border border-black px-3">
                        <option value="">Выберите цвет</option>
                        {(dictionaries.colors || []).map((item: any) => <option key={item.id} value={item.name}>{item.name}</option>)}
                      </select>
                      <Button type="button" variant="outline" className="rounded-none" onClick={() => createDictionaryItem("colors")}>+</Button>
                    </div>
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

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeProductForm} className="rounded-none">
                    ОТМЕНА
                  </Button>
                  <Button type="submit" className="bg-black text-white hover:bg-gray-800 rounded-none font-bold uppercase tracking-widest">
                    {editingId ? 'ОБНОВИТЬ ТОВАР' : 'СОЗДАТЬ ТОВАР'}
                  </Button>
                </div>
              </form>
          </section>
          )}



          <Dialog open={dictionaryDeleteDialog.open} onOpenChange={(open) => { if (!dictionaryDeleteDialog.submitting) setDictionaryDeleteDialog((prev) => ({ ...prev, open, error: open ? prev.error : "" })); }}>
            <DialogContent className="max-w-md rounded-none border-black">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase">Подтверждение удаления</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>
                  Удалить элемент «{dictionaryDeleteDialog.item?.name}» из справочника «{dictionaryGroups.find((group) => group.key === dictionaryDeleteDialog.kind)?.label}»?
                </p>
                <p className="text-muted-foreground">Удаление возможно только если элемент не используется в товарах.</p>
                {dictionaryDeleteDialog.error && (
                  <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                    {dictionaryDeleteDialog.error}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-none" onClick={closeDeleteDictionaryDialog} disabled={dictionaryDeleteDialog.submitting}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  className="rounded-none bg-red-600 text-white hover:bg-red-700"
                  onClick={confirmDeleteDictionaryItem}
                  disabled={dictionaryDeleteDialog.submitting}
                >
                  {dictionaryDeleteDialog.submitting ? "Удаление..." : "Удалить"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={actionNotice.open} onOpenChange={(open) => setActionNotice((prev) => ({ ...prev, open }))}>
            <DialogContent className="max-w-md rounded-none border-black">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase">{actionNotice.title || "Уведомление"}</DialogTitle>
              </DialogHeader>
              <div className={`rounded border px-3 py-2 text-sm ${actionNotice.isError ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                {actionNotice.message}
              </div>
              <DialogFooter>
                <Button type="button" className="rounded-none bg-black text-white hover:bg-gray-800" onClick={() => setActionNotice((prev) => ({ ...prev, open: false }))}>
                  Понятно
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={isMediaGalleryPickerOpen} onOpenChange={setIsMediaGalleryPickerOpen}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto rounded-none border-black">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase">Выбрать изображение из галереи</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Поиск по имени/описанию"
                    value={mediaGallerySearch}
                    onChange={(e) => setMediaGallerySearch(e.target.value)}
                    className="rounded-none"
                  />
                  <input
                    ref={mediaGalleryUploadInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => uploadFromPickerToGallery(e.target.files?.[0] || null)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => mediaGalleryUploadInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Загрузить в галерею
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {filteredGalleryPickerImages.map((image) => (
                    <button
                      type="button"
                      key={`picker-${image.id}`}
                      className="border border-gray-200 text-left hover:border-black transition-colors"
                      onClick={() => selectMediaFromGallery(image.url)}
                    >
                      <img src={image.url} alt={image.name} className="w-full h-36 object-cover bg-gray-100" />
                      <div className="p-2">
                        <div className="text-sm font-semibold truncate">{image.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{image.description || 'Без описания'}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </main>
        {!embedded && <Footer />}
      </div>
  );
}
