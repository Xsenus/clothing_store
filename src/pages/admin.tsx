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
    label: "РџСЂРёРІРµС‚СЃС‚РІРёРµ",
    description: "РћС‚РїСЂР°РІР»СЏРµС‚СЃСЏ РїСЂРё РїРµСЂРІРѕРј СЃРѕРѕР±С‰РµРЅРёРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ.",
    enabled: true,
    text: "РџСЂРёРІРµС‚! РЇ Р±РѕС‚ {bot_name}. РСЃРїРѕР»СЊР·СѓР№С‚Рµ РєРѕРјР°РЅРґС‹ РёР· РјРµРЅСЋ."
  },
  {
    key: "known_command",
    label: "РћС‚РІРµС‚ РЅР° РёР·РІРµСЃС‚РЅСѓСЋ РєРѕРјР°РЅРґСѓ",
    description: "РЎСЂР°Р±Р°С‚С‹РІР°РµС‚ РґР»СЏ РЅР°СЃС‚СЂРѕРµРЅРЅРѕР№ РєРѕРјР°РЅРґС‹ Р±РµР· РѕС‚РґРµР»СЊРЅРѕР№ Р»РѕРіРёРєРё.",
    enabled: false,
    text: "РљРѕРјР°РЅРґР° {command} РїРѕР»СѓС‡РµРЅР°. РЎРєРѕСЂРѕ Р·РґРµСЃСЊ РїРѕСЏРІРёС‚СЃСЏ РѕС‚РґРµР»СЊРЅРѕРµ РґРµР№СЃС‚РІРёРµ."
  },
  {
    key: "unknown_command",
    label: "РќРµРёР·РІРµСЃС‚РЅР°СЏ РєРѕРјР°РЅРґР°",
    description: "РЎСЂР°Р±Р°С‚С‹РІР°РµС‚, РµСЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РІС‹Р·РІР°Р» РЅРµСЃСѓС‰РµСЃС‚РІСѓСЋС‰СѓСЋ РєРѕРјР°РЅРґСѓ.",
    enabled: true,
    text: "РљРѕРјР°РЅРґР° РЅРµ СЂР°СЃРїРѕР·РЅР°РЅР°. РСЃРїРѕР»СЊР·СѓР№С‚Рµ РјРµРЅСЋ Telegram РёР»Рё /check."
  },
  {
    key: "auth_only",
    label: "Р‘РѕС‚ С‚РѕР»СЊРєРѕ РґР»СЏ Р°РІС‚РѕСЂРёР·Р°С†РёРё",
    description: "РћС‚РІРµС‚ РЅР° РѕР±С‹С‡РЅРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ, РµСЃР»Рё Р±РѕС‚ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РґР»СЏ Telegram Login.",
    enabled: true,
    text: "Р­С‚РѕС‚ Р±РѕС‚ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РґР»СЏ Р°РІС‚РѕСЂРёР·Р°С†РёРё С‡РµСЂРµР· Telegram. Р”Р»СЏ РІС…РѕРґР° РѕС‚РєСЂРѕР№С‚Рµ СЃР°Р№С‚ Рё РЅР°Р¶РјРёС‚Рµ РєРЅРѕРїРєСѓ \"Р’РѕР№С‚Рё С‡РµСЂРµР· Telegram\"."
  },
  {
    key: "text_fallback",
    label: "РћС‚РІРµС‚ РЅР° РѕР±С‹С‡РЅС‹Р№ С‚РµРєСЃС‚",
    description: "РћС‚РІРµС‚ РЅР° РїСЂРѕРёР·РІРѕР»СЊРЅРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ Р±РµР· РєРѕРјР°РЅРґС‹ Сѓ РѕР±С‹С‡РЅРѕРіРѕ Р±РѕС‚Р°.",
    enabled: false,
    text: "РЎРµР№С‡Р°СЃ СЏ РїРѕРЅРёРјР°СЋ С‚РѕР»СЊРєРѕ СЃРёСЃС‚РµРјРЅС‹Рµ Рё РЅР°СЃС‚СЂРѕРµРЅРЅС‹Рµ РєРѕРјР°РЅРґС‹."
  },
  {
    key: "order_created",
    label: "РЁР°Р±Р»РѕРЅ: РЅРѕРІС‹Р№ Р·Р°РєР°Р·",
    description: "Р—Р°РіРѕС‚РѕРІРєР° РґР»СЏ Р±СѓРґСѓС‰РёС… СѓРІРµРґРѕРјР»РµРЅРёР№ Рѕ СЃРѕР·РґР°РЅРёРё Р·Р°РєР°Р·Р°.",
    enabled: false,
    text: "Р—Р°РєР°Р· {order_number} СЃРѕР·РґР°РЅ. РњС‹ СЃРѕРѕР±С‰РёРј, РєРѕРіРґР° РЅР°С‡РЅРµРј РµРіРѕ СЃРѕР±РёСЂР°С‚СЊ."
  },
  {
    key: "order_status_changed",
    label: "РЁР°Р±Р»РѕРЅ: СЃС‚Р°С‚СѓСЃ Р·Р°РєР°Р·Р°",
    description: "Р—Р°РіРѕС‚РѕРІРєР° РґР»СЏ Р±СѓРґСѓС‰РёС… СѓРІРµРґРѕРјР»РµРЅРёР№ Рѕ СЃРјРµРЅРµ СЃС‚Р°С‚СѓСЃР° Р·Р°РєР°Р·Р°.",
    enabled: false,
    text: "РЎС‚Р°С‚СѓСЃ Р·Р°РєР°Р·Р° {order_number} РёР·РјРµРЅРёР»СЃСЏ: {status}."
  },
  {
    key: "discount_broadcast",
    label: "РЁР°Р±Р»РѕРЅ: СЃРєРёРґРєРё Рё Р°РєС†РёРё",
    description: "Р—Р°РіРѕС‚РѕРІРєР° РґР»СЏ Р±СѓРґСѓС‰РёС… РјР°СЃСЃРѕРІС‹С… СѓРІРµРґРѕРјР»РµРЅРёР№ Рѕ СЃРєРёРґРєР°С….",
    enabled: false,
    text: "Р”Р»СЏ РІР°СЃ РµСЃС‚СЊ РЅРѕРІРѕРµ РїСЂРµРґР»РѕР¶РµРЅРёРµ: {discount_name}."
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
    errors.push("РќР°Р·РІР°РЅРёРµ Р±РѕС‚Р° РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.");
  } else if (trimmedName.length > TELEGRAM_BOT_LIMITS.name) {
    errors.push(`РќР°Р·РІР°РЅРёРµ Р±РѕС‚Р° РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РЅРµ РґР»РёРЅРЅРµРµ ${TELEGRAM_BOT_LIMITS.name} СЃРёРјРІРѕР»РѕРІ.`);
  }

  if (trimmedDescription.length > TELEGRAM_BOT_LIMITS.description) {
    errors.push(`РћРїРёСЃР°РЅРёРµ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РЅРµ РґР»РёРЅРЅРµРµ ${TELEGRAM_BOT_LIMITS.description} СЃРёРјРІРѕР»РѕРІ.`);
  }

  if (trimmedShortDescription.length > TELEGRAM_BOT_LIMITS.shortDescription) {
    errors.push(`РљСЂР°С‚РєРѕРµ РѕРїРёСЃР°РЅРёРµ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РЅРµ РґР»РёРЅРЅРµРµ ${TELEGRAM_BOT_LIMITS.shortDescription} СЃРёРјРІРѕР»РѕРІ.`);
  }

  if (populatedCommands.length > TELEGRAM_BOT_LIMITS.maxCommands) {
    errors.push(`Telegram РїРѕРґРґРµСЂР¶РёРІР°РµС‚ РЅРµ Р±РѕР»РµРµ ${TELEGRAM_BOT_LIMITS.maxCommands} РєРѕРјР°РЅРґ.`);
  }

  populatedCommands.forEach((item, index) => {
    const command = normalizeTelegramCommandForValidation(item.command);
    const description = item.description.trim();
    if (!command) {
      errors.push(`РљРѕРјР°РЅРґР° #${index + 1}: СѓРєР°Р¶РёС‚Рµ РЅР°Р·РІР°РЅРёРµ РєРѕРјР°РЅРґС‹.`);
      return;
    }

    if (!/^[a-z0-9_]{1,32}$/.test(command)) {
      errors.push(`РљРѕРјР°РЅРґР° #${index + 1}: РёСЃРїРѕР»СЊР·СѓР№С‚Рµ С‚РѕР»СЊРєРѕ СЃС‚СЂРѕС‡РЅС‹Рµ Р»Р°С‚РёРЅСЃРєРёРµ Р±СѓРєРІС‹, С†РёС„СЂС‹ Рё _.`);
    }

    if (!description) {
      errors.push(`РљРѕРјР°РЅРґР° #${index + 1}: СѓРєР°Р¶РёС‚Рµ РѕРїРёСЃР°РЅРёРµ.`);
    } else if (description.length > TELEGRAM_BOT_LIMITS.commandDescription) {
      errors.push(`РљРѕРјР°РЅРґР° #${index + 1}: РѕРїРёСЃР°РЅРёРµ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РЅРµ РґР»РёРЅРЅРµРµ ${TELEGRAM_BOT_LIMITS.commandDescription} СЃРёРјРІРѕР»РѕРІ.`);
    }
  });

  form.replyTemplates.forEach((template) => {
    const text = template.text.trim();
    if (template.enabled && !text) {
      errors.push(`РЁР°Р±Р»РѕРЅ В«${template.label}В» РІРєР»СЋС‡РµРЅ, РЅРѕ С‚РµРєСЃС‚ РїСѓСЃС‚РѕР№.`);
    }

    if (text.length > TELEGRAM_BOT_LIMITS.replyText) {
      errors.push(`РЁР°Р±Р»РѕРЅ В«${template.label}В» РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅРµ РґР»РёРЅРЅРµРµ ${TELEGRAM_BOT_LIMITS.replyText} СЃРёРјРІРѕР»РѕРІ.`);
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
  category?: string;
  categories?: string[];
  isNew: boolean;
  isPopular: boolean;
  likesCount: number;
  sku?: string;
  material?: string;
  materials?: string[];
  printType?: string;
  fit?: string;
  gender?: string;
  color?: string;
  colors?: string[];
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

interface ProductDictionarySelectorState {
  open: boolean;
  kind: DictionaryKind;
}

interface StockHistoryEntry {
  id: string;
  productId: string;
  product?: string;
  sizeId: string;
  size?: string;
  oldValue: number;
  newValue: number;
  changedAt: number;
  changedByUserId?: string;
  changedBy?: string;
  reason?: string;
  orderId?: string | null;
}

const normalizeDictionaryValues = (values?: string[] | null, fallback?: string | null) => {
  const result: string[] = [];
  const seen = new Set<string>();

  (values || []).forEach((value) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  });

  const fallbackValue = fallback?.trim();
  if (fallbackValue) {
    const fallbackKey = fallbackValue.toLowerCase();
    if (!seen.has(fallbackKey)) {
      result.unshift(fallbackValue);
    }
  }

  return result;
};


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
  const [stockHistory, setStockHistory] = useState<StockHistoryEntry[]>([]);
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
  const [productDictionarySelector, setProductDictionarySelector] = useState<ProductDictionarySelectorState>({ open: false, kind: "sizes" });
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
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
    categories: [] as string[],
    images: "",
    videos: "",
    media: [] as { type: "image" | "video"; url: string }[],
    sizes: [] as string[],
    isNew: false,
    isPopular: false,
    sku: "",
    materials: [] as string[],
    printType: "",
    fit: "",
    gender: "",
    colors: [] as string[],
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
      const [usersRes, ordersRes, settingsRes, botsRes, galleryRes, dictionariesRes, stockHistoryRes] = await Promise.all([
        FLOW.adminGetUsers(),
        FLOW.adminGetOrders(),
        FLOW.adminGetSettings(),
        FLOW.adminGetTelegramBots(),
        FLOW.getAdminGalleryImages(),
        FLOW.adminGetDictionaries(),
        FLOW.adminGetStockHistory()
      ]);
      setUsers(Array.isArray(usersRes) ? usersRes : []);
      setOrders(Array.isArray(ordersRes) ? ordersRes : []);
      setStockHistory(Array.isArray(stockHistoryRes) ? stockHistoryRes : []);
      setSettings({ ...DEFAULT_APP_SETTINGS, ...(settingsRes || {}) });
      setTelegramBots(Array.isArray(botsRes) ? botsRes : []);
      setGalleryImages(Array.isArray(galleryRes) ? galleryRes : []);
      setDictionaries(dictionariesRes || { sizes: [], materials: [], colors: [], categories: [] });
    } catch (error) {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЂР°Р·РґРµР» РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№/Р·Р°РєР°Р·РѕРІ/РЅР°СЃС‚СЂРѕРµРє");
    }
  };

  const toggleUserBlock = async (user: any) => {
    try {
      await FLOW.adminUpdateUser({ input: { userId: user.id, isBlocked: !user.isBlocked } });
      await fetchAdminData();
    } catch (error) {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РјРµРЅРёС‚СЊ Р±Р»РѕРєРёСЂРѕРІРєСѓ");
    }
  };

  const toggleUserAdmin = async (user: any) => {
    try {
      await FLOW.adminUpdateUser({ input: { userId: user.id, isAdmin: !user.isAdmin } });
      await fetchAdminData();
    } catch (error) {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РјРµРЅРёС‚СЊ РїСЂР°РІР°");
    }
  };

  const deleteUser = async (user: any) => {
    if (!confirm(`РЈРґР°Р»РёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ ${user.email}?`)) return;
    try {
      await FLOW.adminDeleteUser({ input: { userId: user.id } });
      await fetchAdminData();
    } catch (error) {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ");
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
      toast.success("РќР°СЃС‚СЂРѕР№РєРё СЃРѕС…СЂР°РЅРµРЅС‹");
    } catch (error) {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё");
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
    const name = window.prompt("Р’РІРµРґРёС‚Рµ Р·РЅР°С‡РµРЅРёРµ СЃР»РѕРІР°СЂСЏ");
    if (!name) return;
    try {
      await FLOW.adminCreateDictionaryItem({ input: { kind, name, isActive: true } });
      await fetchAdminData();
      toast.success("Р­Р»РµРјРµРЅС‚ СЃР»РѕРІР°СЂСЏ РґРѕР±Р°РІР»РµРЅ");
      if (kind === "sizes") setFormData((prev) => ({ ...prev, sizes: [...new Set([...prev.sizes, name])] }));
      if (kind === "materials") setFormData((prev) => ({ ...prev, materials: normalizeDictionaryValues([...(prev.materials || []), name]) }));
      if (kind === "colors") setFormData((prev) => ({ ...prev, colors: normalizeDictionaryValues([...(prev.colors || []), name]) }));
      if (kind === "categories") setFormData((prev) => ({ ...prev, categories: normalizeDictionaryValues([...(prev.categories || []), name]) }));
    } catch (error) {
      toast.error((error as Error)?.message || "РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ СЌР»РµРјРµРЅС‚ СЃР»РѕРІР°СЂСЏ");
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
        title: "Р“РѕС‚РѕРІРѕ",
        message: `Р­Р»РµРјРµРЅС‚ В«${dictionaryDeleteDialog.item.name}В» СѓСЃРїРµС€РЅРѕ СѓРґР°Р»РµРЅ.`,
        isError: false
      });
    } catch (error) {
      const message = (error as Error)?.message || "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ СЌР»РµРјРµРЅС‚ СЃР»РѕРІР°СЂСЏ";
      setDictionaryDeleteDialog((prev) => ({ ...prev, submitting: false, error: message }));
    }
  };

  const updateDictionaryItem = async (kind: DictionaryKind, item: any) => {
    const draft = dictionaryDrafts[item.id] ?? getDictionaryDraftDefaults(item);
    const nextName = (draft.name ?? item.name ?? "").trim();
    if (!nextName) {
      toast.error("РќР°Р·РІР°РЅРёРµ РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ");
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
      toast.success("Р­Р»РµРјРµРЅС‚ СЃР»РѕРІР°СЂСЏ РѕР±РЅРѕРІР»РµРЅ");
      setEditingDictionaryItemId(null);
    } catch (error) {
      toast.error((error as Error)?.message || "РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ СЌР»РµРјРµРЅС‚ СЃР»РѕРІР°СЂСЏ");
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
        toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ URL Р·Р°РіСЂСѓР¶РµРЅРЅРѕР№ РёРєРѕРЅРєРё");
        return;
      }

      updateSetting("site_favicon_url", uploadedUrl);
      setSelectedFaviconFileName("");
      if (faviconUploadInputRef.current) {
        faviconUploadInputRef.current.value = "";
      }
      toast.success("РРєРѕРЅРєР° РІРєР»Р°РґРєРё Р·Р°РіСЂСѓР¶РµРЅР°");
    } catch (error) {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РёРєРѕРЅРєСѓ");
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
      toast.success("РР·РѕР±СЂР°Р¶РµРЅРёРµ РґРѕР±Р°РІР»РµРЅРѕ РІ РіР°Р»РµСЂРµСЋ");
    } catch {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РІ РіР°Р»РµСЂРµСЋ");
    } finally {
      setGalleryUploading(false);
    }
  };

  const deleteGalleryImage = async (image: GalleryImage) => {
    if (!confirm(`РЈРґР°Р»РёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ В«${image.name}В»?`)) return;
    try {
      await FLOW.deleteAdminGalleryImage({ input: { id: image.id } });
      await fetchAdminData();
      toast.success("РР·РѕР±СЂР°Р¶РµРЅРёРµ СѓРґР°Р»РµРЅРѕ");
    } catch {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ");
    }
  };

  const copyGalleryImageToDisk = async (image: GalleryImage) => {
    try {
      await FLOW.copyAdminGalleryImageToDisk({ input: { id: image.id } });
      await fetchAdminData();
      toast.success("РР·РѕР±СЂР°Р¶РµРЅРёРµ СЃРєРѕРїРёСЂРѕРІР°РЅРѕ РЅР° РґРёСЃРє");
    } catch {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ");
    }
  };

  const restoreMissingGalleryImages = async () => {
    try {
      const result = await FLOW.restoreMissingAdminGalleryImages();
      await fetchAdminData();
      toast.success(`Р’РѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРѕ С„Р°Р№Р»РѕРІ: ${result?.restored ?? 0}`);
    } catch {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ РІРѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ");
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
      toast.success("РР·РѕР±СЂР°Р¶РµРЅРёРµ РѕР±РЅРѕРІР»РµРЅРѕ");
      cancelEditGalleryImage();
    } catch {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ РјРµС‚Р°РґР°РЅРЅС‹Рµ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ");
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
        toast.error(`Telegram РїРѕРґРґРµСЂР¶РёРІР°РµС‚ РЅРµ Р±РѕР»РµРµ ${TELEGRAM_BOT_LIMITS.maxCommands} РєРѕРјР°РЅРґ.`);
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
      const message = "РўРѕРєРµРЅ Р±РѕС‚Р° РѕР±СЏР·Р°С‚РµР»РµРЅ";
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
      toast.success("РўРѕРєРµРЅ РїРѕРґС‚РІРµСЂР¶РґС‘РЅ С‡РµСЂРµР· getMe");
      return info;
    } catch (error) {
      const message = getErrorMessage(error, "РџСЂРѕРІРµСЂРєР° getMe РЅРµ РїСЂРѕС€Р»Р°");
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
      toast.error("Р”Р»СЏ С„РѕС‚Рѕ РїСЂРѕС„РёР»СЏ Telegram РёСЃРїРѕР»СЊР·СѓР№С‚Рµ JPG/JPEG.");
      return;
    }

    if (file.size > TELEGRAM_BOT_LIMITS.imageUploadBytes) {
      toast.error("Р¤Р°Р№Р» СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№ РґР»СЏ Р±РµР·РѕРїР°СЃРЅРѕР№ Р·Р°РіСЂСѓР·РєРё РІ Telegram.");
      return;
    }

    try {
      const formDataUpload = new FormData();
      formDataUpload.append("files", file);
      const res = await FLOW.adminUpload({ input: formDataUpload });
      const first = Array.isArray(res?.urls) ? res.urls[0] : null;
      if (!first) {
        toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ");
        return;
      }

      setTelegramBotForm((prev) => ({ ...prev, imageUrl: first }));
      toast.success("РР·РѕР±СЂР°Р¶РµРЅРёРµ Р·Р°РіСЂСѓР¶РµРЅРѕ");
    } catch (error) {
      toast.error(getErrorMessage(error, "РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РёР·РѕР±СЂР°Р¶РµРЅРёСЏ"));
    }
  };

  const saveTelegramBot = async () => {
    const enteredToken = telegramBotForm.token.trim();
    const formErrors = getTelegramBotFormErrors(telegramBotForm);

    if (!enteredToken && !editingTelegramBotId) {
      toast.error("РўРѕРєРµРЅ Р±РѕС‚Р° РѕР±СЏР·Р°С‚РµР»РµРЅ");
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

      toast.success(editingTelegramBotId ? "Р‘РѕС‚ РѕР±РЅРѕРІР»С‘РЅ Рё Р·Р°РїСѓС‰РµРЅ" : "Р‘РѕС‚ РґРѕР±Р°РІР»РµРЅ Рё Р·Р°РїСѓС‰РµРЅ");
      setIsTelegramBotDialogOpen(false);
      resetTelegramBotForm();
      await fetchAdminData();
      setTelegramBotCheckInfo(savedBot?.botInfo || null);
    } catch (error) {
      toast.error(getErrorMessage(error, "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ Telegram-Р±РѕС‚Р°"));
    } finally {
      setTelegramBotSaving(false);
    }
  };

  const toggleTelegramBot = async (bot: TelegramBot) => {
    try {
      await FLOW.adminUpdateTelegramBot({ input: { id: bot.id, payload: { enabled: !bot.enabled } } });
      await fetchAdminData();
    } catch (error) {
      toast.error(getErrorMessage(error, "РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РјРµРЅРёС‚СЊ СЃРѕСЃС‚РѕСЏРЅРёРµ Р±РѕС‚Р°"));
    }
  };

  const checkTelegramBot = async (bot: TelegramBot) => {
    try {
      await FLOW.adminCheckTelegramBot({ input: { id: bot.id } });
      toast.success("РџСЂРѕРІРµСЂРєР° Р±РѕС‚Р° РІС‹РїРѕР»РЅРµРЅР°");
      await fetchAdminData();
    } catch (error) {
      toast.error(getErrorMessage(error, "РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРІРµСЂРёС‚СЊ Р±РѕС‚Р°"));
    }
  };

  const deleteTelegramBot = async (bot: TelegramBot) => {
    if (!confirm(`РЈРґР°Р»РёС‚СЊ Р±РѕС‚Р° ${bot.name}?`)) return;
    try {
      await FLOW.adminDeleteTelegramBot({ input: { id: bot.id } });
      await fetchAdminData();
    } catch (error) {
      toast.error(getErrorMessage(error, "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ Р±РѕС‚Р°"));
    }
  };

  const telegramBotFormErrors = getTelegramBotFormErrors(telegramBotForm);

  const settingsGroups = [
    { id: "auth", label: "РђРІС‚РѕСЂРёР·Р°С†РёСЏ" },
    { id: "operations", label: "Р РµРіР»Р°РјРµРЅС‚РЅС‹Рµ РѕРїРµСЂР°С†РёРё" },
    { id: "smtp", label: "РџРѕС‡С‚Р° (SMTP)" },
    { id: "metrics", label: "РњРµС‚СЂРёРєРё" },
    { id: "integrations", label: "РРЅС‚РµРіСЂР°С†РёРё" },
    { id: "legal", label: "Р®СЂРёРґРёС‡РµСЃРєРёРµ С‚РµРєСЃС‚С‹" },
    { id: "general", label: "РћР±С‰РёРµ" }
  ] as const;

  const dictionaryGroups = [
    { key: "sizes", label: "Р Р°Р·РјРµСЂС‹" },
    { key: "materials", label: "РњР°С‚РµСЂРёР°Р»С‹" },
    { key: "colors", label: "Р¦РІРµС‚Р°" },
    { key: "categories", label: "РљР°С‚РµРіРѕСЂРёРё" }
  ] as const;

  const activeDictionaryGroup = dictionaryGroups.find((group) => group.key === selectedDictionaryGroup) || dictionaryGroups[0];
  const getStockHistoryReasonLabel = (reason?: string) => {
    if (reason === "purchase") return "РџРѕРєСѓРїРєР°";
    if (reason === "admin_manual") return "РР·РјРµРЅРµРЅРёРµ Р°РґРјРёРЅРѕРј";
    return reason || "РќРµРёР·РІРµСЃС‚РЅРѕ";
  };

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
        categories: normalizeDictionaryValues(product.categories, product.category),
        images: product.images.join(','),
        videos: (product.videos || []).join(','),
        media: mediaList.length > 0 ? mediaList : [{ type: "image", url: "" }],
        sizes: product.sizes,
        isNew: product.isNew,
        isPopular: product.isPopular,
        sku: product.sku || "",
        materials: normalizeDictionaryValues(product.materials, product.material),
        printType: product.printType || "",
        fit: product.fit || "",
        gender: product.gender || "",
        colors: normalizeDictionaryValues(product.colors, product.color),
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
        categories: [],
        images: "",
        videos: "",
        media: [{ type: "image", url: "" }],
        sizes: [],
        isNew: false,
        isPopular: false,
        sku: "",
        materials: [],
        printType: "",
        fit: "",
        gender: "",
        colors: [],
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
        toast.error('РўРѕРІР°СЂ РЅРµ РЅР°Р№РґРµРЅ');
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
        category: formData.categories[0] || "",
        categories: formData.categories,
        images: imagesFromMedia,
        videos: videosFromMedia,
        media: mediaList,
        sizes: formData.sizes,
        isNew: formData.isNew,
        isPopular: formData.isPopular,
        sku: formData.sku,
        material: formData.materials[0] || "",
        materials: formData.materials,
        printType: formData.printType,
        fit: formData.fit,
        gender: formData.gender,
        color: formData.colors[0] || "",
        colors: formData.colors,
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
        toast.success("РўРѕРІР°СЂ РѕР±РЅРѕРІР»РµРЅ");
      } else {
        await FLOW.createProduct({
          input: payload
        });
        toast.success("РўРѕРІР°СЂ СЃРѕР·РґР°РЅ");
      }
      
      if (isStandaloneAdmin) {
        navigate('/admin');
      } else {
        setIsOpen(false);
      }
      fetchProducts();
    } catch (error) {
      toast.error("РћРїРµСЂР°С†РёСЏ РЅРµ СѓРґР°Р»Р°СЃСЊ. РџСЂРѕРІРµСЂСЊС‚Рµ С„РѕСЂРјР°С‚ РґР°РЅРЅС‹С….");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Р’С‹ СѓРІРµСЂРµРЅС‹, С‡С‚Рѕ С…РѕС‚РёС‚Рµ СѓРґР°Р»РёС‚СЊ СЌС‚РѕС‚ С‚РѕРІР°СЂ?")) return;
    try {
      await FLOW.deleteProduct({ input: { id } });
      toast.success("РўРѕРІР°СЂ СѓРґР°Р»РµРЅ");
      fetchProducts();
    } catch (error) {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ");
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

  const openProductDictionarySelector = (kind: DictionaryKind) => {
    setProductDictionarySelector({ open: true, kind });
  };

  const closeProductDictionarySelector = () => {
    setProductDictionarySelector((prev) => ({ ...prev, open: false }));
  };

  const addDictionaryValueToProduct = (kind: DictionaryKind, name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return;

    setFormData((prev) => {
      if (kind === "sizes") {
        if (prev.sizes.includes(normalizedName)) return prev;
        return {
          ...prev,
          sizes: [...prev.sizes, normalizedName],
          sizeStock: { ...prev.sizeStock, [normalizedName]: prev.sizeStock[normalizedName] ?? 0 }
        };
      }

      if (kind === "categories") {
        return { ...prev, categories: normalizeDictionaryValues([...(prev.categories || []), normalizedName]) };
      }

      if (kind === "materials") {
        return { ...prev, materials: normalizeDictionaryValues([...(prev.materials || []), normalizedName]) };
      }

      if (kind === "colors") {
        return { ...prev, colors: normalizeDictionaryValues([...(prev.colors || []), normalizedName]) };
      }

      return prev;
    });
  };

  const removeDictionaryValueFromProduct = (kind: DictionaryKind, name?: string) => {
    setFormData((prev) => {
      if (kind === "sizes" && name) {
        const nextStock = { ...prev.sizeStock };
        delete nextStock[name];
        return {
          ...prev,
          sizes: prev.sizes.filter((item) => item !== name),
          sizeStock: nextStock
        };
      }

      if (kind === "categories" && name) return { ...prev, categories: prev.categories.filter((item) => item !== name) };
      if (kind === "materials" && name) return { ...prev, materials: prev.materials.filter((item) => item !== name) };
      if (kind === "colors" && name) return { ...prev, colors: prev.colors.filter((item) => item !== name) };
      return prev;
    });
  };

  const getProductDictionarySelected = (kind: DictionaryKind, name: string) => {
    if (kind === "sizes") return formData.sizes.includes(name);
    if (kind === "categories") return formData.categories.includes(name);
    if (kind === "materials") return formData.materials.includes(name);
    if (kind === "colors") return formData.colors.includes(name);
    return false;
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
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ С„Р°Р№Р»С‹");
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
        toast.success("Р¤Р°Р№Р» Р·Р°РіСЂСѓР¶РµРЅ РІ РіР°Р»РµСЂРµСЋ Рё РІС‹Р±СЂР°РЅ");
      }
    } catch {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ С„Р°Р№Р» РІ РіР°Р»РµСЂРµСЋ");
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
      toast.success(`РџСЂРµРґРЅР°РїРѕР»РЅРµРЅРёРµ РІС‹РїРѕР»РЅРµРЅРѕ: С‚РѕРІР°СЂРѕРІ ${result?.products ?? 0}, РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ ${result?.users ?? 0}, Р·Р°РєР°Р·РѕРІ ${result?.orders ?? 0}`);
      await Promise.all([fetchProducts(), fetchAdminData()]);
    } catch (error) {
      let errorMessage = "РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹РїРѕР»РЅРёС‚СЊ РїСЂРµРґРЅР°РїРѕР»РЅРµРЅРёРµ Р±Р°Р·С‹ РґР°РЅРЅС‹С…";
      if (error instanceof Error && error.message) {
        try {
          const parsedError = JSON.parse(error.message);
          if (parsedError?.detail) {
            errorMessage = `РџСЂРµРґРЅР°РїРѕР»РЅРµРЅРёРµ РЅРµ РІС‹РїРѕР»РЅРµРЅРѕ: ${parsedError.detail}`;
          }
        } catch {
          errorMessage = `РџСЂРµРґРЅР°РїРѕР»РЅРµРЅРёРµ РЅРµ РІС‹РїРѕР»РЅРµРЅРѕ: ${error.message}`;
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
      toast.success("РћС‚Р·С‹РІ СѓРґР°Р»РµРЅ");
    } catch (error) {
      toast.error("РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РѕС‚Р·С‹РІ");
    }
  };

  if (loading) return <LoadingSpinner className={embedded ? "h-56" : "h-screen"} />;
  if (!isAdmin) return null;

  return (
      <div className={embedded ? "" : "min-h-screen flex flex-col bg-background text-foreground"}>
        {!embedded && <Header />}
        
        <main className={embedded ? "" : "flex-1 container mx-auto px-4 py-12"}>
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-black uppercase tracking-tighter">РџРђРќР•Р›Р¬ РђР”РњРРќРРЎРўР РђРўРћР Рђ</h1>
            <div className="flex items-center gap-3">
              {!embedded && <Button variant="outline" className="rounded-none font-bold uppercase tracking-widest" onClick={async () => {
                await FLOW.adminLogout();
                navigate("/profile");
              }}>
                Р’Р«Р™РўР
              </Button>}
              <Button onClick={() => handleOpen()} className="bg-black text-white hover:bg-gray-800 rounded-none font-bold uppercase tracking-widest">
                <Plus className="w-4 h-4 mr-2" /> Р”РћР‘РђР’РРўР¬ РўРћР’РђР 
              </Button>
            </div>
          </div>

          <Tabs defaultValue="products" className="w-full">
            <TabsList className="bg-transparent border-b border-gray-200 w-full justify-start rounded-none h-auto p-0 mb-8 gap-8">
              <TabsTrigger value="products" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest">РўРћР’РђР Р«</TabsTrigger>
              <TabsTrigger value="orders" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest">Р—РђРљРђР—Р«</TabsTrigger>
              <TabsTrigger value="users" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest">РџРћР›Р¬Р—РћР’РђРўР•Р›Р</TabsTrigger>
              <TabsTrigger value="gallery" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest">Р“РђР›Р•Р Р•РЇ</TabsTrigger>
              <TabsTrigger value="dictionaries" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest">РЎР›РћР’РђР Р</TabsTrigger>
              <TabsTrigger value="settings" className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 font-bold uppercase tracking-widest">РќРђРЎРўР РћР™РљР</TabsTrigger>
            </TabsList>

          <TabsContent value="products" className="mt-0">
          {!isOpen && (
            <div className="border border-gray-200 rounded-none overflow-hidden">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="w-[100px]">РР·РѕР±СЂР°Р¶РµРЅРёРµ</TableHead>
                    <TableHead>РќР°Р·РІР°РЅРёРµ</TableHead>
                    <TableHead>Р¦РµРЅР°</TableHead>
                    <TableHead>РљР°С‚РµРіРѕСЂРёСЏ</TableHead>
                    <TableHead>РњРµС‚РєРё</TableHead>
                    <TableHead className="text-right">Р”РµР№СЃС‚РІРёСЏ</TableHead>
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
                      <TableCell>{Math.round(product.discountPercent ? (product.discountedPrice || product.price) : (product.basePrice || product.price))}в‚Ѕ</TableCell>
                      <TableCell className="uppercase text-xs tracking-wide">{normalizeDictionaryValues(product.categories, product.category).join(", ") || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {product.isNew && <span className="px-2 py-0.5 bg-black text-white text-[10px] uppercase font-bold">РќРѕРІРёРЅРєР°</span>}
                          {product.isPopular && <span className="px-2 py-0.5 bg-gray-200 text-black text-[10px] uppercase font-bold">РҐРёС‚</span>}
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
                <h2 className="text-2xl font-black uppercase">Р“Р°Р»РµСЂРµСЏ РёР·РѕР±СЂР°Р¶РµРЅРёР№</h2>
                <div className="grid md:grid-cols-4 gap-3">
                  <Input
                    placeholder="РќР°РёРјРµРЅРѕРІР°РЅРёРµ"
                    value={galleryName}
                    onChange={(e) => setGalleryName(e.target.value)}
                    className="rounded-none"
                  />
                  <Input
                    placeholder="РћРїРёСЃР°РЅРёРµ"
                    value={galleryDescription}
                    onChange={(e) => setGalleryDescription(e.target.value)}
                    className="rounded-none"
                  />
                  <Input
                    placeholder="РџРѕРёСЃРє РїРѕ РёРјРµРЅРё/РѕРїРёСЃР°РЅРёСЋ"
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
                      {galleryUploading ? "Р—Р°РіСЂСѓР·РєР°..." : (selectedGalleryFileName ? `Р¤Р°Р№Р»: ${selectedGalleryFileName}` : "Р—Р°РіСЂСѓР·РёС‚СЊ С„Р°Р№Р»")}
                    </Button>
                    <Button type="button" variant="outline" className="rounded-none" onClick={restoreMissingGalleryImages}>
                      <RefreshCcw className="w-4 h-4 mr-1" />
                      Р’РѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ
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
                    РџР»РёС‚РєР°
                  </Button>
                  <Button
                    type="button"
                    variant={galleryViewMode === "table" ? "default" : "outline"}
                    className="rounded-none"
                    onClick={() => setGalleryViewMode("table")}
                  >
                    РўР°Р±Р»РёС†Р°
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
                        <div className="text-sm text-muted-foreground">{image.description || "Р‘РµР· РѕРїРёСЃР°РЅРёСЏ"}</div>
                      </>
                    )}
                    <div className="text-xs text-muted-foreground">{formatBytes(image.fileSize)} В· {image.existsOnDisk ? "РќР° РґРёСЃРєРµ" : "РўРѕР»СЊРєРѕ РІ Р‘Р”"}</div>
                    <div className="flex gap-2">
                      {editingGalleryImageId === image.id ? (
                        <>
                          <Button size="icon" variant="default" className="rounded-none" onClick={saveGalleryImageMeta} aria-label="РЎРѕС…СЂР°РЅРёС‚СЊ">
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="outline" className="rounded-none" onClick={cancelEditGalleryImage} aria-label="РћС‚РјРµРЅР°">
                            <Ban className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <Button size="icon" variant="outline" className="rounded-none" onClick={() => startEditGalleryImage(image)} aria-label="РР·РјРµРЅРёС‚СЊ">
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="outline" className="rounded-none" onClick={() => copyGalleryImageToDisk(image)} aria-label="РљРѕРїРёСЂРѕРІР°С‚СЊ РЅР° РґРёСЃРє">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="destructive" className="rounded-none" onClick={() => deleteGalleryImage(image)} aria-label="РЈРґР°Р»РёС‚СЊ">
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
                        <TableHead>РџСЂРµРІСЊСЋ</TableHead>
                        <TableHead>Р¤Р°Р№Р»</TableHead>
                        <TableHead>РћРїРёСЃР°РЅРёРµ</TableHead>
                        <TableHead>Р Р°Р·РјРµСЂ</TableHead>
                        <TableHead>РЎС‚Р°С‚СѓСЃ</TableHead>
                        <TableHead className="text-right">Р”РµР№СЃС‚РІРёСЏ</TableHead>
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
                            ) : (image.description || "вЂ”")}
                          </TableCell>
                          <TableCell>{formatBytes(image.fileSize)}</TableCell>
                          <TableCell>{image.existsOnDisk ? "РќР° РґРёСЃРєРµ" : "РўРѕР»СЊРєРѕ РІ Р‘Р”"}</TableCell>
                          <TableCell className="text-right space-x-2">
                            {editingGalleryImageId === image.id ? (
                              <>
                                <Button size="icon" variant="default" className="rounded-none" onClick={saveGalleryImageMeta} aria-label="РЎРѕС…СЂР°РЅРёС‚СЊ">
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="outline" className="rounded-none" onClick={cancelEditGalleryImage} aria-label="РћС‚РјРµРЅР°">
                                  <Ban className="w-4 h-4" />
                                </Button>
                              </>
                            ) : (
                              <Button size="icon" variant="outline" className="rounded-none" onClick={() => startEditGalleryImage(image)} aria-label="РР·РјРµРЅРёС‚СЊ">
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            <Button size="icon" variant="outline" className="rounded-none" onClick={() => copyGalleryImageToDisk(image)} aria-label="РљРѕРїРёСЂРѕРІР°С‚СЊ РЅР° РґРёСЃРє">
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="destructive" className="rounded-none" onClick={() => deleteGalleryImage(image)} aria-label="РЈРґР°Р»РёС‚СЊ">
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
              <h2 className="text-2xl font-black uppercase mb-4">РџРѕР»СЊР·РѕРІР°С‚РµР»Рё Рё РїСЂР°РІР°</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Р РѕР»СЊ</TableHead>
                    <TableHead>РЎС‚Р°С‚СѓСЃ</TableHead>
                    <TableHead className="text-right">Р”РµР№СЃС‚РІРёСЏ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.isAdmin ? "РђРґРјРёРЅ" : "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ"}{user.isSystem ? " (system)" : ""}</TableCell>
                      <TableCell>{user.isBlocked ? "Р—Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ" : "РђРєС‚РёРІРµРЅ"}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => toggleUserBlock(user)}>
                          {user.isBlocked ? "Р Р°Р·Р±Р»РѕРєРёСЂРѕРІР°С‚СЊ" : "Р‘Р»РѕРєРёСЂРѕРІР°С‚СЊ"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleUserAdmin(user)} disabled={user.isSystem}>
                          {user.isAdmin ? "РЎРЅСЏС‚СЊ Р°РґРјРёРЅР°" : "РЎРґРµР»Р°С‚СЊ Р°РґРјРёРЅРѕРј"}
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteUser(user)} disabled={user.isSystem}>
                          РЈРґР°Р»РёС‚СЊ
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
              <h2 className="text-2xl font-black uppercase mb-4">РСЃС‚РѕСЂРёСЏ Р·Р°РєР°Р·РѕРІ</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ</TableHead>
                    <TableHead>РЎС‚Р°С‚СѓСЃ</TableHead>
                    <TableHead>РЎСѓРјРјР°</TableHead>
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
            <div className="mt-6 border border-gray-200 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black uppercase">РСЃС‚РѕСЂРёСЏ РѕСЃС‚Р°С‚РєРѕРІ</h2>
                  <p className="text-sm text-muted-foreground">РљС‚Рѕ, РєРѕРіРґР° Рё РїРѕС‡РµРјСѓ РёР·РјРµРЅРёР» РѕСЃС‚Р°С‚РѕРє РїРѕ СЂР°Р·РјРµСЂСѓ.</p>
                </div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Р—Р°РїРёСЃРµР№: {stockHistory.length}</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Р”Р°С‚Р°</TableHead>
                    <TableHead>РўРѕРІР°СЂ</TableHead>
                    <TableHead>Р Р°Р·РјРµСЂ</TableHead>
                    <TableHead>Р‘С‹Р»Рѕ</TableHead>
                    <TableHead>РЎС‚Р°Р»Рѕ</TableHead>
                    <TableHead>РџСЂРёС‡РёРЅР°</TableHead>
                    <TableHead>РљС‚Рѕ</TableHead>
                    <TableHead>Р—Р°РєР°Р·</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">РСЃС‚РѕСЂРёСЏ РѕСЃС‚Р°С‚РєРѕРІ РїРѕРєР° РїСѓСЃС‚Р°</TableCell>
                    </TableRow>
                  ) : (
                    stockHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{entry.changedAt ? new Date(entry.changedAt).toLocaleString("ru-RU") : "вЂ”"}</TableCell>
                        <TableCell>{entry.product || entry.productId}</TableCell>
                        <TableCell>{entry.size || entry.sizeId}</TableCell>
                        <TableCell>{entry.oldValue}</TableCell>
                        <TableCell>{entry.newValue}</TableCell>
                        <TableCell>{getStockHistoryReasonLabel(entry.reason)}</TableCell>
                        <TableCell>{entry.changedBy || entry.changedByUserId || "вЂ”"}</TableCell>
                        <TableCell className="max-w-[180px] truncate">{entry.orderId || "вЂ”"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>


          <TabsContent value="dictionaries" className="mt-0">
            <div className="space-y-4">
              <h2 className="text-5xl font-black tracking-tight">РЎРїСЂР°РІРѕС‡РЅРёРєРё</h2>
              <p className="text-lg text-muted-foreground">РЈРїСЂР°РІР»СЏР№С‚Рµ СЃРїСЂР°РІРѕС‡РЅРёРєР°РјРё СЃРёСЃС‚РµРјС‹</p>

              <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                <div className="rounded-xl border border-gray-200 bg-[#f8fafc] p-3">
                  <div className="mb-2 text-xs font-semibold uppercase text-slate-500">РќР°РёРјРµРЅРѕРІР°РЅРёСЏ</div>
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
                          <div className={`text-xs ${isSelected ? "text-slate-300" : "text-slate-500"}`}>{count} Р·Р°РїРёСЃРµР№</div>
                          <div className={`text-xs ${isSelected ? "text-slate-300" : "text-slate-500"}`}>РђРєС‚РёРІРЅРѕ: {activeCount} В· РћС‚РєР»СЋС‡РµРЅРѕ: {inactiveCount}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-[#f8fafc] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-3xl font-black tracking-tight">{activeDictionaryGroup.label}</h3>
                      <p className="text-sm text-muted-foreground">Р’СЃРµРіРѕ: {(dictionaries[selectedDictionaryGroup] || []).length}</p>
                    </div>
                    <Button type="button" className="rounded-none bg-slate-900 text-white hover:bg-slate-800" onClick={() => createDictionaryItem(selectedDictionaryGroup)}>
                      <Plus className="mr-2 h-4 w-4" /> Р”РѕР±Р°РІРёС‚СЊ
                    </Button>
                  </div>

                  {DICTIONARY_FILTER_SETTING_KEYS[selectedDictionaryGroup] && (
                    <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                      <div>
                        <p className="text-sm font-semibold">РџРѕРєР°Р·С‹РІР°С‚СЊ С„РёР»СЊС‚СЂ РІ РєР°С‚Р°Р»РѕРіРµ</p>
                        <p className="text-xs text-muted-foreground">РЈРїСЂР°РІР»СЏРµС‚ РѕС‚РѕР±СЂР°Р¶РµРЅРёРµРј Р±Р»РѕРєР° В«{activeDictionaryGroup.label}В» РЅР° СЃС‚СЂР°РЅРёС†Рµ РєР°С‚Р°Р»РѕРіР°.</p>
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
                                  <Label className="mb-1 block text-xs">РќР°Р·РІР°РЅРёРµ *</Label>
                                  <Input
                                    value={draft.name}
                                    onChange={(e) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, name: e.target.value } }))}
                                    className="rounded-md border-slate-300"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="mb-1 block text-xs">Р¦РІРµС‚</Label>
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
                                    <Label htmlFor={`dict-active-${item.id}`} className="text-sm">РђРєС‚РёРІРЅРѕ</Label>
                                  </div>
                                  <Button type="button" variant="outline" className="min-w-[110px] rounded-none" onClick={() => cancelEditDictionaryItem(item)}>
                                    <X className="mr-2 h-4 w-4" /> РЎР±СЂРѕСЃ
                                  </Button>
                                  <Button type="button" className="min-w-[130px] rounded-none bg-slate-900 text-white hover:bg-slate-800" onClick={() => updateDictionaryItem(selectedDictionaryGroup, item)}>
                                    <Check className="mr-2 h-4 w-4" /> РЎРѕС…СЂР°РЅРёС‚СЊ
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="mb-1 block text-xs">РћРїРёСЃР°РЅРёРµ</Label>
                                <Textarea
                                  value={draft.description}
                                  onChange={(e) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, description: e.target.value } }))}
                                  className="min-h-[76px] rounded-md border-slate-300"
                                  placeholder="РћРїРёСЃР°РЅРёРµ СЃР»РѕРІР°СЂРЅРѕРіРѕ Р·РЅР°С‡РµРЅРёСЏ"
                                />
                              </div>
                              <div className="text-xs text-muted-foreground">РЎРѕР·РґР°РЅРѕ: {item.createdAt ? new Date(item.createdAt).toLocaleString("ru-RU") : "вЂ”"}</div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 font-semibold">
                                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color || getDictionaryDotColor(item.name) }} />
                                  {item.name}
                                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${item.isActive === false ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                                    {item.isActive === false ? "РЅРµР°РєС‚РёРІРЅРѕ" : "Р°РєС‚РёРІРЅРѕ"}
                                  </span>
                                </div>
                                {item.description && (
                                  <div className="mt-1 text-sm text-slate-600">{item.description}</div>
                                )}
                                <div className="mt-1 text-xs text-muted-foreground">РЎРѕР·РґР°РЅРѕ: {item.createdAt ? new Date(item.createdAt).toLocaleString("ru-RU") : "вЂ”"}</div>
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
              <h2 className="text-2xl font-black uppercase mb-4">РќР°СЃС‚СЂРѕР№РєРё</h2>

              <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                <div className="order-1 lg:order-1">
                  <div className="border p-3 space-y-2 lg:sticky lg:top-4">
                    <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Р“СЂСѓРїРїС‹</p>
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
                      <h3 className="font-semibold">РђРІС‚РѕСЂРёР·Р°С†РёСЏ</h3>
                      <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                        <Checkbox
                          id="auth-password-policy"
                          checked={isSettingEnabled("auth_password_policy_enabled", true)}
                          onCheckedChange={(checked) => updateSetting("auth_password_policy_enabled", checked ? "true" : "false")}
                        />
                        <Label htmlFor="auth-password-policy">РЎС‚СЂРѕРіР°СЏ РїСЂРѕРІРµСЂРєР° РїР°СЂРѕР»СЏ (10+ СЃРёРјРІРѕР»РѕРІ, A-Z, a-z, С†РёС„СЂР°)</Label>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor="auth-session-ttl-hours">РЎРµСЃСЃРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (С‡Р°СЃС‹)</Label>
                          <Input id="auth-session-ttl-hours" type="number" min={1} value={settings["auth_session_ttl_hours"] || "720"} onChange={(e) => updateSetting("auth_session_ttl_hours", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="auth-refresh-ttl-hours">Refresh-СЃРµСЃСЃРёСЏ (С‡Р°СЃС‹)</Label>
                          <Input id="auth-refresh-ttl-hours" type="number" min={1} value={settings["auth_refresh_session_ttl_hours"] || "2160"} onChange={(e) => updateSetting("auth_refresh_session_ttl_hours", e.target.value)} />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label htmlFor="auth-admin-session-ttl-hours">РђРґРјРёРЅ-СЃРµСЃСЃРёСЏ (С‡Р°СЃС‹)</Label>
                          <Input id="auth-admin-session-ttl-hours" type="number" min={1} value={settings["auth_admin_session_ttl_hours"] || "168"} onChange={(e) => updateSetting("auth_admin_session_ttl_hours", e.target.value)} />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label htmlFor="auth-session-sliding-minutes">РЎРєРѕР»СЊР·СЏС‰РµРµ РѕР±РЅРѕРІР»РµРЅРёРµ СЃРµСЃСЃРёРё (РјРёРЅСѓС‚С‹)</Label>
                          <Input id="auth-session-sliding-minutes" type="number" min={1} value={settings["auth_session_sliding_update_minutes"] || "5"} onChange={(e) => updateSetting("auth_session_sliding_update_minutes", e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedSettingsGroup === "operations" && (
                    <div className="space-y-3 border p-3">
                      <h3 className="font-semibold">Р РµРіР»Р°РјРµРЅС‚РЅС‹Рµ РѕРїРµСЂР°С†РёРё</h3>
                      <p className="text-sm text-muted-foreground max-w-3xl">
                        РЎРµСЂРІРёСЃРЅС‹Рµ РґРµР№СЃС‚РІРёСЏ РґР»СЏ Р±С‹СЃС‚СЂРѕРіРѕ Р·Р°РїСѓСЃРєР° РїРѕР»РЅРѕСЃС‚СЊСЋ СЂР°Р±РѕС‡РµРіРѕ РґРµРјРѕ-РјР°РіР°Р·РёРЅР°:
                        РїСЂРµРґР·Р°РїРѕР»РЅРµРЅРЅС‹Рµ С‚РѕРІР°СЂС‹, РїРѕР»СЊР·РѕРІР°С‚РµР»Рё, РєРѕСЂР·РёРЅС‹, Р»Р°Р№РєРё, Р·Р°РєР°Р·С‹ Рё РѕС‚Р·С‹РІС‹.
                      </p>
                      <div className="border border-dashed p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <h4 className="font-bold uppercase tracking-wide">РџСЂРµРґРЅР°РїРѕР»РЅРµРЅРёРµ Р‘Р”</h4>
                          <p className="text-sm text-muted-foreground">РЎРѕР·РґР°РµС‚ 50 С‚РѕРІР°СЂРѕРІ Рё СЃРІСЏР·Р°РЅРЅС‹Р№ РґРµРјРѕ-РЅР°Р±РѕСЂ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№, Р·Р°РєР°Р·РѕРІ, РєРѕСЂР·РёРЅ, Р»Р°Р№РєРѕРІ, РєРѕРјРјРµРЅС‚Р°СЂРёРµРІ Рё РѕС‚Р·С‹РІРѕРІ.</p>
                        </div>
                        <Dialog open={isSeedDialogOpen} onOpenChange={setIsSeedDialogOpen}>
                          <DialogTrigger asChild>
                            <Button disabled={operationsLoading} className="rounded-none font-bold uppercase tracking-widest">
                              {operationsLoading ? "Р’Р«РџРћР›РќРЇР•РўРЎРЇ..." : "Р—РђРџРЈРЎРўРРўР¬ РџР Р•Р”РќРђРџРћР›РќР•РќРР•"}
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>РџРѕРґС‚РІРµСЂРґРёС‚Рµ РїСЂРµРґРЅР°РїРѕР»РЅРµРЅРёРµ Р‘Р”</DialogTitle>
                            </DialogHeader>
                            <p className="text-sm text-muted-foreground">
                              РўРµРєСѓС‰РёРµ С‚РѕРІР°СЂС‹, РїРѕР»СЊР·РѕРІР°С‚РµР»Рё, РєРѕСЂР·РёРЅС‹, Р·Р°РєР°Р·С‹ Рё Р»Р°Р№РєРё (РєСЂРѕРјРµ СЃРёСЃС‚РµРјРЅРѕРіРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°) Р±СѓРґСѓС‚ Р·Р°РјРµРЅРµРЅС‹.
                            </p>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setIsSeedDialogOpen(false)} disabled={operationsLoading}>РћС‚РјРµРЅР°</Button>
                              <Button onClick={runSeedDemoData} disabled={operationsLoading}>РџРѕРґС‚РІРµСЂРґРёС‚СЊ</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  )}

                  {selectedSettingsGroup === "smtp" && (
                    <div className="space-y-3 border p-3">
                      <h3 className="font-semibold">РџРѕС‡С‚Р° (SMTP)</h3>
                      <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                        <Checkbox
                          id="smtp-enabled"
                          checked={isSettingEnabled("smtp_enabled")}
                          onCheckedChange={(checked) => updateSetting("smtp_enabled", checked ? "true" : "false")}
                        />
                        <Label htmlFor="smtp-enabled">Р’РєР»СЋС‡РёС‚СЊ РѕС‚РїСЂР°РІРєСѓ email</Label>
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
                        <Label htmlFor="smtp-use-ssl">РСЃРїРѕР»СЊР·РѕРІР°С‚СЊ SSL/TLS</Label>
                      </div>
                    </div>
                  )}


                  {selectedSettingsGroup === "metrics" && (
                    <div className="space-y-3 border p-3">
                      <h3 className="font-semibold">РњРµС‚СЂРёРєРё</h3>
                      {[ 
                        ["metrics_yandex_metrika", "РЇРЅРґРµРєСЃ РњРµС‚СЂРёРєР°"],
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
                            <Label htmlFor={`${prefix}-enabled`}>Р’РєР»СЋС‡РёС‚СЊ {label}</Label>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`${prefix}-code`}>РљРѕРґ/СЃРЅРёРїРїРµС‚</Label>
                            <Textarea
                              id={`${prefix}-code`}
                              value={settings[`${prefix}_code`] || ""}
                              onChange={(e) => updateSetting(`${prefix}_code`, e.target.value)}
                              className="min-h-[120px]"
                              placeholder="Р’СЃС‚Р°РІСЊС‚Рµ РєРѕРґ СЃС‡С‘С‚С‡РёРєР°"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedSettingsGroup === "integrations" && (
                    <div className="space-y-3 border p-3">
                      <h3 className="font-semibold">РРЅС‚РµРіСЂР°С†РёРё</h3>
                      <p className="text-sm text-muted-foreground">Р Р°Р·РґРµР»РµРЅС‹ РїРѕ РєР°С‚Р°Р»РѕРіР°Рј, С‡С‚РѕР±С‹ Telegram, DaData Рё РЇРЅРґРµРєСЃ.Р”РѕСЃС‚Р°РІРєР° РјРѕР¶РЅРѕ Р±С‹Р»Рѕ РЅРµР·Р°РІРёСЃРёРјРѕ РѕР±РЅРѕРІР»СЏС‚СЊ Рё РЅР°СЃС‚СЂР°РёРІР°С‚СЊ.</p>

                      <Tabs value={selectedIntegrationCatalog} onValueChange={setSelectedIntegrationCatalog} className="w-full">
                        <TabsList className="w-full justify-start gap-2 rounded-none border-b bg-transparent p-0">
                          <TabsTrigger value="telegram" className="rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-black">Telegram</TabsTrigger>
                          <TabsTrigger value="dadata" className="rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-black">DaData</TabsTrigger>
                          <TabsTrigger value="yandex" className="rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-black">РЇРЅРґРµРєСЃ.Р”РѕСЃС‚Р°РІРєР°</TabsTrigger>
                        </TabsList>

                        <TabsContent value="telegram" className="mt-3 space-y-3">
                          <div className="space-y-3 border p-3">
                            <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                              <Checkbox
                                id="telegram-login-enabled"
                                checked={isSettingEnabled("telegram_login_enabled")}
                                onCheckedChange={(checked) => updateSetting("telegram_login_enabled", checked ? "true" : "false")}
                              />
                              <Label htmlFor="telegram-login-enabled">Р’РєР»СЋС‡РёС‚СЊ Р°РІС‚РѕСЂРёР·Р°С†РёСЋ С‡РµСЂРµР· Telegram</Label>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="telegram-bot-username">Username Р±РѕС‚Р° РґР»СЏ Telegram Login</Label>
                              <Input id="telegram-bot-username" value={settings["telegram_bot_username"] || ""} onChange={(e) => updateSetting("telegram_bot_username", e.target.value)} />
                              <p className="text-xs text-muted-foreground">
                                РќРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕРµ РїРѕР»Рµ. Р•СЃР»Рё РѕСЃС‚Р°РІРёС‚СЊ РїСѓСЃС‚С‹Рј, РґР»СЏ РєРЅРѕРїРєРё РІС…РѕРґР° С‡РµСЂРµР· Telegram Р±СѓРґРµС‚ РёСЃРїРѕР»СЊР·РѕРІР°РЅ username РїРѕСЃР»РµРґРЅРµРіРѕ Р°РєС‚РёРІРЅРѕРіРѕ Р±РѕС‚Р° РёР· СЃРїРёСЃРєР° РЅРёР¶Рµ.
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
                                        <div className="text-xs text-slate-400 truncate">{bot.username ? `@${bot.username}` : "username РЅРµ Р·Р°РґР°РЅ"}</div>
                                        <div className="text-xs text-slate-500">ID: {bot.botInfo?.id || bot.id}</div>
                                        <div className="text-xs text-slate-400">РўРѕРєРµРЅ: {bot.tokenMasked || "********"}</div>
                                        <div className="text-xs text-slate-400">Р РµР¶РёРј: {bot.updateMode === "webhook" ? "Webhook" : "Polling"}</div>
                                        {bot.useForLogin && (
                                          <div className="mt-1 inline-flex rounded border border-emerald-500 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                                            РСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РґР»СЏ Р°РІС‚РѕСЂРёР·Р°С†РёРё
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className={`text-xs ${bot.enabled ? "text-emerald-400" : "text-amber-300"}`}>{bot.enabled ? "РђРєС‚РёРІРµРЅ" : "РћСЃС‚Р°РЅРѕРІР»РµРЅ"}</span>
                                        <div className="flex gap-2">
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button type="button" size="icon" className="h-8 w-8 border border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700" onClick={() => openEditTelegramBotDialog(bot)}>
                                                <Pencil className="h-3.5 w-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ Р±РѕС‚Р°</TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button type="button" size="icon" className="h-8 w-8 border border-emerald-500 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-800/50" onClick={() => checkTelegramBot(bot)}>
                                                <ShieldCheck className="h-3.5 w-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>РџСЂРѕРІРµСЂРёС‚СЊ Рё СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊ СЃ Telegram</TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button type="button" size="icon" className="h-8 w-8 border border-sky-500 bg-sky-900/30 text-sky-300 hover:bg-sky-800/50" onClick={() => toggleTelegramBot(bot)}>
                                                {bot.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>{bot.enabled ? "РћСЃС‚Р°РЅРѕРІРёС‚СЊ Р±РѕС‚Р°" : "Р—Р°РїСѓСЃС‚РёС‚СЊ Р±РѕС‚Р°"}</TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button type="button" size="icon" className="h-8 w-8 border border-red-500 bg-red-900/30 text-red-300 hover:bg-red-800/50" onClick={() => deleteTelegramBot(bot)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>РЈРґР°Р»РёС‚СЊ Р±РѕС‚Р°</TooltipContent>
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
                                  <TooltipContent>Р”РѕР±Р°РІРёС‚СЊ РЅРѕРІРѕРіРѕ Telegram-Р±РѕС‚Р°</TooltipContent>
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
                            <h4 className="font-semibold">РЇРЅРґРµРєСЃ Р”РѕСЃС‚Р°РІРєР° (СЂР°СЃС‡С‘С‚)</h4>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                              <div className="space-y-1">
                                <Label htmlFor="yandex-delivery-base-cost">Р‘Р°Р·РѕРІР°СЏ СЃС‚РѕРёРјРѕСЃС‚СЊ (в‚Ѕ)</Label>
                                <Input id="yandex-delivery-base-cost" value={settings["yandex_delivery_base_cost"] || "350"} onChange={(e) => updateSetting("yandex_delivery_base_cost", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="yandex-delivery-cost-per-kg">РЎС‚РѕРёРјРѕСЃС‚СЊ Р·Р° РєРі (в‚Ѕ)</Label>
                                <Input id="yandex-delivery-cost-per-kg" value={settings["yandex_delivery_cost_per_kg"] || "40"} onChange={(e) => updateSetting("yandex_delivery_cost_per_kg", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="yandex-delivery-markup">РќР°С†РµРЅРєР° (%)</Label>
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
                      <h3 className="font-semibold">Р®СЂРёРґРёС‡РµСЃРєРёРµ С‚РµРєСЃС‚С‹</h3>
                      {[
                        ["privacy_policy", "РџРѕР»РёС‚РёРєР° РєРѕРЅС„РёРґРµРЅС†РёР°Р»СЊРЅРѕСЃС‚Рё"],
                        ["user_agreement", "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРѕРµ СЃРѕРіР»Р°С€РµРЅРёРµ"],
                        ["public_offer", "РџСѓР±Р»РёС‡РЅР°СЏ РѕС„РµСЂС‚Р°"],
                        ["cookie_consent_text", "РўРµРєСЃС‚ cookie-СЃРѕРіР»Р°СЃРёСЏ"]
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
                      <h3 className="font-semibold">РћР±С‰РёРµ РЅР°СЃС‚СЂРѕР№РєРё</h3>
                      <div className="space-y-1">
                        <Label htmlFor="store-name">РќР°Р·РІР°РЅРёРµ РјР°РіР°Р·РёРЅР°</Label>
                        <Input id="store-name" value={settings.storeName || ""} onChange={(e) => updateSetting("storeName", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="site-title">РќР°Р·РІР°РЅРёРµ РІРєР»Р°РґРєРё Р±СЂР°СѓР·РµСЂР°</Label>
                        <Input
                          id="site-title"
                          value={settings.site_title || ""}
                          onChange={(e) => updateSetting("site_title", e.target.value)}
                          placeholder="РќР°РїСЂРёРјРµСЂ: Fashion Demon"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="site-favicon-url">URL РёРєРѕРЅРєРё РІРєР»Р°РґРєРё (favicon)</Label>
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
                            {faviconUploading ? "Р—Р°РіСЂСѓР·РєР°..." : (selectedFaviconFileName ? `Р¤Р°Р№Р»: ${selectedFaviconFileName}` : "Р—Р°РіСЂСѓР·РёС‚СЊ С„Р°Р№Р»")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-none"
                            onClick={() => faviconUploadInputRef.current?.click()}
                            disabled={faviconUploading}
                          >
                            <Images className="w-4 h-4 mr-2" /> Р—Р°РјРµРЅРёС‚СЊ favicon.ico
                          </Button>
                          {faviconUploading && (
                            <span className="text-sm text-muted-foreground">Р—Р°РіСЂСѓР·РєР°...</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Р”Р»СЏ СЌС‚РѕРіРѕ РїРѕР»СЏ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ РїСЂСЏРјР°СЏ Р·Р°РіСЂСѓР·РєР° С‚РѕР»СЊРєРѕ С„Р°Р№Р»Р° <b>favicon.ico</b>. Р¤Р°Р№Р» РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ С‚РѕР»СЊРєРѕ РєР°Рє РёРєРѕРЅРєР° РІРєР»Р°РґРєРё.
                        </p>
                      </div>
                    </div>
                  )}

                </div>

              </div>


              <div className="mt-3 flex gap-2">
                <Button onClick={saveSettings}>РЎРѕС…СЂР°РЅРёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё</Button>
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
                  {editingTelegramBotId ? "Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ Telegram-Р±РѕС‚Р°" : "Р”РѕР±Р°РІР»РµРЅРёРµ Telegram-Р±РѕС‚Р°"}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <Label>РќР°Р·РІР°РЅРёРµ Р±РѕС‚Р° *</Label>
                      <span className="text-xs text-muted-foreground">
                        {telegramBotForm.name.trim().length}/{TELEGRAM_BOT_LIMITS.name}
                      </span>
                    </div>
                    <Input
                      value={telegramBotForm.name}
                      onChange={(e) => setTelegramBotForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="РќР°РїСЂРёРјРµСЂ: Fashion Demon Bot"
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
                  <Label>URL РєР°СЂС‚РёРЅРєРё</Label>
                  <Input
                    type="url"
                    value={telegramBotForm.imageUrl}
                    onChange={(e) => setTelegramBotForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                    placeholder="https://..."
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Telegram РґР»СЏ С„РѕС‚Рѕ РїСЂРѕС„РёР»СЏ Р±РѕС‚Р° РѕР¶РёРґР°РµС‚ СЃС‚Р°С‚РёС‡РЅСѓСЋ JPG-РєР°СЂС‚РёРЅРєСѓ. Р•СЃР»Рё СѓРєР°Р¶РµС‚Рµ URL, СЃРµСЂРІРµСЂ РїСЂРѕРІРµСЂРёС‚ С„РѕСЂРјР°С‚ РїСЂРё СЃРѕС…СЂР°РЅРµРЅРёРё.
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => telegramBotImageInputRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" />
                      Р—Р°РіСЂСѓР·РёС‚СЊ РЅР° СЃР°Р№С‚
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
                  <Label>РўРѕРєРµРЅ Р±РѕС‚Р° *</Label>
                  <Input
                    type="text"
                    value={getMaskedTokenInputValue()}
                    onChange={(e) => {
                      setTelegramBotForm((prev) => ({ ...prev, token: e.target.value }));
                      setTelegramBotValidationError("");
                    }}
                    onFocus={() => setTelegramBotTokenVisible(true)}
                    onBlur={() => setTelegramBotTokenVisible(false)}
                    placeholder={editingTelegramBotId ? (telegramBotForm.tokenMasked || "РћСЃС‚Р°РІСЊС‚Рµ РїСѓСЃС‚С‹Рј, С‡С‚РѕР±С‹ РЅРµ РјРµРЅСЏС‚СЊ С‚РѕРєРµРЅ") : "12345:AA..."}
                    required={!editingTelegramBotId}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                  />
                  <div className="min-h-5 text-xs text-muted-foreground">
                    {!telegramBotForm.token.trim() && editingTelegramBotId && telegramBotForm.tokenMasked && (
                      <span>
                        РўРµРєСѓС‰РёР№ С‚РѕРєРµРЅ: <span className="font-mono">{telegramBotForm.tokenMasked}</span>
                      </span>
                    )}
                    {telegramBotForm.token.trim() && !telegramBotTokenVisible && (
                      <span>РўРѕРєРµРЅ Р·Р°РјР°СЃРєРёСЂРѕРІР°РЅ. РќР°Р¶РјРёС‚Рµ РЅР° РїРѕР»Рµ, С‡С‚РѕР±С‹ РёР·РјРµРЅРёС‚СЊ РµРіРѕ.</span>
                    )}
                    {telegramBotForm.token.trim() && telegramBotTokenVisible && (
                      <span>Р РµР¶РёРј СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ С‚РѕРєРµРЅР°.</span>
                    )}
                  </div>
                  {editingTelegramBotId && (
                    <p className="text-xs text-muted-foreground">Р•СЃР»Рё С‚РѕРєРµРЅ РЅРµ РјРµРЅСЏР»Рё, РѕСЃС‚Р°РІСЊС‚Рµ РїРѕР»Рµ РїСѓСЃС‚С‹Рј вЂ” СЃРѕС…СЂР°РЅРёС‚СЃСЏ С‚РµРєСѓС‰РёР№ С‚РѕРєРµРЅ.</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void validateTelegramToken();
                    }}
                    disabled={telegramBotChecking}
                  >
                    {telegramBotChecking ? "РџСЂРѕРІРµСЂРєР°..." : "РџСЂРѕРІРµСЂРёС‚СЊ (getMe)"}
                  </Button>
                  {telegramBotValidationError && (
                    <div className="border border-red-300 bg-red-50 p-2 text-xs text-red-700">
                      {telegramBotValidationError}
                    </div>
                  )}
                </div>

                {telegramBotCheckInfo && (
                  <div className="border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
                    ID: {telegramBotCheckInfo.id || "вЂ”"}, username: {telegramBotCheckInfo.username || "вЂ”"}, name: {telegramBotCheckInfo.first_name || telegramBotCheckInfo.last_name || "вЂ”"}
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <Label>РћРїРёСЃР°РЅРёРµ</Label>
                    <span className="text-xs text-muted-foreground">
                      {telegramBotForm.description.trim().length}/{TELEGRAM_BOT_LIMITS.description}
                    </span>
                  </div>
                  <Textarea
                    value={telegramBotForm.description}
                    onChange={(e) => setTelegramBotForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="РћРїРёСЃР°РЅРёРµ Р±РѕС‚Р° (setMyDescription)"
                    maxLength={TELEGRAM_BOT_LIMITS.description}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <Label>РљСЂР°С‚РєРѕРµ РѕРїРёСЃР°РЅРёРµ</Label>
                    <span className="text-xs text-muted-foreground">
                      {telegramBotForm.shortDescription.trim().length}/{TELEGRAM_BOT_LIMITS.shortDescription}
                    </span>
                  </div>
                  <Input
                    value={telegramBotForm.shortDescription}
                    onChange={(e) => setTelegramBotForm((prev) => ({ ...prev, shortDescription: e.target.value }))}
                    placeholder="РљСЂР°С‚РєРѕРµ РѕРїРёСЃР°РЅРёРµ (setMyShortDescription)"
                    maxLength={TELEGRAM_BOT_LIMITS.shortDescription}
                  />
                </div>

                <div className="space-y-3 rounded border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">РљРѕРјР°РЅРґС‹</div>
                      <p className="text-xs text-muted-foreground">
                        Р’ Telegram РјРѕР¶РЅРѕ Р·Р°РґР°С‚СЊ РґРѕ {TELEGRAM_BOT_LIMITS.maxCommands} РєРѕРјР°РЅРґ. РЎР»СѓР¶РµР±РЅР°СЏ РєРѕРјР°РЅРґР° <span className="font-mono">/check</span> СЂР°Р±РѕС‚Р°РµС‚ РІСЃРµРіРґР° Рё РІ РјРµРЅСЋ РЅРµ РґРѕР±Р°РІР»СЏРµС‚СЃСЏ.
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
                            <Label>РљРѕРјР°РЅРґР°</Label>
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
                            <Label>РћРїРёСЃР°РЅРёРµ</Label>
                            <span className="text-xs text-muted-foreground">
                              {command.description.trim().length}/{TELEGRAM_BOT_LIMITS.commandDescription}
                            </span>
                          </div>
                          <Input
                            value={command.description}
                            onChange={(e) => updateTelegramBotCommand(index, "description", e.target.value)}
                            placeholder="РќР°РїСЂРёРјРµСЂ: РќР°С‡Р°С‚СЊ СЂР°Р±РѕС‚Сѓ"
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
                            РЈРґР°Р»РёС‚СЊ
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" onClick={addTelegramBotCommand}>
                    <Plus className="mr-2 h-4 w-4" />
                    Р”РѕР±Р°РІРёС‚СЊ РєРѕРјР°РЅРґСѓ
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                  <Checkbox
                    id="telegram-bot-enabled"
                    checked={telegramBotForm.enabled}
                    onCheckedChange={(checked) => setTelegramBotForm((prev) => ({ ...prev, enabled: !!checked }))}
                  />
                  <Label htmlFor="telegram-bot-enabled">Р—Р°РїСѓСЃС‚РёС‚СЊ Р±РѕС‚Р° СЃСЂР°Р·Сѓ РїРѕСЃР»Рµ СЃРѕС…СЂР°РЅРµРЅРёСЏ</Label>
                </div>

                <div className="space-y-2 rounded border p-3">
                  <div className="font-medium">Р РµР¶РёРј РїРѕР»СѓС‡РµРЅРёСЏ СЃРѕР±С‹С‚РёР№</div>
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
                        <span className="block text-xs text-muted-foreground">РЎРµСЂРІРµСЂ СЃР°Рј РїРѕСЃС‚РѕСЏРЅРЅРѕ Р·Р°РїСЂР°С€РёРІР°РµС‚ РѕР±РЅРѕРІР»РµРЅРёСЏ Сѓ Telegram (getUpdates).</span>
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
                        <span className="block text-xs text-muted-foreground">Telegram РѕС‚РїСЂР°РІР»СЏРµС‚ СЃРѕР±С‹С‚РёСЏ РЅР° РЅР°С€ endpoint. РўСЂРµР±СѓРµС‚СЃСЏ РїСѓР±Р»РёС‡РЅС‹Р№ HTTPS Р°РґСЂРµСЃ.</span>
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
                  <Label htmlFor="telegram-bot-use-for-login">РСЃРїРѕР»СЊР·РѕРІР°С‚СЊ СЌС‚РѕРіРѕ Р±РѕС‚Р° РґР»СЏ Р°РІС‚РѕСЂРёР·Р°С†РёРё С‡РµСЂРµР· Telegram</Label>
                </div>

                <div className="space-y-3 rounded border p-3">
                  <div>
                    <div className="font-medium">РђРІС‚РѕРѕС‚РІРµС‚С‹ Рё С€Р°Р±Р»РѕРЅС‹</div>
                    <p className="text-xs text-muted-foreground">
                      РџРѕРґРґРµСЂР¶РёРІР°СЋС‚СЃСЏ РїРµСЂРµРјРµРЅРЅС‹Рµ: <span className="font-mono">{`{bot_name}`}</span>, <span className="font-mono">{`{command}`}</span>, <span className="font-mono">{`{username}`}</span>, <span className="font-mono">{`{first_name}`}</span>, <span className="font-mono">{`{order_number}`}</span>, <span className="font-mono">{`{status}`}</span>, <span className="font-mono">{`{discount_name}`}</span>.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                    <Checkbox
                      id="telegram-bot-auto-replies"
                      checked={telegramBotForm.autoRepliesEnabled}
                      onCheckedChange={(checked) => setTelegramBotForm((prev) => ({ ...prev, autoRepliesEnabled: !!checked }))}
                    />
                    <Label htmlFor="telegram-bot-auto-replies">Р’РєР»СЋС‡РёС‚СЊ Р°РІС‚РѕРѕС‚РІРµС‚С‹ Р±РѕС‚Р°</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Р•СЃР»Рё РІС‹РєР»СЋС‡РёС‚СЊ Р°РІС‚РѕРѕС‚РІРµС‚С‹, Р±РѕС‚ РїСЂРѕРґРѕР»Р¶РёС‚ РѕС‚РІРµС‡Р°С‚СЊ С‚РѕР»СЊРєРѕ РЅР° СЃР»СѓР¶РµР±РЅСѓСЋ РїСЂРѕРІРµСЂРєСѓ <span className="font-mono">/check</span>.
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
                            <Label htmlFor={`telegram-template-${template.key}`}>Р’РєР»СЋС‡РµРЅ</Label>
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
                          <span>РљР»СЋС‡ С€Р°Р±Р»РѕРЅР°: <span className="font-mono">{template.key}</span></span>
                          <span>{template.text.trim().length}/{TELEGRAM_BOT_LIMITS.replyText}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {telegramBotFormErrors.length > 0 && (
                  <div className="space-y-1 border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {telegramBotFormErrors.slice(0, 6).map((error) => (
                      <div key={error}>вЂў {error}</div>
                    ))}
                    {telegramBotFormErrors.length > 6 && (
                      <div>вЂў Р РµС‰Рµ {telegramBotFormErrors.length - 6} РѕС€РёР±РѕРє.</div>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsTelegramBotDialogOpen(false)} disabled={telegramBotSaving || telegramBotChecking}>РћС‚РјРµРЅР°</Button>
                <Button type="button" onClick={saveTelegramBot} disabled={telegramBotSaving || telegramBotChecking || telegramBotFormErrors.length > 0}>
                  {telegramBotSaving ? "РЎРѕС…СЂР°РЅРµРЅРёРµ..." : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {isOpen && (
          <section className="mt-8 border border-black p-6">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-black uppercase tracking-tighter">
                {editingId ? 'Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ С‚РѕРІР°СЂ' : 'Р”РѕР±Р°РІРёС‚СЊ РЅРѕРІС‹Р№ С‚РѕРІР°СЂ'}
              </h2>
              <Button type="button" variant="outline" onClick={closeProductForm} className="rounded-none">
                РќРђР—РђР” Рљ РЎРџРРЎРљРЈ
              </Button>
            </div>
              <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prod-name">РќР°Р·РІР°РЅРёРµ</Label>
                    <Input 
                      id="prod-name" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      required
                      className="rounded-none border-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-slug">URL (Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё, РµСЃР»Рё РїСѓСЃС‚Рѕ)</Label>
                    <Input 
                      id="prod-slug" 
                      value={formData.slug}
                      onChange={(e) => setFormData({...formData, slug: e.target.value})}
                      className="rounded-none border-black"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prod-desc">РћРїРёСЃР°РЅРёРµ</Label>
                  <Textarea 
                    id="prod-desc" 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="rounded-none border-black min-h-[100px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prod-price">Р¦РµРЅР° (в‚Ѕ)</Label>
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
                    <Label htmlFor="prod-discount">РЎРєРёРґРєР° (%)</Label>
                    <Input id="prod-discount" type="number" min="0" max="100" value={formData.discountPercent} onChange={(e) => setFormData({...formData, discountPercent: e.target.value})} className="rounded-none border-black"/>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-discounted">Р¦РµРЅР° СЃРѕ СЃРєРёРґРєРѕР№</Label>
                    <Input id="prod-discounted" type="number" value={formData.discountedPrice} onChange={(e) => setFormData({...formData, discountedPrice: e.target.value})} className="rounded-none border-black"/>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-cat">РљР°С‚РµРіРѕСЂРёСЏ</Label>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" className="rounded-none" onClick={() => openProductDictionarySelector("categories")}>РЎР»РѕРІР°СЂСЊ</Button>
                        <Button type="button" variant="outline" className="rounded-none" onClick={() => createDictionaryItem("categories")}>+</Button>
                      </div>
                      {formData.categories.length > 0 ? (
                        <div className="space-y-2">
                          {formData.categories.map((category) => (
                            <div key={category} className="flex items-center justify-between border border-black px-3 py-2">
                              <span>{category}</span>
                              <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => removeDictionaryValueFromProduct("categories", category)}>{"\u0423\u0434\u0430\u043b\u0438\u0442\u044c"}</Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">{"\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f \u043d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d\u0430"}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>РњРµРґРёР° (РїРѕ РїРѕСЂСЏРґРєСѓ)</Label>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">РњРѕР¶РЅРѕ РґРѕР±Р°РІРёС‚СЊ Р»СЋР±РѕРµ РєРѕР»РёС‡РµСЃС‚РІРѕ С„РѕС‚Рѕ/РІРёРґРµРѕ. РџРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ РІС‹Р±РѕСЂ РёР· РіР°Р»РµСЂРµРё.</p>
                    <Button type="button" size="sm" variant="outline" className="rounded-none" onClick={addMediaSlot}>
                      <PlusCircle className="w-4 h-4 mr-1" /> Р”РѕР±Р°РІРёС‚СЊ Р±Р»РѕРє
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
                            <option value="image">Р¤РѕС‚Рѕ</option>
                            <option value="video">Р’РёРґРµРѕ</option>
                          </select>
                          <Input
                            placeholder="URL"
                            value={item.url}
                            onChange={(e) => updateMediaSlot(slot, { url: e.target.value })}
                            className="rounded-none border-black"
                          />
                          <label className="inline-flex items-center justify-center h-10 border border-black font-bold cursor-pointer">
                            Р¤Р°Р№Р»
                            <input
                              type="file"
                              accept="image/*,video/*"
                              className="hidden"
                              onChange={(e) => handleUploadSlot(e.target.files?.[0] || null, slot)}
                              disabled={uploading}
                            />
                          </label>
                          <label className="inline-flex items-center justify-center h-10 border border-black font-bold cursor-pointer">
                            Р’ РіР°Р»РµСЂРµСЋ
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
                            <Images className="w-4 h-4 mr-2" /> Р’С‹Р±СЂР°С‚СЊ РёР· РіР°Р»РµСЂРµРё
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Р Р°Р·РјРµСЂС‹</Label>
                  <div className="space-y-2">
                    <Button type="button" variant="outline" className="rounded-none" onClick={() => openProductDictionarySelector("sizes")}>РЎР»РѕРІР°СЂСЊ</Button>
                    {formData.sizes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Р Р°Р·РјРµСЂС‹ РЅРµ РІС‹Р±СЂР°РЅС‹</p>
                    ) : (
                      <div className="space-y-2">
                        {formData.sizes.map((size) => (
                          <div key={size} className="flex items-center justify-between border border-black px-3 py-2">
                            <span>{size}</span>
                            <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => removeDictionaryValueFromProduct("sizes", size)}>РЈРґР°Р»РёС‚СЊ</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>РћСЃС‚Р°С‚РєРё РїРѕ СЂР°Р·РјРµСЂР°Рј</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {(formData.sizes || []).map((size) => {
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
                    <Label htmlFor="is-new" className="cursor-pointer font-bold uppercase">РќРѕРІРёРЅРєР°</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="is-pop" 
                      checked={formData.isPopular}
                      onCheckedChange={(c) => setFormData({...formData, isPopular: !!c})}
                    />
                    <Label htmlFor="is-pop" className="cursor-pointer font-bold uppercase">РџРѕРїСѓР»СЏСЂРЅС‹Р№ / РҐРёС‚</Label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prod-sku">РђСЂС‚РёРєСѓР»</Label>
                    <Input
                      id="prod-sku"
                      value={formData.sku}
                      onChange={(e) => setFormData({...formData, sku: e.target.value})}
                      className="rounded-none border-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-material">РњР°С‚РµСЂРёР°Р»</Label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" className="rounded-none" onClick={() => openProductDictionarySelector("materials")}>РЎР»РѕРІР°СЂСЊ</Button>
                        <Button type="button" variant="outline" className="rounded-none" onClick={() => createDictionaryItem("materials")}>+</Button>
                      </div>
                      {formData.materials.length > 0 ? (
                        <div className="space-y-2">
                          {formData.materials.map((material) => (
                            <div key={material} className="flex items-center justify-between border border-black px-3 py-2">
                              <span>{material}</span>
                              <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => removeDictionaryValueFromProduct("materials", material)}>{"\u0423\u0434\u0430\u043b\u0438\u0442\u044c"}</Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">{"\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b \u043d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d"}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prod-print">РџСЂРёРЅС‚</Label>
                    <Input
                      id="prod-print"
                      value={formData.printType}
                      onChange={(e) => setFormData({...formData, printType: e.target.value})}
                      className="rounded-none border-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-fit">Р›РµРєР°Р»Р°</Label>
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
                    <Label htmlFor="prod-gender">РџРѕР»</Label>
                    <select id="prod-gender" value={formData.gender} onChange={(e) => setFormData({...formData, gender: e.target.value})} className="h-10 w-full border border-black px-3">
                      <option value="">Р’С‹Р±РµСЂРёС‚Рµ РїРѕР»</option>
                      <option value="male">РјСѓР¶СЃРєРѕР№</option>
                      <option value="female">Р¶РµРЅСЃРєРёР№</option>
                      <option value="unisex">unisex</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-color">Р¦РІРµС‚</Label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" className="rounded-none" onClick={() => openProductDictionarySelector("colors")}>РЎР»РѕРІР°СЂСЊ</Button>
                        <Button type="button" variant="outline" className="rounded-none" onClick={() => createDictionaryItem("colors")}>+</Button>
                      </div>
                      {formData.colors.length > 0 ? (
                        <div className="space-y-2">
                          {formData.colors.map((color) => (
                            <div key={color} className="flex items-center justify-between border border-black px-3 py-2">
                              <span>{color}</span>
                              <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => removeDictionaryValueFromProduct("colors", color)}>{"\u0423\u0434\u0430\u043b\u0438\u0442\u044c"}</Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">{"\u0426\u0432\u0435\u0442 \u043d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d"}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prod-shipping">РћС‚РїСЂР°РІРєР°</Label>
                  <Input
                    id="prod-shipping"
                    value={formData.shipping}
                    onChange={(e) => setFormData({...formData, shipping: e.target.value})}
                    className="rounded-none border-black"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeProductForm} className="rounded-none">
                    РћРўРњР•РќРђ
                  </Button>
                  <Button type="submit" className="bg-black text-white hover:bg-gray-800 rounded-none font-bold uppercase tracking-widest">
                    {editingId ? 'РћР‘РќРћР’РРўР¬ РўРћР’РђР ' : 'РЎРћР—Р”РђРўР¬ РўРћР’РђР '}
                  </Button>
                </div>
              </form>
          </section>
          )}



          <Dialog open={productDictionarySelector.open} onOpenChange={(open) => setProductDictionarySelector((prev) => ({ ...prev, open }))}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto rounded-none border-black">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase">
                  РЎРїСЂР°РІРѕС‡РЅРёРє: {dictionaryGroups.find((group) => group.key === productDictionarySelector.kind)?.label}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                {(dictionaries[productDictionarySelector.kind] || []).map((item: any) => {
                  const selected = getProductDictionarySelected(productDictionarySelector.kind, item.name);
                  return (
                    <div key={`${productDictionarySelector.kind}-${item.id}`} className="flex items-center justify-between border border-gray-200 px-4 py-3">
                      <div>
                        <div className="flex items-center gap-2 font-semibold">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color || getDictionaryDotColor(item.name) }} />
                          <span>{item.name}</span>
                        </div>
                        {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                      </div>
                      <Button
                        type="button"
                        variant={selected ? "secondary" : "outline"}
                        className="rounded-none"
                        onClick={() => addDictionaryValueToProduct(productDictionarySelector.kind, item.name)}
                        disabled={selected}
                      >
                        {selected ? "Р’С‹Р±СЂР°РЅРѕ" : "Р’С‹Р±СЂР°С‚СЊ"}
                      </Button>
                    </div>
                  );
                })}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-none" onClick={closeProductDictionarySelector}>Р—Р°РєСЂС‹С‚СЊ</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={dictionaryDeleteDialog.open} onOpenChange={(open) => { if (!dictionaryDeleteDialog.submitting) setDictionaryDeleteDialog((prev) => ({ ...prev, open, error: open ? prev.error : "" })); }}>
            <DialogContent className="max-w-md rounded-none border-black">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase">РџРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ СѓРґР°Р»РµРЅРёСЏ</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>
                  РЈРґР°Р»РёС‚СЊ СЌР»РµРјРµРЅС‚ В«{dictionaryDeleteDialog.item?.name}В» РёР· СЃРїСЂР°РІРѕС‡РЅРёРєР° В«{dictionaryGroups.find((group) => group.key === dictionaryDeleteDialog.kind)?.label}В»?
                </p>
                <p className="text-muted-foreground">РЈРґР°Р»РµРЅРёРµ РІРѕР·РјРѕР¶РЅРѕ С‚РѕР»СЊРєРѕ РµСЃР»Рё СЌР»РµРјРµРЅС‚ РЅРµ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РІ С‚РѕРІР°СЂР°С….</p>
                {dictionaryDeleteDialog.error && (
                  <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                    {dictionaryDeleteDialog.error}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-none" onClick={closeDeleteDictionaryDialog} disabled={dictionaryDeleteDialog.submitting}>
                  РћС‚РјРµРЅР°
                </Button>
                <Button
                  type="button"
                  className="rounded-none bg-red-600 text-white hover:bg-red-700"
                  onClick={confirmDeleteDictionaryItem}
                  disabled={dictionaryDeleteDialog.submitting}
                >
                  {dictionaryDeleteDialog.submitting ? "РЈРґР°Р»РµРЅРёРµ..." : "РЈРґР°Р»РёС‚СЊ"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={actionNotice.open} onOpenChange={(open) => setActionNotice((prev) => ({ ...prev, open }))}>
            <DialogContent className="max-w-md rounded-none border-black">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase">{actionNotice.title || "РЈРІРµРґРѕРјР»РµРЅРёРµ"}</DialogTitle>
              </DialogHeader>
              <div className={`rounded border px-3 py-2 text-sm ${actionNotice.isError ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                {actionNotice.message}
              </div>
              <DialogFooter>
                <Button type="button" className="rounded-none bg-black text-white hover:bg-gray-800" onClick={() => setActionNotice((prev) => ({ ...prev, open: false }))}>
                  РџРѕРЅСЏС‚РЅРѕ
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={isMediaGalleryPickerOpen} onOpenChange={setIsMediaGalleryPickerOpen}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto rounded-none border-black">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase">Р’С‹Р±СЂР°С‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РёР· РіР°Р»РµСЂРµРё</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="РџРѕРёСЃРє РїРѕ РёРјРµРЅРё/РѕРїРёСЃР°РЅРёСЋ"
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
                    Р—Р°РіСЂСѓР·РёС‚СЊ РІ РіР°Р»РµСЂРµСЋ
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
                        <div className="text-xs text-muted-foreground truncate">{image.description || 'Р‘РµР· РѕРїРёСЃР°РЅРёСЏ'}</div>
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


