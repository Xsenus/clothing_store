import Header from '@/components/Header';
import Footer from '@/components/Footer';
import "./admin.css";
import AdminAnalyticsTab, { type AdminAnalyticsResponse } from '@/components/admin/AdminAnalyticsTab';
import AdminPromoCodesSettings from '@/components/admin/AdminPromoCodesSettings';
import AdminSocialLinksSettings from '@/components/admin/AdminSocialLinksSettings';
import {
  AdminAvitoIntegrationTab,
  AdminCdekIntegrationTab,
  AdminRoboKassaIntegrationTab,
  AdminRussianPostIntegrationTab,
} from '@/components/admin/AdminNewIntegrationsTabs';
import AddressAutocompleteInput from '@/components/AddressAutocompleteInput';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FLOW } from '@/lib/api-mapping';
import { COOKIE_CONSENT_TEXT, PRIVACY_POLICY, PUBLIC_OFFER, RETURN_POLICY, USER_AGREEMENT } from '@/lib/legal-texts';
import { type ChangeEvent, type ComponentProps, type DragEvent, type PointerEvent as ReactPointerEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  getProductCardImageDisplayClasses,
  buildProductCardBackgroundStyleFromColor,
  buildStandardProductCardBackgroundStyle,
  buildTransparentProductCardBackgroundStyle,
  getProductDetailImageDisplayClasses,
  getProductDetailMediaPreviewLayoutClasses,
  normalizeProductCardBackgroundColor,
  normalizeProductCardBackgroundMode,
  normalizeProductCardImageFitMode,
  normalizeProductDetailBackgroundColor,
  normalizeProductDetailBackgroundMode,
  normalizeProductDetailImageFitMode,
  normalizeProductDetailMediaSizeMode,
} from '@/lib/product-card-background';
import {
  IMAGE_UPLOAD_CONTEXTS,
  IMAGE_UPLOAD_SETTING_DEFAULTS,
  getImageUploadSettingKey,
  getImageUploadSettings,
  optimizeImageFileForUpload,
  optimizeFilesForUpload,
} from '@/lib/image-upload-optimization';
import { getCachedPublicSettings, setCachedPublicSettings } from '@/lib/site-settings';
import { DEFAULT_SITE_SOCIAL_LINKS_CONFIG_JSON } from '@/lib/social-links';
import {
  getYooKassaConfigurationIssues,
  getYooMoneyConfigurationIssues,
  YOO_KASSA_PAYMENT_METHOD_LABELS,
  YOO_KASSA_PAYMENT_STATUS_LABELS,
  YOO_MONEY_PAYMENT_METHOD_LABELS,
  YOO_MONEY_PAYMENT_STATUS_LABELS,
} from '@/lib/yoomoney';
import LoadingSpinner from '@/components/LoadingSpinner';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X, Upload, Download, ShieldCheck, Play, Pause, Copy, RefreshCcw, Check, Ban, ImagePlus, Images, PlusCircle, Search, ShieldAlert, ShieldX, UserCog, ArrowUp, ArrowDown, Columns3, Eye, EyeOff, GripVertical, CalendarDays } from 'lucide-react';
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

interface TelegramBotValidationInfo {
  id?: string | number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  commands?: TelegramBotCommand[] | null;
  webhookInfo?: unknown;
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

interface AdminYandexDeliveryTestOption {
  available?: boolean;
  estimatedCost?: number | null;
  deliveryDays?: number | null;
  tariff?: string | null;
  error?: string | null;
}

interface AdminYandexDeliveryTestPickupQuote extends AdminYandexDeliveryTestOption {
  point?: AdminYandexDeliveryTestPickupPoint | null;
}

const AUTH_NO_AUTOFILL_PROPS = {
  autoComplete: "off",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
  "data-form-type": "other",
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
} as const;

type NoAutofillInputProps = ComponentProps<typeof Input>;

const NoAutofillInput = ({
  onFocus,
  onPointerDown,
  onMouseDown,
  readOnly,
  ...props
}: NoAutofillInputProps) => {
  const [locked, setLocked] = useState(true);

  const unlock = () => setLocked(false);

  return (
    <Input
      {...AUTH_NO_AUTOFILL_PROPS}
      {...props}
      readOnly={readOnly || locked}
      onFocus={(event) => {
        unlock();
        onFocus?.(event);
      }}
      onPointerDown={(event) => {
        unlock();
        onPointerDown?.(event);
      }}
      onMouseDown={(event) => {
        unlock();
        onMouseDown?.(event);
      }}
    />
  );
};

const AuthAutofillTrap = ({ scope }: { scope: string }) => (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden opacity-0"
  >
    <input tabIndex={-1} type="text" name={`${scope}-username`} autoComplete="username" defaultValue="" />
    <input tabIndex={-1} type="password" name={`${scope}-password`} autoComplete="current-password" defaultValue="" />
  </div>
);

interface AdminYandexDeliveryTestPickupPoint {
  id?: string;
  name?: string;
  address?: string;
  instruction?: string | null;
  distanceKm?: number | null;
  pointType?: string | null;
  availableForDropoff?: boolean | null;
  availableForC2cDropoff?: boolean | null;
  paymentMethods?: string[] | null;
  available?: boolean;
  estimatedCost?: number | null;
  deliveryDays?: number | null;
  error?: string | null;
}

interface AdminYandexDeliveryTestResult {
  provider?: string;
  currency?: string;
  toAddress?: string;
  homeDelivery?: AdminYandexDeliveryTestOption | null;
  pickupPointDelivery?: AdminYandexDeliveryTestPickupQuote | null;
  pickupPoints?: AdminYandexDeliveryTestPickupPoint[] | null;
  details?: {
    testEnvironment?: boolean;
    sourceStationId?: string | null;
    requestedWeightKg?: number | null;
    declaredCost?: number | null;
  } | null;
  checkedAtLabel: string;
}

interface AdminDatabaseBackupItem {
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  createdAt: number;
  trigger: string;
  downloadUrl?: string;
}

interface AdminDatabaseBackupsOverview {
  automaticEnabled: boolean;
  scheduleLocal: string;
  retentionDays: number;
  rootDirectory: string;
  timeZone: string;
  pgDumpCommand: string;
  items: AdminDatabaseBackupItem[];
}

interface AdminYooMoneyTestResult {
  provider?: string;
  paymentMethod?: string;
  paymentType?: string;
  requestedAmount?: number | null;
  chargeAmount?: number | null;
  expectedReceivedAmount?: number | null;
  walletNumber?: string | null;
  checkoutAction?: string | null;
  checkoutMethod?: string | null;
  checkoutFields?: Record<string, string> | null;
  tokenValid?: boolean;
  tokenDetail?: string | null;
  lastOperation?: {
    operationId?: string | null;
    status?: string | null;
    dateTime?: string | null;
    amount?: string | null;
    type?: string | null;
  } | null;
  note?: string | null;
  checkedAtLabel: string;
}

interface AdminYooKassaTestResult {
  provider?: string;
  mode?: string;
  testMode?: boolean;
  paymentMethod?: string | null;
  paymentType?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  detail?: string | null;
  paymentId?: string | null;
  confirmationUrl?: string | null;
  createdAt?: string | null;
  paid?: boolean | null;
  checkedAtLabel: string;
}

interface AdminExternalAuthTestStatus {
  kind: "info" | "running" | "success" | "error";
  message: string;
}

interface AdminExternalAuthTestSession {
  provider: "telegram" | "google" | "vk" | "yandex";
  kind: "telegram" | "external";
  state: string;
  expiresAt: number;
}

const TELEGRAM_BOT_LIMITS = {
  name: 64,
  username: 32,
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

const getDefaultTelegramReplyTemplateKey = () => DEFAULT_TELEGRAM_BOT_REPLY_TEMPLATES[0]?.key || "welcome";

const normalizeTelegramBotCommandsForForm = (commands?: TelegramBotCommand[] | null) => (
  Array.isArray(commands) && commands.length > 0
    ? commands.map((command) => ({
        command: String(command?.command || ""),
        description: String(command?.description || ""),
      }))
    : [createEmptyTelegramBotCommand()]
);

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

const createTelegramBotFormFromBot = (
  bot: TelegramBot,
  currentForm = getInitialTelegramBotForm()
) => ({
  ...currentForm,
  name: bot.name || "",
  description: bot.description || "",
  shortDescription: bot.shortDescription || "",
  imageUrl: bot.imageUrl || "",
  username: bot.username || currentForm.username || "",
  token: currentForm.token,
  tokenMasked: bot.tokenMasked || currentForm.tokenMasked || "",
  enabled: bot.enabled,
  updateMode: bot.updateMode === "webhook" ? "webhook" : "polling",
  useForLogin: !!bot.useForLogin,
  autoRepliesEnabled: bot.autoRepliesEnabled ?? true,
  commands: normalizeTelegramBotCommandsForForm(bot.commands),
  replyTemplates: cloneTelegramBotReplyTemplates(bot.replyTemplates),
});

const createTelegramBotCheckInfoFromBot = (bot?: TelegramBot | null): TelegramBotValidationInfo | null => {
  if (!bot) return null;

  const info =
    bot.botInfo && typeof bot.botInfo === "object"
      ? (bot.botInfo as TelegramBotValidationInfo)
      : null;

  return {
    ...info,
    id: info?.id ?? bot.id,
    username:
      typeof info?.username === "string" && info.username.trim()
        ? info.username.trim()
        : bot.username || null,
    name:
      typeof info?.name === "string" && info.name.trim()
        ? info.name
        : bot.name || "",
    description:
      typeof info?.description === "string"
        ? info.description
        : bot.description || "",
    shortDescription:
      typeof info?.shortDescription === "string"
        ? info.shortDescription
        : bot.shortDescription || null,
    commands: Array.isArray(info?.commands) ? info.commands : bot.commands || [],
    webhookInfo: info?.webhookInfo,
  };
};

const truncateTelegramPreviewText = (value?: string | null, limit = 96) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
};

const getTelegramBotValidationDisplayName = (info?: TelegramBotValidationInfo | null) => {
  if (!info) return "";

  const directName = typeof info.name === "string" ? info.name.trim() : "";
  if (directName) return directName;

  const nameParts = [info.firstName, info.lastName]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts.join(" ");
  }

  const legacyInfo = info as TelegramBotValidationInfo & { first_name?: string | null; last_name?: string | null };
  const legacyNameParts = [legacyInfo.first_name, legacyInfo.last_name]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return legacyNameParts.join(" ");
};

const getTelegramBotWebhookSummary = (info?: TelegramBotValidationInfo | null) => {
  const webhookInfo =
    info?.webhookInfo && typeof info.webhookInfo === "object"
      ? (info.webhookInfo as Record<string, unknown>)
      : null;
  if (!webhookInfo) return "";

  const parts: string[] = [];
  const url = typeof webhookInfo.url === "string" ? webhookInfo.url.trim() : "";
  const pending =
    typeof webhookInfo.pending_update_count === "number"
      ? webhookInfo.pending_update_count
      : typeof webhookInfo.pendingUpdateCount === "number"
        ? webhookInfo.pendingUpdateCount
        : null;
  const lastError =
    typeof webhookInfo.last_error_message === "string"
      ? webhookInfo.last_error_message.trim()
      : typeof webhookInfo.lastErrorMessage === "string"
        ? webhookInfo.lastErrorMessage.trim()
        : "";

  if (url) parts.push(`url: ${truncateTelegramPreviewText(url, 80)}`);
  if (pending !== null) parts.push(`pending: ${pending}`);
  if (lastError) parts.push(`error: ${truncateTelegramPreviewText(lastError, 80)}`);

  return parts.join(" | ");
};

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
  catalogImageUrl?: string;
  videos?: string[];
  media?: { type: "image" | "video"; url: string }[];
  sizes: string[];
  category?: string;
  categories?: string[];
  collections?: string[];
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
  reviewsEnabled?: boolean;
  sizeStock?: Record<string, number>;
  isHidden?: boolean;
  hiddenAt?: number | null;
}

interface AdminProductReview {
  id: string;
  author: string;
  text: string;
  media?: string[];
  createdAt?: number | null;
  editedAt?: number | null;
  isHidden?: boolean;
  hiddenAt?: number | null;
  isDeleted?: boolean;
  deletedAt?: number | null;
  deletedByRole?: string | null;
}

interface AdminUser {
  id: string;
  email: string;
  verified: boolean;
  isAdmin: boolean;
  isBlocked: boolean;
  isSystem: boolean;
  ordersCount?: number;
  createdAt?: string;
  profile?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
    nickname?: string | null;
    shippingAddress?: string | null;
    emailVerified?: boolean;
    phoneVerified?: boolean;
  } | null;
  externalIdentities?: Array<{
    provider?: string | null;
    providerEmail?: string | null;
    providerUsername?: string | null;
    displayName?: string | null;
    verifiedAt?: number | null;
    lastUsedAt?: number | null;
  }> | null;
}

interface AdminOrderPayment {
  id?: string;
  provider?: string;
  paymentMethod?: string;
  paymentType?: string;
  status?: string;
  currency?: string;
  requestedAmount?: number | null;
  chargeAmount?: number | null;
  expectedReceivedAmount?: number | null;
  receivedAmount?: number | null;
  actualWithdrawAmount?: number | null;
  label?: string | null;
  operationId?: string | null;
  notificationType?: string | null;
  sender?: string | null;
  expiresAt?: number | string | null;
  paidAt?: number | string | null;
  lastCheckedAt?: number | string | null;
  lastError?: string | null;
  receiverMasked?: string | null;
  canPay?: boolean;
  canRefresh?: boolean;
  needsAttention?: boolean;
  isExpired?: boolean;
}

interface AdminOrder {
  id: string;
  orderNumber?: number;
  displayOrderNumber?: string;
  userId: string;
  userEmail?: string;
  userProfile?: {
    name?: string | null;
    phone?: string | null;
    nickname?: string | null;
    shippingAddress?: string | null;
    phoneVerified?: boolean;
  } | null;
  totalAmount: number;
  shippingAmount?: number;
  promoCode?: string | null;
  promoDiscountAmount?: number | null;
  status: string;
  createdAt?: string | number;
  itemsJson?: string;
  items?: Array<{
    productId?: string;
    productName?: string | null;
    productImageUrl?: string | null;
    size?: string | null;
    quantity?: number;
    unitPrice?: number;
    lineTotal?: number;
  }> | unknown;
  paymentMethod?: string;
  purchaseChannel?: string;
  shippingMethod?: string;
  shippingProvider?: string | null;
  shippingTariff?: string | null;
  pickupPointId?: string | null;
  shippingProviderOrderId?: string | null;
  shippingTrackingNumber?: string | null;
  shippingTrackingUrl?: string | null;
  shippingStatus?: string | null;
  shippingStatusDescription?: string | null;
  shippingStatusUpdatedAt?: string | number | null;
  shippingLastSyncError?: string | null;
  yandexRequestId?: string | null;
  yandexDeliveryStatus?: string | null;
  yandexDeliveryStatusDescription?: string | null;
  yandexDeliveryStatusReason?: string | null;
  yandexDeliveryStatusUpdatedAt?: string | number | null;
  yandexDeliveryStatusSyncedAt?: string | number | null;
  yandexDeliveryTrackingUrl?: string | null;
  yandexPickupCode?: string | null;
  yandexDeliveryLastSyncError?: string | null;
  shippingAddress?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  statusHistoryJson?: string;
  updatedAt?: string | number;
  payment?: AdminOrderPayment | null;
}

interface OrderHistoryFieldChange {
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

interface OrderHistoryEntry {
  kind?: string;
  status?: string;
  changedAt?: string | number;
  changedBy?: string;
  comment?: string;
  fieldChanges?: OrderHistoryFieldChange[];
}

interface AdminSessionUser {
  id: string;
  email: string;
}

type OrderTableColumnId = "id" | "client" | "items" | "payment" | "delivery" | "status" | "amount" | "date" | "actions";

interface OrderTablePreferences {
  columnOrder: OrderTableColumnId[];
  hiddenColumns: OrderTableColumnId[];
  pageSize: number;
  columnWidths: Partial<Record<OrderTableColumnId, number>>;
}

interface OrderTableColumnDefinition {
  id: OrderTableColumnId;
  label: string;
  required?: boolean;
}

interface OrderFormChange {
  field: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
}

type OrderActionType = "cancel" | "delete";

interface OrderActionDialogState {
  open: boolean;
  action: OrderActionType;
  order: AdminOrder | null;
  submitting: boolean;
}

interface AdminUserEditForm {
  email: string;
  name: string;
  phone: string;
  nickname: string;
  shippingAddress: string;
  password: string;
}

interface AdminUserMergeForm {
  targetUserId: string;
  targetSearch: string;
  sourceUserIds: string[];
  sourceSearch: string;
  email: string;
  phone: string;
}

type SensitiveField = "email" | "phone" | "password";
interface GalleryImage {
  id: string;
  name: string;
  description?: string | null;
  url: string;
  fileSize: number;
  existsOnDisk: boolean;
  createdAt?: number;
}

interface GalleryImagesPage {
  items: GalleryImage[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

type CollectionPreviewMode = "gallery" | "products";

type GalleryPickerTarget =
  | { type: "product-media"; slot: number }
  | { type: "collection-create" }
  | { type: "collection-edit"; itemId: string };

type GalleryUploadStatus = "pending" | "uploading" | "success" | "error";

interface GalleryUploadItem {
  id: string;
  fileName: string;
  assignedName: string;
  description: string;
  fileSize: number;
  uploadedBytes: number;
  progressPercent: number;
  speedBytesPerSecond: number;
  status: GalleryUploadStatus;
  error?: string;
}

const EXTERNAL_PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  yandex: "Яндекс",
  vk: "VK",
  telegram: "Telegram",
};

type AdminContactOption = {
  value: string;
  verified: boolean;
  source: string;
};

const normalizeAdminComparable = (value?: string | null) => (value || "").trim().toLowerCase();
const normalizeAdminPhoneComparable = (value?: string | null) => (value || "").trim();

const getExternalProviderLabel = (provider?: string | null) => {
  const normalized = normalizeAdminComparable(provider);
  return EXTERNAL_PROVIDER_LABELS[normalized] || (provider || "").trim() || "Внешний вход";
};

const collectAdminUserEmailOptions = (user?: AdminUser | null): AdminContactOption[] => {
  if (!user) return [];

  const options = new Map<string, AdminContactOption>();
  const addOption = (value?: string | null, verified?: boolean, source?: string) => {
    const normalized = normalizeAdminComparable(value);
    if (!normalized) return;

    const existing = options.get(normalized);
    if (!existing) {
      options.set(normalized, {
        value: normalized,
        verified: Boolean(verified),
        source: source || "Аккаунт",
      });
      return;
    }

    existing.verified = existing.verified || Boolean(verified);
    if (source && !existing.source.includes(source)) {
      existing.source = `${existing.source}, ${source}`;
    }
  };

  addOption(user.email, user.verified, "Аккаунт");
  addOption(user.profile?.email, user.profile?.emailVerified, "Профиль");

  (user.externalIdentities || []).forEach((identity) => {
    addOption(identity.providerEmail, Boolean(identity.verifiedAt), getExternalProviderLabel(identity.provider));
  });

  return Array.from(options.values()).sort((left, right) => {
    if (left.verified !== right.verified) return left.verified ? -1 : 1;
    return left.value.localeCompare(right.value, "ru");
  });
};

const collectAdminUserPhoneOptions = (user?: AdminUser | null): AdminContactOption[] => {
  if (!user) return [];

  const value = normalizeAdminPhoneComparable(user.profile?.phone);
  if (!value) return [];

  return [
    {
      value,
      verified: Boolean(user.profile?.phoneVerified),
      source: "Профиль",
    },
  ];
};

const buildAdminUserDisplayName = (user?: AdminUser | null) => {
  if (!user) return "";

  const primaryEmail = normalizeAdminComparable(user.email) || normalizeAdminComparable(user.profile?.email);
  if (primaryEmail) return primaryEmail;

  const verifiedProviderEmail = collectAdminUserEmailOptions(user).find((item) => item.verified)?.value;
  if (verifiedProviderEmail) return verifiedProviderEmail;

  const nickname = (user.profile?.nickname || "").trim();
  if (nickname) return `@${nickname}`;

  return user.id;
};

const buildAdminUserSearchText = (user: AdminUser) => [
  user.email,
  user.profile?.email,
  user.profile?.name,
  user.profile?.nickname,
  user.profile?.phone,
  user.id,
  ...(user.externalIdentities || []).flatMap((identity) => [
    identity.provider,
    identity.providerEmail,
    identity.providerUsername,
    identity.displayName,
  ]),
].filter(Boolean).join(" ").toLowerCase();

const getMergeCandidateScore = (targetUser: AdminUser | null, candidate: AdminUser) => {
  if (!targetUser) return 0;

  const targetEmails = new Set(collectAdminUserEmailOptions(targetUser).map((item) => normalizeAdminComparable(item.value)));
  const targetPhones = new Set(collectAdminUserPhoneOptions(targetUser).map((item) => normalizeAdminPhoneComparable(item.value)));
  const candidateEmails = collectAdminUserEmailOptions(candidate).map((item) => normalizeAdminComparable(item.value));
  const candidatePhones = collectAdminUserPhoneOptions(candidate).map((item) => normalizeAdminPhoneComparable(item.value));

  let score = 0;
  if (candidateEmails.some((email) => email && targetEmails.has(email))) score += 4;
  if (candidatePhones.some((phone) => phone && targetPhones.has(phone))) score += 3;
  if (normalizeAdminComparable(candidate.profile?.nickname) && normalizeAdminComparable(candidate.profile?.nickname) === normalizeAdminComparable(targetUser.profile?.nickname)) score += 1;
  if (normalizeAdminComparable(candidate.profile?.name) && normalizeAdminComparable(candidate.profile?.name) === normalizeAdminComparable(targetUser.profile?.name)) score += 1;

  return score;
};

const choosePreferredMergeOption = (options: AdminContactOption[], preferredValue?: string | null) => {
  const normalizedPreferredEmail = normalizeAdminComparable(preferredValue);
  const normalizedPreferredPhone = normalizeAdminPhoneComparable(preferredValue);

  if (preferredValue) {
    const preferred = options.find((option) => option.value === normalizedPreferredPhone || option.value === normalizedPreferredEmail);
    if (preferred) return preferred.value;
  }

  return options.find((option) => option.verified)?.value || options[0]?.value || "";
};

const mergeAdminContactOptions = (
  users: Array<AdminUser | null | undefined>,
  collector: (user: AdminUser) => AdminContactOption[],
) => {
  const options = new Map<string, AdminContactOption>();

  users.filter(Boolean).forEach((user) => {
    collector(user as AdminUser).forEach((option) => {
      const existing = options.get(option.value);
      if (!existing) {
        options.set(option.value, { ...option });
        return;
      }

      existing.verified = existing.verified || option.verified;
      if (!existing.source.includes(option.source)) {
        existing.source = `${existing.source}, ${option.source}`;
      }
    });
  });

  return Array.from(options.values()).sort((left, right) => {
    if (left.verified !== right.verified) return left.verified ? -1 : 1;
    return left.value.localeCompare(right.value, "ru");
  });
};

const ORDER_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "processing", label: "В обработке" },
  { value: "created", label: "Оформлен" },
  { value: "paid", label: "Оплачен" },
  { value: "in_transit", label: "В пути" },
  { value: "delivered", label: "Доставлен" },
  { value: "completed", label: "Завершен" },
  { value: "canceled", label: "Отменен" },
  { value: "returned", label: "Возврат" },
];

ORDER_STATUS_OPTIONS.splice(1, 0, { value: "pending_payment", label: "Ожидает оплаты" });

const ORDER_STATUS_LABELS = Object.fromEntries(
  [...ORDER_STATUS_OPTIONS, { value: "cancelled", label: "Отменен" }].map((item) => [item.value, item.label])
) as Record<string, string>;

const TERMINAL_ORDER_STATUSES = new Set(["canceled", "returned"]);

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: "Оплата при получении",
  card: "Банковская карта",
  sbp: "СБП",
  cash: "Наличные",
};

Object.assign(PAYMENT_METHOD_LABELS, YOO_MONEY_PAYMENT_METHOD_LABELS);
Object.assign(PAYMENT_METHOD_LABELS, YOO_KASSA_PAYMENT_METHOD_LABELS);

const SHIPPING_METHOD_LABELS: Record<string, string> = {
  home: "До двери",
  pickup: "Пункт выдачи",
  self_pickup: "Самовывоз",
};

const SHIPPING_PROVIDER_LABELS: Record<string, string> = {
  yandex_delivery: "Яндекс Доставка",
  yandex: "Яндекс Доставка",
  cdek: "СДЭК",
  russian_post: "Почта России",
  avito: "Avito",
  self_pickup: "Самовывоз",
};

const PURCHASE_CHANNEL_LABELS: Record<string, string> = {
  web: "Сайт",
  mobile: "Мобильное приложение",
  admin: "Администратор",
};

const ORDER_HISTORY_FIELD_LABELS: Record<string, string> = {
  status: "Статус",
  paymentMethod: "Способ оплаты",
  purchaseChannel: "Канал заказа",
  shippingMethod: "Способ доставки",
  shippingProvider: "Служба доставки",
  shippingTariff: "Тариф доставки",
  shippingAmount: "Стоимость доставки",
  pickupPointId: "ID ПВЗ",
  shippingProviderOrderId: "ID отправления",
  shippingTrackingNumber: "Трек-номер",
  shippingStatus: "Статус доставки",
  yandexRequestId: "ID заявки Яндекс.Доставки",
  customerName: "Получатель",
  customerEmail: "Email",
  customerPhone: "Телефон",
  shippingAddress: "Адрес доставки",
  totalAmount: "Сумма",
};

const ORDER_TABLE_COLUMNS: OrderTableColumnDefinition[] = [
  { id: "id", label: "№ заказа" },
  { id: "client", label: "Клиент" },
  { id: "items", label: "Товары" },
  { id: "payment", label: "Оплата" },
  { id: "delivery", label: "Доставка" },
  { id: "status", label: "Статус" },
  { id: "amount", label: "Сумма" },
  { id: "date", label: "Дата" },
  { id: "actions", label: "Действия", required: true },
];

const ORDER_TABLE_COLUMN_MIN_WIDTHS: Record<OrderTableColumnId, number> = {
  id: 150,
  client: 220,
  items: 280,
  payment: 170,
  delivery: 220,
  status: 130,
  amount: 120,
  date: 170,
  actions: 150,
};

const ORDER_TABLE_COLUMN_DEFAULT_WIDTHS: Record<OrderTableColumnId, number> = {
  id: 190,
  client: 260,
  items: 360,
  payment: 200,
  delivery: 250,
  status: 150,
  amount: 140,
  date: 190,
  actions: 150,
};

const ORDER_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const ADMIN_ORDER_TABLE_PREFERENCE_KEY = "orders_table_layout";
const ORDER_TABLE_COLUMN_MAX_WIDTH = 720;
const ORDER_STATUS_ROW_COLOR_SETTING_KEYS: Record<string, string> = {
  processing: "admin_orders_row_color_processing",
  created: "admin_orders_row_color_created",
  paid: "admin_orders_row_color_paid",
  in_transit: "admin_orders_row_color_in_transit",
  delivered: "admin_orders_row_color_delivered",
  completed: "admin_orders_row_color_completed",
  canceled: "admin_orders_row_color_canceled",
  returned: "admin_orders_row_color_returned",
};

const createDefaultOrderTableColumnWidths = () =>
  Object.fromEntries(ORDER_TABLE_COLUMNS.map((column) => [column.id, ORDER_TABLE_COLUMN_DEFAULT_WIDTHS[column.id]])) as Record<OrderTableColumnId, number>;

const clampOrderTableColumnWidth = (columnId: OrderTableColumnId, rawValue: number) => {
  const minWidth = ORDER_TABLE_COLUMN_MIN_WIDTHS[columnId] ?? 120;
  const safeValue = Number.isFinite(rawValue) ? Math.round(rawValue) : minWidth;
  return Math.min(ORDER_TABLE_COLUMN_MAX_WIDTH, Math.max(minWidth, safeValue));
};

const createDefaultOrderTablePreferences = (): OrderTablePreferences => ({
  columnOrder: ORDER_TABLE_COLUMNS.map((column) => column.id),
  hiddenColumns: [],
  pageSize: ORDER_PAGE_SIZE_OPTIONS[0],
  columnWidths: createDefaultOrderTableColumnWidths(),
});

const sanitizeOrderTablePreferences = (raw: unknown): OrderTablePreferences => {
  const defaults = createDefaultOrderTablePreferences();
  const knownIds = new Set<OrderTableColumnId>(defaults.columnOrder);
  const requiredIds = new Set<OrderTableColumnId>(ORDER_TABLE_COLUMNS.filter((column) => column.required).map((column) => column.id));
  const parsed = (() => {
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    return raw;
  })() as Partial<OrderTablePreferences> | null;

  const preferredOrder = Array.isArray(parsed?.columnOrder)
    ? parsed.columnOrder.filter((columnId): columnId is OrderTableColumnId => knownIds.has(columnId as OrderTableColumnId))
    : [];
  const columnOrder = [...preferredOrder, ...defaults.columnOrder.filter((columnId) => !preferredOrder.includes(columnId))];
  const hiddenColumns = Array.isArray(parsed?.hiddenColumns)
    ? parsed.hiddenColumns.filter((columnId): columnId is OrderTableColumnId => knownIds.has(columnId as OrderTableColumnId) && !requiredIds.has(columnId as OrderTableColumnId))
    : [];
  const pageSize = ORDER_PAGE_SIZE_OPTIONS.includes(parsed?.pageSize as (typeof ORDER_PAGE_SIZE_OPTIONS)[number])
    ? Number(parsed?.pageSize)
    : defaults.pageSize;
  const columnWidths = defaults.columnOrder.reduce((result, columnId) => {
    const rawWidth = parsed?.columnWidths?.[columnId];
    result[columnId] = clampOrderTableColumnWidth(columnId, Number(rawWidth ?? defaults.columnWidths[columnId]));
    return result;
  }, {} as Record<OrderTableColumnId, number>);

  return {
    columnOrder,
    hiddenColumns,
    pageSize,
    columnWidths,
  };
};

const normalizeHexColorSetting = (value?: string | null) => {
  const normalized = (value || "").trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
    return "";
  }

  if (normalized.length === 4) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`.toLowerCase();
  }

  return normalized.toLowerCase();
};

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = normalizeHexColorSetting(hex);
  if (!normalized) return "";

  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const parseOrderItems = (raw: any) => {
  try {
    const source = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(source) ? source : [];
  } catch {
    return [];
  }
};

const parseOrderHistory = (raw: any): OrderHistoryEntry[] => {
  try {
    const source = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(source) ? source : [];
  } catch {
    return [];
  }
};

type EmailTemplateKey =
  | "password_reset"
  | "order_created"
  | "order_shipped"
  | "order_status_changed"
  | "email_confirmation"
  | "telegram_connected";

interface EmailTemplateDefinition {
  key: EmailTemplateKey;
  label: string;
  description: string;
  placeholders: string[];
  enabledByDefault: boolean;
  defaultSubject: string;
  defaultBody: string;
}

type SmtpSecurityMode = "auto" | "none" | "starttls" | "ssl_on_connect";

const SMTP_SECURITY_MODE_OPTIONS: Array<{ value: SmtpSecurityMode; label: string; description: string }> = [
  { value: "auto", label: "Авто", description: "Пробует подобрать режим по порту и ответу сервера." },
  { value: "starttls", label: "STARTTLS", description: "Обычно используется на порту 587." },
  { value: "ssl_on_connect", label: "SSL/TLS при подключении", description: "Обычно используется на порту 465." },
  { value: "none", label: "Без шифрования", description: "Только если ваш SMTP-сервер принимает обычное соединение." },
];

const normalizeSmtpSecurityMode = (value: string | undefined, port: string | undefined, useSslFallback: boolean): SmtpSecurityMode => {
  switch ((value || "").trim().toLowerCase()) {
    case "auto":
    case "none":
    case "starttls":
    case "ssl_on_connect":
      return (value || "").trim().toLowerCase() as SmtpSecurityMode;
    default:
      if (!useSslFallback) {
        return "none";
      }

      return (port || "").trim() === "465" ? "ssl_on_connect" : "starttls";
  }
};

const EMAIL_TEMPLATE_DEFINITIONS: EmailTemplateDefinition[] = [
  {
    key: "password_reset",
    label: "Сброс пароля",
    description: "Письмо с кодом для восстановления доступа.",
    placeholders: ["{{site_title}}", "{{code}}", "{{ttl_minutes}}", "{{user_email}}", "{{current_date_time}}"],
    enabledByDefault: true,
    defaultSubject: "Сброс пароля — {{site_title}}",
    defaultBody: "Здравствуйте!\n\nВы запросили сброс пароля на сайте {{site_title}}.\n\nКод для сброса пароля: {{code}}\nКод действует {{ttl_minutes}} минут.\n\nЕсли это были не вы, просто проигнорируйте это письмо."
  },
  {
    key: "order_created",
    label: "Создание заказа",
    description: "Уведомление клиенту после оформления заказа.",
    placeholders: ["{{site_title}}", "{{order_number}}", "{{customer_name}}", "{{total_amount}}", "{{payment_method_label}}", "{{shipping_address}}", "{{order_items}}"],
    enabledByDefault: true,
    defaultSubject: "Заказ {{order_number}} создан",
    defaultBody: "Здравствуйте, {{customer_name}}!\n\nВаш заказ {{order_number}} успешно создан на сайте {{site_title}}.\n\nСумма: {{total_amount}}\nСпособ оплаты: {{payment_method_label}}\nАдрес доставки: {{shipping_address}}\n\nСостав заказа:\n{{order_items}}\n\nМы сообщим вам, когда статус заказа изменится."
  },
  {
    key: "order_shipped",
    label: "Отправка заказа",
    description: "Письмо, когда заказ передан в доставку.",
    placeholders: ["{{order_number}}", "{{customer_name}}", "{{order_status_label}}", "{{shipping_address}}", "{{manager_comment}}"],
    enabledByDefault: true,
    defaultSubject: "Заказ {{order_number}} передан в доставку",
    defaultBody: "Здравствуйте, {{customer_name}}!\n\nЗаказ {{order_number}} передан в доставку.\n\nТекущий статус: {{order_status_label}}\nАдрес доставки: {{shipping_address}}\nКомментарий менеджера: {{manager_comment}}\n\nСпасибо, что выбрали {{site_title}}."
  },
  {
    key: "order_status_changed",
    label: "Смена статуса заказа",
    description: "Общее письмо о смене статуса заказа.",
    placeholders: ["{{order_number}}", "{{customer_name}}", "{{previous_order_status_label}}", "{{order_status_label}}", "{{manager_comment}}", "{{order_items}}"],
    enabledByDefault: true,
    defaultSubject: "Статус заказа {{order_number}} обновлён",
    defaultBody: "Здравствуйте, {{customer_name}}!\n\nСтатус заказа {{order_number}} изменён.\n\nБыло: {{previous_order_status_label}}\nСтало: {{order_status_label}}\nКомментарий менеджера: {{manager_comment}}\n\nАктуальный состав заказа:\n{{order_items}}"
  },
  {
    key: "email_confirmation",
    label: "Подтверждение email",
    description: "Письмо с кодом подтверждения email.",
    placeholders: ["{{site_title}}", "{{code}}", "{{ttl_minutes}}", "{{user_email}}", "{{current_date_time}}"],
    enabledByDefault: true,
    defaultSubject: "Подтверждение email — {{site_title}}",
    defaultBody: "Здравствуйте!\n\nКод подтверждения email для сайта {{site_title}}: {{code}}\nКод действует {{ttl_minutes}} минут.\n\nEmail: {{user_email}}"
  },
  {
    key: "telegram_connected",
    label: "Подключение Telegram",
    description: "Уведомление о подключении Telegram-аккаунта.",
    placeholders: ["{{user_email}}", "{{telegram_id}}", "{{telegram_username}}", "{{connected_at}}", "{{current_date_time}}"],
    enabledByDefault: false,
    defaultSubject: "Telegram подключён к вашему профилю",
    defaultBody: "Здравствуйте!\n\nК вашему профилю {{user_email}} подключён Telegram-аккаунт.\n\nTelegram ID: {{telegram_id}}\nUsername: {{telegram_username}}\nДата подключения: {{connected_at}}"
  }
];

const getEmailTemplateSettingKey = (templateKey: EmailTemplateKey, field: "enabled" | "subject" | "body") =>
  `email_template_${templateKey}_${field}`;

const EMAIL_TEMPLATE_SETTING_DEFAULTS = Object.fromEntries(
  EMAIL_TEMPLATE_DEFINITIONS.flatMap((template) => ([
    [getEmailTemplateSettingKey(template.key, "enabled"), template.enabledByDefault ? "true" : "false"],
    [getEmailTemplateSettingKey(template.key, "subject"), template.defaultSubject],
    [getEmailTemplateSettingKey(template.key, "body"), template.defaultBody],
  ]))
) as Record<string, string>;


type DictionaryKind = "sizes" | "materials" | "colors" | "categories" | "collections";

const ADMIN_NAVIGATION_STORAGE_KEY = "fashion_demon_admin_navigation_v1";
const ADMIN_TAB_VALUES = ["products", "analytics", "orders", "users", "gallery", "dictionaries", "settings"] as const;
const SETTINGS_GROUP_VALUES = ["orders", "auth", "account-merge", "promo-codes", "smtp", "metrics", "integrations", "legal", "backup", "general"] as const;
const GENERAL_SETTINGS_CATALOG_VALUES = ["branding", "catalog-card", "catalog-page", "product-page", "social-links", "upload-media"] as const;
const INTEGRATION_CATALOG_VALUES = ["telegram", "yoomoney", "yookassa", "robokassa", "dadata", "yandex", "cdek", "russian-post", "avito"] as const;
const DICTIONARY_GROUP_VALUES = ["sizes", "materials", "colors", "categories", "collections"] as const;

const DEFAULT_ADMIN_NAVIGATION_STATE = {
  adminTab: "products",
  settingsGroup: "auth",
  generalSettingsCatalog: "branding",
  integrationCatalog: "telegram",
  dictionaryGroup: "sizes" as DictionaryKind,
} as const;

const normalizeAdminNavigationValue = (
  value: unknown,
  allowedValues: readonly string[],
  fallback: string,
) => {
  const normalized = String(value ?? "").trim();
  return allowedValues.includes(normalized) ? normalized : fallback;
};

const readPersistedAdminNavigationState = () => {
  if (typeof window === "undefined") {
    return DEFAULT_ADMIN_NAVIGATION_STATE;
  }

  try {
    const rawValue = window.localStorage.getItem(ADMIN_NAVIGATION_STORAGE_KEY);
    if (!rawValue) {
      return DEFAULT_ADMIN_NAVIGATION_STATE;
    }

    const parsedValue = JSON.parse(rawValue) as Record<string, unknown>;
    return {
      adminTab: normalizeAdminNavigationValue(parsedValue?.adminTab, ADMIN_TAB_VALUES, DEFAULT_ADMIN_NAVIGATION_STATE.adminTab),
      settingsGroup: normalizeAdminNavigationValue(parsedValue?.settingsGroup, SETTINGS_GROUP_VALUES, DEFAULT_ADMIN_NAVIGATION_STATE.settingsGroup),
      generalSettingsCatalog: normalizeAdminNavigationValue(parsedValue?.generalSettingsCatalog, GENERAL_SETTINGS_CATALOG_VALUES, DEFAULT_ADMIN_NAVIGATION_STATE.generalSettingsCatalog),
      integrationCatalog: normalizeAdminNavigationValue(parsedValue?.integrationCatalog, INTEGRATION_CATALOG_VALUES, DEFAULT_ADMIN_NAVIGATION_STATE.integrationCatalog),
      dictionaryGroup: normalizeAdminNavigationValue(parsedValue?.dictionaryGroup, DICTIONARY_GROUP_VALUES, DEFAULT_ADMIN_NAVIGATION_STATE.dictionaryGroup) as DictionaryKind,
    };
  } catch {
    window.localStorage.removeItem(ADMIN_NAVIGATION_STORAGE_KEY);
    return DEFAULT_ADMIN_NAVIGATION_STATE;
  }
};

const formatDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getRelativeDateInputValue = (daysOffset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return formatDateInputValue(date);
};

const persistAdminNavigationState = (state: typeof DEFAULT_ADMIN_NAVIGATION_STATE) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(ADMIN_NAVIGATION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write failures and keep admin usable.
  }
};

interface DictionaryItem {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
  imageUrl?: string | null;
  previewMode?: CollectionPreviewMode;
  description?: string | null;
  isActive?: boolean;
  showInCatalogFilter?: boolean;
  showColorInCatalog?: boolean;
  sortOrder?: number;
  createdAt?: number;
  isUsed?: boolean;
}

interface DictionaryDraft {
  name: string;
  slug: string;
  color: string;
  imageUrl: string;
  previewMode: CollectionPreviewMode;
  description: string;
  isActive: boolean;
  showInCatalogFilter: boolean;
  showColorInCatalog: boolean;
  sortOrder: string;
}

interface DictionaryDeleteDialogState {
  open: boolean;
  kind: DictionaryKind;
  item: DictionaryItem | null;
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

interface DictionaryCreateDialogState {
  open: boolean;
  kind: DictionaryKind;
  submitting: boolean;
  attachToProduct: boolean;
  name: string;
  slug: string;
  color: string;
  imageUrl: string;
  previewMode: CollectionPreviewMode;
  description: string;
  showColorInCatalog: boolean;
  sortOrder: string;
}

interface MediaDeleteDialogState {
  open: boolean;
  slot: number | null;
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

const createEmptyProductForm = () => ({
  name: "",
  slug: "",
  description: "",
  basePrice: "",
  discountPercent: "0",
  discountedPrice: "",
  categories: [] as string[],
  collections: [] as string[],
  images: "",
  videos: "",
  media: [{ type: "image" as const, url: "" }],
  catalogImageUrl: "",
  sizes: [] as string[],
  isNew: false,
  isPopular: false,
  reviewsEnabled: true,
  sku: "",
  materials: [] as string[],
  printType: "",
  fit: "",
  gender: "",
  colors: [] as string[],
  shipping: "",
  sizeStock: {} as Record<string, number>
});

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

const getProductSizeNames = (product: Pick<Product, "sizes" | "sizeStock">) =>
  normalizeDictionaryValues([...(product.sizes || []), ...Object.keys(product.sizeStock || {})]);

const normalizeDictionaryUsageKey = (value?: string | null) => value?.trim().toLowerCase() || "";

const resolveCatalogImageUrl = (
  media: { type: "image" | "video"; url: string }[],
  preferredUrl?: string | null,
) => {
  const imageUrls = media
    .filter((item) => item.type === "image" && item.url.trim())
    .map((item) => item.url.trim());

  if (imageUrls.length === 0) return "";

  const normalizedPreferredUrl = preferredUrl?.trim();
  if (normalizedPreferredUrl && imageUrls.includes(normalizedPreferredUrl)) {
    return normalizedPreferredUrl;
  }

  return imageUrls[0];
};

const hasConfiguredValue = (value?: string | null) => String(value || "").trim().length > 0;

const getExternalAuthCallbackUrl = (provider: "google" | "vk" | "yandex") => {
  if (typeof window === "undefined") {
    return `/api/auth/external/callback/${provider}`;
  }

  try {
    const apiUrl = import.meta.env.VITE_API_URL || "/api";
    const parsed = new URL(apiUrl, window.location.origin);
    const normalizedPath = parsed.pathname.endsWith("/")
      ? parsed.pathname.slice(0, -1)
      : parsed.pathname;
    return `${parsed.origin}${normalizedPath}/auth/external/callback/${provider}`;
  } catch {
    return `${window.location.origin}/api/auth/external/callback/${provider}`;
  }
};


const DEFAULT_APP_SETTINGS: Record<string, string> = {
  storeName: "",
  site_title: "fashiondemon",
  site_favicon_url: "",
  site_loading_animation_enabled: "true",
  social_links_config_json: DEFAULT_SITE_SOCIAL_LINKS_CONFIG_JSON,
  product_card_background_mode: "standard",
  product_card_background_color: "#e9e3da",
  product_card_image_fit_mode: "contain",
  product_detail_background_mode: "standard",
  product_detail_background_color: "#e9e3da",
  product_detail_image_fit_mode: "contain",
  product_detail_media_size_mode: "compact",
  privacy_policy: PRIVACY_POLICY,
  user_agreement: USER_AGREEMENT,
  public_offer: PUBLIC_OFFER,
  return_policy: RETURN_POLICY,
  cookie_consent_text: COOKIE_CONSENT_TEXT,
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
  smtp_security_mode: "auto",
  smtp_use_ssl: "true",
  ...EMAIL_TEMPLATE_SETTING_DEFAULTS,
  metrics_yandex_metrika_enabled: "false",
  metrics_yandex_metrika_code: "",
  metrics_google_analytics_enabled: "false",
  metrics_google_analytics_code: "",
  metrics_vk_pixel_enabled: "false",
  metrics_vk_pixel_code: "",
  telegram_login_enabled: "false",
  telegram_widget_enabled: "false",
  telegram_bot_username: "",
  telegram_bot_token: "",
  telegram_gateway_enabled: "false",
  telegram_gateway_api_token: "",
  telegram_gateway_sender_username: "",
  telegram_gateway_code_length: "6",
  telegram_gateway_ttl_seconds: "300",
  google_login_enabled: "false",
  google_auth_client_id: "",
  google_auth_client_secret: "",
  vk_login_enabled: "false",
  vk_auth_client_id: "",
  vk_auth_client_secret: "",
  yandex_login_enabled: "false",
  yandex_auth_client_id: "",
  yandex_auth_client_secret: "",
  payments_yoomoney_enabled: "false",
  yoomoney_wallet_number: "",
  yoomoney_notification_secret: "",
  yoomoney_access_token: "",
  yoomoney_label_prefix: "FD",
  yoomoney_payment_timeout_minutes: "30",
  yoomoney_allow_bank_cards: "true",
  yoomoney_allow_wallet: "true",
  payments_yookassa_enabled: "false",
  yookassa_shop_id: "",
  yookassa_secret_key: "",
  yookassa_test_mode: "true",
  yookassa_label_prefix: "YK",
  yookassa_payment_timeout_minutes: "60",
  yookassa_allow_bank_cards: "true",
  yookassa_allow_sbp: "true",
  yookassa_allow_yoomoney: "true",
  payments_robokassa_enabled: "false",
  robokassa_merchant_login: "",
  robokassa_password1: "",
  robokassa_password2: "",
  robokassa_test_password1: "",
  robokassa_test_password2: "",
  robokassa_test_mode: "true",
  robokassa_label_prefix: "FD",
  robokassa_payment_timeout_minutes: "60",
  robokassa_currency_label: "",
  robokassa_payment_methods: "",
  robokassa_receipt_enabled: "false",
  robokassa_receipt_tax: "none",
  robokassa_tax_system: "osn",
  catalog_filter_categories_enabled: "true",
  catalog_filter_sizes_enabled: "true",
  catalog_filter_materials_enabled: "true",
  catalog_filter_colors_enabled: "true",
  catalog_filter_collections_enabled: "true",
  catalog_filter_categories_show_color: "true",
  catalog_filter_sizes_show_color: "true",
  catalog_filter_materials_show_color: "true",
  catalog_filter_colors_show_color: "true",
  catalog_filter_collections_show_color: "true",
  catalog_filter_categories_order: "10",
  catalog_filter_sizes_order: "20",
  catalog_filter_materials_order: "30",
  catalog_filter_colors_order: "40",
  catalog_filter_collections_order: "50",
  catalog_collections_slider_enabled: "true",
  catalog_collections_slider_title: "Коллекции",
  catalog_collections_slider_description: "",
  admin_orders_row_color_processing: "#e5e7eb",
  admin_orders_row_color_pending_payment: "#fef3c7",
  admin_orders_row_color_created: "#e0f2fe",
  admin_orders_row_color_paid: "#dbeafe",
  admin_orders_row_color_in_transit: "#dbeafe",
  admin_orders_row_color_delivered: "#dcfce7",
  admin_orders_row_color_completed: "#bbf7d0",
  admin_orders_row_color_canceled: "#fee2e2",
  admin_orders_row_color_returned: "#ffedd5",
  dadata_api_key: "",
  yandex_delivery_enabled: "true",
  yandex_delivery_use_test_environment: "false",
  yandex_delivery_api_token: "",
  yandex_delivery_source_station_id: "",
  yandex_delivery_package_length_cm: "30",
  yandex_delivery_package_height_cm: "20",
  yandex_delivery_package_width_cm: "10",
  delivery_cdek_enabled: "false",
  delivery_cdek_use_test_environment: "true",
  delivery_cdek_account: "",
  delivery_cdek_password: "",
  delivery_cdek_from_postal_code: "630099",
  delivery_cdek_package_length_cm: "30",
  delivery_cdek_package_height_cm: "20",
  delivery_cdek_package_width_cm: "10",
  delivery_russian_post_enabled: "false",
  delivery_russian_post_access_token: "",
  delivery_russian_post_authorization_key: "",
  delivery_russian_post_from_postal_code: "630099",
  delivery_russian_post_mail_type: "POSTAL_PARCEL",
  delivery_russian_post_mail_category: "ORDINARY",
  delivery_russian_post_dimension_type: "PACK",
  delivery_russian_post_package_length_cm: "30",
  delivery_russian_post_package_height_cm: "20",
  delivery_russian_post_package_width_cm: "10",
  delivery_avito_enabled: "false",
  delivery_avito_client_id: "",
  delivery_avito_client_secret: "",
  delivery_avito_scope: "items:info",
  delivery_avito_warehouse_address: "",
  delivery_avito_notes: "",
  database_backup_enabled: "true",
  database_backup_schedule_local: "03:00,15:00",
  database_backup_retention_days: "14",
  ...IMAGE_UPLOAD_SETTING_DEFAULTS
};

const LEGAL_SETTING_KEYS = [
  "privacy_policy",
  "user_agreement",
  "public_offer",
  "return_policy",
  "cookie_consent_text",
] as const;

const mergeSettingsWithDefaults = (rawSettings?: Record<string, string> | null) => {
  const mergedSettings = { ...DEFAULT_APP_SETTINGS, ...(rawSettings || {}) };

  for (const key of LEGAL_SETTING_KEYS) {
    if (!String(mergedSettings[key] ?? "").trim()) {
      mergedSettings[key] = DEFAULT_APP_SETTINGS[key];
    }
  }

  return mergedSettings;
};

const YANDEX_TEST_SOURCE_STATION_ID = "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924";

type YandexSourceStationPreset = {
  id: string;
  label: string;
  address: string;
  mode: "test" | "live";
};

const YANDEX_SOURCE_STATION_PRESETS: YandexSourceStationPreset[] = [
  {
    id: YANDEX_TEST_SOURCE_STATION_ID,
    label: "Тестовый контур Яндекса",
    address: "Demo station из документации Яндекс.Доставки",
    mode: "test",
  },
  {
    id: "0198ebbcd65571f5b61e3cdb57f253c0",
    label: "Новосибирск",
    address: "пер. Архонский, д. 2А, корп. 6",
    mode: "live",
  },
  {
    id: "71fe4a70-677d-44ee-adf1-6e8b9320bb08",
    label: "Томск",
    address: "ул. Мокрушина, д. 9, стр. 21",
    mode: "live",
  },
  {
    id: "019a2a19d7927402abdab92f025774b1",
    label: "Омск",
    address: "ул. 22 Декабря, д. 108А",
    mode: "live",
  },
  {
    id: "b07a534a-f6d6-40c8-963b-3930146a81ab",
    label: "Барнаул",
    address: "ул. Чернышевского, д. 293Б",
    mode: "live",
  },
  {
    id: "8197a006-ff4f-444b-9ea4-7df14dc54a22",
    label: "Красноярск",
    address: "ул. Промысловая, д. 41А",
    mode: "live",
  },
  {
    id: "dbee4575-9a39-4d34-a1c3-2594d97ee2fd",
    label: "Екатеринбург",
    address: "Серовский тракт, 11-й километр, д. 5",
    mode: "live",
  },
  {
    id: "3c528302-17d0-48a7-a7cd-c6f4c69ccc69",
    label: "Казань",
    address: "с. Столбище, ул. Почтовая, д. 1",
    mode: "live",
  },
  {
    id: "0262bd9d-5837-4209-8f09-e3217a765198",
    label: "Москва (Строгино)",
    address: "ул. 2-я Лыковская, д. 63, стр. 6",
    mode: "live",
  },
  {
    id: "f43a9f99-212a-44fe-acf3-54541401773b",
    label: "Москва (Царицыно)",
    address: "Промышленная ул., 12А",
    mode: "live",
  },
  {
    id: "d544c95c-d47d-4054-9d55-e85c3db7e523",
    label: "Санкт-Петербург (Бугры)",
    address: "Порошкино, ул. 23 км КАД, стр. 3",
    mode: "live",
  },
  {
    id: "434f9528-944e-4c4d-9464-ac7a0acf3942",
    label: "Санкт-Петербург (Троицкий)",
    address: "ул. Запорожская, д. 12, стр. 1",
    mode: "live",
  },
];

const DICTIONARY_FILTER_SETTING_KEYS: Partial<Record<DictionaryKind, string>> = {
  categories: "catalog_filter_categories_enabled",
  sizes: "catalog_filter_sizes_enabled",
  materials: "catalog_filter_materials_enabled",
  colors: "catalog_filter_colors_enabled",
  collections: "catalog_filter_collections_enabled"
};

const DICTIONARY_FILTER_ORDER_SETTING_KEYS: Record<DictionaryKind, string> = {
  categories: "catalog_filter_categories_order",
  sizes: "catalog_filter_sizes_order",
  materials: "catalog_filter_materials_order",
  colors: "catalog_filter_colors_order",
  collections: "catalog_filter_collections_order"
};

const DICTIONARY_FILTER_COLOR_SETTING_KEYS: Record<DictionaryKind, string> = {
  categories: "catalog_filter_categories_show_color",
  sizes: "catalog_filter_sizes_show_color",
  materials: "catalog_filter_materials_show_color",
  colors: "catalog_filter_colors_show_color",
  collections: "catalog_filter_collections_show_color"
};

const PRODUCT_CARD_SETTINGS_PREVIEW_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 300">
  <rect width="220" height="300" fill="#ffffff"/>
  <g>
    <path d="M76 48h68l14 20 26 20-18 134H54L36 88l26-20z" fill="#171717"/>
    <path d="M70 61h80l-8 22H78z" fill="#2a2a2a"/>
    <path d="M84 52h18v20H84zM118 52h18v20h-18z" fill="#e53935"/>
    <path d="M50 96l14-10 18 28-18 88H44z" fill="#101010"/>
    <path d="M170 96l-14-10-18 28 18 88h20z" fill="#101010"/>
    <path d="M128 104c18 0 32 12 32 28s-16 34-34 34c-5 0-9 7-3 16l-10 7c-12-13-15-22-13-31 2-10 11-19 18-22-12-3-18-10-18-20 0-13 11-24 28-24z" fill="#ff4338"/>
    <path d="M60 120c10 14 10 30 0 48" stroke="#ff4338" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M160 120c-10 14-10 30 0 48" stroke="#ff4338" stroke-width="10" fill="none" stroke-linecap="round"/>
  </g>
</svg>
`)}`;

export default function AdminPage({ embedded = false }: { embedded?: boolean }) {
  const confirmAction = useConfirmDialog();
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [adminUser, setAdminUser] = useState<AdminSessionUser | null>(null);
  const [stockHistory, setStockHistory] = useState<StockHistoryEntry[]>([]);
  const [usersSearch, setUsersSearch] = useState("");
  const [usersRoleFilter, setUsersRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [usersStatusFilter, setUsersStatusFilter] = useState<"all" | "active" | "blocked">("all");
  const [usersPage, setUsersPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isUserEditModalOpen, setIsUserEditModalOpen] = useState(false);
  const [userEditForm, setUserEditForm] = useState<AdminUserEditForm>({ email: "", name: "", phone: "", nickname: "", shippingAddress: "", password: "" });
  const [userEditSaving, setUserEditSaving] = useState(false);
  const [userMergeForm, setUserMergeForm] = useState<AdminUserMergeForm>({
    targetUserId: "",
    targetSearch: "",
    sourceUserIds: [],
    sourceSearch: "",
    email: "",
    phone: "",
  });
  const [userMergeSaving, setUserMergeSaving] = useState(false);
  const [pendingSensitiveFields, setPendingSensitiveFields] = useState<SensitiveField[]>([]);
  const [isSensitiveConfirmOpen, setIsSensitiveConfirmOpen] = useState(false);
  const [telegramBots, setTelegramBots] = useState<TelegramBot[]>([]);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [smtpTestEmail, setSmtpTestEmail] = useState("");
  const [smtpTestSending, setSmtpTestSending] = useState(false);
  const [yoomoneyTestAmount, setYoomoneyTestAmount] = useState("100");
  const [yoomoneyTestMethod, setYoomoneyTestMethod] = useState("yoomoney_card");
  const [yoomoneyTestRunning, setYoomoneyTestRunning] = useState(false);
  const [yoomoneyTestError, setYoomoneyTestError] = useState("");
  const [yoomoneyTestResult, setYoomoneyTestResult] = useState<AdminYooMoneyTestResult | null>(null);
  const [yookassaTestAmount, setYookassaTestAmount] = useState("100");
  const [yookassaTestMethod, setYookassaTestMethod] = useState("yookassa_card");
  const [yookassaTestRunning, setYookassaTestRunning] = useState(false);
  const [yookassaTestError, setYookassaTestError] = useState("");
  const [yookassaTestResult, setYookassaTestResult] = useState<AdminYooKassaTestResult | null>(null);
  const [yandexDeliveryTestAddress, setYandexDeliveryTestAddress] = useState("630099, Новосибирск, Красный проспект, 25");
  const [yandexDeliveryTestWeightKg, setYandexDeliveryTestWeightKg] = useState("0.300");
  const [yandexDeliveryTestDeclaredCost, setYandexDeliveryTestDeclaredCost] = useState("1000");
  const [yandexDeliveryTestRunning, setYandexDeliveryTestRunning] = useState(false);
  const [yandexDeliveryTestError, setYandexDeliveryTestError] = useState("");
  const [yandexDeliveryTestResult, setYandexDeliveryTestResult] = useState<AdminYandexDeliveryTestResult | null>(null);
  const [yandexDeliveryPointSearchQuery, setYandexDeliveryPointSearchQuery] = useState("630099, Новосибирск, Красный проспект, 25");
  const [yandexDeliveryPointSearchType, setYandexDeliveryPointSearchType] = useState("warehouse");
  const [yandexDeliveryPointSearchLimit, setYandexDeliveryPointSearchLimit] = useState("10");
  const [yandexDeliveryPointSearchRunning, setYandexDeliveryPointSearchRunning] = useState(false);
  const [yandexDeliveryPointSearchError, setYandexDeliveryPointSearchError] = useState("");
  const [yandexDeliveryPointSearchResults, setYandexDeliveryPointSearchResults] = useState<AdminYandexDeliveryTestPickupPoint[]>([]);
  const [databaseBackupsOverview, setDatabaseBackupsOverview] = useState<AdminDatabaseBackupsOverview | null>(null);
  const [databaseBackupsLoading, setDatabaseBackupsLoading] = useState(false);
  const [databaseBackupCreating, setDatabaseBackupCreating] = useState(false);
  const [externalAuthTestRunning, setExternalAuthTestRunning] = useState("");
  const [externalAuthTestSession, setExternalAuthTestSession] = useState<AdminExternalAuthTestSession | null>(null);
  const [externalAuthTestStatuses, setExternalAuthTestStatuses] = useState<Record<string, AdminExternalAuthTestStatus>>({});
  const [telegramWidgetTestVisible, setTelegramWidgetTestVisible] = useState(false);
  const externalAuthTestPopupRef = useRef<Window | null>(null);
  const telegramWidgetTestRef = useRef<HTMLDivElement | null>(null);
  const loginTelegramBot = useMemo(
    () => telegramBots.find((bot) => bot.enabled && bot.useForLogin) ?? null,
    [telegramBots]
  );
  const googleCallbackUrl = useMemo(() => getExternalAuthCallbackUrl("google"), []);
  const vkCallbackUrl = useMemo(() => getExternalAuthCallbackUrl("vk"), []);
  const yandexCallbackUrl = useMemo(() => getExternalAuthCallbackUrl("yandex"), []);
  const telegramWidgetUsername = useMemo(
    () => String(settings["telegram_bot_username"] || loginTelegramBot?.username || "").trim(),
    [loginTelegramBot?.username, settings]
  );
  const isTelegramLoginTestReady = useMemo(
    () => !!loginTelegramBot?.enabled
      && !!loginTelegramBot?.useForLogin
      && hasConfiguredValue(loginTelegramBot?.username)
      && (loginTelegramBot?.hasToken || hasConfiguredValue(loginTelegramBot?.tokenMasked)),
    [loginTelegramBot]
  );
  const isTelegramWidgetTestReady = useMemo(
    () => isTelegramLoginTestReady && hasConfiguredValue(telegramWidgetUsername),
    [isTelegramLoginTestReady, telegramWidgetUsername]
  );
  const [dictionaries, setDictionaries] = useState<Record<DictionaryKind, DictionaryItem[]>>({ sizes: [], materials: [], colors: [], categories: [], collections: [] });
  const [dictionaryDrafts, setDictionaryDrafts] = useState<Record<string, DictionaryDraft>>({});
  const [selectedDictionaryGroup, setSelectedDictionaryGroup] = useState<DictionaryKind>(() => readPersistedAdminNavigationState().dictionaryGroup);
  const [editingDictionaryItemId, setEditingDictionaryItemId] = useState<string | null>(null);
  const [dictionaryDeleteDialog, setDictionaryDeleteDialog] = useState<DictionaryDeleteDialogState>({
    open: false,
    kind: "sizes",
    item: null,
    submitting: false,
    error: ""
  });
  const [dictionaryCreateDialog, setDictionaryCreateDialog] = useState<DictionaryCreateDialogState>({
    open: false,
    kind: "categories",
    submitting: false,
    attachToProduct: false,
    name: "",
    slug: "",
    color: "#3b82f6",
    imageUrl: "",
    previewMode: "gallery",
    description: "",
    showColorInCatalog: true,
    sortOrder: "1"
  });
  const [actionNotice, setActionNotice] = useState<ActionNoticeState>({ open: false, title: "", message: "", isError: false });
  const [productDictionarySelector, setProductDictionarySelector] = useState<ProductDictionarySelectorState>({ open: false, kind: "sizes" });
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingOrder, setEditingOrder] = useState<AdminOrder | null>(null);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderPaymentRefreshingId, setOrderPaymentRefreshingId] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [ordersStatusFilter, setOrdersStatusFilter] = useState("all");
  const [ordersDateFrom, setOrdersDateFrom] = useState("");
  const [ordersDateTo, setOrdersDateTo] = useState("");
  const [ordersDateFromDisplay, setOrdersDateFromDisplay] = useState("");
  const [ordersDateToDisplay, setOrdersDateToDisplay] = useState("");
  const [analyticsDateFrom, setAnalyticsDateFrom] = useState(() => getRelativeDateInputValue(-29));
  const [analyticsDateTo, setAnalyticsDateTo] = useState(() => getRelativeDateInputValue(0));
  const [analyticsData, setAnalyticsData] = useState<AdminAnalyticsResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const formatOrderFilterDateDisplay = (value: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return "";
    }

    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
  };

  const normalizeOrderFilterDateDraft = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8);

    if (digits.length <= 2) {
      return digits;
    }

    if (digits.length <= 4) {
      return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    }

    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
  };

  const parseOrderFilterDateDraft = (value: string): string | null => {
    const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

    if (!match) {
      return null;
    }

    const [, day, month, year] = match;
    const parsedDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

    if (
      Number.isNaN(parsedDate.getTime()) ||
      String(parsedDate.getUTCFullYear()).padStart(4, "0") !== year ||
      String(parsedDate.getUTCMonth() + 1).padStart(2, "0") !== month ||
      String(parsedDate.getUTCDate()).padStart(2, "0") !== day
    ) {
      return null;
    }

    return `${year}-${month}-${day}`;
  };

  const handleOrderDateDraftChange = (
    value: string,
    setDisplayValue: (value: string) => void,
    setIsoValue: (value: string) => void,
  ) => {
    const normalizedValue = normalizeOrderFilterDateDraft(value);
    setDisplayValue(normalizedValue);

    if (!normalizedValue) {
      setIsoValue("");
      return;
    }

    setIsoValue(parseOrderFilterDateDraft(normalizedValue) ?? "");
  };

  const handleOrderDatePickerChange = (
    value: string,
    setDisplayValue: (value: string) => void,
    setIsoValue: (value: string) => void,
  ) => {
    setIsoValue(value);
    setDisplayValue(formatOrderFilterDateDisplay(value));
  };
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState<(typeof ORDER_PAGE_SIZE_OPTIONS)[number]>(ORDER_PAGE_SIZE_OPTIONS[0]);
  const [ordersTotalItems, setOrdersTotalItems] = useState(0);
  const [ordersTotalPages, setOrdersTotalPages] = useState(1);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersReady, setOrdersReady] = useState(false);
  const [orderActionDialog, setOrderActionDialog] = useState<OrderActionDialogState>({ open: false, action: "cancel", order: null, submitting: false });
  const [orderTablePreferences, setOrderTablePreferences] = useState<OrderTablePreferences>(createDefaultOrderTablePreferences);
  const [orderTableDraft, setOrderTableDraft] = useState<OrderTablePreferences>(createDefaultOrderTablePreferences);
  const [isOrderTableDialogOpen, setIsOrderTableDialogOpen] = useState(false);
  const [orderTableSaving, setOrderTableSaving] = useState(false);
  const [draggedOrderColumnId, setDraggedOrderColumnId] = useState<OrderTableColumnId | null>(null);
  const [orderColumnDropTargetId, setOrderColumnDropTargetId] = useState<OrderTableColumnId | null>(null);
  const [resizingOrderColumnId, setResizingOrderColumnId] = useState<OrderTableColumnId | null>(null);
  const [pendingOrderSaveChanges, setPendingOrderSaveChanges] = useState<OrderFormChange[]>([]);
  const [isOrderSaveConfirmOpen, setIsOrderSaveConfirmOpen] = useState(false);
  const [orderForm, setOrderForm] = useState({
    status: "processing",
    shippingAddress: "",
    paymentMethod: "cod",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    yandexRequestId: "",
    managerComment: "",
  });
  const [selectedSettingsGroup, setSelectedSettingsGroup] = useState(() => readPersistedAdminNavigationState().settingsGroup);
  const [selectedGeneralSettingsCatalog, setSelectedGeneralSettingsCatalog] = useState(() => readPersistedAdminNavigationState().generalSettingsCatalog);
  const [selectedIntegrationCatalog, setSelectedIntegrationCatalog] = useState(() => readPersistedAdminNavigationState().integrationCatalog);
  const [selectedUserOrders, setSelectedUserOrders] = useState<AdminOrder[]>([]);
  const [selectedUserOrdersTotal, setSelectedUserOrdersTotal] = useState(0);
  const [selectedUserOrdersLoading, setSelectedUserOrdersLoading] = useState(false);
  const [selectedProductStockHistory, setSelectedProductStockHistory] = useState<Product | null>(null);
  const [telegramBotForm, setTelegramBotForm] = useState(getInitialTelegramBotForm);
  const [isTelegramBotDialogOpen, setIsTelegramBotDialogOpen] = useState(false);
  const [editingTelegramBotId, setEditingTelegramBotId] = useState<string | null>(null);
  const [telegramBotSaving, setTelegramBotSaving] = useState(false);
  const [telegramBotChecking, setTelegramBotChecking] = useState(false);
  const [telegramBotCheckInfo, setTelegramBotCheckInfo] = useState<any | null>(null);
  const [telegramBotValidationError, setTelegramBotValidationError] = useState("");
  const [telegramBotTokenVisible, setTelegramBotTokenVisible] = useState(false);
  const [activeTelegramReplyTemplateKey, setActiveTelegramReplyTemplateKey] = useState(getDefaultTelegramReplyTemplateKey);
  const telegramBotImageInputRef = useRef<HTMLInputElement | null>(null);
  const ordersRequestIdRef = useRef(0);
  const latestOrderTablePreferencesRef = useRef<OrderTablePreferences>(createDefaultOrderTablePreferences());
  const deferredOrderSearch = useDeferredValue(orderSearch);
  const navigate = useNavigate();
  const location = useLocation();
  const isStandaloneAdmin = !embedded;
  const isCreateProductRoute = isStandaloneAdmin && location.pathname === "/admin/products/new";
  const editProductRouteMatch = isStandaloneAdmin
    ? location.pathname.match(/^\/admin\/products\/([^/]+)\/edit$/)
    : null;
  const routeEditingProductId = editProductRouteMatch?.[1] || null;
  const [selectedAdminTab, setSelectedAdminTab] = useState(() => readPersistedAdminNavigationState().adminTab);

  useEffect(() => {
    if (!isStandaloneAdmin) {
      return;
    }

    persistAdminNavigationState({
      adminTab: normalizeAdminNavigationValue(selectedAdminTab, ADMIN_TAB_VALUES, DEFAULT_ADMIN_NAVIGATION_STATE.adminTab),
      settingsGroup: normalizeAdminNavigationValue(selectedSettingsGroup, SETTINGS_GROUP_VALUES, DEFAULT_ADMIN_NAVIGATION_STATE.settingsGroup),
      generalSettingsCatalog: normalizeAdminNavigationValue(selectedGeneralSettingsCatalog, GENERAL_SETTINGS_CATALOG_VALUES, DEFAULT_ADMIN_NAVIGATION_STATE.generalSettingsCatalog),
      integrationCatalog: normalizeAdminNavigationValue(selectedIntegrationCatalog, INTEGRATION_CATALOG_VALUES, DEFAULT_ADMIN_NAVIGATION_STATE.integrationCatalog),
      dictionaryGroup: normalizeAdminNavigationValue(selectedDictionaryGroup, DICTIONARY_GROUP_VALUES, DEFAULT_ADMIN_NAVIGATION_STATE.dictionaryGroup) as DictionaryKind,
    });
  }, [
    isStandaloneAdmin,
    selectedAdminTab,
    selectedSettingsGroup,
    selectedGeneralSettingsCatalog,
    selectedIntegrationCatalog,
    selectedDictionaryGroup,
  ]);

  // Form State
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(createEmptyProductForm);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productReviews, setProductReviews] = useState<AdminProductReview[]>([]);
  const [productReviewsLoading, setProductReviewsLoading] = useState(false);
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [productUpdateConfirmOpen, setProductUpdateConfirmOpen] = useState(false);
  const [mediaDeleteDialog, setMediaDeleteDialog] = useState<MediaDeleteDialogState>({ open: false, slot: null });
  const [uploading, setUploading] = useState(false);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const faviconUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFaviconFileName, setSelectedFaviconFileName] = useState("");
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryName, setGalleryName] = useState("");
  const [galleryDescription, setGalleryDescription] = useState("");
  const [gallerySearch, setGallerySearch] = useState("");
  const deferredGallerySearch = useDeferredValue(gallerySearch);
  const [galleryPage, setGalleryPage] = useState(1);
  const [galleryTotalPages, setGalleryTotalPages] = useState(1);
  const [galleryTotalItems, setGalleryTotalItems] = useState(0);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryUploadQueue, setGalleryUploadQueue] = useState<GalleryUploadItem[]>([]);
  const [isGalleryUploadPanelOpen, setIsGalleryUploadPanelOpen] = useState(false);
  const [galleryDropActive, setGalleryDropActive] = useState(false);
  const [galleryViewMode, setGalleryViewMode] = useState<"grid" | "table">("grid");
  const [editingGalleryImageId, setEditingGalleryImageId] = useState<string | null>(null);
  const [editingGalleryName, setEditingGalleryName] = useState("");
  const [editingGalleryDescription, setEditingGalleryDescription] = useState("");
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const [galleryPickerTarget, setGalleryPickerTarget] = useState<GalleryPickerTarget | null>(null);
  const [mediaGallerySearch, setMediaGallerySearch] = useState("");
  const deferredMediaGallerySearch = useDeferredValue(mediaGallerySearch);
  const [mediaGalleryPage, setMediaGalleryPage] = useState(1);
  const [mediaGalleryTotalPages, setMediaGalleryTotalPages] = useState(1);
  const [mediaGalleryTotalItems, setMediaGalleryTotalItems] = useState(0);
  const [mediaGalleryLoading, setMediaGalleryLoading] = useState(false);
  const [galleryPickerImages, setGalleryPickerImages] = useState<GalleryImage[]>([]);
  const mediaGalleryUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedProductEditorDictionaryTab, setSelectedProductEditorDictionaryTab] = useState<DictionaryKind>("categories");
  const GALLERY_PAGE_SIZE = 24;
  const MEDIA_GALLERY_PAGE_SIZE = 16;

  const compareDictionaryNames = (left: string, right: string) =>
    left.localeCompare(right, "ru", { numeric: true, sensitivity: "base" });

  const getDictionaryItems = (kind: DictionaryKind): DictionaryItem[] => {
    const items = dictionaries[kind];
    return Array.isArray(items) ? items : [];
  };

  const compareDictionaryItems = (left: DictionaryItem, right: DictionaryItem) => {
    const leftOrder = Number.isFinite(left.sortOrder) ? Number(left.sortOrder) : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(right.sortOrder) ? Number(right.sortOrder) : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return compareDictionaryNames(left.name || "", right.name || "");
  };

  const getSortedDictionaryItems = (kind: DictionaryKind) => [...getDictionaryItems(kind)].sort(compareDictionaryItems);

  const isDictionaryItemUsed = (kind: DictionaryKind, item: DictionaryItem) => {
    if (item.isUsed) return true;

    const usedValues = usedDictionaryValues[kind];
    return usedValues.has(normalizeDictionaryUsageKey(item.name))
      || usedValues.has(normalizeDictionaryUsageKey(item.slug));
  };

  const parseDictionarySortOrder = (value: string, fallback?: number) => {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return fallback ?? 0;
    }

    const parsedValue = Number.parseInt(normalizedValue, 10);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      return null;
    }

    return parsedValue;
  };

  const getNextDictionarySortOrder = (kind: DictionaryKind) => {
    const currentMaxSortOrder = getDictionaryItems(kind)
      .map((item) => (Number.isFinite(item.sortOrder) ? Number(item.sortOrder) : 0))
      .reduce((maxValue, currentValue) => Math.max(maxValue, currentValue), 0);

    return currentMaxSortOrder + 1;
  };

  const sortProductDictionaryValues = (kind: DictionaryKind, values?: string[] | null, fallback?: string | null) => {
    const normalizedValues = normalizeDictionaryValues(values, fallback);
    const orderByName = new Map(
      getDictionaryItems(kind).map((item) => [String(item.name || "").trim().toLowerCase(), Number.isFinite(item.sortOrder) ? Number(item.sortOrder) : Number.MAX_SAFE_INTEGER])
    );

    return [...normalizedValues].sort((left, right) => {
      const leftOrder = orderByName.get(left.trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = orderByName.get(right.trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return compareDictionaryNames(left, right);
    });
  };

  const areStringArraysEqual = (left: string[], right: string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index]);

  useEffect(() => {
    setFormData((prev) => {
      const nextCategories = sortProductDictionaryValues("categories", prev.categories);
      const nextCollections = sortProductDictionaryValues("collections", prev.collections);
      const nextSizes = sortProductDictionaryValues("sizes", prev.sizes);
      const nextMaterials = sortProductDictionaryValues("materials", prev.materials);
      const nextColors = sortProductDictionaryValues("colors", prev.colors);

      if (
        areStringArraysEqual(prev.categories, nextCategories)
        && areStringArraysEqual(prev.collections, nextCollections)
        && areStringArraysEqual(prev.sizes, nextSizes)
        && areStringArraysEqual(prev.materials, nextMaterials)
        && areStringArraysEqual(prev.colors, nextColors)
      ) {
        return prev;
      }

      return {
        ...prev,
        categories: nextCategories,
        collections: nextCollections,
        sizes: nextSizes,
        materials: nextMaterials,
        colors: nextColors,
      };
    });
  }, [dictionaries]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await FLOW.adminMe();
        setAdminUser(session?.user || null);
        setIsAdmin(true);
        await Promise.all([fetchProducts(), fetchAdminData(session?.user || null)]);
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

	  const fetchAdminData = async (sessionUser: AdminSessionUser | null = adminUser) => {
	    try {
	      const [usersRes, settingsRes, preferencesRes, botsRes, dictionariesRes, stockHistoryRes, backupsRes] = await Promise.all([
	        FLOW.adminGetUsers(),
	        FLOW.adminGetSettings(),
	        FLOW.adminGetPreferences(),
	        FLOW.adminGetTelegramBots(),
	        FLOW.adminGetDictionaries(),
	        FLOW.adminGetStockHistory(),
	        FLOW.adminGetDatabaseBackups()
	      ]);
      setUsers(Array.isArray(usersRes) ? usersRes : []);
      setStockHistory(Array.isArray(stockHistoryRes) ? stockHistoryRes : []);
      const mergedSettings = mergeSettingsWithDefaults(settingsRes);
      const resolvedPreferences = sanitizeOrderTablePreferences(preferencesRes?.[ADMIN_ORDER_TABLE_PREFERENCE_KEY]);
      setSettings(mergedSettings);
      setOrderTablePreferences(resolvedPreferences);
	      setOrderTableDraft(resolvedPreferences);
	      setOrdersPageSize(resolvedPreferences.pageSize);
	      setOrdersReady(true);
	      setTelegramBots(Array.isArray(botsRes) ? botsRes : []);
	      setDictionaries(dictionariesRes || { sizes: [], materials: [], colors: [], categories: [], collections: [] });
	      setDatabaseBackupsOverview(backupsRes || null);
	    } catch (error) {
      toast.error("Не удалось загрузить раздел пользователей/заказов/настроек");
    }
  };

  const refreshDatabaseBackups = async (silent = false) => {
    if (!silent) {
      setDatabaseBackupsLoading(true);
    }

    try {
      const result = await FLOW.adminGetDatabaseBackups();
      setDatabaseBackupsOverview(result || null);
      return result;
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось загрузить список резервных копий"));
      return null;
    } finally {
      if (!silent) {
        setDatabaseBackupsLoading(false);
      }
    }
  };

  const downloadDatabaseBackup = async (relativePath: string, fallbackFileName?: string) => {
    const response = await FLOW.adminDownloadDatabaseBackup({ input: { relativePath } });
    const blobUrl = window.URL.createObjectURL(response.blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = response.fileName || fallbackFileName || "database-backup.dump";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  const createAndDownloadDatabaseBackup = async () => {
    setDatabaseBackupCreating(true);
    try {
      const result = await FLOW.adminCreateDatabaseBackup();
      if (result?.backup?.relativePath) {
        await downloadDatabaseBackup(result.backup.relativePath, result.backup.fileName);
      }
      await refreshDatabaseBackups(true);
      toast.success("Резервная копия создана и скачивание началось");
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось создать резервную копию"));
    } finally {
      setDatabaseBackupCreating(false);
    }
  };

  const loadGalleryImages = async ({
    page = galleryPage,
    search = deferredGallerySearch,
    silent = false,
  }: Partial<{ page: number; search: string; silent: boolean }> = {}): Promise<GalleryImagesPage | null> => {
    if (!silent) {
      setGalleryLoading(true);
    }

    try {
      const response = await FLOW.getAdminGalleryImages({
        input: {
          page,
          pageSize: GALLERY_PAGE_SIZE,
          search: search?.trim() || undefined,
        },
      });

      setGalleryImages(Array.isArray(response?.items) ? response.items : []);
      setGalleryPage(response?.page || 1);
      setGalleryTotalPages(response?.totalPages || 1);
      setGalleryTotalItems(response?.totalItems || 0);
      return response;
    } catch (error) {
      toast.error("Не удалось загрузить изображения галереи");
      return null;
    } finally {
      if (!silent) {
        setGalleryLoading(false);
      }
    }
  };

  const loadMediaGalleryImages = async ({
    page = mediaGalleryPage,
    search = deferredMediaGallerySearch,
    silent = false,
  }: Partial<{ page: number; search: string; silent: boolean }> = {}): Promise<GalleryImagesPage | null> => {
    if (!silent) {
      setMediaGalleryLoading(true);
    }

    try {
      const response = await FLOW.getAdminGalleryImages({
        input: {
          page,
          pageSize: MEDIA_GALLERY_PAGE_SIZE,
          search: search?.trim() || undefined,
        },
      });

      setGalleryPickerImages(Array.isArray(response?.items) ? response.items : []);
      setMediaGalleryPage(response?.page || 1);
      setMediaGalleryTotalPages(response?.totalPages || 1);
      setMediaGalleryTotalItems(response?.totalItems || 0);
      return response;
    } catch (error) {
      toast.error("Не удалось загрузить галерею для выбора изображения");
      return null;
    } finally {
      if (!silent) {
        setMediaGalleryLoading(false);
      }
    }
  };

  const persistOrderTablePreferences = async (nextPreferences: OrderTablePreferences) => {
    const serializedValue = JSON.stringify(nextPreferences);
    await FLOW.adminSavePreferences({ input: { [ADMIN_ORDER_TABLE_PREFERENCE_KEY]: serializedValue } });
  };

  const applyResolvedOrderTablePreferences = (nextPreferences: OrderTablePreferences) => {
    latestOrderTablePreferencesRef.current = nextPreferences;
    setOrderTablePreferences(nextPreferences);
    setOrderTableDraft(nextPreferences);
  };

  const getOrderTableColumnWidth = (columnId: OrderTableColumnId) =>
    clampOrderTableColumnWidth(
      columnId,
      Number(latestOrderTablePreferencesRef.current.columnWidths?.[columnId] ?? ORDER_TABLE_COLUMN_DEFAULT_WIDTHS[columnId]),
    );

  const getOrderTableColumnCellStyle = (columnId: OrderTableColumnId) => {
    const width = getOrderTableColumnWidth(columnId);
    return {
      width,
      minWidth: width,
      maxWidth: width,
    } as const;
  };

  const buildMovedOrderColumns = (columnOrder: OrderTableColumnId[], sourceId: OrderTableColumnId, targetId: OrderTableColumnId) => {
    if (sourceId === targetId) {
      return columnOrder;
    }

    const nextColumnOrder = columnOrder.filter((columnId) => columnId !== sourceId);
    const targetIndex = nextColumnOrder.indexOf(targetId);
    if (targetIndex < 0) {
      nextColumnOrder.push(sourceId);
      return nextColumnOrder;
    }

    nextColumnOrder.splice(targetIndex, 0, sourceId);
    return nextColumnOrder;
  };

  const saveImmediateOrderTablePreferences = async (
    nextPreferences: OrderTablePreferences,
    previousPreferences: OrderTablePreferences,
    errorMessage: string,
  ) => {
    applyResolvedOrderTablePreferences(nextPreferences);

    try {
      await persistOrderTablePreferences(nextPreferences);
    } catch (error) {
      applyResolvedOrderTablePreferences(previousPreferences);
      toast.error(getErrorMessage(error, errorMessage));
    }
  };

  const handleOrderColumnDragStart = (columnId: OrderTableColumnId, event: DragEvent<HTMLDivElement>) => {
    setDraggedOrderColumnId(columnId);
    setOrderColumnDropTargetId(columnId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columnId);
  };

  const handleOrderColumnDragOver = (targetColumnId: OrderTableColumnId, event: DragEvent<HTMLTableCellElement>) => {
    if (!draggedOrderColumnId || draggedOrderColumnId === targetColumnId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOrderColumnDropTargetId(targetColumnId);
  };

  const handleOrderColumnDrop = async (targetColumnId: OrderTableColumnId, event: DragEvent<HTMLTableCellElement>) => {
    event.preventDefault();

    const droppedColumnId = (draggedOrderColumnId || event.dataTransfer.getData("text/plain")) as OrderTableColumnId | "";
    setDraggedOrderColumnId(null);
    setOrderColumnDropTargetId(null);

    if (!droppedColumnId || droppedColumnId === targetColumnId) {
      return;
    }

    const previousPreferences = latestOrderTablePreferencesRef.current;
    const nextColumnOrder = buildMovedOrderColumns(previousPreferences.columnOrder, droppedColumnId, targetColumnId);
    const nextPreferences = sanitizeOrderTablePreferences({
      ...previousPreferences,
      columnOrder: nextColumnOrder,
    });

    await saveImmediateOrderTablePreferences(nextPreferences, previousPreferences, "Не удалось сохранить новый порядок колонок");
  };

  const handleOrderColumnResizeStart = (columnId: OrderTableColumnId, startEvent: ReactPointerEvent<HTMLButtonElement>) => {
    startEvent.preventDefault();
    startEvent.stopPropagation();

    const previousPreferences = latestOrderTablePreferencesRef.current;
    const startWidth = getOrderTableColumnWidth(columnId);
    const startX = startEvent.clientX;

    setResizingOrderColumnId(columnId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clampOrderTableColumnWidth(columnId, startWidth + (moveEvent.clientX - startX));
      const nextPreferences = sanitizeOrderTablePreferences({
        ...latestOrderTablePreferencesRef.current,
        columnWidths: {
          ...latestOrderTablePreferencesRef.current.columnWidths,
          [columnId]: nextWidth,
        },
      });

      applyResolvedOrderTablePreferences(nextPreferences);
    };

    const handlePointerUp = async () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      setResizingOrderColumnId(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      const finalPreferences = latestOrderTablePreferencesRef.current;
      if ((previousPreferences.columnWidths[columnId] ?? startWidth) === finalPreferences.columnWidths[columnId]) {
        return;
      }

      try {
        await persistOrderTablePreferences(finalPreferences);
      } catch (error) {
        applyResolvedOrderTablePreferences(previousPreferences);
        toast.error(getErrorMessage(error, "Не удалось сохранить ширину колонки"));
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const refreshStockHistory = async () => {
    const stockHistoryRes = await FLOW.adminGetStockHistory();
    setStockHistory(Array.isArray(stockHistoryRes) ? stockHistoryRes : []);
  };

  useEffect(() => {
    if (!isAdmin) return;
    void loadGalleryImages({ page: galleryPage, search: deferredGallerySearch });
  }, [isAdmin, galleryPage, deferredGallerySearch]);

  useEffect(() => {
    if (!isAdmin || !galleryPickerTarget) return;
    void loadMediaGalleryImages({ page: mediaGalleryPage, search: deferredMediaGallerySearch });
  }, [isAdmin, galleryPickerTarget, mediaGalleryPage, deferredMediaGallerySearch]);

  useEffect(() => {
    setGalleryPage(1);
  }, [deferredGallerySearch]);

  useEffect(() => {
    setMediaGalleryPage(1);
  }, [deferredMediaGallerySearch]);

  useEffect(() => {
    latestOrderTablePreferencesRef.current = orderTablePreferences;
  }, [orderTablePreferences]);

  const loadOrders = async (overrides?: Partial<{ page: number; pageSize: number; search: string; status: string; dateFrom: string; dateTo: string; userId: string }>) => {
    const requestId = ++ordersRequestIdRef.current;
    setOrdersLoading(true);
    try {
      const response = await FLOW.adminGetOrders({
        input: {
          page: overrides?.page ?? ordersPage,
          pageSize: overrides?.pageSize ?? ordersPageSize,
          search: overrides?.search ?? deferredOrderSearch.trim(),
          status: overrides?.status ?? ordersStatusFilter,
          dateFrom: overrides?.dateFrom ?? ordersDateFrom,
          dateTo: overrides?.dateTo ?? ordersDateTo,
          userId: overrides?.userId,
        }
      });

      if (requestId !== ordersRequestIdRef.current) return;

      const responseItems = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response)
          ? response
          : [];

      setOrders(responseItems);
      setOrdersTotalItems(Number(response?.totalItems ?? responseItems.length ?? 0));
      setOrdersTotalPages(Math.max(1, Number(response?.totalPages ?? 1)));

      if (typeof response?.page === "number" && response.page !== ordersPage) {
        setOrdersPage(response.page);
      }
      return responseItems;
    } catch (error) {
      if (requestId !== ordersRequestIdRef.current) return;
      toast.error(getErrorMessage(error, "Не удалось загрузить заказы"));
    } finally {
      if (requestId === ordersRequestIdRef.current) {
        setOrdersLoading(false);
      }
    }
  };

  const loadAnalytics = async (overrides?: Partial<{ dateFrom: string; dateTo: string }>) => {
    setAnalyticsLoading(true);
    try {
      const response = await FLOW.adminGetAnalytics({
        input: {
          dateFrom: overrides?.dateFrom ?? analyticsDateFrom,
          dateTo: overrides?.dateTo ?? analyticsDateTo,
        },
      });
      setAnalyticsData(response || null);
      return response;
    } catch (error) {
      toast.error(getErrorMessage(error, "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ Р°РЅР°Р»РёС‚РёРєСѓ"));
      return null;
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const applyAnalyticsPreset = (days: number) => {
    const safeDays = Math.max(1, Math.trunc(days || 1));
    setAnalyticsDateFrom(getRelativeDateInputValue(-(safeDays - 1)));
    setAnalyticsDateTo(getRelativeDateInputValue(0));
  };

  const openOrderTableDialog = () => {
    setOrderTableDraft(orderTablePreferences);
    setIsOrderTableDialogOpen(true);
  };

  const toggleOrderTableDraftColumn = (columnId: OrderTableColumnId, visible: boolean) => {
    if (ORDER_TABLE_COLUMNS.find((column) => column.id === columnId)?.required) {
      return;
    }

    setOrderTableDraft((prev) => ({
      ...prev,
      hiddenColumns: visible
        ? prev.hiddenColumns.filter((item) => item !== columnId)
        : [...prev.hiddenColumns, columnId],
    }));
  };

  const moveOrderTableDraftColumn = (columnId: OrderTableColumnId, direction: -1 | 1) => {
    setOrderTableDraft((prev) => {
      const index = prev.columnOrder.indexOf(columnId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.columnOrder.length) {
        return prev;
      }

      const nextOrder = [...prev.columnOrder];
      const [movedColumn] = nextOrder.splice(index, 1);
      nextOrder.splice(nextIndex, 0, movedColumn);
      return { ...prev, columnOrder: nextOrder };
    });
  };

  const resetOrderTableDraft = () => {
    setOrderTableDraft({ ...createDefaultOrderTablePreferences(), pageSize: ordersPageSize });
  };

  const saveOrderTableLayout = async () => {
    const nextPreferences = sanitizeOrderTablePreferences({ ...orderTableDraft, pageSize: ordersPageSize });
    setOrderTableSaving(true);
    try {
      await persistOrderTablePreferences(nextPreferences);
      applyResolvedOrderTablePreferences(nextPreferences);
      setIsOrderTableDialogOpen(false);
      toast.success("Вид таблицы сохранен");
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось сохранить настройки таблицы"));
    } finally {
      setOrderTableSaving(false);
    }
  };

  const changeOrdersPageSize = async (nextPageSize: (typeof ORDER_PAGE_SIZE_OPTIONS)[number]) => {
    const previousPageSize = ordersPageSize;
    const previousPreferences = latestOrderTablePreferencesRef.current;
    const nextPreferences = sanitizeOrderTablePreferences({ ...previousPreferences, pageSize: nextPageSize });

    setOrdersPageSize(nextPreferences.pageSize);
    setOrdersPage(1);
    applyResolvedOrderTablePreferences(nextPreferences);

    try {
      await persistOrderTablePreferences(nextPreferences);
    } catch (error) {
      setOrdersPageSize(previousPageSize);
      applyResolvedOrderTablePreferences(previousPreferences);
      toast.error(getErrorMessage(error, "Не удалось сохранить количество строк"));
    }
  };

  const normalizeOrderStatusValue = (value?: string | null) => {
    const normalized = value?.trim().toLowerCase() || "";
    return normalized || "processing";
  };

  const formatOrderStatus = (value?: string | null) => {
    const normalized = normalizeOrderStatusValue(value);
    return ORDER_STATUS_LABELS[normalized] || value || "—";
  };

  const formatPaymentMethod = (value?: string | null) => {
    const normalized = value?.trim().toLowerCase() || "";
    return PAYMENT_METHOD_LABELS[normalized] || value || "—";
  };

  const formatPurchaseChannel = (value?: string | null) => {
    const normalized = value?.trim().toLowerCase() || "";
    return PURCHASE_CHANNEL_LABELS[normalized] || value || "—";
  };

  const formatShippingMethod = (value?: string | null) => {
    const normalized = value?.trim().toLowerCase() || "";
    return SHIPPING_METHOD_LABELS[normalized] || value || "—";
  };

  const formatShippingProvider = (value?: string | null) => {
    const normalized = value?.trim().toLowerCase() || "";
    return SHIPPING_PROVIDER_LABELS[normalized] || value || "—";
  };

  const formatOrderShippingSelection = (order?: AdminOrder | null) => {
    if (!order) return "—";

    const normalizedMethod = String(order.shippingMethod || "").trim().toLowerCase();
    if (normalizedMethod === "self_pickup") {
      return SHIPPING_METHOD_LABELS.self_pickup;
    }

    const provider = String(order.shippingProvider || "").trim().toLowerCase();
    const providerLabel = provider
      ? formatShippingProvider(provider)
      : String(order.yandexRequestId || "").trim()
        ? SHIPPING_PROVIDER_LABELS.yandex_delivery
        : "";
    const methodLabel = formatShippingMethod(order.shippingMethod);

    if (providerLabel && methodLabel && providerLabel !== methodLabel) {
      return `${providerLabel} · ${methodLabel}`;
    }

    return providerLabel || methodLabel || "—";
  };

  const formatYandexDeliveryStatus = (order?: AdminOrder | null) => {
    const description = String(order?.yandexDeliveryStatusDescription || "").trim();
    if (description) {
      return description;
    }

    const statusCode = String(order?.yandexDeliveryStatus || "").trim();
    return statusCode || "—";
  };

  const formatOrderPaymentStatus = (value?: string | null) => {
    const normalized = value?.trim().toLowerCase() || "";
    return YOO_MONEY_PAYMENT_STATUS_LABELS[normalized]
      || YOO_KASSA_PAYMENT_STATUS_LABELS[normalized]
      || value
      || "—";
  };

  const getOrderPaymentStatusBadgeClassName = (value?: string | null) => {
    switch (String(value || "").trim().toLowerCase()) {
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

  const formatOrderPaymentSummary = (payment?: AdminOrderPayment | null) => {
    if (!payment) {
      return "Счет не создан";
    }

    const normalized = String(payment.status || "").trim().toLowerCase();

    if (normalized === "paid") {
      return payment.paidAt
        ? `Оплачен ${formatOrderDateTime(payment.paidAt)}`
        : "Оплачен";
    }

    if (normalized === "review_required") {
      return "Требуется ручная проверка";
    }

    if (normalized === "expired") {
      return "Счет истек";
    }

    if (normalized === "canceled" || normalized === "cancelled") {
      return "Счет отменен";
    }

    if (payment.expiresAt) {
      return `Ожидает оплату до ${formatOrderDateTime(payment.expiresAt)}`;
    }

    return "Ожидает оплату";
  };

  const getOrderStatusBadgeClassName = (value?: string | null) => {
    switch (normalizeOrderStatusValue(value)) {
      case "pending_payment":
        return "border-amber-200 bg-amber-50 text-amber-700";
      case "canceled":
      case "returned":
        return "border-red-200 bg-red-50 text-red-700";
      case "delivered":
      case "completed":
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
      case "paid":
      case "in_transit":
        return "border-sky-200 bg-sky-50 text-sky-700";
      default:
        return "border-gray-200 bg-gray-50 text-gray-800";
    }
  };

  const getOrderRowStyle = (value?: string | null) => {
    const colorKey = ORDER_STATUS_ROW_COLOR_SETTING_KEYS[normalizeOrderStatusValue(value)];
    const color = normalizeHexColorSetting(settings[colorKey]);
    if (!color) return undefined;

    return {
      backgroundColor: hexToRgba(color, 0.14),
      boxShadow: `inset 4px 0 0 ${color}`,
    } as const;
  };

  const getOrderTimestamp = (value?: string | number) => {
    const parsed = value ? new Date(value).getTime() : Number.NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatOrderDateTime = (value?: string | number) => {
    const timestamp = getOrderTimestamp(value);
    return timestamp > 0 ? new Date(timestamp).toLocaleString("ru-RU") : "—";
  };

  const formatRubles = (value?: number | string | null) => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return "вЂ”";
    return `${new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric)} ₽`;
  };

  const formatOptionalRubles = (value?: number | string | null) => {
    if (value === null || value === undefined || String(value).trim() === "") {
      return "—";
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "—";
    }

    return formatRubles(numeric);
  };

  const getOrderPromoCodeValue = (order?: Pick<AdminOrder, "promoCode"> | null) => {
    const normalized = String(order?.promoCode || "").trim();
    return normalized || "";
  };

  const getOrderPromoDiscountValue = (order?: Pick<AdminOrder, "promoDiscountAmount"> | null) => {
    const numeric = Number(order?.promoDiscountAmount ?? 0);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  };

  const formatDeliveryDaysLabel = (value?: number | null) => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric) || numeric <= 0) return "—";
    return numeric === 1 ? "1 день" : `${numeric} дн.`;
  };

  const formatYandexPointTypeLabel = (value?: string | null) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "warehouse") return "Сортцентр / самопривоз";
    if (normalized === "terminal") return "Терминал";
    return "ПВЗ";
  };

  const formatAdminOrderNumber = (order?: AdminOrder | null) => {
    const explicitDisplayNumber = String(order?.displayOrderNumber || "").trim();
    if (explicitDisplayNumber) return explicitDisplayNumber;

    const numericOrderNumber = Number(order?.orderNumber || 0);
    if (Number.isFinite(numericOrderNumber) && numericOrderNumber > 0) {
      return String(Math.trunc(numericOrderNumber)).padStart(7, "0");
    }

    return order?.id || "вЂ”";
  };

  const resolveOrderCustomerSnapshot = (order: AdminOrder) => {
    const user = usersById.get(order.userId) || null;
    const userProfile = order.userProfile || user?.profile || null;
    const name = order.customerName || userProfile?.name || userProfile?.nickname || "";
    const email = order.customerEmail || order.userEmail || user?.email || "";
    const phone = order.customerPhone || userProfile?.phone || "";
    const shippingAddress = order.shippingAddress || userProfile?.shippingAddress || "";

    return {
      user,
      userProfile,
      name,
      email,
      phone,
      shippingAddress,
    };
  };

  const getOrderItemsDetails = (order: AdminOrder) => {
    const items = parseOrderItems(order?.itemsJson || order?.items);
    return items.map((item: any) => {
      const qty = Math.max(1, Number(item?.quantity || 1));
      const unitPrice = Number(item?.unitPrice || 0);
      const lineTotal = Number(item?.lineTotal || unitPrice * qty);
      const product = productsById.get(item?.productId);
      return {
        productId: item?.productId || "",
        title: item?.productName || product?.name || item?.productId || "Товар",
        imageUrl: item?.productImageUrl || product?.catalogImageUrl || product?.images?.[0] || "",
        size: item?.size || "",
        quantity: qty,
        unitPrice,
        lineTotal,
      };
    });
  };

  const formatOrderHistoryValue = (field: string | undefined, value: unknown) => {
    if (value === null || value === undefined) return "—";
    const textValue = String(value).trim();
    if (!textValue) return "—";

    if (field === "totalAmount" || field === "shippingAmount") {
      const numeric = Number(textValue);
      return Number.isFinite(numeric) ? formatRubles(numeric) : textValue;
    }

    switch (field) {
      case "status":
        return formatOrderStatus(textValue);
      case "paymentMethod":
        return formatPaymentMethod(textValue);
      case "purchaseChannel":
        return formatPurchaseChannel(textValue);
      case "shippingMethod":
        return formatShippingMethod(textValue);
      case "shippingProvider":
        return formatShippingProvider(textValue);
      case "totalAmount": {
        const numeric = Number(textValue);
        return Number.isFinite(numeric) ? `${numeric.toFixed(2)} ₽` : textValue;
      }
      default:
        return textValue;
    }
  };

  const getOrderHistoryEntries = (order?: AdminOrder | null): OrderHistoryEntry[] => {
    if (!order) return [];
    return parseOrderHistory(order.statusHistoryJson);
  };

  const isOrderHistoryFieldChanged = (change?: OrderHistoryFieldChange | null) => {
    if (!change?.field) return false;
    const oldValue = String(change.oldValue ?? "").trim();
    const newValue = String(change.newValue ?? "").trim();
    return oldValue !== newValue;
  };

  const getOrderFormChanges = (order: AdminOrder, form = orderForm): OrderFormChange[] => {
    const snapshot = resolveOrderCustomerSnapshot(order);
    const nextValues = {
      status: normalizeOrderStatusValue(form.status),
      paymentMethod: (form.paymentMethod || "cod").trim().toLowerCase(),
      customerName: form.customerName.trim(),
      customerEmail: form.customerEmail.trim(),
      customerPhone: form.customerPhone.trim(),
      shippingAddress: form.shippingAddress.trim(),
      yandexRequestId: form.yandexRequestId.trim(),
    };
    const currentValues = {
      status: normalizeOrderStatusValue(order.status),
      paymentMethod: (order.paymentMethod || "cod").trim().toLowerCase(),
      customerName: (snapshot.name || "").trim(),
      customerEmail: (snapshot.email || "").trim(),
      customerPhone: (snapshot.phone || "").trim(),
      shippingAddress: (snapshot.shippingAddress || "").trim(),
      yandexRequestId: String(order.yandexRequestId || "").trim(),
    };

    return [
      { field: "status", label: ORDER_HISTORY_FIELD_LABELS.status, oldValue: currentValues.status, newValue: nextValues.status },
      { field: "paymentMethod", label: ORDER_HISTORY_FIELD_LABELS.paymentMethod, oldValue: currentValues.paymentMethod, newValue: nextValues.paymentMethod },
      { field: "customerName", label: ORDER_HISTORY_FIELD_LABELS.customerName, oldValue: currentValues.customerName, newValue: nextValues.customerName },
      { field: "customerEmail", label: ORDER_HISTORY_FIELD_LABELS.customerEmail, oldValue: currentValues.customerEmail, newValue: nextValues.customerEmail },
      { field: "customerPhone", label: ORDER_HISTORY_FIELD_LABELS.customerPhone, oldValue: currentValues.customerPhone, newValue: nextValues.customerPhone },
      { field: "shippingAddress", label: ORDER_HISTORY_FIELD_LABELS.shippingAddress, oldValue: currentValues.shippingAddress, newValue: nextValues.shippingAddress },
      { field: "yandexRequestId", label: ORDER_HISTORY_FIELD_LABELS.yandexRequestId, oldValue: currentValues.yandexRequestId, newValue: nextValues.yandexRequestId },
    ].filter((change) => String(change.oldValue ?? "").trim() !== String(change.newValue ?? "").trim());
  };

  const closeOrderEditor = () => {
    setIsOrderDialogOpen(false);
    setEditingOrder(null);
    setPendingOrderSaveChanges([]);
    setIsOrderSaveConfirmOpen(false);
    setOrderForm({
      status: "processing",
      shippingAddress: "",
      paymentMethod: "cod",
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      yandexRequestId: "",
      managerComment: "",
    });
  };

  const openOrderEditor = (order: AdminOrder) => {
    const snapshot = resolveOrderCustomerSnapshot(order);
    setEditingOrder(order);
    setOrderForm({
      status: normalizeOrderStatusValue(order?.status),
      shippingAddress: snapshot.shippingAddress,
      paymentMethod: (order?.paymentMethod || "cod").trim().toLowerCase(),
      customerName: snapshot.name,
      customerEmail: snapshot.email,
      customerPhone: snapshot.phone,
      yandexRequestId: String(order?.yandexRequestId || "").trim(),
      managerComment: "",
    });
    setIsOrderDialogOpen(true);
  };

  const openOrderActionDialog = (action: OrderActionType, order: AdminOrder) => {
    setOrderActionDialog({ open: true, action, order, submitting: false });
  };

  const closeOrderActionDialog = () => {
    setOrderActionDialog((prev) => (prev.submitting ? prev : { ...prev, open: false, order: null }));
  };

  const confirmOrderAction = async () => {
    const targetOrder = orderActionDialog.order;
    if (!targetOrder?.id) return;

    setOrderActionDialog((prev) => ({ ...prev, submitting: true }));
    try {
      if (orderActionDialog.action === "cancel") {
        await FLOW.adminUpdateOrder({
          input: {
            orderId: targetOrder.id,
            payload: {
              status: "canceled",
              managerComment: "Заказ отменен администратором",
            },
          },
        });
        toast.success("Заказ отменен");
      } else {
        await FLOW.adminDeleteOrder({ input: { orderId: targetOrder.id } });
        toast.success("Заказ удален");
      }

      if (editingOrder?.id === targetOrder.id) {
        closeOrderEditor();
      }
      setOrderActionDialog({ open: false, action: orderActionDialog.action, order: null, submitting: false });
      await Promise.all([loadOrders(), refreshStockHistory()]);
    } catch (error) {
      toast.error(getErrorMessage(error, orderActionDialog.action === "cancel" ? "Не удалось отменить заказ" : "Не удалось удалить заказ"));
      setOrderActionDialog((prev) => ({ ...prev, submitting: false }));
    }
  };

  const requestOrderSave = () => {
    if (!editingOrder) return;

    const changes = getOrderFormChanges(editingOrder);
    if (changes.length === 0) {
      toast.info("Нет изменений для сохранения");
      return;
    }

    setPendingOrderSaveChanges(changes);
    setIsOrderSaveConfirmOpen(true);
  };

  const confirmOrderSave = async () => {
    if (!editingOrder?.id) return;

    setOrderSaving(true);
    try {
      const payload: Record<string, string> = {};
      pendingOrderSaveChanges.forEach((change) => {
        payload[change.field] = String(change.newValue ?? "");
      });
      if (orderForm.managerComment.trim()) {
        payload.managerComment = orderForm.managerComment.trim();
      }

      await FLOW.adminUpdateOrder({
        input: {
          orderId: editingOrder.id,
          payload,
        },
      });
      toast.success("Заказ обновлен");
      setIsOrderSaveConfirmOpen(false);
      closeOrderEditor();
      await Promise.all([loadOrders(), refreshStockHistory()]);
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось сохранить заказ"));
    } finally {
      setOrderSaving(false);
    }
  };

  const refreshOrderPayment = async (orderId: string) => {
    setOrderPaymentRefreshingId(orderId);

    try {
      await FLOW.adminRefreshOrderPayment({ input: { orderId } });
      const refreshedOrders = await loadOrders();

      if (editingOrder?.id === orderId) {
        const refreshedOrder = (Array.isArray(refreshedOrders) ? refreshedOrders : []).find((order) => order.id === orderId) || null;
        if (refreshedOrder) {
          setEditingOrder(refreshedOrder);
          setOrderForm((prev) => ({
            ...prev,
            status: refreshedOrder.status || prev.status,
            paymentMethod: (refreshedOrder.paymentMethod || prev.paymentMethod).trim().toLowerCase(),
          }));
        }
      }

      toast.success("Статус оплаты обновлен");
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось обновить статус оплаты"));
    } finally {
      setOrderPaymentRefreshingId((current) => (current === orderId ? null : current));
    }
  };

  const toggleUserBlock = async (user: AdminUser) => {
    try {
      await FLOW.adminUpdateUser({ input: { userId: user.id, isBlocked: !user.isBlocked } });
      await fetchAdminData();
    } catch (error) {
      toast.error("Не удалось изменить блокировку");
    }
  };

  const toggleUserAdmin = async (user: AdminUser) => {
    try {
      await FLOW.adminUpdateUser({ input: { userId: user.id, isAdmin: !user.isAdmin } });
      await fetchAdminData();
    } catch (error) {
      toast.error("Не удалось изменить права");
    }
  };

  const deleteUser = async (user: AdminUser) => {
    const confirmed = await confirmAction({
      title: "Удалить пользователя?",
      description: `Пользователь ${user.email} будет удалён без возможности быстрого восстановления.`,
      confirmText: "Удалить",
      variant: "destructive",
    });
    if (!confirmed) return;

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
      const mergedSettings = mergeSettingsWithDefaults({
        ...(currentRemote || {}),
        ...settings
      });

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

  const yandexSourceStationId = settings["yandex_delivery_source_station_id"] || "";
  const selectedYandexSourcePreset = YANDEX_SOURCE_STATION_PRESETS.find((preset) => preset.id === yandexSourceStationId) || null;
  const selectedYandexSourcePresetValue = selectedYandexSourcePreset?.id || "manual";
  const yoomoneyNotificationUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "/api/integrations/yoomoney/notifications";
    }

    try {
      const apiBaseUrl = new URL(import.meta.env.VITE_API_URL || "/api", window.location.origin);
      return new URL("integrations/yoomoney/notifications", apiBaseUrl.href.endsWith("/") ? apiBaseUrl.href : `${apiBaseUrl.href}/`).toString();
    } catch {
      return `${window.location.origin}/api/integrations/yoomoney/notifications`;
    }
  }, []);
  const yookassaNotificationUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "/api/integrations/yookassa/notifications";
    }

    try {
      const apiBaseUrl = new URL(import.meta.env.VITE_API_URL || "/api", window.location.origin);
      return new URL("integrations/yookassa/notifications", apiBaseUrl.href.endsWith("/") ? apiBaseUrl.href : `${apiBaseUrl.href}/`).toString();
    } catch {
      return `${window.location.origin}/api/integrations/yookassa/notifications`;
    }
  }, []);
  const yoomoneyConfigurationIssues = useMemo(() => getYooMoneyConfigurationIssues(settings), [settings]);
  const yookassaConfigurationIssues = useMemo(() => getYooKassaConfigurationIssues(settings), [settings]);
  const yoomoneyTestMethodOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    if (isSettingEnabled("yoomoney_allow_bank_cards", true)) {
      options.push({
        value: "yoomoney_card",
        label: YOO_MONEY_PAYMENT_METHOD_LABELS.yoomoney_card,
      });
    }
    if (isSettingEnabled("yoomoney_allow_wallet")) {
      options.push({
        value: "yoomoney_wallet",
        label: YOO_MONEY_PAYMENT_METHOD_LABELS.yoomoney_wallet,
      });
    }
    return options;
  }, [settings]);
  const yookassaTestMethodOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    if (isSettingEnabled("yookassa_allow_bank_cards", true)) {
      options.push({
        value: "yookassa_card",
        label: YOO_KASSA_PAYMENT_METHOD_LABELS.yookassa_card,
      });
    }
    if (isSettingEnabled("yookassa_allow_sbp", true)) {
      options.push({
        value: "yookassa_sbp",
        label: YOO_KASSA_PAYMENT_METHOD_LABELS.yookassa_sbp,
      });
    }
    if (isSettingEnabled("yookassa_allow_yoomoney", true)) {
      options.push({
        value: "yookassa_yoomoney",
        label: YOO_KASSA_PAYMENT_METHOD_LABELS.yookassa_yoomoney,
      });
    }
    return options;
  }, [settings]);

  useEffect(() => {
    if (yoomoneyTestMethodOptions.length === 0) {
      return;
    }

    if (!yoomoneyTestMethodOptions.some((option) => option.value === yoomoneyTestMethod)) {
      setYoomoneyTestMethod(yoomoneyTestMethodOptions[0].value);
    }
  }, [yoomoneyTestMethod, yoomoneyTestMethodOptions]);

  useEffect(() => {
    if (yookassaTestMethodOptions.length === 0) {
      return;
    }

    if (!yookassaTestMethodOptions.some((option) => option.value === yookassaTestMethod)) {
      setYookassaTestMethod(yookassaTestMethodOptions[0].value);
    }
  }, [yookassaTestMethod, yookassaTestMethodOptions]);

  const buildAdminIntegrationReturnUrl = (provider: string) => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("integrationTest", provider);
      return currentUrl.toString();
    } catch {
      return `${window.location.origin}/admin`;
    }
  };

  const buildAdminAuthTestReturnUrl = () => "/profile?tab=admin";

  const getExternalAuthTestLabel = (provider: string) => {
    if (provider === "google") return "Google";
    if (provider === "vk") return "VK";
    if (provider === "yandex") return "Яндекс";
    if (provider === "telegram_widget") return "Telegram Widget";
    return "Telegram";
  };

  const setExternalAuthTestStatus = (provider: string, kind: AdminExternalAuthTestStatus["kind"], message: string) => {
    setExternalAuthTestStatuses((prev) => ({
      ...prev,
      [provider]: { kind, message },
    }));
  };

  const closeExternalAuthTestPopup = () => {
    if (externalAuthTestPopupRef.current && !externalAuthTestPopupRef.current.closed) {
      externalAuthTestPopupRef.current.close();
    }
    externalAuthTestPopupRef.current = null;
  };

  const openAuthPageForTesting = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.open("/auth", "_blank", "noopener,noreferrer");
    setExternalAuthTestStatus(
      "telegram_widget",
      "info",
      "Открыта страница входа. Если виджет виден на /auth, фронтовая часть Telegram Widget работает."
    );
    toast.message("Страница входа открыта в новой вкладке для проверки Telegram Widget.");
  };

  const startTelegramLoginTest = async () => {
    if (!isSettingEnabled("telegram_login_enabled")) {
      toast.error("Сначала включите Telegram-вход и сохраните настройки.");
      return;
    }

    if (!isTelegramLoginTestReady) {
      const message = "Для теста нужен включенный login-бот из интеграций Telegram с username и токеном.";
      setExternalAuthTestStatus("telegram", "error", message);
      toast.error(message);
      return;
    }

    setExternalAuthTestRunning("telegram");
    setExternalAuthTestStatus("telegram", "running", "Создаем тестовую ссылку Telegram...");
    try {
      const started = await FLOW.telegramStartAuth({
        input: {
          returnUrl: buildAdminAuthTestReturnUrl(),
        },
      });

      if (!started?.authUrl || !started?.state) {
        throw new Error("Не удалось получить ссылку Telegram-входа");
      }

      setExternalAuthTestSession({
        provider: "telegram",
        kind: "telegram",
        state: started.state,
        expiresAt: Number(started.expiresAt || 0),
      });
      window.open(started.authUrl, "_blank", "noopener,noreferrer");
      setExternalAuthTestStatus(
        "telegram",
        "running",
        "Ссылка создана. Telegram-бот открыт. Если подтвердите вход в боте, статус обновится здесь автоматически."
      );
      toast.message("Открыт Telegram-бот для проверки входа.");
    } catch (error) {
      const message = getErrorMessage(error, "Не удалось запустить тест Telegram-входа");
      setExternalAuthTestStatus("telegram", "error", message);
      toast.error(message);
    } finally {
      setExternalAuthTestRunning((current) => (current === "telegram" ? "" : current));
    }
  };

  const startExternalOAuthTest = async (provider: "google" | "vk" | "yandex") => {
    const settingKey = provider === "google"
      ? "google_login_enabled"
      : provider === "vk"
        ? "vk_login_enabled"
        : "yandex_login_enabled";
    const label = getExternalAuthTestLabel(provider);

    if (!isSettingEnabled(settingKey)) {
      toast.error(`Сначала включите ${label} и сохраните настройки.`);
      return;
    }

    setExternalAuthTestRunning(provider);
    setExternalAuthTestStatus(provider, "running", `Создаем тестовый OAuth-запуск ${label}...`);
    try {
      const started = await FLOW.externalAuthStart({
        input: {
          provider,
          returnUrl: buildAdminAuthTestReturnUrl(),
        },
      });

      if (!started?.authUrl || !started?.state) {
        throw new Error(`Не удалось получить OAuth URL для ${label}`);
      }

      setExternalAuthTestSession({
        provider,
        kind: "external",
        state: started.state,
        expiresAt: Number(started.expiresAt || 0),
      });

      const popup = window.open(started.authUrl, `${provider}-oauth-test`, "width=540,height=720");
      externalAuthTestPopupRef.current = popup;
      if (!popup) {
        window.location.assign(started.authUrl);
        return;
      }

      setExternalAuthTestStatus(
        provider,
        "running",
        `Окно ${label} открыто. Если провайдер принимает запрос и вы завершите вход, статус обновится здесь автоматически.`
      );
      toast.message(`Открыто окно ${label} OAuth для проверки.`);
    } catch (error) {
      closeExternalAuthTestPopup();
      const message = getErrorMessage(error, `Не удалось запустить тест ${label}`);
      setExternalAuthTestStatus(provider, "error", message);
      toast.error(message);
    } finally {
      setExternalAuthTestRunning((current) => (current === provider ? "" : current));
    }
  };

  useEffect(() => {
    if (!externalAuthTestSession?.state) {
      return undefined;
    }

    const session = externalAuthTestSession;
    const timer = window.setInterval(async () => {
      try {
        const status = session.kind === "telegram"
          ? await FLOW.telegramAuthStatus({ input: { state: session.state } })
          : await FLOW.externalAuthStatus({ input: { state: session.state } });

        if (status?.completed) {
          closeExternalAuthTestPopup();
          setExternalAuthTestSession(null);
          setExternalAuthTestStatus(
            session.provider,
            "success",
            session.kind === "telegram"
              ? "Telegram-вход успешно подтвердился. Тест пройден."
              : `${getExternalAuthTestLabel(status?.provider || session.provider)} OAuth успешно завершен. Тест пройден.`
          );
          toast.success(
            session.kind === "telegram"
              ? "Тест Telegram-входа выполнен"
              : `Тест ${getExternalAuthTestLabel(status?.provider || session.provider)} выполнен`
          );
          return;
        }

        const nextStatus = String(status?.status || "").trim().toLowerCase();
        if (["failed", "expired", "consumed"].includes(nextStatus)) {
          closeExternalAuthTestPopup();
          setExternalAuthTestSession(null);
          const message = nextStatus === "failed"
            ? String(status?.detail || `Провайдер вернул ошибку для ${getExternalAuthTestLabel(session.provider)}`)
            : nextStatus === "expired"
              ? `Сессия теста ${getExternalAuthTestLabel(session.provider)} истекла. Запустите проверку заново.`
              : `Сессия теста ${getExternalAuthTestLabel(session.provider)} уже использована.`;
          setExternalAuthTestStatus(session.provider, nextStatus === "failed" ? "error" : "info", message);
          if (nextStatus === "failed") {
            toast.error(message);
          }
        }
      } catch (error) {
        closeExternalAuthTestPopup();
        setExternalAuthTestSession(null);
        const message = getErrorMessage(error, `Не удалось проверить статус теста ${getExternalAuthTestLabel(session.provider)}`);
        setExternalAuthTestStatus(session.provider, "error", message);
        toast.error(message);
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [externalAuthTestSession]);

  useEffect(() => {
    if (!telegramWidgetTestVisible || !isSettingEnabled("telegram_widget_enabled") || !telegramWidgetUsername || !telegramWidgetTestRef.current) {
      return undefined;
    }

    const callbackName = "__fashionDemonAdminTelegramWidgetTest";
    const container = telegramWidgetTestRef.current;
    container.innerHTML = "";

    (window as Window & Record<string, unknown>)[callbackName] = (user: unknown) => {
      const widgetUser = (user && typeof user === "object") ? user as Record<string, unknown> : {};
      const username = String(widgetUser.username || "").trim();
      const identifier = String(widgetUser.id || "").trim();
      const suffix = username ? `@${username}` : identifier ? `ID ${identifier}` : "пользователя";
      const message = `Виджет отдал данные ${suffix}. Значит фронт Telegram Widget работает. Для полной проверки backend можно пройти обычный вход на странице /auth.`;
      setExternalAuthTestStatus("telegram_widget", "success", message);
      toast.success("Telegram Widget вернул данные пользователя. Тест отображения пройден.");
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", telegramWidgetUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", `${callbackName}(user)`);
    container.appendChild(script);

    setExternalAuthTestStatus(
      "telegram_widget",
      "info",
      "Тестовый виджет загружен. Если он не появился, проверьте username login-бота и домен, заданный у BotFather через setdomain."
    );

    return () => {
      delete (window as Window & Record<string, unknown>)[callbackName];
      container.innerHTML = "";
    };
  }, [telegramWidgetTestVisible, telegramWidgetUsername, settings]);

  const renderExternalAuthTestStatus = (provider: string) => {
    const status = externalAuthTestStatuses[provider];
    if (!status?.message) {
      return null;
    }

    const className = status.kind === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status.kind === "error"
        ? "border-red-200 bg-red-50 text-red-700"
        : status.kind === "running"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-slate-50 text-slate-700";

    return (
      <div className={`rounded-none border px-3 py-2 text-xs leading-5 ${className}`}>
        {status.message}
      </div>
    );
  };

  const applyYandexSourceStationPreset = (presetId: string) => {
    if (presetId === "manual") {
      return;
    }

    const preset = YANDEX_SOURCE_STATION_PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    updateSetting("yandex_delivery_source_station_id", preset.id);
    updateSetting("yandex_delivery_use_test_environment", preset.mode === "test" ? "true" : "false");
    toast.success(
      preset.mode === "test"
        ? "Подставлен тестовый SourceStationId и включен тестовый контур."
        : `Подставлен SourceStationId для ${preset.label} и включен боевой контур.`,
    );
  };

  const getSmtpSecurityMode = (): SmtpSecurityMode => (
    normalizeSmtpSecurityMode(
      settings["smtp_security_mode"],
      settings["smtp_port"],
      isSettingEnabled("smtp_use_ssl", true))
  );

  const updateSmtpSecurityMode = (mode: SmtpSecurityMode) => {
    updateSetting("smtp_security_mode", mode);
    updateSetting("smtp_use_ssl", mode === "none" ? "false" : "true");
  };

  const sendSmtpTestEmail = async () => {
    const recipient = smtpTestEmail.trim();
    if (!recipient) {
      toast.error("Укажите email для тестового письма");
      return;
    }

    setSmtpTestSending(true);
    try {
      const securityMode = getSmtpSecurityMode();

      await FLOW.adminSendSmtpTestEmail({
        input: {
          toEmail: recipient,
          enabled: isSettingEnabled("smtp_enabled"),
          host: settings["smtp_host"] || "",
          port: settings["smtp_port"] || "587",
          username: settings["smtp_username"] || "",
          password: settings["smtp_password"] || "",
          fromEmail: settings["smtp_from_email"] || "",
          fromName: settings["smtp_from_name"] || "Fashion Demon",
          useSsl: securityMode !== "none",
          securityMode,
        }
      });
      toast.success(`Тестовое письмо отправлено на ${recipient}`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось отправить тестовое письмо"));
    } finally {
      setSmtpTestSending(false);
    }
  };

  const runYooMoneyIntegrationTest = async () => {
    if (!isSettingEnabled("payments_yoomoney_enabled")) {
      toast.error("Сначала включите YooMoney в интеграциях");
      return;
    }

    const normalizedAmount = Number(yoomoneyTestAmount.replace(",", "."));
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      toast.error("Укажите корректную сумму для проверки YooMoney");
      return;
    }

    setYoomoneyTestRunning(true);
    setYoomoneyTestError("");
    setYoomoneyTestResult(null);

    try {
      const result = await FLOW.adminTestYooMoney({
        input: {
          enabled: isSettingEnabled("payments_yoomoney_enabled"),
          walletNumber: settings["yoomoney_wallet_number"] || "",
          notificationSecret: settings["yoomoney_notification_secret"] || "",
          accessToken: settings["yoomoney_access_token"] || "",
          labelPrefix: settings["yoomoney_label_prefix"] || "FD",
          paymentTimeoutMinutes: Number(settings["yoomoney_payment_timeout_minutes"] || 30),
          allowBankCards: isSettingEnabled("yoomoney_allow_bank_cards", true),
          allowWallet: isSettingEnabled("yoomoney_allow_wallet"),
          paymentMethod: yoomoneyTestMethod,
          amount: normalizedAmount,
          returnUrl: buildAdminIntegrationReturnUrl("yoomoney"),
        }
      });

      setYoomoneyTestResult({
        ...(result || {}),
        checkedAtLabel: new Date().toLocaleString("ru-RU"),
      });
      toast.success("Проверка YooMoney выполнена");
    } catch (error) {
      const message = getErrorMessage(error, "Не удалось выполнить проверку YooMoney");
      setYoomoneyTestError(message);
      toast.error(message);
    } finally {
      setYoomoneyTestRunning(false);
    }
  };

  const runYooKassaIntegrationTest = async () => {
    if (!isSettingEnabled("payments_yookassa_enabled")) {
      toast.error("Сначала включите YooKassa в интеграциях");
      return;
    }

    const normalizedAmount = Number(yookassaTestAmount.replace(",", "."));
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      toast.error("Укажите корректную сумму для проверки YooKassa");
      return;
    }

    setYookassaTestRunning(true);
    setYookassaTestError("");
    setYookassaTestResult(null);

    try {
      const result = await FLOW.adminTestYooKassa({
        input: {
          enabled: isSettingEnabled("payments_yookassa_enabled"),
          shopId: settings["yookassa_shop_id"] || "",
          secretKey: settings["yookassa_secret_key"] || "",
          testMode: isSettingEnabled("yookassa_test_mode"),
          labelPrefix: settings["yookassa_label_prefix"] || "YK",
          paymentTimeoutMinutes: Number(settings["yookassa_payment_timeout_minutes"] || 60),
          allowBankCards: isSettingEnabled("yookassa_allow_bank_cards", true),
          allowSbp: isSettingEnabled("yookassa_allow_sbp", true),
          allowYooMoney: isSettingEnabled("yookassa_allow_yoomoney", true),
          paymentMethod: yookassaTestMethod,
          amount: normalizedAmount,
          returnUrl: buildAdminIntegrationReturnUrl("yookassa"),
        }
      });

      setYookassaTestResult({
        ...(result || {}),
        checkedAtLabel: new Date().toLocaleString("ru-RU"),
      });
      toast.success("Проверка YooKassa выполнена");
    } catch (error) {
      const message = getErrorMessage(error, "Не удалось выполнить проверку YooKassa");
      setYookassaTestError(message);
      toast.error(message);
    } finally {
      setYookassaTestRunning(false);
    }
  };

  const runYandexDeliveryIntegrationTest = async () => {
    if (!isYandexDeliveryEnabled) {
      toast.error("Сначала включите Яндекс.Доставку в интеграциях");
      return;
    }

    const toAddress = yandexDeliveryTestAddress.trim();
    if (!toAddress) {
      toast.error("Укажите тестовый адрес для проверки Яндекс.Доставки");
      return;
    }

    const normalizedWeight = Number(yandexDeliveryTestWeightKg.replace(",", "."));
    if (!Number.isFinite(normalizedWeight) || normalizedWeight <= 0) {
      toast.error("Укажите корректный вес для проверки Яндекс.Доставки");
      return;
    }

    const normalizedDeclaredCost = Number(yandexDeliveryTestDeclaredCost.replace(",", "."));
    if (!Number.isFinite(normalizedDeclaredCost) || normalizedDeclaredCost < 0) {
      toast.error("Укажите корректную объявленную стоимость для проверки Яндекс.Доставки");
      return;
    }

    setYandexDeliveryTestRunning(true);
    setYandexDeliveryTestError("");
    setYandexDeliveryTestResult(null);

    try {
      const result = await FLOW.adminTestYandexDelivery({
        input: {
          enabled: isYandexDeliveryEnabled,
          useTestEnvironment: isSettingEnabled("yandex_delivery_use_test_environment"),
          apiToken: settings["yandex_delivery_api_token"] || "",
          sourceStationId: settings["yandex_delivery_source_station_id"] || "",
          packageLengthCm: Number(settings["yandex_delivery_package_length_cm"] || 30),
          packageHeightCm: Number(settings["yandex_delivery_package_height_cm"] || 20),
          packageWidthCm: Number(settings["yandex_delivery_package_width_cm"] || 10),
          toAddress,
          weightKg: normalizedWeight,
          declaredCost: normalizedDeclaredCost,
        }
      });

      setYandexDeliveryTestResult({
        ...(result || {}),
        checkedAtLabel: new Date().toLocaleString("ru-RU"),
      });
      toast.success("Проверка Яндекс.Доставки выполнена");
    } catch (error) {
      const message = getErrorMessage(error, "Не удалось выполнить проверку Яндекс.Доставки");
      setYandexDeliveryTestError(message);
      toast.error(message);
    } finally {
      setYandexDeliveryTestRunning(false);
    }
  };

  const runYandexDeliveryPointSearch = async () => {
    const query = yandexDeliveryPointSearchQuery.trim();
    if (!query) {
      toast.error("Укажите адрес или населенный пункт для поиска точек Яндекс.Доставки");
      return;
    }

    const normalizedLimit = Number.parseInt(yandexDeliveryPointSearchLimit, 10);
    const limit = Number.isFinite(normalizedLimit) ? Math.min(Math.max(normalizedLimit, 1), 20) : 10;

    setYandexDeliveryPointSearchRunning(true);
    setYandexDeliveryPointSearchError("");
    setYandexDeliveryPointSearchResults([]);

    try {
      const result = await FLOW.adminSearchYandexDeliveryPoints({
        input: {
          useTestEnvironment: isSettingEnabled("yandex_delivery_use_test_environment"),
          apiToken: settings["yandex_delivery_api_token"] || "",
          query,
          pointType: yandexDeliveryPointSearchType,
          limit,
        },
      });

      const points = Array.isArray(result?.points) ? result.points : [];
      setYandexDeliveryPointSearchResults(points);
      toast.success(points.length > 0 ? `Найдено точек: ${points.length}` : "Подходящие точки не найдены");
    } catch (error) {
      const message = getErrorMessage(error, "Не удалось получить список точек Яндекс.Доставки");
      setYandexDeliveryPointSearchError(message);
      toast.error(message);
    } finally {
      setYandexDeliveryPointSearchRunning(false);
    }
  };

  const applyYandexSourceStationId = (stationId: string, label?: string | null) => {
    const normalizedStationId = String(stationId || "").trim();
    if (!normalizedStationId) {
      toast.error("У точки нет platform_station_id для подстановки");
      return;
    }

    updateSetting("yandex_delivery_source_station_id", normalizedStationId);
    toast.success(label ? `SourceStationId подставлен из точки «${label}»` : "SourceStationId подставлен");
  };

  const updateDictionaryFilterVisibility = async (kind: DictionaryKind, enabled: boolean) => {
    const key = DICTIONARY_FILTER_SETTING_KEYS[kind];
    if (!key) return;
    const nextValue = enabled ? "true" : "false";
    const previousValue = settings[key] ?? DEFAULT_APP_SETTINGS[key];

    updateSetting(key, nextValue);

    try {
      await FLOW.adminSaveSettings({ input: { [key]: nextValue } });
      setCachedPublicSettings({ ...getCachedPublicSettings(), [key]: nextValue });
    } catch (error) {
      updateSetting(key, previousValue);
      toast.error("Не удалось сохранить настройку фильтра каталога");
    }
  };

  const updateDictionaryFilterColorVisibility = async (kind: DictionaryKind, enabled: boolean) => {
    const key = DICTIONARY_FILTER_COLOR_SETTING_KEYS[kind];
    const nextValue = enabled ? "true" : "false";
    const previousValue = settings[key] ?? DEFAULT_APP_SETTINGS[key];

    updateSetting(key, nextValue);

    try {
      await FLOW.adminSaveSettings({ input: { [key]: nextValue } });
      setCachedPublicSettings({ ...getCachedPublicSettings(), [key]: nextValue });
    } catch (error) {
      updateSetting(key, previousValue);
      toast.error("Не удалось сохранить настройку отображения цвета");
    }
  };

  const updateDictionaryFilterOrder = async (kind: DictionaryKind, rawValue: string) => {
    const key = DICTIONARY_FILTER_ORDER_SETTING_KEYS[kind];
    const previousValue = settings[key] ?? DEFAULT_APP_SETTINGS[key] ?? "0";
    const parsedValue = parseDictionarySortOrder(rawValue, Number.parseInt(previousValue, 10) || 0);
    if (parsedValue === null) {
      updateSetting(key, previousValue);
      toast.error("Порядок блока фильтра должен быть целым неотрицательным числом");
      return;
    }

    const nextValue = String(parsedValue);
    updateSetting(key, nextValue);

    try {
      await FLOW.adminSaveSettings({ input: { [key]: nextValue } });
      setCachedPublicSettings({ ...getCachedPublicSettings(), [key]: nextValue });
    } catch (error) {
      updateSetting(key, previousValue);
      toast.error("Не удалось сохранить порядок блока фильтра");
    }
  };

  const createDictionaryItem = (kind: DictionaryKind, attachToProduct = false) => {
    setSelectedProductEditorDictionaryTab(kind);
    setDictionaryCreateDialog({
      open: true,
      kind,
      submitting: false,
      attachToProduct,
      name: "",
      slug: "",
      color: getDictionaryDotColor(kind),
      imageUrl: "",
      previewMode: "gallery",
      description: "",
      showColorInCatalog: true,
      sortOrder: String(getNextDictionarySortOrder(kind))
    });
  };

  const submitCreateDictionaryItem = async () => {
    const name = dictionaryCreateDialog.name.trim();
    const slug = dictionaryCreateDialog.slug.trim().toLowerCase();
    const color = String(dictionaryCreateDialog.color ?? "").trim();
    const imageUrl = String(dictionaryCreateDialog.imageUrl ?? "").trim();
    const description = String(dictionaryCreateDialog.description ?? "").trim();
    const previewMode =
      dictionaryCreateDialog.previewMode === "products" ? "products" : "gallery";
    const sortOrder = parseDictionarySortOrder(
      dictionaryCreateDialog.sortOrder,
      getNextDictionarySortOrder(dictionaryCreateDialog.kind)
    );

    if (!name) {
      toast.error("Название обязательно");
      return;
    }

    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      toast.error("Slug должен быть на латинице");
      return;
    }

    if (sortOrder === null) {
      toast.error("Порядок сортировки должен быть целым неотрицательным числом");
      return;
    }

    setDictionaryCreateDialog((prev) => ({ ...prev, submitting: true }));
    try {
      await FLOW.adminCreateDictionaryItem({
        input: {
          kind: dictionaryCreateDialog.kind,
          name,
          slug: slug || undefined,
          color: color || undefined,
          imageUrl: imageUrl || undefined,
          previewMode,
          description: description || undefined,
          isActive: true,
          showInCatalogFilter: dictionaryCreateDialog.kind !== "collections",
          showColorInCatalog: dictionaryCreateDialog.showColorInCatalog,
          sortOrder
        }
      });
      await fetchAdminData();
      toast.success("Элемент словаря добавлен");
      if (dictionaryCreateDialog.attachToProduct) {
        setSelectedProductEditorDictionaryTab(dictionaryCreateDialog.kind);
        addDictionaryValueToProduct(dictionaryCreateDialog.kind, name);
      }
      setDictionaryCreateDialog((prev) => ({
        ...prev,
        open: false,
        submitting: false,
        attachToProduct: false,
        name: "",
        slug: "",
        color: "#3b82f6",
        imageUrl: "",
        previewMode: "gallery",
        description: "",
        showColorInCatalog: true,
        sortOrder: "1"
      }));
    } catch (error) {
      setDictionaryCreateDialog((prev) => ({ ...prev, submitting: false }));
      toast.error((error as Error)?.message || "Не удалось добавить элемент словаря");
    }
  };

  const getDictionaryDraftDefaults = (item: DictionaryItem): DictionaryDraft => ({
    name: item.name || "",
    slug: item.slug || "",
    color: item.color || getDictionaryDotColor(item.name || ""),
    imageUrl: item.imageUrl || "",
    previewMode: item.previewMode === "products" ? "products" : "gallery",
    description: item.description || "",
    isActive: item.isActive ?? true,
    showInCatalogFilter: item.showInCatalogFilter ?? true,
    showColorInCatalog: item.showColorInCatalog ?? true,
    sortOrder: String(item.sortOrder ?? 0)
  });

  const closeCreateDictionaryDialog = () => {
    setDictionaryCreateDialog((prev) => {
      if (prev.submitting) return prev;
      return {
        ...prev,
        open: false,
        attachToProduct: false,
        name: "",
        slug: "",
        color: "#3b82f6",
        imageUrl: "",
        previewMode: "gallery",
        description: "",
        showColorInCatalog: true,
        sortOrder: "1"
      };
    });
  };

  const startEditDictionaryItem = (item: DictionaryItem) => {
    setEditingDictionaryItemId(item.id);
    setDictionaryDrafts((prev) => ({ ...prev, [item.id]: getDictionaryDraftDefaults(item) }));
  };

  const cancelEditDictionaryItem = (item: DictionaryItem) => {
    setEditingDictionaryItemId(null);
    setDictionaryDrafts((prev) => {
      const copy = { ...prev };
      delete copy[item.id];
      return copy;
    });
  };

  const requestDeleteDictionaryItem = (kind: DictionaryKind, item: DictionaryItem) => {
    if (isDictionaryItemUsed(kind, item)) {
      toast.error(`Элемент «${item.name}» используется в товарах. Его можно редактировать, но нельзя удалять.`);
      return;
    }

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

  const updateDictionaryItem = async (kind: DictionaryKind, item: DictionaryItem) => {
    const draft = dictionaryDrafts[item.id] ?? getDictionaryDraftDefaults(item);
    const nextName = (draft.name ?? item.name ?? "").trim();
    const nextSlug = (draft.slug ?? item.slug ?? "").trim().toLowerCase();
    const nextSortOrder = parseDictionarySortOrder(draft.sortOrder, item.sortOrder ?? 0);
    if (!nextName) {
      toast.error("Название обязательно");
      return;
    }
    if (!nextSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nextSlug)) {
      toast.error("Slug обязателен и должен быть на латинице");
      return;
    }
    if (nextSortOrder === null) {
      toast.error("Порядок сортировки должен быть целым неотрицательным числом");
      return;
    }
    try {
      await FLOW.adminUpdateDictionaryItem({
        input: {
          kind,
          id: item.id,
          name: nextName,
          slug: nextSlug,
          color: draft.color,
          imageUrl: draft.imageUrl,
          previewMode: draft.previewMode,
          description: draft.description,
          isActive: draft.isActive,
          showInCatalogFilter: kind !== "collections" && draft.showInCatalogFilter,
          showColorInCatalog: draft.showColorInCatalog,
          sortOrder: nextSortOrder
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
      const preparedFile = file;

      if (false && preparedFile.size > TELEGRAM_BOT_LIMITS.imageUploadBytes) {
        toast.error("Файл слишком большой для безопасной загрузки в Telegram.");
        return;
      }

      const formDataUpload = new FormData();
      formDataUpload.append("files", preparedFile);
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
      toast.error(getErrorMessage(error, "Не удалось загрузить иконку"));
    } finally {
      setFaviconUploading(false);
    }
  };

  function isSettingEnabled(key: string, fallback = false) {
    const value = (settings[key] ?? (fallback ? "true" : "false")).toLowerCase();
    return value === "true" || value === "1" || value === "on";
  }

  const renderPaymentIntegrationStatus = (providerName: string, enabled: boolean, issues: string[]) => {
    const hasIssues = issues.length > 0;
    const className = !enabled
      ? "rounded-none border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
      : hasIssues
        ? "rounded-none border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        : "rounded-none border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800";
    const title = !enabled
      ? "Статус: выключено"
      : hasIssues
        ? "Статус: есть проблемы"
        : "Статус: готово";
    const description = !enabled
      ? `Провайдер ${providerName} отключен, поэтому его способы оплаты не показываются в checkout.`
      : hasIssues
        ? `Провайдер ${providerName} включен, но checkout скрывает его способы оплаты, пока не исправлены проблемы ниже.`
        : `Провайдер ${providerName} настроен, и его способы оплаты могут показываться в checkout.`;

    return (
      <div className={className}>
        <div className="font-semibold">{title}</div>
        <p className="mt-1">{description}</p>
      </div>
    );
  };

  const isYandexDeliveryEnabled = isSettingEnabled("yandex_delivery_enabled", true);
  const isYandexDeliveryTestMode = isSettingEnabled("yandex_delivery_use_test_environment");
  const yandexDeliveryConfigurationIssues: string[] = [];

  if (isYandexDeliveryEnabled && !isYandexDeliveryTestMode && !(settings["yandex_delivery_api_token"] || "").trim()) {
    yandexDeliveryConfigurationIssues.push("Добавьте API token Яндекс.Доставки для боевого контура.");
  }

  if (isYandexDeliveryEnabled && !isYandexDeliveryTestMode && !yandexSourceStationId.trim()) {
    yandexDeliveryConfigurationIssues.push("Укажите SourceStationId склада отправки для боевого контура.");
  }

  const renderYandexDeliveryIntegrationStatus = () => {
    const hasIssues = yandexDeliveryConfigurationIssues.length > 0;
    const className = !isYandexDeliveryEnabled
      ? "rounded-none border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
      : hasIssues
      ? "rounded-none border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
      : "rounded-none border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800";
    const title = !isYandexDeliveryEnabled
      ? "Статус: выключено"
      : hasIssues
      ? "Статус: есть проблемы"
      : isYandexDeliveryTestMode
        ? "Статус: готово в тестовом контуре"
        : "Статус: готово в боевом контуре";
    const description = !isYandexDeliveryEnabled
      ? "Яндекс.Доставка отключена, поэтому checkout не будет показывать доставку до двери и ПВЗ."
      : hasIssues
      ? "Яндекс.Доставка не готова к полноценной работе в боевом контуре, пока не исправлены пункты ниже."
      : isYandexDeliveryTestMode
        ? "Тестовый контур активен. Если API token или SourceStationId пусты, backend подставит тестовые значения."
        : "Боевой контур настроен. Расчет доставки и обновление статусов могут работать с боевыми значениями.";

    return (
      <div className={className}>
        <div className="font-semibold">{title}</div>
        <p className="mt-1">{description}</p>
      </div>
    );
  };

  const getDictionaryFilterOrderSetting = (kind: DictionaryKind) => {
    const key = DICTIONARY_FILTER_ORDER_SETTING_KEYS[kind];
    return settings[key] ?? DEFAULT_APP_SETTINGS[key] ?? "0";
  };

  const formatBytes = (value?: number) => {
    if (!value || value <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const size = value / (1024 ** index);
    return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  };

  const buildGalleryAssignedName = (file: File, index: number, total: number) => {
    const customName = galleryName.trim();
    const baseFileName = file.name.replace(/\.[^.]+$/, "").trim() || file.name;
    if (!customName) return baseFileName;
    if (total === 1) return customName;
    return `${customName} ${String(index + 1).padStart(2, "0")}`;
  };

  const updateGalleryUploadQueueItem = (itemId: string, updater: (item: GalleryUploadItem) => GalleryUploadItem) => {
    setGalleryUploadQueue((prev) => prev.map((item) => (item.id === itemId ? updater(item) : item)));
  };

  const clearGalleryUploadQueue = () => {
    if (galleryUploading) return;
    setGalleryUploadQueue([]);
    setIsGalleryUploadPanelOpen(false);
  };

  const uploadGalleryFiles = async (filesSource?: FileList | File[] | null) => {
    const sourceFiles = Array.from(filesSource || []).filter((file) => file instanceof File);
    if (sourceFiles.length === 0 || galleryUploading) return;

    setGalleryUploading(true);
    setIsGalleryUploadPanelOpen(true);

    const files = await optimizeFilesForUpload(sourceFiles, settings, "gallery");

    const queueItems = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      fileName: file.name,
      assignedName: buildGalleryAssignedName(file, index, files.length),
      description: galleryDescription.trim(),
      fileSize: file.size,
      uploadedBytes: 0,
      progressPercent: 0,
      speedBytesPerSecond: 0,
      status: "pending" as const,
      error: "",
    }));

    setGalleryUploadQueue(queueItems);

    const uploadedImages: GalleryImage[] = [];
    let successCount = 0;
    let errorCount = 0;

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const queueItem = queueItems[index];
        updateGalleryUploadQueueItem(queueItem.id, (item) => ({
          ...item,
          status: "uploading",
          error: "",
          uploadedBytes: 0,
          progressPercent: 0,
          speedBytesPerSecond: 0,
        }));

        try {
          const payload = new FormData();
          payload.append("file", file);
          payload.append("name", queueItem.assignedName);
          payload.append("description", queueItem.description);

          const uploaded = await FLOW.uploadAdminGalleryImageWithProgress({
            input: payload,
            onProgress: (progress) => {
              updateGalleryUploadQueueItem(queueItem.id, (item) => ({
                ...item,
                status: "uploading",
                uploadedBytes: progress.loaded,
                progressPercent: progress.percent,
                speedBytesPerSecond: progress.speedBytesPerSecond,
              }));
            },
          });

          if (!uploaded?.url) {
            throw new Error("Не удалось получить URL загруженного изображения");
          }

          uploadedImages.push(uploaded);
          successCount += 1;
          updateGalleryUploadQueueItem(queueItem.id, (item) => ({
            ...item,
            status: "success",
            uploadedBytes: item.fileSize,
            progressPercent: 100,
            speedBytesPerSecond: 0,
          }));
        } catch (error) {
          errorCount += 1;
          updateGalleryUploadQueueItem(queueItem.id, (item) => ({
            ...item,
            status: "error",
            speedBytesPerSecond: 0,
            error: getErrorMessage(error, "Не удалось загрузить файл"),
          }));
        }
      }

      if (uploadedImages.length > 0) {
        setGalleryPage(1);
        await loadGalleryImages({ page: 1, search: deferredGallerySearch, silent: true });
        if (galleryPickerTarget) {
          setMediaGalleryPage(1);
          await loadMediaGalleryImages({ page: 1, search: deferredMediaGallerySearch, silent: true });
        }
        setGalleryName("");
        setGalleryDescription("");
      }

      if (successCount > 0 && errorCount === 0) {
        toast.success(`Загружено файлов: ${successCount}`);
      } else if (successCount > 0) {
        toast.success(`Загружено файлов: ${successCount}. Ошибок: ${errorCount}`);
      } else {
        toast.error("Не удалось загрузить файлы в галерею");
      }
    } finally {
      setGalleryUploading(false);
      if (galleryFileInputRef.current) {
        galleryFileInputRef.current.value = "";
      }
    }
  };

  const handleGalleryFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    await uploadGalleryFiles(event.target.files);
    event.target.value = "";
  };

  const handleGalleryDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setGalleryDropActive(false);
    await uploadGalleryFiles(event.dataTransfer?.files);
  };

  const deleteGalleryImage = async (image: GalleryImage) => {
    const confirmed = await confirmAction({
      title: "Удалить изображение?",
      description: `Изображение «${image.name}» будет удалено из галереи.`,
      confirmText: "Удалить",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await FLOW.deleteAdminGalleryImage({ input: { id: image.id } });
      const targetPage = galleryImages.length === 1 && galleryPage > 1 ? galleryPage - 1 : galleryPage;
      setGalleryPage(targetPage);
      await loadGalleryImages({ page: targetPage, search: deferredGallerySearch, silent: true });
      if (galleryPickerTarget) {
        await loadMediaGalleryImages({ page: mediaGalleryPage, search: deferredMediaGallerySearch, silent: true });
      }
      toast.success("Изображение удалено");
    } catch {
      toast.error("Не удалось удалить изображение");
    }
  };

  const copyGalleryImageToDisk = async (image: GalleryImage) => {
    try {
      await FLOW.copyAdminGalleryImageToDisk({ input: { id: image.id } });
      await loadGalleryImages({ page: galleryPage, search: deferredGallerySearch, silent: true });
      toast.success("Изображение скопировано на диск");
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось скопировать изображение"));
    }
  };

  const restoreMissingGalleryImages = async () => {
    try {
      const result = await FLOW.restoreMissingAdminGalleryImages();
      await loadGalleryImages({ page: galleryPage, search: deferredGallerySearch, silent: true });
      if (galleryPickerTarget) {
        await loadMediaGalleryImages({ page: mediaGalleryPage, search: deferredMediaGallerySearch, silent: true });
      }
      toast.success(`Восстановлено файлов: ${result?.restored ?? 0}`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось восстановить изображения"));
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
      const updatedImage = await FLOW.updateAdminGalleryImage({
        input: {
          id: editingGalleryImageId,
          name: editingGalleryName,
          description: editingGalleryDescription
        }
      });
      setGalleryImages((prev) => prev.map((item) => (item.id === updatedImage?.id ? { ...item, ...updatedImage } : item)));
      setGalleryPickerImages((prev) => prev.map((item) => (item.id === updatedImage?.id ? { ...item, ...updatedImage } : item)));
      toast.success("Изображение обновлено");
      cancelEditGalleryImage();
    } catch {
      toast.error("Не удалось обновить метаданные изображения");
    }
  };

  const filteredGalleryImages = galleryImages;

  const galleryUploadTotalBytes = galleryUploadQueue.reduce((sum, item) => sum + item.fileSize, 0);
  const galleryUploadUploadedBytes = galleryUploadQueue.reduce((sum, item) => (
    sum + Math.min(item.fileSize, item.status === "success" ? item.fileSize : item.uploadedBytes)
  ), 0);
  const galleryUploadProgress = galleryUploadTotalBytes > 0
    ? Math.round((galleryUploadUploadedBytes / galleryUploadTotalBytes) * 100)
    : 0;
  const galleryUploadSpeed = galleryUploadQueue.reduce((sum, item) => (
    item.status === "uploading" ? sum + item.speedBytesPerSecond : sum
  ), 0);
  const galleryUploadSuccessCount = galleryUploadQueue.filter((item) => item.status === "success").length;
  const galleryUploadErrorCount = galleryUploadQueue.filter((item) => item.status === "error").length;
  const hasGalleryUploadQueue = galleryUploadQueue.length > 0;

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const productsById = useMemo(() => new Map(products.map((product) => [product._id, product])), [products]);
  const usedDictionaryValues = useMemo(() => {
    const sizes = new Set<string>();
    const materials = new Set<string>();
    const colors = new Set<string>();
    const categories = new Set<string>();
    const collections = new Set<string>();

    products.forEach((product) => {
      getProductSizeNames(product).forEach((value) => sizes.add(normalizeDictionaryUsageKey(value)));
      normalizeDictionaryValues(product.materials, product.material).forEach((value) => materials.add(normalizeDictionaryUsageKey(value)));
      normalizeDictionaryValues(product.colors, product.color).forEach((value) => colors.add(normalizeDictionaryUsageKey(value)));
      normalizeDictionaryValues(product.categories, product.category).forEach((value) => categories.add(normalizeDictionaryUsageKey(value)));
      normalizeDictionaryValues(product.collections).forEach((value) => collections.add(normalizeDictionaryUsageKey(value)));
    });

    return { sizes, materials, colors, categories, collections };
  }, [products]);

  const USERS_PER_PAGE = 10;
  const visibleOrderColumns = useMemo(() => {
    const hidden = new Set(orderTablePreferences.hiddenColumns);
    return orderTablePreferences.columnOrder
      .map((columnId) => ORDER_TABLE_COLUMNS.find((column) => column.id === columnId))
      .filter((column): column is OrderTableColumnDefinition => Boolean(column))
      .filter((column) => !hidden.has(column.id));
  }, [orderTablePreferences]);

  const filteredUsers = useMemo(() => {
    const query = usersSearch.trim().toLowerCase();
    return users.filter((user) => {
      const roleMatch = usersRoleFilter === "all"
        ? true
        : usersRoleFilter === "admin"
          ? user.isAdmin
          : !user.isAdmin;
      const statusMatch = usersStatusFilter === "all"
        ? true
        : usersStatusFilter === "active"
          ? !user.isBlocked
          : user.isBlocked;
      if (!roleMatch || !statusMatch) return false;
      if (!query) return true;

      return buildAdminUserSearchText(user).includes(query);
    });
  }, [users, usersRoleFilter, usersSearch, usersStatusFilter]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const paginatedUsers = useMemo(() => {
    const safePage = Math.min(usersPage, totalUserPages);
    const start = (safePage - 1) * USERS_PER_PAGE;
    return filteredUsers.slice(start, start + USERS_PER_PAGE);
  }, [filteredUsers, usersPage, totalUserPages]);

  useEffect(() => {
    setUsersPage(1);
  }, [usersSearch, usersRoleFilter, usersStatusFilter]);

  useEffect(() => {
    if (usersPage > totalUserPages) {
      setUsersPage(totalUserPages);
    }
  }, [usersPage, totalUserPages]);

  const mergeTargetUser = useMemo(() => {
    if (!userMergeForm.targetUserId) return null;
    return usersById.get(userMergeForm.targetUserId) || null;
  }, [userMergeForm.targetUserId, usersById]);

  const mergeSourceUsers = useMemo(
    () => userMergeForm.sourceUserIds
      .map((userId) => usersById.get(userId) || null)
      .filter(Boolean) as AdminUser[],
    [userMergeForm.sourceUserIds, usersById]
  );

  const selectedMergeSourceIds = useMemo(
    () => new Set(userMergeForm.sourceUserIds),
    [userMergeForm.sourceUserIds]
  );

  const userMergeEmailOptions = useMemo(() => {
    if (!mergeTargetUser || mergeSourceUsers.length === 0) return [];
    return mergeAdminContactOptions([mergeTargetUser, ...mergeSourceUsers], collectAdminUserEmailOptions);
  }, [mergeSourceUsers, mergeTargetUser]);

  const userMergePhoneOptions = useMemo(() => {
    if (!mergeTargetUser || mergeSourceUsers.length === 0) return [];
    return mergeAdminContactOptions([mergeTargetUser, ...mergeSourceUsers], collectAdminUserPhoneOptions);
  }, [mergeSourceUsers, mergeTargetUser]);

  const mergeTargetCandidateUsers = useMemo(() => {
    const query = userMergeForm.targetSearch.trim().toLowerCase();
    return users
      .map((user) => ({ user, score: 0 }))
      .filter(({ user, score }) => {
        if (!query) return users.length <= 20 || user.id === userMergeForm.targetUserId;
        return buildAdminUserSearchText(user).includes(query);
      })
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return buildAdminUserDisplayName(left.user).localeCompare(buildAdminUserDisplayName(right.user), "ru");
      })
      .slice(0, query ? 50 : 20)
      .map((entry) => entry.user);
  }, [userMergeForm.targetSearch, userMergeForm.targetUserId, users]);

  const mergeSourceCandidateUsers = useMemo(() => {
    if (!mergeTargetUser) return [];

    const query = userMergeForm.sourceSearch.trim().toLowerCase();
    return users
      .filter((user) => user.id !== mergeTargetUser.id)
      .map((user) => ({
        user,
        score: getMergeCandidateScore(mergeTargetUser, user),
        selected: selectedMergeSourceIds.has(user.id),
      }))
      .filter(({ user, score, selected }) => {
        if (!query) return selected || score > 0 || users.length <= 20;
        return buildAdminUserSearchText(user).includes(query);
      })
      .sort((left, right) => {
        if (left.selected !== right.selected) return left.selected ? -1 : 1;
        if (right.score !== left.score) return right.score - left.score;
        return buildAdminUserDisplayName(left.user).localeCompare(buildAdminUserDisplayName(right.user), "ru");
      })
      .slice(0, query ? 60 : 24)
      .map((entry) => entry.user);
  }, [mergeTargetUser, selectedMergeSourceIds, userMergeForm.sourceSearch, users]);

  const openUserEditModal = (user: AdminUser) => {
    setSelectedUser(user);
    setUserEditForm({
      email: user.email || "",
      name: user.profile?.name || "",
      phone: user.profile?.phone || "",
      nickname: user.profile?.nickname || "",
      shippingAddress: user.profile?.shippingAddress || "",
      password: ""
    });
    setPendingSensitiveFields([]);
    setIsSensitiveConfirmOpen(false);
    setIsUserEditModalOpen(true);
  };

  const closeUserEditModal = () => {
    setIsUserEditModalOpen(false);
    setUserMergeSaving(false);
    setPendingSensitiveFields([]);
    setIsSensitiveConfirmOpen(false);
  };

  const resetUserMergeForm = () => {
    setUserMergeForm({
      targetUserId: "",
      targetSearch: "",
      sourceUserIds: [],
      sourceSearch: "",
      email: "",
      phone: "",
    });
  };

  const selectUserMergeTarget = (user: AdminUser) => {
    const preservedSources = userMergeForm.sourceUserIds
      .filter((sourceUserId) => sourceUserId !== user.id)
      .map((sourceUserId) => usersById.get(sourceUserId) || null)
      .filter(Boolean) as AdminUser[];
    const emailOptions = mergeAdminContactOptions([user, ...preservedSources], collectAdminUserEmailOptions);
    const phoneOptions = mergeAdminContactOptions([user, ...preservedSources], collectAdminUserPhoneOptions);

    setUserMergeForm((prev) => ({
      ...prev,
      targetUserId: user.id,
      sourceUserIds: preservedSources.map((sourceUser) => sourceUser.id),
      email: preservedSources.length > 0
        ? choosePreferredMergeOption(emailOptions, user.profile?.email || user.email || "")
        : "",
      phone: preservedSources.length > 0
        ? choosePreferredMergeOption(phoneOptions, user.profile?.phone || "")
        : "",
    }));
  };

  const toggleUserMergeSource = (user: AdminUser) => {
    if (!mergeTargetUser || user.id === mergeTargetUser.id) return;

    const nextSourceUserIds = selectedMergeSourceIds.has(user.id)
      ? userMergeForm.sourceUserIds.filter((sourceUserId) => sourceUserId !== user.id)
      : [...userMergeForm.sourceUserIds, user.id];
    const nextSourceUsers = nextSourceUserIds
      .map((sourceUserId) => usersById.get(sourceUserId) || null)
      .filter(Boolean) as AdminUser[];
    const emailOptions = mergeAdminContactOptions([mergeTargetUser, ...nextSourceUsers], collectAdminUserEmailOptions);
    const phoneOptions = mergeAdminContactOptions([mergeTargetUser, ...nextSourceUsers], collectAdminUserPhoneOptions);

    setUserMergeForm((prev) => ({
      ...prev,
      sourceUserIds: nextSourceUserIds,
      email: nextSourceUsers.length > 0
        ? choosePreferredMergeOption(
          emailOptions,
          mergeTargetUser.profile?.email || mergeTargetUser.email || ""
        )
        : "",
      phone: nextSourceUsers.length > 0
        ? choosePreferredMergeOption(
          phoneOptions,
          mergeTargetUser.profile?.phone || ""
        )
        : "",
    }));
  };

  const getSensitiveFieldLabel = (field: SensitiveField) => {
    if (field === "email") return "Email";
    if (field === "phone") return "Телефон";
    return "Пароль";
  };

  const submitUserEdit = async () => {
    if (!selectedUser) return;

    setUserEditSaving(true);
    try {
      await FLOW.adminUpdateUser({
        input: {
          userId: selectedUser.id,
          email: userEditForm.email.trim(),
          name: userEditForm.name,
          phone: userEditForm.phone,
          nickname: userEditForm.nickname,
          shippingAddress: userEditForm.shippingAddress,
          password: userEditForm.password.trim() || undefined
        }
      });
      await fetchAdminData();
      toast.success("Пользователь обновлен");
      closeUserEditModal();
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось обновить пользователя"));
    } finally {
      setUserEditSaving(false);
      setPendingSensitiveFields([]);
      setIsSensitiveConfirmOpen(false);
    }
  };

  const submitUserMerge = async () => {
    if (!mergeTargetUser || mergeSourceUsers.length === 0) return;

    const sourceUsersLabel = mergeSourceUsers
      .slice(0, 3)
      .map((user) => buildAdminUserDisplayName(user))
      .join(", ");
    const remainingSourceUsersCount = Math.max(0, mergeSourceUsers.length - 3);
    const mergeScopeDescription = remainingSourceUsersCount > 0
      ? `${sourceUsersLabel} и ещё ${remainingSourceUsersCount}`
      : sourceUsersLabel;

    const confirmed = await confirmAction({
      title: "Объединить аккаунты?",
      description: mergeSourceUsers.length === 1
        ? `Аккаунт ${mergeScopeDescription} будет объединён в ${buildAdminUserDisplayName(mergeTargetUser)}. Источник будет удалён после переноса заказов, корзины, сессий и внешних привязок.`
        : `В профиль ${buildAdminUserDisplayName(mergeTargetUser)} будут объединены ${mergeSourceUsers.length} аккаунтов: ${mergeScopeDescription}. После переноса заказов, корзины, сессий и внешних привязок аккаунты-источники будут удалены.`,
      confirmText: "Объединить",
      variant: "destructive",
    });
    if (!confirmed) return;

    setUserMergeSaving(true);
    try {
      await FLOW.adminMergeUsers({
        input: {
          sourceUserIds: mergeSourceUsers.map((user) => user.id),
          targetUserId: mergeTargetUser.id,
          email: userMergeForm.email || undefined,
          phone: userMergeForm.phone || undefined,
        },
      });
      await fetchAdminData();
      toast.success(mergeSourceUsers.length === 1 ? "Аккаунт объединён" : `Объединено аккаунтов: ${mergeSourceUsers.length}`);
      resetUserMergeForm();
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось объединить аккаунты"));
    } finally {
      setUserMergeSaving(false);
    }
  };

  const renderUserMergePanel = () => (
    <div className="space-y-4 border border-gray-200 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-bold uppercase">Объединение аккаунтов</h3>
          <p className="text-sm text-muted-foreground">
            Выберите основной профиль и один или несколько аккаунтов-источников. После безопасного переноса заказов, корзины, сессий и внешних привязок аккаунты-источники будут удалены.
          </p>
        </div>
        {(mergeTargetUser || mergeSourceUsers.length > 0) ? (
          <Button type="button" variant="outline" className="rounded-none" onClick={resetUserMergeForm}>
            Сбросить выбор
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="user-merge-target-search">Основной профиль</Label>
            <Input
              id="user-merge-target-search"
              value={userMergeForm.targetSearch}
              onChange={(e) => setUserMergeForm((prev) => ({ ...prev, targetSearch: e.target.value }))}
              className="h-11 rounded-none"
              placeholder="Email, телефон, ник, ID, провайдер"
            />
          </div>

          <div className="min-h-[320px] max-h-[420px] space-y-2 overflow-auto border border-gray-200 bg-white p-2">
            {mergeTargetCandidateUsers.map((user) => {
              const isSelected = user.id === userMergeForm.targetUserId;
              return (
                <button
                  key={`target-${user.id}`}
                  type="button"
                  onClick={() => selectUserMergeTarget(user)}
                  className={`w-full rounded-none border px-3 py-3 text-left transition ${isSelected ? "border-black bg-black text-white" : "border-gray-200 hover:border-black"}`}
                >
                  <div className="font-semibold break-all">{buildAdminUserDisplayName(user)}</div>
                  <div className={`mt-1 text-sm ${isSelected ? "text-white/80" : "text-muted-foreground"}`}>
                    {user.profile?.name || "Без имени"}
                    {user.profile?.nickname ? ` | @${user.profile.nickname}` : ""}
                    {user.profile?.phone ? ` | ${user.profile.phone}` : ""}
                  </div>
                  {(user.externalIdentities || []).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(user.externalIdentities || []).map((identity) => (
                        <span
                          key={`target-${user.id}-${identity.provider}-${identity.providerEmail || identity.providerUsername || ""}`}
                          className={`inline-flex border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${isSelected ? "border-white/40 text-white" : "border-gray-200 text-muted-foreground"}`}
                        >
                          {getExternalProviderLabel(identity.provider)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })}
            {mergeTargetCandidateUsers.length === 0 ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">
                {userMergeForm.targetSearch.trim()
                  ? "Ничего не найдено. Попробуйте другой email, телефон, ник или ID."
                  : "Начните вводить email, телефон, ник или ID, чтобы выбрать основной профиль."}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="user-merge-source-search">Аккаунты для объединения</Label>
              <span className="text-xs text-muted-foreground">
                {mergeSourceUsers.length > 0 ? `Выбрано: ${mergeSourceUsers.length}` : "Можно выбрать несколько"}
              </span>
            </div>
            <Input
              id="user-merge-source-search"
              value={userMergeForm.sourceSearch}
              onChange={(e) => setUserMergeForm((prev) => ({ ...prev, sourceSearch: e.target.value }))}
              className="h-11 rounded-none"
              placeholder={mergeTargetUser ? "Email, телефон, ник, ID, провайдер" : "Сначала выберите основной профиль"}
              disabled={!mergeTargetUser}
            />
          </div>

          <div className="min-h-[320px] max-h-[420px] space-y-2 overflow-auto border border-gray-200 bg-white p-2">
            {!mergeTargetUser ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">
                Сначала выберите основной профиль. После этого здесь появятся вероятные дубли и ручной поиск.
              </div>
            ) : null}
            {mergeTargetUser ? mergeSourceCandidateUsers.map((user) => {
              const isSelected = selectedMergeSourceIds.has(user.id);
              return (
                <button
                  key={`source-${user.id}`}
                  type="button"
                  onClick={() => toggleUserMergeSource(user)}
                  className={`w-full rounded-none border px-3 py-3 text-left transition ${isSelected ? "border-black bg-black text-white" : "border-gray-200 hover:border-black"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="break-all font-semibold">{buildAdminUserDisplayName(user)}</div>
                      <div className={`mt-1 text-sm ${isSelected ? "text-white/80" : "text-muted-foreground"}`}>
                        {user.profile?.name || "Без имени"}
                        {user.profile?.nickname ? ` | @${user.profile.nickname}` : ""}
                        {user.profile?.phone ? ` | ${user.profile.phone}` : ""}
                      </div>
                    </div>
                    <span className={`shrink-0 border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${isSelected ? "border-white/40 text-white" : "border-gray-200 text-muted-foreground"}`}>
                      {isSelected ? "Выбран" : "Добавить"}
                    </span>
                  </div>
                  {(user.externalIdentities || []).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(user.externalIdentities || []).map((identity) => (
                        <span
                          key={`source-${user.id}-${identity.provider}-${identity.providerEmail || identity.providerUsername || ""}`}
                          className={`inline-flex border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${isSelected ? "border-white/40 text-white" : "border-gray-200 text-muted-foreground"}`}
                        >
                          {getExternalProviderLabel(identity.provider)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            }) : null}
            {mergeTargetUser && mergeSourceCandidateUsers.length === 0 ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">
                {userMergeForm.sourceSearch.trim()
                  ? "Ничего не найдено. Попробуйте другой email, телефон, ник или ID."
                  : "Вероятные дубли не найдены. Попробуйте поискать аккаунты вручную."}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 rounded-none border border-gray-200 bg-gray-50 p-4">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Основной профиль</div>
            {mergeTargetUser ? (
              <div className="rounded-none border border-gray-200 bg-white p-3">
                <div className="break-all font-semibold">{buildAdminUserDisplayName(mergeTargetUser)}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {mergeTargetUser.profile?.name || "Без имени"}
                  {mergeTargetUser.profile?.phone ? ` | ${mergeTargetUser.profile.phone}` : ""}
                </div>
                {(mergeTargetUser.externalIdentities || []).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(mergeTargetUser.externalIdentities || []).map((identity) => (
                      <span
                        key={`summary-target-${mergeTargetUser.id}-${identity.provider}-${identity.providerEmail || identity.providerUsername || ""}`}
                        className="inline-flex border border-gray-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {getExternalProviderLabel(identity.provider)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-none border border-dashed border-gray-300 bg-white px-3 py-4 text-sm text-muted-foreground">
                Выберите профиль слева.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Аккаунты-источники</div>
              <div className="text-xs text-muted-foreground">
                {mergeSourceUsers.length > 0 ? `Выбрано: ${mergeSourceUsers.length}` : "Не выбраны"}
              </div>
            </div>
            {mergeSourceUsers.length > 0 ? (
              <div className="max-h-[220px] space-y-2 overflow-auto">
                {mergeSourceUsers.map((user) => (
                  <div key={`selected-source-${user.id}`} className="rounded-none border border-gray-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="break-all font-semibold">{buildAdminUserDisplayName(user)}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {user.profile?.name || "Без имени"}
                          {user.profile?.phone ? ` | ${user.profile.phone}` : ""}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 shrink-0 rounded-none px-3"
                        onClick={() => toggleUserMergeSource(user)}
                        disabled={userMergeSaving}
                      >
                        Убрать
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-none border border-dashed border-gray-300 bg-white px-3 py-4 text-sm text-muted-foreground">
                Выберите один или несколько аккаунтов-источников, которые нужно влить в основной профиль.
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="user-merge-email">Итоговый email</Label>
            <select
              id="user-merge-email"
              value={userMergeForm.email}
              onChange={(e) => setUserMergeForm((prev) => ({ ...prev, email: e.target.value }))}
              className="h-11 w-full rounded-none border border-input bg-background px-3 text-sm"
              disabled={mergeSourceUsers.length === 0 || userMergeEmailOptions.length === 0}
            >
              {userMergeEmailOptions.length === 0 ? (
                <option value="">Нет email для выбора</option>
              ) : null}
              {userMergeEmailOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} {option.verified ? "| подтверждён" : "| не подтверждён"}
                </option>
              ))}
            </select>
            <div className="text-xs text-muted-foreground">
              Для входа лучше оставлять подтверждённый email одного из объединяемых аккаунтов.
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="user-merge-phone">Итоговый телефон</Label>
            <select
              id="user-merge-phone"
              value={userMergeForm.phone}
              onChange={(e) => setUserMergeForm((prev) => ({ ...prev, phone: e.target.value }))}
              className="h-11 w-full rounded-none border border-input bg-background px-3 text-sm"
              disabled={mergeSourceUsers.length === 0 || userMergePhoneOptions.length === 0}
            >
              {userMergePhoneOptions.length === 0 ? (
                <option value="">Телефон не найден</option>
              ) : null}
              {userMergePhoneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} {option.verified ? "| подтверждён" : "| не подтверждён"}
                </option>
              ))}
            </select>
            <div className="text-xs text-muted-foreground">
              Телефон от внешнего провайдера без подтверждения сохраняется как неподтверждённый.
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full rounded-none"
            onClick={submitUserMerge}
            disabled={!mergeTargetUser || mergeSourceUsers.length === 0 || userMergeSaving}
          >
            {userMergeSaving ? "Объединяем..." : "Объединить аккаунты"}
          </Button>
        </div>
      </div>
    </div>
  );

  const requestUserEditSave = () => {
    if (!selectedUser) return;

    const changedSensitive: SensitiveField[] = [];
    if (userEditForm.email.trim().toLowerCase() !== (selectedUser.email || "").trim().toLowerCase()) {
      changedSensitive.push("email");
    }
    if (userEditForm.phone.trim() !== (selectedUser.profile?.phone || "").trim()) {
      changedSensitive.push("phone");
    }
    if (userEditForm.password.trim()) {
      changedSensitive.push("password");
    }

    if (changedSensitive.length === 0) {
      submitUserEdit();
      return;
    }

    setPendingSensitiveFields(changedSensitive);
    setIsSensitiveConfirmOpen(true);
  };

  const confirmNextSensitiveField = () => {
    if (pendingSensitiveFields.length <= 1) {
      setIsSensitiveConfirmOpen(false);
      setPendingSensitiveFields([]);
      submitUserEdit();
      return;
    }

    setPendingSensitiveFields((prev) => prev.slice(1));
    setIsSensitiveConfirmOpen(false);
    setTimeout(() => setIsSensitiveConfirmOpen(true), 0);
  };

  useEffect(() => {
    if (!selectedUser?.id || !isUserEditModalOpen) {
      setSelectedUserOrders([]);
      setSelectedUserOrdersTotal(selectedUser?.ordersCount || 0);
      setSelectedUserOrdersLoading(false);
      return;
    }

    let cancelled = false;
    const loadSelectedUserOrders = async () => {
      setSelectedUserOrdersLoading(true);
      try {
        const response = await FLOW.adminGetOrders({
          input: {
            userId: selectedUser.id,
            page: 1,
            pageSize: Math.min(Math.max(selectedUser.ordersCount || 20, 20), 100),
          }
        });

        if (cancelled) return;
        setSelectedUserOrders(Array.isArray(response?.items) ? response.items : []);
        setSelectedUserOrdersTotal(Number(response?.totalItems ?? selectedUser.ordersCount ?? 0));
      } catch (error) {
        if (cancelled) return;
        setSelectedUserOrders([]);
        setSelectedUserOrdersTotal(selectedUser.ordersCount || 0);
        toast.error(getErrorMessage(error, "Не удалось загрузить заказы пользователя"));
      } finally {
        if (!cancelled) {
          setSelectedUserOrdersLoading(false);
        }
      }
    };

    void loadSelectedUserOrders();
    return () => {
      cancelled = true;
    };
  }, [selectedUser?.id, selectedUser?.ordersCount, isUserEditModalOpen]);

  useEffect(() => {
    if (!ordersReady) return;
    setOrdersPage(1);
  }, [deferredOrderSearch, ordersStatusFilter, ordersDateFrom, ordersDateTo, ordersPageSize, ordersReady]);

  useEffect(() => {
    if (!isAdmin || selectedAdminTab !== "analytics") return;
    void loadAnalytics();
  }, [isAdmin, selectedAdminTab, analyticsDateFrom, analyticsDateTo]);

  useEffect(() => {
    if (!ordersReady || selectedAdminTab !== "orders") return;
    void loadOrders();
  }, [ordersReady, selectedAdminTab, ordersPage, ordersPageSize, deferredOrderSearch, ordersStatusFilter, ordersDateFrom, ordersDateTo]);

  const selectedOrderUser = useMemo(() => {
    if (!editingOrder) return null;
    return usersById.get(editingOrder.userId) || null;
  }, [editingOrder, usersById]);

  const editingOrderItems = useMemo(() => {
    if (!editingOrder) return [];
    return getOrderItemsDetails(editingOrder);
  }, [editingOrder, productsById]);

  const editingOrderHistory = useMemo(() => {
    if (!editingOrder) return [];
    return getOrderHistoryEntries(editingOrder).slice().reverse();
  }, [editingOrder]);

  const stockHistoryByProductId = useMemo(() => {
    const map = new Map<string, StockHistoryEntry[]>();
    stockHistory.forEach((entry) => {
      if (!entry.productId) return;
      const existing = map.get(entry.productId);
      if (existing) {
        existing.push(entry);
      } else {
        map.set(entry.productId, [entry]);
      }
    });
    return map;
  }, [stockHistory]);

  const selectedProductStockHistoryEntries = useMemo(() => {
    if (!selectedProductStockHistory?._id) return [];
    return stockHistoryByProductId.get(selectedProductStockHistory._id) || [];
  }, [selectedProductStockHistory, stockHistoryByProductId]);

  const selectedProductStockSizes = useMemo(() => {
    if (!selectedProductStockHistory) return [];
    return getProductSizeNames(selectedProductStockHistory);
  }, [selectedProductStockHistory]);

  const selectedProductTotalStock = useMemo(() => {
    if (!selectedProductStockHistory) return 0;
    return selectedProductStockSizes.reduce(
      (sum, size) => sum + Math.max(0, Number(selectedProductStockHistory.sizeStock?.[size] ?? 0)),
      0
    );
  }, [selectedProductStockHistory, selectedProductStockSizes]);

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    if (typeof error === "string" && error.trim()) {
      return error;
    }

    return fallback;
  };

  const getStockHistoryReasonLabel = (reason?: string) => {
    switch ((reason || "").toLowerCase()) {
      case "purchase":
        return "Покупка";
      case "admin_manual":
        return "Ручное изменение";
      case "admin_create":
        return "Создание товара";
      case "admin_update":
        return "Изменение товара";
      case "admin_remove_size":
        return "Удаление размера";
      default:
        return reason || "Ручное изменение";
    }
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
    setActiveTelegramReplyTemplateKey(getDefaultTelegramReplyTemplateKey());
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
    setTelegramBotCheckInfo(createTelegramBotCheckInfoFromBot(bot));
    setTelegramBotValidationError("");
    setTelegramBotTokenVisible(false);
    setTelegramBotForm(createTelegramBotFormFromBot(bot));
    setActiveTelegramReplyTemplateKey(getDefaultTelegramReplyTemplateKey());
    setIsTelegramBotDialogOpen(true);
  };

  const applyTelegramBotValidationInfoToForm = (info?: TelegramBotValidationInfo | null) => {
    if (!info) {
      return;
    }

    setTelegramBotForm((prev) => ({
      ...prev,
      username: info.username ? String(info.username).trim() : prev.username,
      name: info.name ? String(info.name) : prev.name,
      description: typeof info.description === "string" ? info.description : prev.description,
      shortDescription: typeof info.shortDescription === "string" ? info.shortDescription : prev.shortDescription,
      commands: Array.isArray(info.commands)
        ? normalizeTelegramBotCommandsForForm(info.commands)
        : prev.commands,
    }));
  };

  const syncExistingTelegramBotForm = async () => {
    if (!editingTelegramBotId) {
      return null;
    }

    setTelegramBotValidationError("");
    setTelegramBotChecking(true);
    try {
      const bot = await FLOW.adminCheckTelegramBot({ input: { id: editingTelegramBotId } });
      setTelegramBotCheckInfo(createTelegramBotCheckInfoFromBot(bot));
      if (bot) {
        setTelegramBotForm((prev) => createTelegramBotFormFromBot(bot, prev));
      }
      toast.success("Данные бота синхронизированы из Telegram");
      return bot;
    } catch (error) {
      const message = getErrorMessage(error, "Не удалось синхронизировать бота с Telegram");
      setTelegramBotValidationError(message);
      toast.error(message);
      return null;
    } finally {
      setTelegramBotChecking(false);
    }
  };

  const validateTelegramToken = async (
    tokenInput?: string,
    options?: { applyToForm?: boolean; successMessage?: string; errorMessage?: string; silent?: boolean }
  ) => {
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
      const info = await FLOW.adminValidateTelegramBot({ input: { token } }) as TelegramBotValidationInfo | null;
      setTelegramBotCheckInfo(info || null);
      setTelegramBotValidationError("");
      if (options?.applyToForm) {
        applyTelegramBotValidationInfoToForm(info);
      }
      if (!options?.silent) {
        toast.success(options?.successMessage || "Токен подтвержден через Telegram");
      }
      return info;
    } catch (error) {
      const message = getErrorMessage(error, options?.errorMessage || "Не удалось проверить токен Telegram");
      setTelegramBotValidationError(message);
      if (!options?.silent) {
        toast.error(message);
      }
      return null;
    } finally {
      setTelegramBotChecking(false);
    }
  };

  const syncTelegramBotFormWithTelegram = async () => {
    if (editingTelegramBotId && !telegramBotForm.token.trim()) {
      return syncExistingTelegramBotForm();
    }

    const token = telegramBotForm.token.trim();
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
      const info = await FLOW.adminValidateTelegramBot({ input: { token } }) as TelegramBotValidationInfo | null;
      setTelegramBotCheckInfo(info || null);
      applyTelegramBotValidationInfoToForm(info);
      toast.success("Токен подтвержден, поля заполнены данными из Telegram");
      return info;
    } catch (error) {
      const message = getErrorMessage(error, "Не удалось получить данные бота из Telegram");
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
    const requiresJpegConversion = normalizedType !== "image/jpeg" && normalizedType !== "image/jpg";
    if (!normalizedType.startsWith("image/")) {
      toast.error("Для фото профиля Telegram используйте JPG/JPEG.");
      return;
    }

    if (false && file.size > TELEGRAM_BOT_LIMITS.imageUploadBytes) {
      toast.error("Файл слишком большой для безопасной загрузки в Telegram.");
      return;
    }

    try {
      const preparedFile = requiresJpegConversion
        ? await optimizeImageFileForUpload(file, settings, "telegram_bot", {
            forceMimeType: "image/jpeg",
            enabled: true,
            allowLargerResult: true,
          })
        : await optimizeImageFileForUpload(file, settings, "telegram_bot", {
            forceMimeType: "image/jpeg",
          });

      if (preparedFile.size > TELEGRAM_BOT_LIMITS.imageUploadBytes) {
        toast.error("Файл слишком большой для безопасной загрузки в Telegram.");
        return;
      }

      const formDataUpload = new FormData();
      formDataUpload.append("files", preparedFile);
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
      setTelegramBotCheckInfo(createTelegramBotCheckInfoFromBot(savedBot));
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
    const confirmed = await confirmAction({
      title: "Удалить Telegram-бота?",
      description: `Бот «${bot.name}» будет удалён из настроек интеграций.`,
      confirmText: "Удалить",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await FLOW.adminDeleteTelegramBot({ input: { id: bot.id } });
      await fetchAdminData();
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось удалить бота"));
    }
  };

  const telegramBotFormErrors = getTelegramBotFormErrors(telegramBotForm);

  const settingsGroups = [
    { id: "orders", label: "Заказы" },
    { id: "auth", label: "Авторизация" },
    { id: "account-merge", label: "Объединение аккаунтов" },
    { id: "smtp", label: "Почта (SMTP)" },
    { id: "metrics", label: "Метрики" },
    { id: "integrations", label: "Интеграции" },
    { id: "legal", label: "Юридические тексты" },
    { id: "general", label: "Общие" }
  ] as const;
  const settingsGroupsWithBackup = settingsGroups.flatMap((group) =>
    group.id === "general"
      ? [{ id: "backup", label: "Резервное копирование" } as const, group]
      : [group]
  );

  const productCardBackgroundMode = normalizeProductCardBackgroundMode(settings.product_card_background_mode);
  const productCardBackgroundColor = normalizeProductCardBackgroundColor(settings.product_card_background_color);
  const productCardImageFitMode = normalizeProductCardImageFitMode(settings.product_card_image_fit_mode);
  const productDetailBackgroundMode = normalizeProductDetailBackgroundMode(settings.product_detail_background_mode);
  const productDetailBackgroundColor = normalizeProductDetailBackgroundColor(settings.product_detail_background_color);
  const productDetailImageFitMode = normalizeProductDetailImageFitMode(settings.product_detail_image_fit_mode);
  const productDetailMediaSizeMode = normalizeProductDetailMediaSizeMode(settings.product_detail_media_size_mode);
  const productCardBackgroundPreviewStyle = useMemo(() => {
    if (productCardBackgroundMode === "none") {
      return buildTransparentProductCardBackgroundStyle();
    }

    if (productCardBackgroundMode === "color") {
      return buildProductCardBackgroundStyleFromColor(productCardBackgroundColor);
    }

    if (productCardBackgroundMode === "auto") {
      return buildProductCardBackgroundStyleFromColor("#ffffff");
    }

    return buildStandardProductCardBackgroundStyle();
  }, [productCardBackgroundColor, productCardBackgroundMode]);
  const productDetailBackgroundPreviewStyle = useMemo(() => {
    if (productDetailBackgroundMode === "none") {
      return buildTransparentProductCardBackgroundStyle();
    }

    if (productDetailBackgroundMode === "color") {
      return buildProductCardBackgroundStyleFromColor(productDetailBackgroundColor);
    }

    if (productDetailBackgroundMode === "auto") {
      return buildProductCardBackgroundStyleFromColor("#ffffff");
    }

    return buildStandardProductCardBackgroundStyle();
  }, [productDetailBackgroundColor, productDetailBackgroundMode]);
  const productCardPreviewImageDisplay = useMemo(
    () => getProductCardImageDisplayClasses(productCardImageFitMode, "card"),
    [productCardImageFitMode],
  );
  const productDetailPreviewImageDisplay = useMemo(
    () => getProductDetailImageDisplayClasses(productDetailImageFitMode),
    [productDetailImageFitMode],
  );
  const productDetailMediaPreviewLayout = useMemo(
    () => getProductDetailMediaPreviewLayoutClasses(productDetailMediaSizeMode),
    [productDetailMediaSizeMode],
  );

  const dictionaryGroups = [
    { key: "sizes", label: "Размеры" },
    { key: "materials", label: "Материалы" },
    { key: "colors", label: "Цвета" },
    { key: "categories", label: "Категории" },
    { key: "collections", label: "Коллекции" }
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

  const resolveProductCollectionPreviewImageUrls = (product: Product) => {
    const previewImages = [
      product.catalogImageUrl,
      ...(product.images || []),
      ...((product.media || [])
        .filter((item) => item.type === "image")
        .map((item) => item.url)),
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    return previewImages.filter((value, index, list) => list.indexOf(value) === index);
  };

  const getCollectionPreviewImagesFromProducts = (collectionName?: string | null) => {
    const normalizedCollection = normalizeDictionaryUsageKey(collectionName);
    if (!normalizedCollection) {
      return [] as string[];
    }

    const previewImages: string[] = [];
    for (const product of products) {
      const productCollections = normalizeDictionaryValues(product.collections);
      const belongsToCollection = productCollections.some((value) => normalizeDictionaryUsageKey(value) === normalizedCollection);
      if (!belongsToCollection) {
        continue;
      }

      for (const previewImage of resolveProductCollectionPreviewImageUrls(product)) {
        if (!previewImage || previewImages.includes(previewImage)) {
          continue;
        }

        previewImages.push(previewImage);
        if (previewImages.length >= 6) {
          return previewImages;
        }
      }
    }

    return previewImages;
  };

  const resetProductEditor = () => {
    setEditingId(null);
    setEditingProduct(null);
    setProductReviews([]);
    setProductReviewsLoading(false);
    setFormData(createEmptyProductForm());
    setSelectedProductEditorDictionaryTab("categories");
    setProductSubmitting(false);
    setProductUpdateConfirmOpen(false);
    setMediaDeleteDialog({ open: false, slot: null });
    setIsOpen(false);
  };

  const fetchProductReviews = async (productId: string) => {
    setProductReviewsLoading(true);
    try {
      const response = await FLOW.getAdminProductReviews({ input: { productId } });
      setProductReviews(Array.isArray(response?.items) ? response.items : []);
    } catch (error) {
      toast.error("Не удалось загрузить отзывы товара");
      setProductReviews([]);
    } finally {
      setProductReviewsLoading(false);
    }
  };

  const openProductForm = (product?: Product) => {
    if (product) {
      setEditingId(product._id);
      setEditingProduct(product);
      setProductReviews([]);
      void fetchProductReviews(product._id);
      setSelectedProductEditorDictionaryTab("categories");
      const mediaList = buildMediaFromProduct(product);
      setFormData({
        name: product.name,
        slug: product.slug,
        description: product.description,
        basePrice: String(product.basePrice ?? product.price ?? ""),
        discountPercent: String(product.discountPercent ?? 0),
        discountedPrice: String(product.discountedPrice ?? product.price ?? ""),
        categories: sortProductDictionaryValues("categories", product.categories, product.category),
        collections: sortProductDictionaryValues("collections", product.collections),
        images: product.images.join(','),
        videos: (product.videos || []).join(','),
        media: mediaList.length > 0 ? mediaList : [{ type: "image", url: "" }],
        catalogImageUrl: product.catalogImageUrl || "",
        sizes: sortProductDictionaryValues("sizes", getProductSizeNames(product)),
        isNew: product.isNew,
        isPopular: product.isPopular,
        reviewsEnabled: product.reviewsEnabled !== false,
        sku: product.sku || "",
        materials: sortProductDictionaryValues("materials", product.materials, product.material),
        printType: product.printType || "",
        fit: product.fit || "",
        gender: product.gender || "",
        colors: sortProductDictionaryValues("colors", product.colors, product.color),
        shipping: product.shipping || "",
        sizeStock: product.sizeStock || {}
      });
    } else {
      setEditingId(null);
      setEditingProduct(null);
      setProductReviews([]);
      setProductReviewsLoading(false);
      setFormData(createEmptyProductForm());
      setSelectedProductEditorDictionaryTab("categories");
    }
    setIsOpen(true);
  };

  const closeProductForm = () => {
    resetProductEditor();
    if (isStandaloneAdmin && location.pathname !== "/admin") {
      navigate("/admin");
    }
  };

  const openProductStockHistory = (product: Product) => {
    setSelectedProductStockHistory(product);
  };

  const closeProductStockHistory = () => {
    setSelectedProductStockHistory(null);
  };

  const handleAdminTabChange = (value: string) => {
    setSelectedAdminTab(value);
    if (value === "products") {
      closeOrderEditor();
      closeOrderActionDialog();
      return;
    }

    resetProductEditor();
    closeProductStockHistory();
    if (value !== "orders") {
      closeOrderEditor();
      closeOrderActionDialog();
    }
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
      setSelectedAdminTab("products");
      openProductForm();
      return;
    }

    if (routeEditingProductId) {
      setSelectedAdminTab("products");
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

  useEffect(() => {
    if (!selectedProductStockHistory?._id) return;
    const nextProduct = products.find((product) => product._id === selectedProductStockHistory._id);
    if (!nextProduct) {
      setSelectedProductStockHistory(null);
      return;
    }
    if (nextProduct !== selectedProductStockHistory) {
      setSelectedProductStockHistory(nextProduct);
    }
  }, [products, selectedProductStockHistory]);

  useEffect(() => {
    if (!editingOrder?.id) return;
    const nextOrder = orders.find((order) => order.id === editingOrder.id);
    if (nextOrder && nextOrder !== editingOrder) {
      setEditingOrder(nextOrder);
    }
  }, [orders, editingOrder]);

  const buildProductPayload = () => {
    const mediaList = formData.media.filter(item => item.url);
    const imagesFromMedia = mediaList.filter(item => item.type === "image").map(item => item.url);
    const videosFromMedia = mediaList.filter(item => item.type === "video").map(item => item.url);
    const catalogImageUrl = resolveCatalogImageUrl(mediaList, formData.catalogImageUrl);
    return {
      name: formData.name,
      slug: formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-'),
      description: formData.description,
      basePrice: parseFloat(formData.basePrice || "0"),
      discountPercent: parseFloat(formData.discountPercent || "0"),
      discountedPrice: parseFloat(formData.discountedPrice || "0"),
      category: formData.categories[0] || "",
      categories: formData.categories,
      collections: formData.collections,
      images: imagesFromMedia,
      catalogImageUrl,
      videos: videosFromMedia,
      media: mediaList,
      sizes: formData.sizes,
      isNew: formData.isNew,
      isPopular: formData.isPopular,
      reviewsEnabled: formData.reviewsEnabled !== false,
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
  };

  const buildDuplicateProductPayload = (product: Product) => {
    const suffix = Date.now().toString(36).slice(-5);
    const baseSlug = (product.slug || product.name || "product")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "product";

    return {
      name: `${product.name} (копия)`,
      slug: `${baseSlug}-copy-${suffix}`,
      description: product.description || "",
      basePrice: Number(product.basePrice ?? product.price ?? 0),
      discountPercent: Number(product.discountPercent ?? 0),
      discountedPrice: Number(product.discountedPrice ?? product.price ?? 0),
      category: product.categories?.[0] || product.category || "",
      categories: [...(product.categories || (product.category ? [product.category] : []))],
      collections: [...(product.collections || [])],
      images: [...(product.images || [])],
      catalogImageUrl: product.catalogImageUrl || "",
      videos: [...(product.videos || [])],
      media: Array.isArray(product.media) ? product.media.map((item) => ({ ...item })) : [],
      sizes: [...(product.sizes || [])],
      isNew: !!product.isNew,
      isPopular: !!product.isPopular,
      reviewsEnabled: product.reviewsEnabled !== false,
      sku: product.sku || "",
      material: product.materials?.[0] || product.material || "",
      materials: [...(product.materials || (product.material ? [product.material] : []))],
      printType: product.printType || "",
      fit: product.fit || "",
      gender: product.gender || "",
      color: product.colors?.[0] || product.color || "",
      colors: [...(product.colors || (product.color ? [product.color] : []))],
      shipping: product.shipping || "",
      sizeStock: { ...(product.sizeStock || {}) },
      isHidden: true,
    };
  };

  const submitProductForm = async () => {
    setProductSubmitting(true);
    try {
      const payload = buildProductPayload();

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
        setProductUpdateConfirmOpen(false);
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
    } finally {
      setProductSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (productSubmitting) return;
    if (editingId) {
      setProductUpdateConfirmOpen(true);
      return;
    }
    await submitProductForm();
  };

  const handleDelete = async (id: string) => {
    const product = products.find((item) => item._id === id || (item as any).id === id);
    const confirmed = await confirmAction({
      title: "Удалить товар?",
      description: product?.name
        ? `Товар «${product.name}» будет удалён из каталога.`
        : "Товар будет удалён из каталога.",
      confirmText: "Удалить",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await FLOW.deleteProduct({ input: { id } });
      toast.success("Товар удален");
      fetchProducts();
    } catch (error) {
      toast.error("Не удалось удалить");
    }
  };

  const handleToggleHidden = async (product: Product) => {
    const nextHidden = !product.isHidden;
    const confirmed = await confirmAction({
      title: nextHidden ? "Скрыть товар?" : "Показать товар?",
      description: nextHidden
        ? `Товар «${product.name}» останется в админке, но исчезнет с витрины для покупателей.`
        : `Товар «${product.name}» снова станет виден покупателям на витрине.`,
      confirmText: nextHidden ? "Скрыть" : "Показать",
    });
    if (!confirmed) return;

    try {
      await FLOW.updateProduct({
        input: {
          id: product._id,
          isHidden: nextHidden,
        }
      });
      toast.success(nextHidden ? "Товар скрыт" : "Товар снова виден покупателям");
      await fetchProducts();
    } catch (error) {
      toast.error(nextHidden ? "Не удалось скрыть товар" : "Не удалось показать товар");
    }
  };

  const handleDuplicate = async (product: Product) => {
    try {
      const created = await FLOW.createProduct({
        input: buildDuplicateProductPayload(product)
      });

      toast.success("Копия товара создана и пока скрыта от покупателей");
      await fetchProducts();

      if (created?._id) {
        if (isStandaloneAdmin) {
          navigate(`/admin/products/${created._id}/edit`);
        } else {
          handleOpen(created);
        }
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось создать копию товара"));
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
    setSelectedProductEditorDictionaryTab(kind);
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
          sizes: sortProductDictionaryValues("sizes", [...prev.sizes, normalizedName]),
          sizeStock: { ...prev.sizeStock, [normalizedName]: prev.sizeStock[normalizedName] ?? 0 }
        };
      }

      if (kind === "categories") {
        return { ...prev, categories: sortProductDictionaryValues("categories", [...(prev.categories || []), normalizedName]) };
      }

      if (kind === "collections") {
        return { ...prev, collections: sortProductDictionaryValues("collections", [...(prev.collections || []), normalizedName]) };
      }

      if (kind === "materials") {
        return { ...prev, materials: sortProductDictionaryValues("materials", [...(prev.materials || []), normalizedName]) };
      }

      if (kind === "colors") {
        return { ...prev, colors: sortProductDictionaryValues("colors", [...(prev.colors || []), normalizedName]) };
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

      if (kind === "categories" && name) {
        return { ...prev, categories: prev.categories.filter((item) => item !== name) };
      }

      if (kind === "collections" && name) {
        return { ...prev, collections: prev.collections.filter((item) => item !== name) };
      }

      if (kind === "materials" && name) {
        return { ...prev, materials: prev.materials.filter((item) => item !== name) };
      }

      if (kind === "colors" && name) {
        return { ...prev, colors: prev.colors.filter((item) => item !== name) };
      }

      return prev;
    });
  };

  const getProductDictionarySelected = (kind: DictionaryKind, name: string) => {
    if (kind === "sizes") return formData.sizes.includes(name);
    if (kind === "categories") return formData.categories.includes(name);
    if (kind === "collections") return formData.collections.includes(name);
    if (kind === "materials") return formData.materials.includes(name);
    return formData.colors.includes(name);
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

  const moveMediaSlot = (index: number, direction: -1 | 1) => {
    setFormData((prev) => {
      const from = index - 1;
      const to = from + direction;
      if (from < 0 || to < 0 || from >= prev.media.length || to >= prev.media.length) {
        return prev;
      }

      const media = [...prev.media];
      const [current] = media.splice(from, 1);
      if (!current) return prev;
      media.splice(to, 0, current);
      return { ...prev, media };
    });
  };

  const setMediaSlotAsCover = (index: number) => {
    setFormData((prev) => {
      const from = index - 1;
      if (from <= 0 || from >= prev.media.length) return prev;

      const media = [...prev.media];
      const [current] = media.splice(from, 1);
      if (!current) return prev;
      media.unshift(current);
      return { ...prev, media };
    });
  };

  const setMediaSlotAsIcon = (index: number) => {
    setFormData((prev) => {
      const from = index - 1;
      const current = prev.media[from];
      if (!current || current.type !== "image" || !current.url.trim()) return prev;
      if (prev.catalogImageUrl === current.url) return prev;
      return { ...prev, catalogImageUrl: current.url };
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

  const requestRemoveMediaSlot = (slot: number) => {
    setMediaDeleteDialog({ open: true, slot });
  };

  const confirmRemoveMediaSlot = () => {
    if (!mediaDeleteDialog.slot) return;
    removeMediaSlot(mediaDeleteDialog.slot);
    setMediaDeleteDialog({ open: false, slot: null });
  };

  const openGalleryPicker = (target: GalleryPickerTarget) => {
    setMediaGallerySearch("");
    setMediaGalleryPage(1);
    setGalleryPickerTarget(target);
  };

  const openMediaGalleryPicker = (slot: number) => {
    openGalleryPicker({ type: "product-media", slot });
  };

  const openCollectionCreateGalleryPicker = () => {
    openGalleryPicker({ type: "collection-create" });
  };

  const openCollectionEditGalleryPicker = (itemId: string) => {
    openGalleryPicker({ type: "collection-edit", itemId });
  };

  const closeGalleryPicker = () => {
    setGalleryPickerTarget(null);
  };

  const assignSelectedGalleryImage = (url: string) => {
    if (!galleryPickerTarget) return;

    if (galleryPickerTarget.type === "product-media") {
      setMediaSlot(galleryPickerTarget.slot, "image", url);
    } else if (galleryPickerTarget.type === "collection-create") {
      setDictionaryCreateDialog((prev) => ({ ...prev, imageUrl: url, previewMode: "gallery" }));
    } else if (galleryPickerTarget.type === "collection-edit") {
      setDictionaryDrafts((prev) => {
        const current = prev[galleryPickerTarget.itemId];
        if (!current) return prev;
        return {
          ...prev,
          [galleryPickerTarget.itemId]: {
            ...current,
            imageUrl: url,
            previewMode: "gallery",
          },
        };
      });
    }

    closeGalleryPicker();
  };

  const uploadMediaToGalleryAndAssign = async (file: File | null, slot: number) => {
    if (!file) return;
    setUploading(true);
    try {
      const preparedFile = await optimizeImageFileForUpload(file, settings, "product_media");
      const payload = new FormData();
      payload.append("file", preparedFile);
      payload.append("name", preparedFile.name);
      const uploaded = await FLOW.uploadAdminGalleryImage({ input: payload });
      if (!uploaded?.url) {
        throw new Error("Не удалось получить URL загруженного файла");
      }
      setMediaSlot(slot, preparedFile.type.startsWith("video") ? "video" : "image", uploaded.url);
      setGalleryPage(1);
      await loadGalleryImages({ page: 1, search: deferredGallerySearch, silent: true });
      if (galleryPickerTarget) {
        setMediaGalleryPage(1);
        await loadMediaGalleryImages({ page: 1, search: deferredMediaGallerySearch, silent: true });
      }
      toast.success("Файл загружен в галерею и выбран");
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось загрузить файл в галерею"));
    } finally {
      setUploading(false);
    }
  };

  const uploadFromPickerToGallery = async (file: File | null) => {
    if (!file || !galleryPickerTarget) return;

    if (galleryPickerTarget.type === "product-media") {
      await uploadMediaToGalleryAndAssign(file, galleryPickerTarget.slot);
      closeGalleryPicker();
      return;
    }

    setUploading(true);
    try {
      const preparedFile = await optimizeImageFileForUpload(file, settings, "gallery");
      const payload = new FormData();
      payload.append("file", preparedFile);
      payload.append("name", preparedFile.name);
      const uploaded = await FLOW.uploadAdminGalleryImage({ input: payload });
      if (!uploaded?.url) {
        throw new Error("Не удалось получить URL загруженного файла");
      }

      setGalleryPage(1);
      await loadGalleryImages({ page: 1, search: deferredGallerySearch, silent: true });
      setMediaGalleryPage(1);
      await loadMediaGalleryImages({ page: 1, search: deferredMediaGallerySearch, silent: true });
      assignSelectedGalleryImage(uploaded.url);
      toast.success("Изображение загружено в галерею и выбрано");
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось загрузить изображение в галерею"));
    } finally {
      setUploading(false);
    }
  };

  const filteredGalleryPickerImages = galleryPickerImages;
  const safeGalleryTotalPages = Math.max(galleryTotalPages, 1);
  const safeMediaGalleryTotalPages = Math.max(mediaGalleryTotalPages, 1);
  const galleryPageStart = galleryTotalItems > 0 ? (galleryPage - 1) * GALLERY_PAGE_SIZE + 1 : 0;
  const galleryPageEnd = galleryTotalItems > 0 ? Math.min(galleryPage * GALLERY_PAGE_SIZE, galleryTotalItems) : 0;
  const mediaGalleryPageStart = mediaGalleryTotalItems > 0 ? (mediaGalleryPage - 1) * MEDIA_GALLERY_PAGE_SIZE + 1 : 0;
  const mediaGalleryPageEnd = mediaGalleryTotalItems > 0 ? Math.min(mediaGalleryPage * MEDIA_GALLERY_PAGE_SIZE, mediaGalleryTotalItems) : 0;

  const mediaDeleteTarget = mediaDeleteDialog.slot ? formData.media[mediaDeleteDialog.slot - 1] ?? null : null;
  const resolvedCatalogImageUrl = resolveCatalogImageUrl(formData.media, formData.catalogImageUrl);

  const productEditorDictionaryTabs = [
    { key: "categories" as const, label: "Категории", count: formData.categories.length },
    { key: "collections" as const, label: "Коллекции", count: formData.collections.length },
    { key: "sizes" as const, label: "Размеры", count: formData.sizes.length },
    { key: "materials" as const, label: "Материалы", count: formData.materials.length },
    { key: "colors" as const, label: "Цвета", count: formData.colors.length }
  ];

  const handleModerateReview = async (reviewId: string, action: "hide" | "show" | "delete" | "restore") => {
    if (!editingProduct) return;

    if (action === "delete") {
      const confirmed = await confirmAction({
        title: "Удалить отзыв?",
        description: "Отзыв пропадёт с витрины, но запись останется в базе.",
        confirmText: "Удалить",
        variant: "destructive",
      });
      if (!confirmed) return;
    }

    try {
      const review = await FLOW.moderateProductReview({
        input: {
          productId: editingProduct._id,
          reviewId,
          action,
        },
      });

      setProductReviews((prev) => prev.map((item) => (item.id === reviewId ? review : item)));

      const actionLabel = action === "hide"
        ? "Отзыв скрыт"
        : action === "show"
          ? "Отзыв снова опубликован"
          : action === "restore"
            ? "Отзыв восстановлен"
            : "Отзыв удален";
      toast.success(actionLabel);
    } catch (error) {
      toast.error("Не удалось изменить статус отзыва");
    }
  };

  if (loading) return <LoadingSpinner className={embedded ? "h-56" : "h-screen"} />;
  if (!isAdmin) return null;

  return (
      <div className={embedded ? "" : "min-h-screen flex flex-col bg-background text-foreground"}>
        {!embedded && <Header />}
        
        <main className={embedded ? "" : "flex-1 container mx-auto px-4 pb-8 pt-24 md:pb-12 md:pt-20"}>
          <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-black uppercase tracking-tighter sm:text-4xl">ПАНЕЛЬ АДМИНИСТРАТОРА</h1>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {!embedded && <Button variant="outline" className="w-full rounded-none font-bold uppercase tracking-widest sm:w-auto" onClick={async () => {
                await FLOW.adminLogout();
                navigate("/profile");
              }}>
                ВЫЙТИ
              </Button>}
              <Button onClick={() => handleOpen()} className="w-full rounded-none bg-black font-bold uppercase tracking-widest text-white hover:bg-gray-800 sm:w-auto">
                <Plus className="w-4 h-4 mr-2" /> ДОБАВИТЬ ТОВАР
              </Button>
            </div>
          </div>

          <Tabs value={selectedAdminTab} onValueChange={handleAdminTabChange} className="w-full">
            <TabsList className="mb-6 h-auto w-full justify-start gap-3 overflow-x-auto border-b border-gray-200 bg-transparent p-0 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mb-8 md:gap-8">
              <TabsTrigger value="analytics" className="shrink-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 text-xs font-bold uppercase tracking-[0.22em] sm:text-sm">АНАЛИТИКА</TabsTrigger>
              <TabsTrigger value="products" className="shrink-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 text-xs font-bold uppercase tracking-[0.22em] sm:text-sm">ТОВАРЫ</TabsTrigger>
              <TabsTrigger value="orders" className="shrink-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 text-xs font-bold uppercase tracking-[0.22em] sm:text-sm">ЗАКАЗЫ</TabsTrigger>
              <TabsTrigger value="users" className="shrink-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 text-xs font-bold uppercase tracking-[0.22em] sm:text-sm">ПОЛЬЗОВАТЕЛИ</TabsTrigger>
              <TabsTrigger value="gallery" className="shrink-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 text-xs font-bold uppercase tracking-[0.22em] sm:text-sm">ГАЛЕРЕЯ</TabsTrigger>
              <TabsTrigger value="dictionaries" className="shrink-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 text-xs font-bold uppercase tracking-[0.22em] sm:text-sm">СЛОВАРИ</TabsTrigger>
              <TabsTrigger value="settings" className="shrink-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-black rounded-none px-0 py-2 text-xs font-bold uppercase tracking-[0.22em] sm:text-sm">НАСТРОЙКИ</TabsTrigger>
            </TabsList>

          <TabsContent value="products" className="mt-0">
          {!isOpen && (
            <div className="space-y-4">
              <div className="border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-muted-foreground">
                Нажмите на название товара, чтобы открыть историю остатков по размерам.
              </div>
              <div className="space-y-3 md:hidden">
                {products.map((product) => {
                  const sizeNames = getProductSizeNames(product);
                  const hasStockInfo = Boolean(product.sizeStock && Object.keys(product.sizeStock).length > 0);
                  const stockEntries = hasStockInfo
                    ? sizeNames.map((size) => ({
                        size,
                        stock: Math.max(0, Number(product.sizeStock?.[size] ?? 0)),
                      }))
                    : [];
                  const totalStock = stockEntries.reduce((sum, entry) => sum + entry.stock, 0);
                  const previewImageUrl =
                    product.catalogImageUrl || product.images?.[0] || product.media?.find((media) => media.type === "image")?.url || "";
                  const priceValue = Math.round(product.discountPercent ? (product.discountedPrice || product.price) : (product.basePrice || product.price));

                  return (
                    <div key={product._id} className="border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        {previewImageUrl ? (
                          <img src={previewImageUrl} alt={product.name} className="h-24 w-20 shrink-0 bg-gray-100 object-cover" />
                        ) : (
                          <div className="h-24 w-20 shrink-0 bg-gray-200" />
                        )}

                        <div className="min-w-0 flex-1 space-y-2">
                          <button
                            type="button"
                            onClick={() => openProductStockHistory(product)}
                            className="w-full text-left transition-opacity hover:opacity-80"
                          >
                            <div className="truncate text-base font-bold leading-tight">{product.name}</div>
                            {product.isHidden && (
                              <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700">
                                Скрыт с витрины
                              </div>
                            )}
                          </button>

                          <div className="text-xl font-black leading-none">{priceValue}₽</div>

                          <div className="flex flex-wrap gap-1">
                            {product.isNew && <span className="bg-black px-2 py-0.5 text-[10px] font-bold uppercase text-white">Новинка</span>}
                            {product.isPopular && <span className="bg-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase text-black">Хит</span>}
                            {product.isHidden && <span className="bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">Скрыт</span>}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        <div>
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Размеры</div>
                          {sizeNames.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {sizeNames.map((size) => (
                                <span key={size} className="inline-flex items-center border border-gray-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide">
                                  {size}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Не указаны</span>
                          )}
                        </div>

                        <div>
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Остатки</div>
                          {hasStockInfo ? (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-1">
                                {stockEntries.map(({ size, stock }) => (
                                  <span
                                    key={size}
                                    className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] font-semibold ${stock > 0 ? "border-gray-200 text-black" : "border-red-200 bg-red-50 text-red-600"}`}
                                  >
                                    <span className="uppercase tracking-wide">{size}</span>
                                    <span>{stock}</span>
                                  </span>
                                ))}
                              </div>
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Всего: {totalStock}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Не заданы</span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Button type="button" variant="outline" className="h-10 rounded-none" onClick={() => handleOpen(product)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Изменить
                          </Button>
                          <Button type="button" variant="outline" className="h-10 rounded-none" onClick={() => handleDuplicate(product)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Копия
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={`h-10 rounded-none ${product.isHidden ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-amber-200 text-amber-700 hover:bg-amber-50"}`}
                            onClick={() => handleToggleHidden(product)}
                          >
                            {product.isHidden ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
                            {product.isHidden ? "Показать" : "Скрыть"}
                          </Button>
                          <Button type="button" variant="outline" className="h-10 rounded-none border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleDelete(product._id)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Удалить
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-hidden rounded-none border border-gray-200 md:block">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="w-[100px]">Изображение</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Цена</TableHead>
                    <TableHead>Размеры</TableHead>
                    <TableHead>Остатки</TableHead>
                    <TableHead>Метки</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const sizeNames = getProductSizeNames(product);
                    const hasStockInfo = Boolean(product.sizeStock && Object.keys(product.sizeStock).length > 0);
                    const stockEntries = hasStockInfo
                      ? sizeNames.map((size) => ({
                          size,
                          stock: Math.max(0, Number(product.sizeStock?.[size] ?? 0))
                        }))
                      : [];
                    const totalStock = stockEntries.reduce((sum, entry) => sum + entry.stock, 0);

                    return (
                      <TableRow key={product._id}>
                        <TableCell>
                          {(product.images?.[0] || product.media?.find((m) => m.type === "image")?.url) ? (
                            <img src={product.catalogImageUrl || product.images?.[0] || product.media?.find((m) => m.type === "image")?.url} alt={product.name} className="w-12 h-16 object-cover bg-gray-100" />
                          ) : (
                            <div className="w-12 h-16 bg-gray-200" />
                          )}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => openProductStockHistory(product)}
                            className="text-left transition-opacity hover:opacity-80"
                          >
                            <div className="font-bold">{product.name}</div>
                            {product.isHidden && (
                              <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700">
                                Скрыт с витрины
                              </div>
                            )}
                          </button>
                        </TableCell>
                        <TableCell>{Math.round(product.discountPercent ? (product.discountedPrice || product.price) : (product.basePrice || product.price))}₽</TableCell>
                        <TableCell>
                          {sizeNames.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {sizeNames.map((size) => (
                                <span key={size} className="inline-flex items-center border border-gray-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide">
                                  {size}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Не указаны</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {hasStockInfo ? (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-1">
                                {stockEntries.map(({ size, stock }) => (
                                  <span
                                    key={size}
                                    className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] font-semibold ${stock > 0 ? "border-gray-200 text-black" : "border-red-200 bg-red-50 text-red-600"}`}
                                  >
                                    <span className="uppercase tracking-wide">{size}</span>
                                    <span>{stock}</span>
                                  </span>
                                ))}
                              </div>
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Всего: {totalStock}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Не заданы</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {product.isNew && <span className="px-2 py-0.5 bg-black text-white text-[10px] uppercase font-bold">Новинка</span>}
                            {product.isPopular && <span className="px-2 py-0.5 bg-gray-200 text-black text-[10px] uppercase font-bold">Хит</span>}
                            {product.isHidden && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] uppercase font-bold">Скрыт</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Редактировать" onClick={() => handleOpen(product)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Скопировать" onClick={() => handleDuplicate(product)}>
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={product.isHidden ? "Показать товар" : "Скрыть товар"}
                              onClick={() => handleToggleHidden(product)}
                              className={product.isHidden ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" : "text-amber-600 hover:text-amber-700 hover:bg-amber-50"}
                            >
                              {product.isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" title="Удалить" onClick={() => handleDelete(product._id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
          <Dialog open={Boolean(selectedProductStockHistory)} onOpenChange={(open) => (!open ? closeProductStockHistory() : undefined)}>
            <DialogContent className="max-w-5xl rounded-none">
              <DialogHeader>
                <DialogTitle className="uppercase">
                  История остатков{selectedProductStockHistory ? `: ${selectedProductStockHistory.name}` : ""}
                </DialogTitle>
              </DialogHeader>

              {selectedProductStockHistory ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="border border-gray-200 p-4 space-y-3">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Товар</div>
                        <div className="font-bold">{selectedProductStockHistory.name}</div>
                        <div className="text-sm text-muted-foreground">{selectedProductStockHistory.slug}</div>
                      </div>

                      <div>
                        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Текущие остатки по размерам</div>
                        {selectedProductStockSizes.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {selectedProductStockSizes.map((size) => {
                              const stock = Math.max(0, Number(selectedProductStockHistory.sizeStock?.[size] ?? 0));
                              return (
                                <span
                                  key={size}
                                  className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] font-semibold ${stock > 0 ? "border-gray-200 text-black" : "border-red-200 bg-red-50 text-red-600"}`}
                                >
                                  <span className="uppercase tracking-wide">{size}</span>
                                  <span>{stock}</span>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Размеры для товара пока не указаны.</p>
                        )}
                      </div>
                    </div>

                    <div className="border border-gray-200 p-4 space-y-3">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Записей в истории</div>
                        <div className="text-3xl font-black">{selectedProductStockHistoryEntries.length}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Текущий общий остаток</div>
                        <div className="text-3xl font-black">{selectedProductTotalStock}</div>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 max-h-[60vh] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Дата</TableHead>
                          <TableHead>Размер</TableHead>
                          <TableHead>Было</TableHead>
                          <TableHead>Стало</TableHead>
                          <TableHead>Изменение</TableHead>
                          <TableHead>Причина</TableHead>
                          <TableHead>Кто</TableHead>
                          <TableHead>Заказ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedProductStockHistoryEntries.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                              История остатков по этому товару пока пуста
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedProductStockHistoryEntries.map((entry) => {
                            const delta = entry.newValue - entry.oldValue;
                            const deltaClassName = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-muted-foreground";
                            const deltaLabel = `${delta > 0 ? "+" : ""}${delta}`;

                            return (
                              <TableRow key={entry.id}>
                                <TableCell>{entry.changedAt ? new Date(entry.changedAt).toLocaleString("ru-RU") : "—"}</TableCell>
                                <TableCell>{entry.size || entry.sizeId}</TableCell>
                                <TableCell>{entry.oldValue}</TableCell>
                                <TableCell>{entry.newValue}</TableCell>
                                <TableCell className={deltaClassName}>{deltaLabel}</TableCell>
                                <TableCell>{getStockHistoryReasonLabel(entry.reason)}</TableCell>
                                <TableCell>{entry.changedBy || entry.changedByUserId || "—"}</TableCell>
                                <TableCell className="max-w-[180px] truncate">{entry.orderId || "—"}</TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" className="rounded-none" onClick={closeProductStockHistory}>
                      Закрыть
                    </Button>
                  </DialogFooter>
                </div>
              ) : null}
            </DialogContent>
              </Dialog>
          </TabsContent>

          <TabsContent value="analytics" className="mt-0">
            <AdminAnalyticsTab
              analytics={analyticsData}
              loading={analyticsLoading}
              dateFrom={analyticsDateFrom}
              dateTo={analyticsDateTo}
              onDateFromChange={setAnalyticsDateFrom}
              onDateToChange={setAnalyticsDateTo}
              onApplyPreset={applyAnalyticsPreset}
              onRefresh={() => {
                void loadAnalytics();
              }}
              formatRubles={formatRubles}
            />
          </TabsContent>

          <TabsContent value="gallery" className="mt-0">
            <div className="space-y-4">
              <div className="border border-gray-200 p-4 space-y-3">
                <h2 className="text-2xl font-black uppercase">Галерея изображений</h2>
                <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    placeholder="Общее имя или префикс"
                    value={galleryName}
                    onChange={(e) => setGalleryName(e.target.value)}
                    className="rounded-none"
                  />
                  <Input
                    placeholder="Общее описание"
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
                </div>

                <div
                  className={`space-y-3 border border-dashed p-4 transition-colors ${galleryDropActive ? "border-black bg-stone-100" : "border-black/30 bg-stone-50"}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setGalleryDropActive(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setGalleryDropActive(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    const relatedTarget = event.relatedTarget;
                    if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
                      setGalleryDropActive(false);
                    }
                  }}
                  onDrop={handleGalleryDrop}
                >
                  <input
                    id="gallery-file-upload"
                    name="gallery_files"
                    aria-label="Загрузка изображений в галерею"
                    ref={galleryFileInputRef}
                    type="file"
                    accept="image/*,.avif,.jfif"
                    multiple
                    className="hidden"
                    onChange={handleGalleryFileSelection}
                  />

                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold uppercase tracking-wide">Пакетная загрузка</div>
                      <div className="text-sm text-muted-foreground">
                        Перетащите изображения сюда или выберите сразу несколько файлов. Показываем процент, текущую скорость и статус каждого файла.
                      </div>
                      {galleryName.trim() && (
                        <div className="text-xs text-muted-foreground">
                          Общее имя будет использовано как префикс, если выбрано несколько файлов.
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-none"
                        disabled={galleryUploading}
                        onClick={() => galleryFileInputRef.current?.click()}
                      >
                        <ImagePlus className="mr-2 h-4 w-4" />
                        {galleryUploading ? "Идёт загрузка..." : "Выбрать файлы"}
                      </Button>
                      <Button type="button" variant="outline" className="rounded-none" onClick={restoreMissingGalleryImages}>
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        Восстановить
                      </Button>
                      {hasGalleryUploadQueue && (
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-none"
                          onClick={clearGalleryUploadQueue}
                          disabled={galleryUploading}
                        >
                          Очистить список
                        </Button>
                      )}
                    </div>
                  </div>

                  {hasGalleryUploadQueue && (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-muted-foreground">
                      Прогресс загрузки открыт в панели справа снизу и не мешает работе с сайтом.
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
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

              <div className="mb-4 flex flex-col gap-2 border border-gray-200 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between">
                <div>
                  {galleryLoading
                    ? "Загружаем изображения..."
                    : galleryTotalItems > 0
                      ? `Показано ${galleryPageStart}-${galleryPageEnd} из ${galleryTotalItems}`
                      : "Изображения не найдены"}
                </div>
                <div className="text-muted-foreground">Страница {Math.min(galleryPage, safeGalleryTotalPages)} из {safeGalleryTotalPages}</div>
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

              <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-muted-foreground">Всего изображений: {galleryTotalItems}</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => setGalleryPage((prev) => Math.max(1, prev - 1))}
                    disabled={galleryLoading || galleryPage <= 1}
                  >
                    Назад
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => setGalleryPage((prev) => Math.min(safeGalleryTotalPages, prev + 1))}
                    disabled={galleryLoading || galleryPage >= safeGalleryTotalPages}
                  >
                    Вперед
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="users" className="mt-0">
            <div className="border border-gray-200 p-4">
              <h2 className="text-2xl font-black uppercase mb-4">Пользователи и права</h2>

              <div className="mb-4 grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_140px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    name="users_search"
                    aria-label="Поиск пользователей"
                    value={usersSearch}
                    onChange={(e) => setUsersSearch(e.target.value)}
                    placeholder="Поиск: email, имя, ник, телефон, ID"
                    className="h-11 rounded-none pl-9"
                  />
                </div>

                <select
                  id="users-role-filter"
                  name="users_role_filter"
                  aria-label="Фильтр пользователей по роли"
                  value={usersRoleFilter}
                  onChange={(e) => setUsersRoleFilter(e.target.value as typeof usersRoleFilter)}
                  className="h-11 border border-input bg-background px-3 text-sm rounded-none"
                >
                  <option value="all">Все роли</option>
                  <option value="admin">Только админы</option>
                  <option value="user">Только пользователи</option>
                </select>

                <select
                  id="users-status-filter"
                  name="users_status_filter"
                  aria-label="Фильтр пользователей по статусу"
                  value={usersStatusFilter}
                  onChange={(e) => setUsersStatusFilter(e.target.value as typeof usersStatusFilter)}
                  className="h-11 border border-input bg-background px-3 text-sm rounded-none"
                >
                  <option value="all">Все статусы</option>
                  <option value="active">Активные</option>
                  <option value="blocked">Заблокированные</option>
                </select>

                <div className="flex h-11 items-center justify-center rounded-none border border-gray-200 px-4 text-sm text-muted-foreground">
                  Найдено: {filteredUsers.length}
                </div>
              </div>

              <div className="space-y-3 md:hidden">
                {paginatedUsers.map((user) => {
                  const userOrdersCount = user.ordersCount || 0;

                  return (
                    <div key={user.id} className="border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="space-y-3">
                        <div>
                          <div className="break-all text-base font-semibold">{buildAdminUserDisplayName(user)}</div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {user.profile?.name || "Без имени"}
                            {user.profile?.nickname ? ` · @${user.profile.nickname}` : ""}
                            {user.profile?.phone ? ` · ${user.profile.phone}` : ""}
                          </div>
                          {(user.externalIdentities || []).length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(user.externalIdentities || []).map((identity) => (
                                <span
                                  key={`${user.id}-${identity.provider}-${identity.providerEmail || identity.providerUsername || ""}`}
                                  className="inline-flex border border-gray-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                                >
                                  {getExternalProviderLabel(identity.provider)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className={`inline-flex border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${user.isAdmin ? "border-black bg-black text-white" : "border-gray-200 text-black"}`}>
                            {user.isAdmin ? "Админ" : "Пользователь"}
                            {user.isSystem ? " (system)" : ""}
                          </span>
                          <span className={`inline-flex border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${user.isBlocked ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                            {user.isBlocked ? "Заблокирован" : "Активен"}
                          </span>
                          <span className="inline-flex border border-gray-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Заказов: {userOrdersCount}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Button type="button" variant="outline" className="h-10 rounded-none" onClick={() => openUserEditModal(user)}>
                            <UserCog className="mr-2 h-4 w-4" />
                            Открыть
                          </Button>
                          <Button type="button" variant="outline" className="h-10 rounded-none" onClick={() => toggleUserBlock(user)}>
                            {user.isBlocked ? <ShieldCheck className="mr-2 h-4 w-4" /> : <ShieldX className="mr-2 h-4 w-4" />}
                            {user.isBlocked ? "Разблок." : "Блок."}
                          </Button>
                          <Button type="button" variant="outline" className="h-10 rounded-none" onClick={() => toggleUserAdmin(user)} disabled={user.isSystem}>
                            {user.isAdmin ? <ShieldAlert className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                            {user.isAdmin ? "Снять admin" : "Дать admin"}
                          </Button>
                          <Button type="button" variant="outline" className="h-10 rounded-none border-red-200 text-red-600 hover:bg-red-50" onClick={() => deleteUser(user)} disabled={user.isSystem}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Удалить
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {paginatedUsers.length === 0 && (
                  <div className="border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-muted-foreground">
                    Пользователи не найдены
                  </div>
                )}
              </div>

              <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email / профиль</TableHead>
                    <TableHead>Роль</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Заказов</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((user) => {
                    const userOrdersCount = user.ordersCount || 0;
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="font-semibold">{buildAdminUserDisplayName(user)}</div>
                          <div className="text-xs text-muted-foreground">
                            {user.profile?.name || "Без имени"}
                            {user.profile?.nickname ? ` В· @${user.profile.nickname}` : ""}
                            {user.profile?.phone ? ` В· ${user.profile.phone}` : ""}
                          </div>
                          {(user.externalIdentities || []).length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(user.externalIdentities || []).map((identity) => (
                                <span
                                  key={`${user.id}-${identity.provider}-${identity.providerEmail || identity.providerUsername || ""}`}
                                  className="inline-flex border border-gray-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                                >
                                  {getExternalProviderLabel(identity.provider)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>{user.isAdmin ? "Админ" : "Пользователь"}{user.isSystem ? " (system)" : ""}</TableCell>
                        <TableCell>{user.isBlocked ? "Заблокирован" : "Активен"}</TableCell>
                        <TableCell>{userOrdersCount}</TableCell>
                        <TableCell className="text-right">
                          <TooltipProvider>
                            <div className="inline-flex items-center gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="outline" size="icon" className="rounded-none" onClick={() => openUserEditModal(user)} aria-label="Редактировать пользователя">
                                    <UserCog className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Редактировать / просмотреть</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="outline" size="icon" className="rounded-none" onClick={() => toggleUserBlock(user)} aria-label={user.isBlocked ? "Разблокировать" : "Заблокировать"}>
                                    {user.isBlocked ? <ShieldCheck className="h-4 w-4" /> : <ShieldX className="h-4 w-4" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{user.isBlocked ? "Снять блокировку" : "Заблокировать"}</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="outline" size="icon" className="rounded-none" onClick={() => toggleUserAdmin(user)} disabled={user.isSystem} aria-label={user.isAdmin ? "Снять админа" : "Сделать админом"}>
                                    {user.isAdmin ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{user.isAdmin ? "Снять права администратора" : "Выдать права администратора"}</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="destructive" size="icon" className="rounded-none" onClick={() => deleteUser(user)} disabled={user.isSystem} aria-label="Удалить пользователя">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Удалить</TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {paginatedUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                        Пользователи не найдены
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  Страница {usersPage} из {totalUserPages}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => setUsersPage((prev) => Math.max(1, prev - 1))}
                    disabled={usersPage <= 1}
                  >
                    Назад
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => setUsersPage((prev) => Math.min(totalUserPages, prev + 1))}
                    disabled={usersPage >= totalUserPages}
                  >
                    Вперёд
                  </Button>
                </div>
              </div>

              <Dialog open={isUserEditModalOpen} onOpenChange={(open) => (open ? setIsUserEditModalOpen(true) : closeUserEditModal())}>
                <DialogContent className="max-w-3xl rounded-none">
                  <DialogHeader>
                    <DialogTitle className="uppercase">Редактор пользователя</DialogTitle>
                  </DialogHeader>

                  {selectedUser ? (
                    <div className="space-y-6">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor="user-edit-email">Email</Label>
                          <Input
                            id="user-edit-email"
                            name="email"
                            autoComplete="email"
                            aria-label="Email пользователя"
                            value={userEditForm.email}
                            onChange={(e) => setUserEditForm((prev) => ({ ...prev, email: e.target.value }))}
                            className="rounded-none"
                            type="email"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="user-edit-id">ID</Label>
                          <Input id="user-edit-id" name="user_id" aria-label="ID пользователя" value={selectedUser.id} disabled className="rounded-none font-mono text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="user-edit-name">Имя</Label>
                          <Input
                            id="user-edit-name"
                            name="name"
                            autoComplete="name"
                            aria-label="Имя пользователя"
                            value={userEditForm.name}
                            onChange={(e) => setUserEditForm((prev) => ({ ...prev, name: e.target.value }))}
                            className="rounded-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="user-edit-nickname">Telegram / Ник</Label>
                          <Input
                            id="user-edit-nickname"
                            name="nickname"
                            autoComplete="username"
                            aria-label="Telegram или ник пользователя"
                            value={userEditForm.nickname}
                            onChange={(e) => setUserEditForm((prev) => ({ ...prev, nickname: e.target.value }))}
                            className="rounded-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="user-edit-phone">Телефон</Label>
                          <Input
                            id="user-edit-phone"
                            name="tel"
                            type="tel"
                            autoComplete="tel"
                            aria-label="Телефон пользователя"
                            value={userEditForm.phone}
                            onChange={(e) => setUserEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                            className="rounded-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="user-edit-password">Новый пароль</Label>
                          <Input
                            id="user-edit-password"
                            name="new_password"
                            autoComplete="new-password"
                            aria-label="Новый пароль пользователя"
                            value={userEditForm.password}
                            onChange={(e) => setUserEditForm((prev) => ({ ...prev, password: e.target.value }))}
                            className="rounded-none"
                            type="password"
                            placeholder="Оставьте пустым, если менять не нужно"
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label htmlFor="user-edit-shipping-address">Адрес доставки</Label>
                          <Textarea
                            id="user-edit-shipping-address"
                            name="shipping_address"
                            autoComplete="street-address"
                            aria-label="Адрес доставки пользователя"
                            value={userEditForm.shippingAddress}
                            onChange={(e) => setUserEditForm((prev) => ({ ...prev, shippingAddress: e.target.value }))}
                            className="rounded-none min-h-20"
                          />
                        </div>
                        <div className="border p-3 md:col-span-2">
                          <div className="text-xs uppercase text-muted-foreground">Текущий статус</div>
                          <div>{selectedUser.isBlocked ? "Заблокирован" : "Активен"}</div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-lg font-bold uppercase mb-2">Заказы пользователя ({selectedUserOrders.length})</h3>
                        <div className="max-h-64 overflow-auto border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>№ заказа</TableHead>
                                <TableHead>Сумма</TableHead>
                                <TableHead>Статус</TableHead>
                                <TableHead>Дата</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedUserOrders.map((order) => (
                                <TableRow key={order.id}>
                                  <TableCell className="font-mono">{formatAdminOrderNumber(order)}</TableCell>
                                  <TableCell>
                                    <div>{formatRubles(order.totalAmount)}</div>
                                    {getOrderPromoCodeValue(order) ? (
                                      <div className="mt-1 text-xs text-muted-foreground">
                                        Промокод: <span className="font-mono text-foreground">{getOrderPromoCodeValue(order)}</span>
                                      </div>
                                    ) : null}
                                  </TableCell>
                                  <TableCell>{formatOrderStatus(order.status)}</TableCell>
                                  <TableCell>{order.createdAt ? new Date(order.createdAt).toLocaleString() : "—"}</TableCell>
                                </TableRow>
                              ))}
                              {selectedUserOrders.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">У пользователя пока нет заказов</TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      <DialogFooter>
                        <Button variant="outline" className="rounded-none" onClick={closeUserEditModal}>
                          Закрыть
                        </Button>
                        <Button variant="outline" className="rounded-none" onClick={() => selectedUser && toggleUserBlock(selectedUser)}>
                          {selectedUser.isBlocked ? "Разблокировать" : "Блокировать"}
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-none"
                          onClick={() => selectedUser && toggleUserAdmin(selectedUser)}
                          disabled={selectedUser.isSystem}
                        >
                          {selectedUser.isAdmin ? "Снять админа" : "Сделать админом"}
                        </Button>
                        <Button className="rounded-none" onClick={requestUserEditSave} disabled={userEditSaving}>
                          {userEditSaving ? "Сохранение..." : "Сохранить изменения"}
                        </Button>
                      </DialogFooter>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">Пользователь не выбран</div>
                  )}
                </DialogContent>
              </Dialog>

              <Dialog open={isSensitiveConfirmOpen} onOpenChange={setIsSensitiveConfirmOpen}>
                <DialogContent className="max-w-md rounded-none border-black">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase">Подтвердите изменение поля «{getSensitiveFieldLabel(pendingSensitiveFields[0] || "password")}»</DialogTitle>
                  </DialogHeader>
                  <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Это обязательное подтверждение для критичных данных пользователя.
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-none"
                      onClick={() => {
                        setIsSensitiveConfirmOpen(false);
                        setPendingSensitiveFields([]);
                      }}
                    >
                      Отмена
                    </Button>
                    <Button type="button" className="rounded-none bg-black text-white hover:bg-gray-800" onClick={confirmNextSensitiveField}>
                      Подтвердить
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </TabsContent>

          <TabsContent value="orders" className="mt-0">
            <div className="space-y-4">
              <div className="border border-gray-200 p-4">
                <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <h2 className="text-2xl font-black uppercase">История заказов</h2>
                    <p className="text-sm text-muted-foreground">Фильтруйте заказы по датам, проверяйте состав и управляйте каждым заказом прямо из таблицы.</p>
                  </div>
                  <div className="text-sm text-muted-foreground">{ordersLoading ? "Загрузка..." : `Найдено: ${ordersTotalItems}`}</div>
                </div>

                <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_210px_170px_170px_auto_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      name="orders_search"
                      aria-label="Поиск заказов"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="Поиск: ID, клиент, телефон, email, товар"
                      className="h-11 rounded-none pl-9"
                    />
                  </div>

                  <select
                    id="orders-status-filter"
                    name="orders_status_filter"
                    aria-label="Фильтр заказов по статусу"
                    value={ordersStatusFilter}
                    onChange={(e) => setOrdersStatusFilter(e.target.value)}
                    className="h-11 border border-input bg-background px-3 text-sm rounded-none"
                  >
                    <option value="all">Все статусы</option>
                    {ORDER_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <div className="relative">
                    <Input
                      name="orders_date_from_display"
                      aria-label="Дата начала фильтра заказов"
                      type="text"
                      inputMode="numeric"
                      placeholder="дд.мм.гггг"
                      maxLength={10}
                      value={ordersDateFromDisplay}
                      className="h-11 rounded-none pr-12 text-center tracking-[0.08em] placeholder:text-center"
                      onChange={(event: { target: { value: string } }) =>
                        handleOrderDateDraftChange(
                          event.target.value,
                          setOrdersDateFromDisplay,
                          setOrdersDateFrom,
                        )
                      }
                    />
                    <input
                      id="orders-date-from-picker"
                      name="orders_date_from"
                      type="date"
                      value={ordersDateFrom}
                      onChange={(event) =>
                        handleOrderDatePickerChange(
                          event.target.value,
                          setOrdersDateFromDisplay,
                          setOrdersDateFrom,
                        )
                      }
                      className="absolute inset-y-0 right-0 w-12 cursor-pointer opacity-0"
                      aria-label="Дата начала"
                      tabIndex={-1}
                    />
                    <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>

                  <div className="relative">
                    <Input
                      name="orders_date_to_display"
                      aria-label="Дата окончания фильтра заказов"
                      type="text"
                      inputMode="numeric"
                      placeholder="дд.мм.гггг"
                      maxLength={10}
                      value={ordersDateToDisplay}
                      className="h-11 rounded-none pr-12 text-center tracking-[0.08em] placeholder:text-center"
                      onChange={(event: { target: { value: string } }) =>
                        handleOrderDateDraftChange(
                          event.target.value,
                          setOrdersDateToDisplay,
                          setOrdersDateTo,
                        )
                      }
                    />
                    <input
                      id="orders-date-to-picker"
                      name="orders_date_to"
                      type="date"
                      value={ordersDateTo}
                      onChange={(event) =>
                        handleOrderDatePickerChange(
                          event.target.value,
                          setOrdersDateToDisplay,
                          setOrdersDateTo,
                        )
                      }
                      className="absolute inset-y-0 right-0 w-12 cursor-pointer opacity-0"
                      aria-label="Дата окончания"
                      tabIndex={-1}
                    />
                    <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-none"
                    onClick={openOrderTableDialog}
                  >
                    <Columns3 className="mr-2 h-4 w-4" />
                    Колонки
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-none"
                    onClick={() => {
                      setOrderSearch("");
                      setOrdersStatusFilter("all");
                      setOrdersDateFrom("");
                          setOrdersDateTo("");
                          setOrdersDateFromDisplay("");
                          setOrdersDateToDisplay("");
                    }}
                  >
                    Сбросить
                  </Button>
                </div>

                <div className="space-y-3 md:hidden">
                  {ordersLoading ? (
                    <div className="border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-muted-foreground">
                      Загружаем заказы...
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-muted-foreground">
                      Заказы по текущим фильтрам не найдены
                    </div>
                  ) : (
                    orders.map((order) => {
                      const customer = resolveOrderCustomerSnapshot(order);
                      const items = getOrderItemsDetails(order);
                      const isTerminalOrder = TERMINAL_ORDER_STATUSES.has(normalizeOrderStatusValue(order.status));
                      const promoCode = getOrderPromoCodeValue(order);
                      const promoDiscount = getOrderPromoDiscountValue(order);

                      return (
                        <div key={order.id} className="border border-gray-200 bg-white p-4 shadow-sm" style={getOrderRowStyle(order.status)}>
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="font-mono text-base font-bold">{formatAdminOrderNumber(order)}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{formatOrderDateTime(order.createdAt)}</div>
                              </div>
                              <span className={`inline-flex border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${getOrderStatusBadgeClassName(order.status)}`}>
                                {formatOrderStatus(order.status)}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Клиент</div>
                                <div className="mt-1 break-words font-medium">{customer.email || order.userId}</div>
                                <div className="text-xs text-muted-foreground">
                                  {customer.name || "Без имени"}
                                  {customer.phone ? ` · ${customer.phone}` : ""}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Сумма</div>
                                <div className="mt-1 text-lg font-black">{formatRubles(order.totalAmount)}</div>
                                {promoCode ? (
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    Промокод: <span className="font-mono text-foreground">{promoCode}</span>
                                  </div>
                                ) : null}
                                {promoDiscount > 0 ? (
                                  <div className="text-xs text-emerald-700">Скидка: -{formatRubles(promoDiscount)}</div>
                                ) : null}
                                <div className="text-xs text-muted-foreground">
                                  {formatPaymentMethod(order.paymentMethod)} · {formatOrderShippingSelection(order)}
                                </div>
                              </div>
                            </div>

                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Доставка</div>
                              <div className="mt-1 text-sm font-medium">{formatOrderShippingSelection(order)}</div>
                              <div className="mt-1 text-sm">{customer.shippingAddress || "—"}</div>
                              <div className="text-xs text-muted-foreground">
                                Стоимость: {Number.isFinite(Number(order.shippingAmount)) ? formatRubles(order.shippingAmount) : "—"}
                              </div>
                              {order.pickupPointId ? (
                                <div className="text-xs text-muted-foreground">Точка выдачи: {order.pickupPointId}</div>
                              ) : null}
                              {order.shippingTariff ? (
                                <div className="text-xs text-muted-foreground">Тариф: {order.shippingTariff}</div>
                              ) : null}
                              {order.shippingProviderOrderId ? (
                                <div className="text-xs text-muted-foreground">Отправление: {order.shippingProviderOrderId}</div>
                              ) : null}
                            </div>

                            <div className="space-y-2">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Товары</div>
                              {items.length === 0 ? (
                                <div className="border border-dashed border-gray-200 px-3 py-4 text-sm text-muted-foreground">
                                  Нет данных по товарам
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {items.map((item, index) => (
                                    <div key={`${order.id}-${item.productId}-${item.size}-${index}`} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 border border-dashed border-gray-200 p-3">
                                      <div className="h-16 w-14 overflow-hidden bg-gray-100">
                                        {item.imageUrl ? (
                                          <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center bg-gray-900 px-1 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-white">
                                            FD
                                          </div>
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="font-medium leading-tight">{item.title}</div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                          Размер: {item.size || "—"} · Количество: {item.quantity}
                                        </div>
                                        <div className="mt-2 text-sm font-semibold">{formatRubles(item.lineTotal)}</div>
                                        <div className="text-xs text-muted-foreground">{formatRubles(item.unitPrice)} × {item.quantity}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {order.yandexRequestId ? (
                              <div className="border border-gray-200 bg-gray-50 p-3 text-sm">
                                <div className="font-medium">Яндекс: {formatYandexDeliveryStatus(order)}</div>
                                {order.yandexDeliveryLastSyncError ? (
                                  <div className="mt-1 text-xs text-red-600">{order.yandexDeliveryLastSyncError}</div>
                                ) : null}
                              </div>
                            ) : null}

                            <div className="grid grid-cols-3 gap-2">
                              <Button type="button" variant="outline" className="h-10 rounded-none" onClick={() => openOrderEditor(order)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Откр.
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-10 rounded-none border-amber-200 text-amber-700 hover:bg-amber-50"
                                onClick={() => openOrderActionDialog("cancel", order)}
                                disabled={isTerminalOrder}
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                Отмена
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-10 rounded-none border-red-200 text-red-600 hover:bg-red-50"
                                onClick={() => openOrderActionDialog("delete", order)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Удалить
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="hidden border border-gray-200 md:block">
                  <Table className="min-w-max table-fixed">
                    <colgroup>
                      {visibleOrderColumns.map((column) => (
                        <col key={`order-col-${column.id}`} style={getOrderTableColumnCellStyle(column.id)} />
                      ))}
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        {visibleOrderColumns.map((column) => (
                          <TableHead
                            key={column.id}
                            className={`${column.id === "actions" ? "relative select-none px-3 text-right" : "relative select-none px-3"} ${orderColumnDropTargetId === column.id && draggedOrderColumnId !== column.id ? "bg-black/5" : ""}`}
                            style={getOrderTableColumnCellStyle(column.id)}
                            onDragOver={(event) => handleOrderColumnDragOver(column.id, event)}
                            onDrop={(event) => void handleOrderColumnDrop(column.id, event)}
                          >
                            <div
                              draggable={resizingOrderColumnId !== column.id}
                              onDragStart={(event) => handleOrderColumnDragStart(column.id, event)}
                              onDragEnd={() => {
                                setDraggedOrderColumnId(null);
                                setOrderColumnDropTargetId(null);
                              }}
                              className={`flex items-center gap-2 ${column.id === "actions" ? "justify-end pr-3" : "cursor-grab pr-3 active:cursor-grabbing"}`}
                            >
                              {column.id !== "actions" ? <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" /> : null}
                              <span className="truncate">{column.label}</span>
                            </div>
                            <button
                              type="button"
                              onPointerDown={(event) => handleOrderColumnResizeStart(column.id, event)}
                              className="absolute inset-y-0 right-0 z-10 w-3 cursor-col-resize touch-none"
                              aria-label={`Изменить ширину колонки ${column.label}`}
                              tabIndex={-1}
                            >
                              <span className={`absolute right-0.5 top-1/2 h-6 w-px -translate-y-1/2 transition ${resizingOrderColumnId === column.id ? "bg-black" : "bg-black/15 hover:bg-black/40"}`} />
                            </button>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordersLoading ? (
                        <TableRow>
                          <TableCell colSpan={visibleOrderColumns.length} className="py-10 text-center text-muted-foreground">
                            Загружаем заказы...
                          </TableCell>
                        </TableRow>
                      ) : orders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={visibleOrderColumns.length} className="py-10 text-center text-muted-foreground">
                            Заказы по текущим фильтрам не найдены
                          </TableCell>
                        </TableRow>
                      ) : (
                        orders.map((order) => {
                          const customer = resolveOrderCustomerSnapshot(order);
                          const items = getOrderItemsDetails(order);
                          const isTerminalOrder = TERMINAL_ORDER_STATUSES.has(normalizeOrderStatusValue(order.status));
                          const promoCode = getOrderPromoCodeValue(order);
                          const promoDiscount = getOrderPromoDiscountValue(order);

                          return (
                            <TableRow key={order.id} style={getOrderRowStyle(order.status)}>
                              {visibleOrderColumns.map((column) => {
                                if (column.id === "id") {
                                  return (
                                    <TableCell key={column.id} className="align-top" style={getOrderTableColumnCellStyle(column.id)}>
                                      <div className="font-mono text-sm font-bold">{formatAdminOrderNumber(order)}</div>
                                      <div className="mt-1 text-[11px] text-muted-foreground">создан {formatOrderDateTime(order.createdAt)}</div>
                                    </TableCell>
                                  );
                                }

                                if (column.id === "client") {
                                  return (
                                    <TableCell key={column.id} className="align-top" style={getOrderTableColumnCellStyle(column.id)}>
                                      <div className="font-semibold">{customer.email || order.userId}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {customer.name || "Без имени"}
                                        {customer.phone ? ` В· ${customer.phone}` : ""}
                                      </div>
                                    </TableCell>
                                  );
                                }

                                if (column.id === "items") {
                                  return (
                                    <TableCell key={column.id} className="align-top" style={getOrderTableColumnCellStyle(column.id)}>
                                      {items.length === 0 ? (
                                        <span className="text-sm text-muted-foreground">Нет данных по товарам</span>
                                      ) : (
                                        <div className="space-y-3">
                                          {items.map((item, index) => (
                                            <div key={`${order.id}-${item.productId}-${item.size}-${index}`} className="grid gap-3 border-b border-dashed border-gray-200 pb-3 last:border-b-0 last:pb-0 md:grid-cols-[56px_minmax(0,1fr)_auto] md:items-center">
                                              <div className="h-16 w-14 overflow-hidden bg-gray-100">
                                                {item.imageUrl ? (
                                                  <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                                                ) : (
                                                  <div className="flex h-full w-full items-center justify-center bg-gray-900 px-1 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-white">
                                                    FD
                                                  </div>
                                                )}
                                              </div>
                                              <div className="min-w-0">
                                                <div className="font-medium leading-tight">{item.title}</div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                  Размер: {item.size || "—"} · Количество: {item.quantity}
                                                </div>
                                              </div>
                                              <div className="text-left md:text-right">
                                                <div className="font-semibold">{formatRubles(item.lineTotal)}</div>
                                                <div className="text-xs text-muted-foreground">{formatRubles(item.unitPrice)} × {item.quantity}</div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </TableCell>
                                  );
                                }

                                if (column.id === "payment") {
                                  return (
                                    <TableCell key={column.id} className="align-top" style={getOrderTableColumnCellStyle(column.id)}>
                                      <div>{formatPaymentMethod(order.paymentMethod)}</div>
                                      <div className="text-xs text-muted-foreground">Доставка: {formatOrderShippingSelection(order)}</div>
                                      <div className="text-xs text-muted-foreground">Канал: {formatPurchaseChannel(order.purchaseChannel)}</div>
                                    </TableCell>
                                  );
                                }

                                if (column.id === "delivery") {
                                  return (
                                    <TableCell key={column.id} className="align-top" style={getOrderTableColumnCellStyle(column.id)}>
                                      <div className="font-medium">{formatOrderShippingSelection(order)}</div>
                                      <div className="text-xs text-muted-foreground">
                                        Стоимость: {Number.isFinite(Number(order.shippingAmount)) ? formatRubles(order.shippingAmount) : "—"}
                                      </div>
                                      <div className="text-sm">{customer.shippingAddress || "—"}</div>
                                      <div className="text-xs text-muted-foreground">Получатель: {customer.name || "—"}</div>
                                      {order.pickupPointId ? (
                                        <div className="text-xs text-muted-foreground">Точка выдачи: {order.pickupPointId}</div>
                                      ) : null}
                                      {order.shippingTariff ? (
                                        <div className="text-xs text-muted-foreground">Тариф: {order.shippingTariff}</div>
                                      ) : null}
                                      {order.shippingTrackingNumber ? (
                                        <div className="text-xs text-muted-foreground">Трек: {order.shippingTrackingNumber}</div>
                                      ) : null}
                                    </TableCell>
                                  );
                                }

                                if (column.id === "status") {
                                  return (
                                    <TableCell key={column.id} className="align-top" style={getOrderTableColumnCellStyle(column.id)}>
                                      <span className={`inline-flex border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${getOrderStatusBadgeClassName(order.status)}`}>
                                        {formatOrderStatus(order.status)}
                                      </span>
                                      {order.yandexRequestId ? (
                                        <div className="mt-2 space-y-1 text-xs">
                                          <div className="text-muted-foreground">
                                            Яндекс: {formatYandexDeliveryStatus(order)}
                                          </div>
                                          {order.yandexDeliveryLastSyncError ? (
                                            <div className="text-red-600">{order.yandexDeliveryLastSyncError}</div>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </TableCell>
                                  );
                                }

                                if (column.id === "amount") {
                                  return (
                                    <TableCell key={column.id} className="whitespace-nowrap align-top font-semibold" style={getOrderTableColumnCellStyle(column.id)}>
                                      <div>{formatRubles(order.totalAmount)}</div>
                                      {promoCode ? (
                                        <div className="mt-1 text-xs font-normal text-muted-foreground">
                                          Промокод: <span className="font-mono text-foreground">{promoCode}</span>
                                        </div>
                                      ) : null}
                                      {promoDiscount > 0 ? (
                                        <div className="text-xs font-normal text-emerald-700">Скидка: -{formatRubles(promoDiscount)}</div>
                                      ) : null}
                                    </TableCell>
                                  );
                                }

                                if (column.id === "date") {
                                  return (
                                    <TableCell key={column.id} className="whitespace-nowrap align-top text-sm" style={getOrderTableColumnCellStyle(column.id)}>
                                      {formatOrderDateTime(order.createdAt)}
                                    </TableCell>
                                  );
                                }

                                return (
                                  <TableCell key={column.id} className="align-top text-right" style={getOrderTableColumnCellStyle(column.id)}>
                                    <TooltipProvider delayDuration={150}>
                                      <div className="flex justify-end gap-2">
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-none" onClick={() => openOrderEditor(order)} aria-label="Изменить заказ">
                                              <Pencil className="h-4 w-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Изменить</TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="icon"
                                              className="h-9 w-9 rounded-none border-amber-200 text-amber-700 hover:bg-amber-50"
                                              onClick={() => openOrderActionDialog("cancel", order)}
                                              disabled={isTerminalOrder}
                                              aria-label="Отменить заказ"
                                            >
                                              <Ban className="h-4 w-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>{isTerminalOrder ? "Заказ уже завершен" : "Отменить"}</TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="icon"
                                              className="h-9 w-9 rounded-none border-red-200 text-red-600 hover:bg-red-50"
                                              onClick={() => openOrderActionDialog("delete", order)}
                                              aria-label="Удалить заказ"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Удалить</TooltipContent>
                                        </Tooltip>
                                      </div>
                                    </TooltipProvider>
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center">
                    <span>
                      {ordersTotalItems === 0
                        ? "По текущим фильтрам нет заказов"
                        : `Показано ${Math.min((ordersPage - 1) * ordersPageSize + 1, ordersTotalItems)}-${Math.min(ordersPage * ordersPageSize, ordersTotalItems)} из ${ordersTotalItems}`}
                    </span>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="orders-page-size" className="text-xs uppercase tracking-wide text-muted-foreground">Строк на странице</Label>
                      <select
                        id="orders-page-size"
                        name="orders_page_size"
                        aria-label="Строк на странице"
                        value={ordersPageSize}
                        onChange={(e) => void changeOrdersPageSize(Number(e.target.value) as (typeof ORDER_PAGE_SIZE_OPTIONS)[number])}
                        className="h-9 rounded-none border border-input bg-background px-3 text-sm text-foreground"
                      >
                        {ORDER_PAGE_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 xl:justify-end">
                    <div className="text-sm text-muted-foreground">
                      Страница {Math.min(ordersPage, Math.max(ordersTotalPages, 1))} из {Math.max(ordersTotalPages, 1)}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-none"
                        onClick={() => setOrdersPage((prev) => Math.max(1, prev - 1))}
                        disabled={ordersLoading || ordersPage <= 1}
                      >
                        Назад
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-none"
                        onClick={() => setOrdersPage((prev) => Math.min(Math.max(ordersTotalPages, 1), prev + 1))}
                        disabled={ordersLoading || ordersPage >= Math.max(ordersTotalPages, 1)}
                      >
                        Вперёд
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <Dialog open={isOrderTableDialogOpen} onOpenChange={(open) => (!orderTableSaving ? setIsOrderTableDialogOpen(open) : undefined)}>
                <DialogContent className="max-w-3xl rounded-none">
                  <DialogHeader>
                    <DialogTitle className="uppercase">Настройка таблицы заказов</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                      <p>Скрывайте лишние колонки и меняйте их порядок. Настройка сохранится для вашего аккаунта.</p>
                    </div>

                    <div className="space-y-3">
                      {orderTableDraft.columnOrder.map((columnId, index) => {
                        const column = ORDER_TABLE_COLUMNS.find((item) => item.id === columnId);
                        if (!column) return null;

                        const isVisible = !orderTableDraft.hiddenColumns.includes(columnId);
                        const isRequired = Boolean(column.required);

                        return (
                          <div key={columnId} className="flex flex-col gap-3 border border-gray-200 p-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="font-medium">{column.label}</div>
                              <div className="text-xs text-muted-foreground">
                                {isRequired ? "Обязательная колонка" : isVisible ? "Колонка видна в таблице" : "Колонка скрыта"}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 rounded-none"
                                onClick={() => moveOrderTableDraftColumn(columnId, -1)}
                                disabled={index === 0}
                                aria-label={`Поднять колонку ${column.label}`}
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 rounded-none"
                                onClick={() => moveOrderTableDraftColumn(columnId, 1)}
                                disabled={index === orderTableDraft.columnOrder.length - 1}
                                aria-label={`Опустить колонку ${column.label}`}
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-9 rounded-none"
                                onClick={() => toggleOrderTableDraftColumn(columnId, !isVisible)}
                                disabled={isRequired}
                              >
                                {isVisible ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
                                {isRequired ? "Обязательно" : isVisible ? "Скрыть" : "Показать"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" className="rounded-none" onClick={resetOrderTableDraft} disabled={orderTableSaving}>
                      Сбросить
                    </Button>
                    <Button type="button" variant="outline" className="rounded-none" onClick={() => setIsOrderTableDialogOpen(false)} disabled={orderTableSaving}>
                      Отмена
                    </Button>
                    <Button type="button" className="rounded-none bg-black text-white" onClick={saveOrderTableLayout} disabled={orderTableSaving}>
                      {orderTableSaving ? "Сохранение..." : "Сохранить"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={isOrderDialogOpen} onOpenChange={(open) => (!open ? closeOrderEditor() : setIsOrderDialogOpen(true))}>
                <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto rounded-none">
                  <DialogHeader>
                    <DialogTitle className="uppercase">
                      Редактирование заказа{editingOrder ? ` · ${formatAdminOrderNumber(editingOrder)}` : ""}
                    </DialogTitle>
                  </DialogHeader>

                  {editingOrder ? (
                    <div className="space-y-6 min-w-0">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                        <div className="space-y-4 min-w-0">
                          <div className="border border-gray-200 p-4 space-y-3">
                            <h3 className="text-lg font-bold uppercase">Сводка</h3>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Статус</div>
                                <span className={`mt-1 inline-flex border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${getOrderStatusBadgeClassName(editingOrder.status)}`}>
                                  {formatOrderStatus(editingOrder.status)}
                                </span>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Сумма</div>
                                <div className="font-semibold">{formatRubles(editingOrder.totalAmount)}</div>
                                {getOrderPromoCodeValue(editingOrder) ? (
                                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                    <div>
                                      Промокод: <span className="font-mono text-foreground">{getOrderPromoCodeValue(editingOrder)}</span>
                                    </div>
                                    {getOrderPromoDiscountValue(editingOrder) > 0 ? (
                                      <div>Скидка: -{formatRubles(getOrderPromoDiscountValue(editingOrder))}</div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Создан</div>
                                <div>{formatOrderDateTime(editingOrder.createdAt)}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Обновлен</div>
                                <div>{formatOrderDateTime(editingOrder.updatedAt)}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Оплата</div>
                                <div>{formatPaymentMethod(editingOrder.paymentMethod)}</div>
                                {editingOrder.payment ? (
                                  <div className="mt-2 space-y-2">
                                    <span className={`inline-flex border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${getOrderPaymentStatusBadgeClassName(editingOrder.payment.status)}`}>
                                      {formatOrderPaymentStatus(editingOrder.payment.status)}
                                    </span>
                                    <div className="text-xs text-muted-foreground">
                                      {formatOrderPaymentSummary(editingOrder.payment)}
                                    </div>
                                    {Number.isFinite(Number(editingOrder.payment.chargeAmount)) ? (
                                      <div className="text-xs text-muted-foreground">
                                        К оплате: {formatRubles(editingOrder.payment.chargeAmount)}
                                      </div>
                                    ) : null}
                                    {editingOrder.payment.lastError ? (
                                      <div className="text-xs text-red-600">{editingOrder.payment.lastError}</div>
                                    ) : null}
                                    {editingOrder.payment.canRefresh ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-9 rounded-none px-3 text-[11px] font-bold uppercase tracking-[0.16em]"
                                        onClick={() => void refreshOrderPayment(editingOrder.id)}
                                        disabled={orderPaymentRefreshingId === editingOrder.id}
                                      >
                                        {orderPaymentRefreshingId === editingOrder.id ? "Проверяем..." : "Проверить оплату"}
                                      </Button>
                                    ) : null}
                                  </div>
                                ) : null}
                                <div className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">Доставка</div>
                                <div>{formatOrderShippingSelection(editingOrder)}</div>
                                <div className="text-xs text-muted-foreground">
                                  {Number.isFinite(Number(editingOrder.shippingAmount)) ? formatRubles(editingOrder.shippingAmount) : "—"}
                                </div>
                                {editingOrder.shippingTariff ? (
                                  <div className="text-xs text-muted-foreground">Тариф: {editingOrder.shippingTariff}</div>
                                ) : null}
                                {editingOrder.pickupPointId ? (
                                  <div className="text-xs text-muted-foreground break-all">Точка выдачи: {editingOrder.pickupPointId}</div>
                                ) : null}
                                {editingOrder.shippingProviderOrderId ? (
                                  <div className="text-xs text-muted-foreground break-all">ID отправления: {editingOrder.shippingProviderOrderId}</div>
                                ) : null}
                                {editingOrder.shippingTrackingNumber ? (
                                  <div className="text-xs text-muted-foreground break-all">Трек-номер: {editingOrder.shippingTrackingNumber}</div>
                                ) : null}
                                {editingOrder.shippingStatusDescription || editingOrder.shippingStatus ? (
                                  <div className="text-xs text-muted-foreground">
                                    Статус: {editingOrder.shippingStatusDescription || editingOrder.shippingStatus}
                                  </div>
                                ) : null}
                                {editingOrder.shippingTrackingUrl ? (
                                  <a
                                    href={editingOrder.shippingTrackingUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex text-xs underline underline-offset-2"
                                  >
                                    Открыть трекинг доставки
                                  </a>
                                ) : null}
                                {editingOrder.shippingLastSyncError ? (
                                  <div className="text-xs text-red-600">{editingOrder.shippingLastSyncError}</div>
                                ) : null}
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Канал заказа</div>
                                <div>{formatPurchaseChannel(editingOrder.purchaseChannel)}</div>
                              </div>
                              <div className="sm:col-span-2">
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Яндекс.Доставка</div>
                                <div className="mt-1 space-y-1 text-sm min-w-0">
                                  <div>Статус: {formatYandexDeliveryStatus(editingOrder)}</div>
                                  <div className="break-all text-muted-foreground">Request ID: {editingOrder.yandexRequestId || "—"}</div>
                                  {editingOrder.yandexPickupCode ? (
                                    <div className="break-words text-muted-foreground">Код получения: {editingOrder.yandexPickupCode}</div>
                                  ) : null}
                                  {editingOrder.yandexDeliveryStatusReason ? (
                                    <div className="break-words text-muted-foreground">Причина: {editingOrder.yandexDeliveryStatusReason}</div>
                                  ) : null}
                                  {editingOrder.yandexDeliveryStatusUpdatedAt ? (
                                    <div className="text-muted-foreground">Статус обновлен: {formatOrderDateTime(editingOrder.yandexDeliveryStatusUpdatedAt)}</div>
                                  ) : null}
                                  {editingOrder.yandexDeliveryStatusSyncedAt ? (
                                    <div className="text-muted-foreground">Последний sync: {formatOrderDateTime(editingOrder.yandexDeliveryStatusSyncedAt)}</div>
                                  ) : null}
                                  {editingOrder.yandexDeliveryTrackingUrl ? (
                                    <a
                                      href={editingOrder.yandexDeliveryTrackingUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex text-sm underline underline-offset-2"
                                    >
                                      Открыть трекинг Яндекса
                                    </a>
                                  ) : null}
                                  {editingOrder.yandexDeliveryLastSyncError ? (
                                    <div className="text-sm text-red-600">{editingOrder.yandexDeliveryLastSyncError}</div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="border border-gray-200 p-4 space-y-3">
                            <h3 className="text-lg font-bold uppercase">Клиент</h3>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Аккаунт</div>
                                <div className="break-all">{editingOrder.userEmail || selectedOrderUser?.email || editingOrder.userId}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Имя</div>
                                <div className="break-words">{orderForm.customerName || selectedOrderUser?.profile?.name || selectedOrderUser?.profile?.nickname || "—"}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Телефон</div>
                                <div className="break-words">{orderForm.customerPhone || selectedOrderUser?.profile?.phone || "—"}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Email заказа</div>
                                <div className="break-all">{orderForm.customerEmail || editingOrder.userEmail || "—"}</div>
                              </div>
                              <div className="sm:col-span-2">
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Адрес</div>
                                <div className="whitespace-pre-wrap break-words">{orderForm.shippingAddress || selectedOrderUser?.profile?.shippingAddress || "—"}</div>
                              </div>
                            </div>
                          </div>

                          <div className="border border-gray-200 p-4 space-y-3">
                            <h3 className="text-lg font-bold uppercase">Товары в заказе</h3>
                            {editingOrderItems.length === 0 ? (
                              <p className="text-sm text-muted-foreground">В заказе нет позиций</p>
                            ) : (
                              <div className="space-y-3">
                                {editingOrderItems.map((item, index) => (
                                  <div key={`${editingOrder.id}-${item.productId}-${item.size}-${index}`} className="grid gap-3 border border-dashed border-gray-200 p-3 md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-center">
                                    <div className="h-20 w-[72px] overflow-hidden bg-gray-100">
                                      {item.imageUrl ? (
                                        <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center bg-gray-900 px-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                                          FD
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-semibold leading-tight">{item.title}</div>
                                      <div className="mt-1 text-sm text-muted-foreground">
                                        Размер: {item.size || "—"} · Количество: {item.quantity}
                                      </div>
                                    </div>
                                    <div className="text-left md:text-right">
                                      <div className="font-semibold">{formatRubles(item.lineTotal)}</div>
                                      <div className="text-sm text-muted-foreground">{formatRubles(item.unitPrice)} × {item.quantity}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4 min-w-0">
                          <div className="border border-gray-200 p-4 space-y-4">
                            <h3 className="text-lg font-bold uppercase">Данные заказа</h3>

                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor="order-status">Статус заказа</Label>
                                <select
                                  id="order-status"
                                  name="order_status"
                                  aria-label="Статус заказа"
                                  className="h-10 w-full border border-black bg-white px-3 rounded-none"
                                  value={orderForm.status}
                                  onChange={(e) => setOrderForm((prev) => ({ ...prev, status: e.target.value }))}
                                >
                                  {!ORDER_STATUS_LABELS[orderForm.status] && <option value={orderForm.status}>{orderForm.status}</option>}
                                  {ORDER_STATUS_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="order-payment-method">Способ оплаты</Label>
                                <select
                                  id="order-payment-method"
                                  name="order_payment_method"
                                  aria-label="Способ оплаты"
                                  className="h-10 w-full border border-black bg-white px-3 rounded-none"
                                  value={orderForm.paymentMethod}
                                  onChange={(e) => setOrderForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                                >
                                  {!PAYMENT_METHOD_LABELS[orderForm.paymentMethod] && <option value={orderForm.paymentMethod}>{orderForm.paymentMethod}</option>}
                                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="order-customer-name">Получатель</Label>
                                <Input
                                  id="order-customer-name"
                                  name="customer_name"
                                  autoComplete="name"
                                  aria-label="Получатель заказа"
                                  value={orderForm.customerName}
                                  onChange={(e) => setOrderForm((prev) => ({ ...prev, customerName: e.target.value }))}
                                  className="rounded-none border-black"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="order-customer-email">Email</Label>
                                <Input
                                  id="order-customer-email"
                                  name="customer_email"
                                  type="email"
                                  autoComplete="email"
                                  aria-label="Email получателя"
                                  value={orderForm.customerEmail}
                                  onChange={(e) => setOrderForm((prev) => ({ ...prev, customerEmail: e.target.value }))}
                                  className="rounded-none border-black"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="order-customer-phone">Телефон</Label>
                                <Input
                                  id="order-customer-phone"
                                  name="customer_phone"
                                  type="tel"
                                  autoComplete="tel"
                                  aria-label="Телефон получателя"
                                  value={orderForm.customerPhone}
                                  onChange={(e) => setOrderForm((prev) => ({ ...prev, customerPhone: e.target.value }))}
                                  className="rounded-none border-black"
                                />
                              </div>

                              <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="order-shipping-address">Адрес доставки</Label>
                                <Textarea
                                  id="order-shipping-address"
                                  name="shipping_address"
                                  autoComplete="street-address"
                                  aria-label="Адрес доставки заказа"
                                  value={orderForm.shippingAddress}
                                  onChange={(e) => setOrderForm((prev) => ({ ...prev, shippingAddress: e.target.value }))}
                                  className="rounded-none border-black min-h-[110px]"
                                />
                              </div>

                              <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="order-yandex-request-id">Yandex request ID</Label>
                                <Input
                                  id="order-yandex-request-id"
                                  name="yandex_request_id"
                                  aria-label="Yandex request ID"
                                  value={orderForm.yandexRequestId}
                                  onChange={(e) => setOrderForm((prev) => ({ ...prev, yandexRequestId: e.target.value }))}
                                  className="rounded-none border-black"
                                  placeholder="Например: 77241d8009bb46d0bff5c65a73077bcd-udp"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Нужен для автоматического обновления статуса доставки в профиле клиента и в админке.
                                </p>
                              </div>

                              <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="order-manager-comment">Комментарий к изменению</Label>
                                <Textarea
                                  id="order-manager-comment"
                                  name="manager_comment"
                                  aria-label="Комментарий к изменению заказа"
                                  value={orderForm.managerComment}
                                  onChange={(e) => setOrderForm((prev) => ({ ...prev, managerComment: e.target.value }))}
                                  placeholder="Например: Клиент попросил изменить адрес или заказ передан в доставку"
                                  className="rounded-none border-black min-h-[110px]"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="border border-gray-200 p-4 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-bold uppercase">История изменений</h3>
                            <p className="text-sm text-muted-foreground">Показывает, кто и когда менял поля заказа.</p>
                          </div>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">Записей: {editingOrderHistory.length}</span>
                        </div>

                        {editingOrderHistory.length === 0 ? (
                          <p className="text-sm text-muted-foreground">История изменений пока пуста</p>
                        ) : (
                          <div className="space-y-3">
                            {editingOrderHistory.map((entry, index) => {
                              const changes = entry.kind === "created"
                                ? []
                                : Array.isArray(entry.fieldChanges)
                                ? entry.fieldChanges.filter((change) => isOrderHistoryFieldChanged(change))
                                : [];
                              const entryTitle = entry.kind === "created"
                                ? "Заказ создан"
                                : entry.kind === "canceled"
                                  ? "Заказ отменен"
                                  : "Заказ обновлен";

                              return (
                                <div key={`${entry.changedAt || "row"}-${index}`} className="border border-gray-200 p-4">
                                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div>
                                      <div className="font-semibold">{entryTitle}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {formatOrderDateTime(entry.changedAt)} В· {entry.changedBy || "system"}
                                      </div>
                                    </div>
                                    {entry.status ? (
                                      <span className={`inline-flex border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${getOrderStatusBadgeClassName(String(entry.status))}`}>
                                        {formatOrderStatus(String(entry.status))}
                                      </span>
                                    ) : null}
                                  </div>

                                  {entry.comment && <p className="mt-3 text-sm">{entry.comment}</p>}

                                  {changes.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                      {changes.map((change, changeIndex) => (
                                        <div key={`${entry.changedAt || "row"}-${change.field}-${changeIndex}`} className="grid gap-2 border-t border-dashed border-gray-200 pt-2 md:grid-cols-[180px_1fr_1fr]">
                                          <div className="text-sm font-medium">{ORDER_HISTORY_FIELD_LABELS[String(change.field || "")] || change.field}</div>
                                          <div className="text-sm text-muted-foreground">Было: {formatOrderHistoryValue(change.field, change.oldValue)}</div>
                                          <div className="text-sm">Стало: {formatOrderHistoryValue(change.field, change.newValue)}</div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <DialogFooter>
                        <Button type="button" variant="outline" className="rounded-none" onClick={closeOrderEditor}>
                          Отмена
                        </Button>
                        <Button type="button" className="rounded-none bg-black text-white" onClick={requestOrderSave} disabled={orderSaving}>
                          {orderSaving ? "Сохранение..." : "Сохранить"}
                        </Button>
                      </DialogFooter>
                    </div>
                  ) : null}
                </DialogContent>
              </Dialog>

              <Dialog open={isOrderSaveConfirmOpen} onOpenChange={(open) => (!orderSaving ? setIsOrderSaveConfirmOpen(open) : undefined)}>
                <DialogContent className="max-w-2xl rounded-none border-black">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase">Подтвердите сохранение заказа</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 text-sm">
                    <p>Перед сохранением проверьте, какие поля изменятся в заказе.</p>
                    <div className="space-y-3 border border-gray-200 p-4">
                      {pendingOrderSaveChanges.map((change) => (
                        <div key={change.field} className="grid gap-2 border-b border-dashed border-gray-200 pb-3 last:border-b-0 last:pb-0 md:grid-cols-[180px_1fr_1fr]">
                          <div className="font-medium">{change.label}</div>
                          <div className="text-muted-foreground">Было: {formatOrderHistoryValue(change.field, change.oldValue)}</div>
                          <div>Станет: {formatOrderHistoryValue(change.field, change.newValue)}</div>
                        </div>
                      ))}
                    </div>
                    {orderForm.managerComment.trim() ? (
                      <div className="border border-gray-200 p-4">
                        <div className="mb-2 font-medium">Комментарий к изменению</div>
                        <p className="whitespace-pre-wrap text-muted-foreground">{orderForm.managerComment.trim()}</p>
                      </div>
                    ) : null}
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" className="rounded-none" onClick={() => setIsOrderSaveConfirmOpen(false)} disabled={orderSaving}>
                      Отмена
                    </Button>
                    <Button type="button" className="rounded-none bg-black text-white" onClick={confirmOrderSave} disabled={orderSaving}>
                      {orderSaving ? "Сохранение..." : "Подтвердить"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={orderActionDialog.open} onOpenChange={(open) => { if (!open) closeOrderActionDialog(); }}>
                <DialogContent className="max-w-md rounded-none border-black">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase">
                      {orderActionDialog.action === "cancel" ? "Подтвердить отмену заказа" : "Подтвердить удаление заказа"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 text-sm">
                    <p>
                      {orderActionDialog.action === "cancel"
                        ? `Отменить заказ ${orderActionDialog.order?.id}?`
                        : `Удалить заказ ${orderActionDialog.order?.id}?`}
                    </p>
                    <p className="text-muted-foreground">
                      {orderActionDialog.action === "cancel"
                        ? "После отмены статус изменится на «Отменен», а остатки товара вернутся на склад."
                        : "Удаление уберет заказ из списка. Если заказ еще не был отменен или возвращен, остатки товара тоже вернутся на склад."}
                    </p>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" className="rounded-none" onClick={closeOrderActionDialog} disabled={orderActionDialog.submitting}>
                      Отмена
                    </Button>
                    <Button
                      type="button"
                      className={`rounded-none text-white ${orderActionDialog.action === "cancel" ? "bg-amber-600 hover:bg-amber-700" : "bg-red-600 hover:bg-red-700"}`}
                      onClick={confirmOrderAction}
                      disabled={orderActionDialog.submitting}
                    >
                      {orderActionDialog.submitting
                        ? (orderActionDialog.action === "cancel" ? "Отмена..." : "Удаление...")
                        : (orderActionDialog.action === "cancel" ? "Отменить заказ" : "Удалить заказ")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            </TabsContent>


          <TabsContent value="dictionaries" className="mt-0">
            <div className="space-y-4">
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl xl:text-5xl">Справочники</h2>
              <p className="text-base text-muted-foreground sm:text-lg">Управляйте справочниками системы</p>

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
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-3xl font-black tracking-tight">{activeDictionaryGroup.label}</h3>
                      <p className="text-sm text-muted-foreground">Всего: {(dictionaries[selectedDictionaryGroup] || []).length}</p>
                    </div>
                    <Button type="button" className="w-full rounded-none bg-slate-900 text-white hover:bg-slate-800 sm:w-auto" onClick={() => createDictionaryItem(selectedDictionaryGroup)}>
                      <Plus className="mr-2 h-4 w-4" /> Добавить
                    </Button>
                  </div>

                  {DICTIONARY_FILTER_SETTING_KEYS[selectedDictionaryGroup] && (
                    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-end xl:grid-cols-[minmax(0,1fr)_minmax(620px,auto)]">
                        <div>
                          <p className="text-sm font-semibold">Фильтр каталога</p>
                          <p className="text-xs text-muted-foreground">Управляет отображением блока «{activeDictionaryGroup.label}» на странице каталога и его местом в списке фильтров.</p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)] lg:justify-end">
                          <div className="flex min-w-0 flex-col gap-1">
                            <Label htmlFor={`catalog-filter-order-${selectedDictionaryGroup}`} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Порядок блока
                            </Label>
                            <Input
                              id={`catalog-filter-order-${selectedDictionaryGroup}`}
                              type="number"
                              min="0"
                              step="1"
                              value={getDictionaryFilterOrderSetting(selectedDictionaryGroup)}
                              onChange={(event) => updateSetting(DICTIONARY_FILTER_ORDER_SETTING_KEYS[selectedDictionaryGroup], event.target.value)}
                              onBlur={(event) => updateDictionaryFilterOrder(selectedDictionaryGroup, event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  updateDictionaryFilterOrder(selectedDictionaryGroup, event.currentTarget.value);
                                  event.currentTarget.blur();
                                }
                              }}
                              className="h-11 rounded-none border-slate-300"
                            />
                          </div>
                          <div className="flex min-w-0 flex-col gap-1">
                            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Отображение блока
                            </span>
                            <label className="flex h-11 cursor-pointer items-center justify-between gap-3 rounded-none border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700">
                              <span className="min-w-0 truncate">Показывать в каталоге</span>
                              <Checkbox
                                checked={isSettingEnabled(DICTIONARY_FILTER_SETTING_KEYS[selectedDictionaryGroup] as string, true)}
                                onCheckedChange={(checked) => updateDictionaryFilterVisibility(selectedDictionaryGroup, !!checked)}
                              />
                            </label>
                          </div>
                          <div className="flex min-w-0 flex-col gap-1">
                            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Отображение цвета
                            </span>
                            <label className="flex h-11 cursor-pointer items-center justify-between gap-3 rounded-none border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700">
                              <span className="min-w-0 truncate">Показывать цвет в каталоге</span>
                              <Checkbox
                                checked={isSettingEnabled(DICTIONARY_FILTER_COLOR_SETTING_KEYS[selectedDictionaryGroup], true)}
                                onCheckedChange={(checked) => updateDictionaryFilterColorVisibility(selectedDictionaryGroup, !!checked)}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {getSortedDictionaryItems(selectedDictionaryGroup).map((item) => {
                      const isEditing = editingDictionaryItemId === item.id;
                      const draft = dictionaryDrafts[item.id] ?? getDictionaryDraftDefaults(item);
                      const itemUsed = isDictionaryItemUsed(selectedDictionaryGroup, item);
                      const collectionPreviewImages = selectedDictionaryGroup === "collections"
                        ? getCollectionPreviewImagesFromProducts(draft.name || item.name)
                        : [];
                      return (
                        <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-3">
                          {isEditing ? (
                            <div className="space-y-4">
                              {itemUsed && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                  Элемент уже используется в товарах. Редактирование доступно, удаление отключено.
                                </div>
                              )}
                              <div className="grid items-end gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_160px_minmax(0,0.95fr)_180px]">
                                <div className="flex h-full flex-col gap-1">
                                  <Label htmlFor={`dict-name-${item.id}`} className="block text-xs">Название *</Label>
                                  <Input
                                    id={`dict-name-${item.id}`}
                                    name={`dict_name_${item.id}`}
                                    aria-label={`Название словарного элемента ${item.name || item.id}`}
                                    value={draft.name}
                                    onChange={(e) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, name: e.target.value } }))}
                                    className="h-11 rounded-none border-slate-300"
                                  />
                                </div>
                                <div className="flex h-full flex-col gap-1">
                                  <Label htmlFor={`dict-slug-${item.id}`} className="block text-xs">Slug *</Label>
                                  <Input
                                    id={`dict-slug-${item.id}`}
                                    name={`dict_slug_${item.id}`}
                                    aria-label={`Slug словарного элемента ${item.name || item.id}`}
                                    value={draft.slug}
                                    onChange={(e) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, slug: e.target.value.toLowerCase() } }))}
                                    className="h-11 rounded-none border-slate-300"
                                    placeholder="latin-slug"
                                  />
                                </div>
                                <div className="flex h-full flex-col gap-1">
                                  <Label htmlFor={`dict-sort-order-${item.id}`} className="block text-xs">Порядок</Label>
                                  <Input
                                    id={`dict-sort-order-${item.id}`}
                                    name={`dict_sort_order_${item.id}`}
                                    aria-label={`Порядок словарного элемента ${item.name || item.id}`}
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={draft.sortOrder}
                                    onChange={(e) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, sortOrder: e.target.value } }))}
                                    className="h-11 rounded-none border-slate-300"
                                    placeholder="0"
                                  />
                                </div>
                                <div className="flex h-full flex-col gap-1">
                                  <Label htmlFor={`dict-color-${item.id}`} className="block text-xs">Цвет</Label>
                                  <div className="grid items-stretch grid-cols-[minmax(0,1fr)_48px] gap-2">
                                    <Input
                                      id={`dict-color-${item.id}`}
                                      name={`dict_color_${item.id}`}
                                      aria-label={`HEX-цвет словарного элемента ${item.name || item.id}`}
                                      value={draft.color}
                                      onChange={(e) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, color: e.target.value } }))}
                                      className="h-11 rounded-none border-slate-300"
                                      placeholder="#3b82f6"
                                    />
                                    <input
                                      id={`dict-color-picker-${item.id}`}
                                      name={`dict_color_picker_${item.id}`}
                                      aria-label={`Цвет словарного элемента ${draft.name || item.name || item.id}`}
                                      type="color"
                                      value={draft.color || "#3b82f6"}
                                      onChange={(e) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, color: e.target.value } }))}
                                      className="h-11 w-12 cursor-pointer rounded-none border border-slate-300 bg-white p-1"
                                    />
                                  </div>
                                </div>
                                <div className="flex h-full flex-col gap-1">
                                  <Label htmlFor={`dict-active-${item.id}`} className="block text-xs">Статус</Label>
                                  <label htmlFor={`dict-active-${item.id}`} className="flex h-11 cursor-pointer items-center gap-3 rounded-none border border-slate-300 bg-white px-3">
                                    <Checkbox
                                      id={`dict-active-${item.id}`}
                                      checked={draft.isActive}
                                      onCheckedChange={(checked) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, isActive: !!checked } }))}
                                    />
                                    <span className="text-sm">Активно</span>
                                  </label>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`dict-description-${item.id}`} className="mb-1 block text-xs">Описание</Label>
                                <Textarea
                                  id={`dict-description-${item.id}`}
                                  name={`dict_description_${item.id}`}
                                  aria-label={`Описание словарного элемента ${item.name || item.id}`}
                                  value={draft.description}
                                  onChange={(e) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, description: e.target.value } }))}
                                  className="min-h-[76px] rounded-md border-slate-300"
                                  placeholder="Описание словарного значения"
                                />
                              </div>
                              {selectedDictionaryGroup === "collections" && (
                                <div className="space-y-3 rounded-none border border-slate-200 p-3">
                                  <div className="space-y-1">
                                    <Label htmlFor={`dict-preview-mode-${item.id}`} className="mb-1 block text-xs">Режим изображения коллекции</Label>
                                    <Select
                                      value={draft.previewMode}
                                      onValueChange={(value) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, previewMode: value as CollectionPreviewMode } }))}
                                    >
                                      <SelectTrigger id={`dict-preview-mode-${item.id}`} className="h-11 rounded-none border-slate-300">
                                        <SelectValue placeholder="Выберите режим" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="gallery">Большое изображение из галереи</SelectItem>
                                        <SelectItem value="products">Автоколлаж из товаров коллекции</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {draft.previewMode === "gallery" ? (
                                    <div className="space-y-3">
                                      <div className="flex flex-wrap gap-2">
                                        <Button type="button" variant="outline" className="rounded-none" onClick={() => openCollectionEditGalleryPicker(item.id)}>
                                          <Images className="mr-2 h-4 w-4" /> Выбрать из галереи
                                        </Button>
                                        {draft.imageUrl?.trim() && (
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="rounded-none"
                                            onClick={() => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, imageUrl: "" } }))}
                                          >
                                            <X className="mr-2 h-4 w-4" /> Убрать изображение
                                          </Button>
                                        )}
                                      </div>
                                      {draft.imageUrl?.trim() ? (
                                        <div className="overflow-hidden border border-slate-200 bg-slate-50">
                                          <img src={draft.imageUrl} alt={draft.name || item.name} className="h-44 w-full object-cover" />
                                        </div>
                                      ) : (
                                        <div className="rounded-none border border-dashed border-slate-300 px-3 py-4 text-sm text-muted-foreground">
                                          Выберите изображение из общей галереи. Оно будет использовано как главный кадр коллекции.
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="space-y-3">
                                      {collectionPreviewImages.length > 0 ? (
                                        <div className="grid grid-cols-3 gap-2 overflow-hidden">
                                          {collectionPreviewImages.map((imageUrl, index) => (
                                            <div key={`${item.id}-preview-${index}`} className="overflow-hidden border border-slate-200 bg-slate-50">
                                              <img src={imageUrl} alt="" className="h-32 w-full object-cover" />
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="rounded-none border border-dashed border-slate-300 px-3 py-4 text-sm text-muted-foreground">
                                          Как только в коллекции появятся товары с изображениями, коллаж соберётся автоматически из всех картинок этой коллекции.
                                        </div>
                                      )}
                                      <p className="text-xs leading-5 text-muted-foreground">
                                        В этом режиме блок на главной и в каталоге сам собирает широкий коллаж из всех изображений товаров коллекции и ротирует их автоматически.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="flex flex-wrap gap-3">
                                <label className="flex cursor-pointer items-center gap-3 rounded-none border border-slate-300 bg-white px-3 py-2 text-sm">
                                  <Checkbox
                                    checked={draft.showColorInCatalog}
                                    onCheckedChange={(checked) => setDictionaryDrafts((prev) => ({ ...prev, [item.id]: { ...draft, showColorInCatalog: !!checked } }))}
                                  />
                                  <span>Показывать цвет в каталоге</span>
                                </label>
                              </div>
                              <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 md:flex-row md:items-center md:justify-between">
                                <div className="space-y-1 text-xs text-muted-foreground">
                                  <div>Создано: {item.createdAt ? new Date(item.createdAt).toLocaleString("ru-RU") : "—"}</div>
                                  {itemUsed && <div>Удаление недоступно, пока значение используется в товарах.</div>}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                  <Button type="button" variant="outline" className="min-w-[110px] rounded-none" onClick={() => cancelEditDictionaryItem(item)}>
                                    <X className="mr-2 h-4 w-4" /> Сброс
                                  </Button>
                                  <Button type="button" className="min-w-[130px] rounded-none bg-slate-900 text-white hover:bg-slate-800" onClick={() => updateDictionaryItem(selectedDictionaryGroup, item)}>
                                    <Check className="mr-2 h-4 w-4" /> Сохранить
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 font-semibold">
                                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color || getDictionaryDotColor(item.name) }} />
                                  {item.name}
                                  <span className="text-xs text-slate-500">({item.slug})</span>
                                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${item.isActive === false ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                                    {item.isActive === false ? "неактивно" : "активно"}
                                  </span>
                                  {itemUsed && (
                                    <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                                      используется
                                    </span>
                                  )}
                                </div>
                                {item.description && (
                                  <div className="mt-1 text-sm text-slate-600">{item.description}</div>
                                )}
                                <div className="mt-1 text-xs text-muted-foreground">Порядок: {item.sortOrder ?? 0}</div>
                                <div className="mt-1 text-xs text-muted-foreground">Цвет в каталоге: {item.showColorInCatalog === false ? "скрыт" : "показан"}</div>
                                <div className="mt-1 text-xs text-muted-foreground">Создано: {item.createdAt ? new Date(item.createdAt).toLocaleString("ru-RU") : "—"}</div>
                              </div>
                              <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto xl:justify-end">
                                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-none" onClick={() => startEditDictionaryItem(item)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className={`h-8 w-8 rounded-none ${itemUsed ? "cursor-not-allowed text-slate-300 hover:bg-transparent hover:text-slate-300" : "text-red-500"}`}
                                  onClick={() => requestDeleteDictionaryItem(selectedDictionaryGroup, item)}
                                  disabled={itemUsed}
                                  title={itemUsed ? "Элемент используется в товарах и не может быть удален" : "Удалить элемент"}
                                >
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
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                      {settingsGroupsWithBackup.map((group) => (
                        <Button
                          key={group.id}
                          variant={selectedSettingsGroup === group.id ? "default" : "outline"}
                          className="h-auto min-h-11 justify-start whitespace-normal break-words px-3 py-3 text-left leading-snug"
                          onClick={() => setSelectedSettingsGroup(group.id)}
                        >
                          {group.label}
                        </Button>
                      ))}
                      <Button
                        key="promo-codes"
                        variant={selectedSettingsGroup === "promo-codes" ? "default" : "outline"}
                        className="h-auto min-h-11 justify-start whitespace-normal break-words px-3 py-3 text-left leading-snug"
                        onClick={() => setSelectedSettingsGroup("promo-codes")}
                      >
                        Промокоды
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="order-2 space-y-4 lg:order-2">
                  {selectedSettingsGroup === "account-merge" && renderUserMergePanel()}

                  {selectedSettingsGroup === "auth" && (
                    <div className="space-y-4 border p-3">
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
                      <div className="space-y-4 rounded-none border border-gray-200 p-4">
                        <div className="space-y-1">
                          <h4 className="font-semibold">Внешние способы входа</h4>
                          <p className="text-sm text-muted-foreground">
                            Здесь собраны все настройки, которых достаточно с нашей стороны для входа через Telegram, Google, VK и Яндекс. Отдельно у провайдеров все равно нужно разрешить callback URL, который показан ниже в карточках OAuth-провайдеров.
                          </p>
                          <p className="text-xs leading-5 text-muted-foreground">
                            Кнопки проверки ниже используют уже сохраненные настройки сервера. Если вы только что изменили поля в этой форме, сначала нажмите общую кнопку сохранения настроек внизу страницы.
                          </p>
                          <p className="text-xs leading-5 text-muted-foreground">
                            Выберите вкладку нужного провайдера: внутри каждой собраны поля, callback URL, тест и пошаговая инструкция со ссылками в официальный кабинет.
                          </p>
                        </div>
                        <Tabs defaultValue="telegram" className="space-y-4">
                          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-none bg-transparent p-0 xl:grid-cols-6">
                            <TabsTrigger value="telegram" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">Telegram</TabsTrigger>
                            <TabsTrigger value="telegram-widget" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">Telegram Widget</TabsTrigger>
                            <TabsTrigger value="telegram-gateway" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">Telegram Gateway</TabsTrigger>
                            <TabsTrigger value="google" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">Google</TabsTrigger>
                            <TabsTrigger value="vk" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">VK</TabsTrigger>
                            <TabsTrigger value="yandex" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">Яндекс</TabsTrigger>
                          </TabsList>

                          <TabsContent value="telegram" className="mt-0">
                          <div className="space-y-3 rounded-none border border-gray-200 p-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <Label htmlFor="auth-telegram-login-enabled" className="text-sm font-semibold">Telegram</Label>
                                <p className="text-xs leading-5 text-muted-foreground">
                                  Как работает: пользователь нажимает кнопку входа, переходит в Telegram-бота, подтверждает аккаунт и возвращается на сайт уже авторизованным.
                                </p>
                              </div>
                              <Checkbox
                                id="auth-telegram-login-enabled"
                                checked={isSettingEnabled("telegram_login_enabled")}
                                onCheckedChange={(checked) => updateSetting("telegram_login_enabled", checked ? "true" : "false")}
                              />
                            </div>
                            <div className="space-y-3 border border-amber-200 bg-amber-50/70 p-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold">Как настроить Telegram-вход</div>
                                <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                                  <li>Откройте BotFather и создайте нового бота через команду <code>/newbot</code>, если бота еще нет.</li>
                                  <li>Скопируйте токен бота и добавьте его в разделе интеграций Telegram.</li>
                                  <li>Включите у этого бота флаг <code>использовать для входа</code>.</li>
                                  <li>Проверьте, что у бота есть username, потому что именно он используется для deep-link входа.</li>
                                  <li>После сохранения настроек нажмите кнопку проверки ниже: должен открыться Telegram-бот с параметром входа.</li>
                                </ol>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://t.me/BotFather" target="_blank" rel="noreferrer">Открыть BotFather</a>
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://core.telegram.org/bots#how-do-i-create-a-bot" target="_blank" rel="noreferrer">Инструкция по ботам</a>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="auth-telegram-bot-username">Username бота</Label>
                              <Input
                                id="auth-telegram-bot-username"
                                value={settings["telegram_bot_username"] || ""}
                                onChange={(e) => updateSetting("telegram_bot_username", e.target.value)}
                                placeholder="fashion_demon_bot"
                              />
                              <p className="text-xs text-muted-foreground">
                                Если оставить пустым, будет использован username активного login-бота из раздела интеграций.
                              </p>
                            </div>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <div>Что нужно: в разделе `Интеграции / Telegram` должен быть включенный бот с токеном и флагом `использовать для входа`.</div>
                              <div>Сейчас используется: {loginTelegramBot?.username ? `@${loginTelegramBot.username}` : "login-бот пока не выбран"}.</div>
                              <div>Токен бота: {loginTelegramBot?.hasToken || hasConfiguredValue(loginTelegramBot?.tokenMasked) ? "задан" : "не задан"}.</div>
                            </div>
                            <div className="space-y-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full rounded-none"
                                onClick={startTelegramLoginTest}
                                disabled={externalAuthTestRunning === "telegram"}
                              >
                                {externalAuthTestRunning === "telegram" ? "Запускаем тест..." : "Проверить Telegram-вход"}
                              </Button>
                              <p className="text-xs text-muted-foreground">
                                Тест создаст реальную ссылку входа и откроет Telegram-бота. Можно просто убедиться, что бот открылся, не завершая авторизацию.
                              </p>
                              {renderExternalAuthTestStatus("telegram")}
                            </div>
                          </div>
                          </TabsContent>

                          <TabsContent value="telegram-widget" className="mt-0">
                          <div className="space-y-3 rounded-none border border-gray-200 p-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <Label htmlFor="auth-telegram-widget-enabled" className="text-sm font-semibold">Telegram Widget</Label>
                                <p className="text-xs leading-5 text-muted-foreground">
                                  Как работает: на странице авторизации появляется официальный Telegram Login Widget, и пользователь подтверждает вход прямо в виджете без перехода по кнопке в бота.
                                </p>
                              </div>
                              <Checkbox
                                id="auth-telegram-widget-enabled"
                                checked={isSettingEnabled("telegram_widget_enabled")}
                                onCheckedChange={(checked) => updateSetting("telegram_widget_enabled", checked ? "true" : "false")}
                              />
                            </div>
                            <div className="space-y-3 border border-amber-200 bg-amber-50/70 p-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold">Как настроить Telegram Widget</div>
                                <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                                  <li>Сначала полностью настройте обычный Telegram-вход через login-бота во вкладке Telegram.</li>
                                  <li>Убедитесь, что у бота есть username и он указан в интеграции.</li>
                                  <li>В BotFather выполните <code>/setdomain</code> и укажите домен сайта, на котором будет отображаться виджет.</li>
                                  <li>Включите Telegram Widget в этой вкладке и сохраните настройки.</li>
                                  <li>Сначала проверьте тестовый виджет в админке, а затем откройте страницу <code>/auth</code> и убедитесь, что виджет появился и там.</li>
                                </ol>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://t.me/BotFather" target="_blank" rel="noreferrer">Открыть BotFather</a>
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://core.telegram.org/widgets/login" target="_blank" rel="noreferrer">Документация Widget</a>
                              </div>
                            </div>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <div>Что нужно: тот же login-бот из интеграций должен быть включен и иметь username.</div>
                              <div>Дополнительно у BotFather для этого бота должен быть настроен домен сайта через `setdomain`.</div>
                              <div>Если виджет включен, а на странице входа его нет, обычно не хватает username бота, токена или домена у BotFather.</div>
                            </div>
                            <div className="space-y-2">
                              <div className="grid gap-2 sm:grid-cols-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full rounded-none"
                                  onClick={() => setTelegramWidgetTestVisible((current) => !current)}
                                  disabled={!isSettingEnabled("telegram_widget_enabled") || !isTelegramWidgetTestReady}
                                >
                                  {telegramWidgetTestVisible ? "Скрыть тестовый виджет" : "Показать тестовый виджет"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full rounded-none"
                                  onClick={openAuthPageForTesting}
                                  disabled={!isSettingEnabled("telegram_widget_enabled")}
                                >
                                  Открыть страницу входа
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Тестовый виджет проверяет отрисовку прямо в админке. Для полной проверки боевого сценария откройте страницу `/auth` и убедитесь, что виджет появился там.
                              </p>
                              {telegramWidgetTestVisible ? (
                                <div className="space-y-2 rounded-none border border-dashed border-slate-300 p-3">
                                  <div className="text-xs text-muted-foreground">
                                    Тестовый username: {telegramWidgetUsername ? `@${telegramWidgetUsername}` : "не задан"}.
                                  </div>
                                  <div ref={telegramWidgetTestRef} className="min-h-[56px]" />
                                </div>
                              ) : null}
                              {renderExternalAuthTestStatus("telegram_widget")}
                            </div>
                          </div>
                          </TabsContent>

                          <TabsContent value="telegram-gateway" className="mt-0">
                          <div className="space-y-3 rounded-none border border-gray-200 p-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <Label htmlFor="auth-telegram-gateway-enabled" className="text-sm font-semibold">Telegram Gateway</Label>
                                <p className="text-xs leading-5 text-muted-foreground">
                                  Как работает: сервис отправляет одноразовый код в системный чат Telegram `Verification Codes`. Мы используем его для подтверждения телефона и подтверждения удаления профиля.
                                </p>
                              </div>
                              <Checkbox
                                id="auth-telegram-gateway-enabled"
                                checked={isSettingEnabled("telegram_gateway_enabled")}
                                onCheckedChange={(checked) => updateSetting("telegram_gateway_enabled", checked ? "true" : "false")}
                              />
                            </div>
                            <div className="space-y-3 border border-amber-200 bg-amber-50/70 p-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold">Как настроить Telegram Gateway</div>
                                <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                                  <li>Откройте кабинет Telegram Gateway и получите API token.</li>
                                  <li>При необходимости пополните баланс Gateway для боевых отправок.</li>
                                  <li>Вставьте token ниже, сохраните настройки и включите интеграцию.</li>
                                  <li>После этого подтверждение телефона и удаление профиля по телефону на сайте автоматически перейдут на OTP-код из Telegram.</li>
                                  <li>Если Gateway недоступен, система сможет использовать старый bot-flow как резервный сценарий.</li>
                                </ol>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://gateway.telegram.org" target="_blank" rel="noreferrer">Открыть Gateway</a>
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://core.telegram.org/gateway" target="_blank" rel="noreferrer">Обзор</a>
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://core.telegram.org/gateway/api" target="_blank" rel="noreferrer">API</a>
                              </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1 md:col-span-2">
                                <Label htmlFor="auth-telegram-gateway-api-token">API token</Label>
                                <Input
                                  id="auth-telegram-gateway-api-token"
                                  type="password"
                                  autoComplete="new-password"
                                  value={settings["telegram_gateway_api_token"] || ""}
                                  onChange={(e) => updateSetting("telegram_gateway_api_token", e.target.value)}
                                  placeholder="AAEFAAAA..."
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="auth-telegram-gateway-sender-username">Sender username</Label>
                                <Input
                                  id="auth-telegram-gateway-sender-username"
                                  value={settings["telegram_gateway_sender_username"] || ""}
                                  onChange={(e) => updateSetting("telegram_gateway_sender_username", e.target.value)}
                                  placeholder="@your_verified_channel"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Необязательно. Если укажете, код будет приходить от вашего верифицированного канала.
                                </p>
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="auth-telegram-gateway-code-length">Длина кода</Label>
                                <Input
                                  id="auth-telegram-gateway-code-length"
                                  type="number"
                                  min={4}
                                  max={8}
                                  value={settings["telegram_gateway_code_length"] || "6"}
                                  onChange={(e) => updateSetting("telegram_gateway_code_length", e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="auth-telegram-gateway-ttl">TTL кода, сек</Label>
                                <Input
                                  id="auth-telegram-gateway-ttl"
                                  type="number"
                                  min={30}
                                  max={3600}
                                  value={settings["telegram_gateway_ttl_seconds"] || "300"}
                                  onChange={(e) => updateSetting("telegram_gateway_ttl_seconds", e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <div>Сейчас включено: {isSettingEnabled("telegram_gateway_enabled") ? "да" : "нет"}.</div>
                              <div>API token: {hasConfiguredValue(settings["telegram_gateway_api_token"]) ? "задан" : "не задан"}.</div>
                              <div>После сохранения сайт начнет использовать Gateway для подтверждения телефона автоматически.</div>
                            </div>
                          </div>
                          </TabsContent>

                          <TabsContent value="google" className="mt-0">
                          <div className="space-y-3 rounded-none border border-gray-200 p-3">
                            <AuthAutofillTrap scope="auth-google-oauth" />
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <Label htmlFor="auth-google-login-enabled" className="text-sm font-semibold">Google</Label>
                                <p className="text-xs leading-5 text-muted-foreground">
                                  Как работает: при нажатии открывается окно Google OAuth, пользователь подтверждает доступ, после чего аккаунт создается или привязывается к текущему профилю.
                                </p>
                              </div>
                              <Checkbox
                                id="auth-google-login-enabled"
                                checked={isSettingEnabled("google_login_enabled")}
                                onCheckedChange={(checked) => updateSetting("google_login_enabled", checked ? "true" : "false")}
                              />
                            </div>
                            <div className="space-y-3 border border-amber-200 bg-amber-50/70 p-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold">Как получить ключи Google OAuth</div>
                                <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                                  <li>Откройте Google Cloud Console и выберите проект или создайте новый.</li>
                                  <li>В разделе Google Auth Platform заполните экран брендинга и при необходимости добавьте test users.</li>
                                  <li>Перейдите в Credentials и создайте OAuth Client ID типа <code>Web application</code>.</li>
                                  <li>Добавьте callback URL из поля ниже в список <code>Authorized redirect URIs</code>.</li>
                                  <li>Скопируйте <code>Client ID</code> и <code>Client Secret</code> в поля этой формы, сохраните настройки и запустите тест.</li>
                                </ol>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noreferrer">Google Auth Platform</a>
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">OAuth Credentials</a>
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://developers.google.com/identity/protocols/oauth2/web-server" target="_blank" rel="noreferrer">Официальная инструкция</a>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="auth-google-client-id">Client ID</Label>
                              <NoAutofillInput
                                id="auth-google-client-id"
                                name="auth-google-oauth-client-id"
                                autoComplete="new-password"
                                value={settings["google_auth_client_id"] || ""}
                                onChange={(e) => updateSetting("google_auth_client_id", e.target.value)}
                                placeholder="Google OAuth Client ID"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="auth-google-client-secret">Client Secret</Label>
                              <NoAutofillInput
                                id="auth-google-client-secret"
                                name="auth-google-oauth-client-secret"
                                type="password"
                                autoComplete="new-password"
                                value={settings["google_auth_client_secret"] || ""}
                                onChange={(e) => updateSetting("google_auth_client_secret", e.target.value)}
                                placeholder="Google OAuth Client Secret"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="auth-google-callback-url">Callback URL</Label>
                              <Input id="auth-google-callback-url" value={googleCallbackUrl} readOnly className="bg-slate-50" />
                            </div>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <div>Что нужно: добавить этот callback URL в Google Cloud Console в список разрешенных redirect URI.</div>
                              <div>Client ID: {hasConfiguredValue(settings["google_auth_client_id"]) ? "задан в панели" : "не задан в панели, можно использовать env Auth__Google__ClientId"}.</div>
                              <div>Client Secret: {hasConfiguredValue(settings["google_auth_client_secret"]) ? "задан в панели" : "не задан в панели, можно использовать env Auth__Google__ClientSecret"}.</div>
                            </div>
                            <div className="space-y-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full rounded-none"
                                onClick={() => startExternalOAuthTest("google")}
                                disabled={externalAuthTestRunning === "google"}
                              >
                                {externalAuthTestRunning === "google" ? "Запускаем тест..." : "Проверить Google OAuth"}
                              </Button>
                              <p className="text-xs text-muted-foreground">
                                Тест откроет реальное окно Google OAuth. Если не хотите создавать или использовать реальный аккаунт, достаточно проверить, что окно провайдера открылось без мгновенной ошибки backend.
                              </p>
                              {renderExternalAuthTestStatus("google")}
                            </div>
                          </div>
                          </TabsContent>

                          <TabsContent value="vk" className="mt-0">
                          <div className="space-y-3 rounded-none border border-gray-200 p-3">
                            <AuthAutofillTrap scope="auth-vk-oauth" />
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <Label htmlFor="auth-vk-login-enabled" className="text-sm font-semibold">VK ID</Label>
                                <p className="text-xs leading-5 text-muted-foreground">
                                  Как работает: открывается окно VK ID, пользователь подтверждает доступ, после чего VK-аккаунт используется для входа или привязки.
                                </p>
                              </div>
                              <Checkbox
                                id="auth-vk-login-enabled"
                                checked={isSettingEnabled("vk_login_enabled")}
                                onCheckedChange={(checked) => updateSetting("vk_login_enabled", checked ? "true" : "false")}
                              />
                            </div>
                            <div className="space-y-3 border border-amber-200 bg-amber-50/70 p-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold">Как получить ключи VK ID</div>
                                <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                                  <li>Откройте кабинет разработчика VK и создайте приложение для сайта.</li>
                                  <li>В настройках приложения найдите <code>App ID / Client ID</code> и <code>Secure key / Client Secret</code>.</li>
                                  <li>Добавьте callback URL из поля ниже в список разрешенных redirect URI.</li>
                                  <li>Сохраните значения в этой форме и включите VK-вход.</li>
                                  <li>После сохранения нажмите кнопку теста: должен открыться официальный экран VK ID без мгновенной backend-ошибки.</li>
                                </ol>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://id.vk.ru/about/business/go" target="_blank" rel="noreferrer">Кабинет VK ID</a>
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://vkcom.github.io/vkid-web-sdk/docs/index.html" target="_blank" rel="noreferrer">VK ID SDK</a>
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://id.vk.ru/about/business/go/docs/ru/vkid/latest/vk-id/connection/oauth2" target="_blank" rel="noreferrer">OAuth 2.1</a>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="auth-vk-client-id">Client ID</Label>
                              <NoAutofillInput
                                id="auth-vk-client-id"
                                name="auth-vk-oauth-client-id"
                                autoComplete="new-password"
                                value={settings["vk_auth_client_id"] || ""}
                                onChange={(e) => updateSetting("vk_auth_client_id", e.target.value)}
                                placeholder="VK App ID / Client ID"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="auth-vk-client-secret">Client Secret</Label>
                              <NoAutofillInput
                                id="auth-vk-client-secret"
                                name="auth-vk-oauth-client-secret"
                                type="password"
                                autoComplete="new-password"
                                value={settings["vk_auth_client_secret"] || ""}
                                onChange={(e) => updateSetting("vk_auth_client_secret", e.target.value)}
                                placeholder="VK Secure key / Client Secret"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="auth-vk-callback-url">Callback URL</Label>
                              <Input id="auth-vk-callback-url" value={vkCallbackUrl} readOnly className="bg-slate-50" />
                            </div>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <div>Что нужно: добавить этот callback URL в настройках приложения VK как разрешенный redirect URI.</div>
                              <div>Client ID: {hasConfiguredValue(settings["vk_auth_client_id"]) ? "задан в панели" : "не задан в панели, можно использовать env Auth__Vk__ClientId"}.</div>
                              <div>Client Secret: {hasConfiguredValue(settings["vk_auth_client_secret"]) ? "задан в панели" : "не задан в панели, можно использовать env Auth__Vk__ClientSecret"}.</div>
                            </div>
                            <div className="space-y-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full rounded-none"
                                onClick={() => startExternalOAuthTest("vk")}
                                disabled={externalAuthTestRunning === "vk"}
                              >
                                {externalAuthTestRunning === "vk" ? "Запускаем тест..." : "Проверить VK ID"}
                              </Button>
                              <p className="text-xs text-muted-foreground">
                                Публичного универсального sandbox для VK ID нет, поэтому тест откроет реальное окно провайдера. Для первичной проверки достаточно убедиться, что backend выдает корректный OAuth URL и VK принимает запрос без мгновенной ошибки.
                              </p>
                              {renderExternalAuthTestStatus("vk")}
                            </div>
                          </div>
                          </TabsContent>

                          <TabsContent value="yandex" className="mt-0">
                          <div className="space-y-3 rounded-none border border-gray-200 p-3">
                            <AuthAutofillTrap scope="auth-yandex-oauth" />
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <Label htmlFor="auth-yandex-login-enabled" className="text-sm font-semibold">Яндекс</Label>
                                <p className="text-xs leading-5 text-muted-foreground">
                                  Как работает: открывается окно Яндекс OAuth, пользователь подтверждает доступ, после чего аккаунт Яндекса используется для входа или привязки.
                                </p>
                              </div>
                              <Checkbox
                                id="auth-yandex-login-enabled"
                                checked={isSettingEnabled("yandex_login_enabled")}
                                onCheckedChange={(checked) => updateSetting("yandex_login_enabled", checked ? "true" : "false")}
                              />
                            </div>
                            <div className="space-y-3 border border-amber-200 bg-amber-50/70 p-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold">Как получить ключи Яндекс OAuth</div>
                                <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                                  <li>Откройте кабинет приложений Яндекс OAuth и создайте новое приложение.</li>
                                  <li>Выберите веб-сервис и укажите callback URL из поля ниже как адрес возврата.</li>
                                  <li>После создания приложения скопируйте его <code>Client ID</code> и пароль приложения <code>Client Secret</code>.</li>
                                  <li>Вставьте оба значения в эту форму и сохраните настройки.</li>
                                  <li>Запустите тест: должно открыться окно Яндекс OAuth, а backend не должен падать на старте запроса.</li>
                                </ol>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://oauth.yandex.com/client/new/id/" target="_blank" rel="noreferrer">Создать приложение</a>
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://yandex.ru/dev/id/doc/ru/register-client" target="_blank" rel="noreferrer">Регистрация приложения</a>
                                <a className="inline-flex min-h-9 items-center justify-center border border-black px-3 py-2 font-medium hover:bg-black hover:text-white" href="https://yandex.ru/dev/id/doc/ru/codes/code-and-token" target="_blank" rel="noreferrer">Auth code flow</a>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="auth-yandex-client-id">Client ID</Label>
                              <NoAutofillInput
                                id="auth-yandex-client-id"
                                name="auth-yandex-oauth-client-id"
                                autoComplete="new-password"
                                value={settings["yandex_auth_client_id"] || ""}
                                onChange={(e) => updateSetting("yandex_auth_client_id", e.target.value)}
                                placeholder="Yandex OAuth Client ID"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="auth-yandex-client-secret">Client Secret</Label>
                              <NoAutofillInput
                                id="auth-yandex-client-secret"
                                name="auth-yandex-oauth-client-secret"
                                type="password"
                                autoComplete="new-password"
                                value={settings["yandex_auth_client_secret"] || ""}
                                onChange={(e) => updateSetting("yandex_auth_client_secret", e.target.value)}
                                placeholder="Yandex OAuth Client Secret"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="auth-yandex-callback-url">Callback URL</Label>
                              <Input id="auth-yandex-callback-url" value={yandexCallbackUrl} readOnly className="bg-slate-50" />
                            </div>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <div>Что нужно: добавить этот callback URL в настройках приложения Яндекса как адрес возврата.</div>
                              <div>Client ID: {hasConfiguredValue(settings["yandex_auth_client_id"]) ? "задан в панели" : "не задан в панели, можно использовать env Auth__Yandex__ClientId"}.</div>
                              <div>Client Secret: {hasConfiguredValue(settings["yandex_auth_client_secret"]) ? "задан в панели" : "не задан в панели, можно использовать env Auth__Yandex__ClientSecret"}.</div>
                            </div>
                            <div className="space-y-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full rounded-none"
                                onClick={() => startExternalOAuthTest("yandex")}
                                disabled={externalAuthTestRunning === "yandex"}
                              >
                                {externalAuthTestRunning === "yandex" ? "Запускаем тест..." : "Проверить Яндекс OAuth"}
                              </Button>
                              <p className="text-xs text-muted-foreground">
                                Тест откроет реальное окно Яндекс OAuth. Для первичной проверки достаточно убедиться, что запрос до провайдера стартует и не падает сразу на стороне backend.
                              </p>
                              {renderExternalAuthTestStatus("yandex")}
                            </div>
                          </div>
                          </TabsContent>
                        </Tabs>
                      </div>
                    </div>
                  )}

                  {selectedSettingsGroup === "promo-codes" && (
                    <AdminPromoCodesSettings />
                  )}

                  {selectedSettingsGroup === "orders" && (
                    <div className="space-y-4 border p-3">
                      <div className="space-y-1">
                        <h3 className="font-semibold">Настройки заказов</h3>
                        <p className="text-sm text-muted-foreground">
                          Цвета ниже управляют подложкой строки заказа в таблице. Сами значения сохраняются в БД через общие настройки.
                        </p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        {ORDER_STATUS_OPTIONS.map((option) => {
                          const settingKey = ORDER_STATUS_ROW_COLOR_SETTING_KEYS[option.value];
                          const colorValue = normalizeHexColorSetting(settings[settingKey]) || DEFAULT_APP_SETTINGS[settingKey] || "#e5e7eb";
                          return (
                            <div key={option.value} className="space-y-2 border border-gray-200 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="font-medium">{option.label}</div>
                                  <div className="text-xs text-muted-foreground">{settingKey}</div>
                                </div>
                                <span className={`inline-flex border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${getOrderStatusBadgeClassName(option.value)}`}>
                                  {option.label}
                                </span>
                              </div>

                              <div className="flex items-center gap-3">
                                <Input
                                  type="color"
                                  value={colorValue}
                                  onChange={(e) => updateSetting(settingKey, e.target.value)}
                                  className="h-11 w-16 rounded-none border-black p-1"
                                />
                                <Input
                                  value={settings[settingKey] || colorValue}
                                  onChange={(e) => updateSetting(settingKey, e.target.value)}
                                  className="h-11 rounded-none"
                                  placeholder="#e5e7eb"
                                />
                              </div>

                              <div
                                className="border px-3 py-2 text-sm"
                                style={{ backgroundColor: hexToRgba(colorValue, 0.14), boxShadow: `inset 4px 0 0 ${colorValue}` }}
                              >
                                Пример строки со статусом «{option.label}»
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedSettingsGroup === "smtp" && (
                    <div className="space-y-4 border p-3">
                      <div className="space-y-1">
                        <h3 className="font-semibold">Почта (SMTP)</h3>
                        <p className="text-sm text-muted-foreground">
                          SMTP уже используется для системных писем. Здесь можно проверить соединение тестовым письмом и настроить шаблоны уведомлений.
                        </p>
                      </div>
                      <div className="grid gap-2 md:max-w-xl">
                        <Label htmlFor="smtp-security-mode">Режим защиты SMTP</Label>
                        <Select value={getSmtpSecurityMode()} onValueChange={(value) => updateSmtpSecurityMode(value as SmtpSecurityMode)}>
                          <SelectTrigger id="smtp-security-mode" className="h-11 rounded-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SMTP_SECURITY_MODE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Для `587` обычно подходит `STARTTLS`, для `465` - `SSL/TLS при подключении`.
                        </p>
                      </div>
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
                      <div className="hidden flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                        <Checkbox
                          id="smtp-use-ssl"
                          checked={isSettingEnabled("smtp_use_ssl", true)}
                          onCheckedChange={(checked) => updateSetting("smtp_use_ssl", checked ? "true" : "false")}
                        />
                        <Label htmlFor="smtp-use-ssl">Использовать SSL/TLS</Label>
                      </div>

                      <div className="rounded-xl border border-dashed border-gray-300 p-4 space-y-3">
                        <div>
                          <div className="font-medium">Проверка отправки</div>
                          <div className="text-xs text-muted-foreground">
                            Тест использует текущие значения SMTP из формы, поэтому можно проверить подключение без отдельного сохранения.
                          </div>
                        </div>
                        <div className="flex flex-col gap-3 md:flex-row">
                          <div className="flex-1 space-y-1">
                            <Label htmlFor="smtp-test-email">Email для теста</Label>
                            <Input
                              id="smtp-test-email"
                              type="email"
                              value={smtpTestEmail}
                              onChange={(e) => setSmtpTestEmail(e.target.value)}
                              placeholder="test@example.com"
                              className="h-11 rounded-none"
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              type="button"
                              className="h-11 rounded-none font-bold uppercase tracking-wide"
                              onClick={sendSmtpTestEmail}
                              disabled={smtpTestSending}
                            >
                              {smtpTestSending ? "Отправка..." : "Отправить тест"}
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <h4 className="font-semibold">Шаблоны писем</h4>
                          <p className="text-sm text-muted-foreground">
                            Каждый шаблон можно отдельно включать и выключать. Плейсхолдеры используются в формате{" "}
                            <span className="font-mono">{'{{name}}'}</span>.
                          </p>
                        </div>

                        <Tabs defaultValue={EMAIL_TEMPLATE_DEFINITIONS[0]?.key} className="space-y-4">
                          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 md:grid-cols-2 xl:grid-cols-3">
                            {EMAIL_TEMPLATE_DEFINITIONS.map((template) => {
                              const enabledKey = getEmailTemplateSettingKey(template.key, "enabled");
                              const isEnabled = isSettingEnabled(enabledKey, template.enabledByDefault);

                              return (
                                <TabsTrigger
                                  key={template.key}
                                  value={template.key}
                                  className="flex min-h-[72px] flex-col items-start justify-center gap-1 rounded-none border border-black px-4 py-3 text-left data-[state=active]:bg-black data-[state=active]:text-white"
                                >
                                  <span className="font-semibold leading-tight">{template.label}</span>
                                  <span className="text-xs uppercase tracking-wide opacity-70">
                                    {isEnabled ? "Включен" : "Выключен"}
                                  </span>
                                </TabsTrigger>
                              );
                            })}
                          </TabsList>

                          {EMAIL_TEMPLATE_DEFINITIONS.map((template) => {
                            const enabledKey = getEmailTemplateSettingKey(template.key, "enabled");
                            const subjectKey = getEmailTemplateSettingKey(template.key, "subject");
                            const bodyKey = getEmailTemplateSettingKey(template.key, "body");

                            return (
                              <TabsContent key={template.key} value={template.key} className="mt-0">
                                <div className="space-y-4 rounded-xl border border-gray-200 p-4">
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-1">
                                      <div className="font-medium">{template.label}</div>
                                      <p className="text-sm text-muted-foreground">{template.description}</p>
                                      <div className="text-xs text-muted-foreground">
                                        Плейсхолдеры: {template.placeholders.join(", ")}
                                      </div>
                                    </div>
                                    <label className="flex items-center gap-2 text-sm font-medium">
                                      <Checkbox
                                        checked={isSettingEnabled(enabledKey, template.enabledByDefault)}
                                        onCheckedChange={(checked) => updateSetting(enabledKey, checked ? "true" : "false")}
                                      />
                                      <span>Шаблон включен</span>
                                    </label>
                                  </div>

                                  <div className="grid gap-3">
                                    <div className="space-y-1">
                                      <Label htmlFor={`${template.key}-subject-tab`}>Тема письма</Label>
                                      <Input
                                        id={`${template.key}-subject-tab`}
                                        value={settings[subjectKey] ?? template.defaultSubject}
                                        onChange={(e) => updateSetting(subjectKey, e.target.value)}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label htmlFor={`${template.key}-body-tab`}>Текст письма</Label>
                                      <Textarea
                                        id={`${template.key}-body-tab`}
                                        value={settings[bodyKey] ?? template.defaultBody}
                                        onChange={(e) => updateSetting(bodyKey, e.target.value)}
                                        className="min-h-[220px]"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </TabsContent>
                            );
                          })}
                        </Tabs>

                        {false && EMAIL_TEMPLATE_DEFINITIONS.map((template) => {
                          const enabledKey = getEmailTemplateSettingKey(template.key, "enabled");
                          const subjectKey = getEmailTemplateSettingKey(template.key, "subject");
                          const bodyKey = getEmailTemplateSettingKey(template.key, "body");

                          return (
                            <div key={template.key} className="space-y-3 rounded-xl border border-gray-200 p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="space-y-1">
                                  <div className="font-medium">{template.label}</div>
                                  <p className="text-sm text-muted-foreground">{template.description}</p>
                                  <div className="text-xs text-muted-foreground">
                                    Плейсхолдеры: {template.placeholders.join(", ")}
                                  </div>
                                </div>
                                <label className="flex items-center gap-2 text-sm font-medium">
                                  <Checkbox
                                    checked={isSettingEnabled(enabledKey, template.enabledByDefault)}
                                    onCheckedChange={(checked) => updateSetting(enabledKey, checked ? "true" : "false")}
                                  />
                                  <span>Шаблон включен</span>
                                </label>
                              </div>

                              <div className="grid gap-3">
                                <div className="space-y-1">
                                  <Label htmlFor={`${template.key}-subject`}>Тема письма</Label>
                                  <Input
                                    id={`${template.key}-subject`}
                                    value={settings[subjectKey] ?? template.defaultSubject}
                                    onChange={(e) => updateSetting(subjectKey, e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor={`${template.key}-body`}>Текст письма</Label>
                                  <Textarea
                                    id={`${template.key}-body`}
                                    value={settings[bodyKey] ?? template.defaultBody}
                                    onChange={(e) => updateSetting(bodyKey, e.target.value)}
                                    className="min-h-[180px]"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
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
                    <div className="min-w-0 space-y-3 overflow-hidden border p-3">
                      <h3 className="font-semibold">Интеграции</h3>
                      <p className="text-sm text-muted-foreground">Интеграции разнесены по вкладкам, чтобы каждый сервис было удобно настраивать отдельно.</p>

                      <Tabs value={selectedIntegrationCatalog} onValueChange={setSelectedIntegrationCatalog} className="min-w-0 w-full">
                        <div className="space-y-4">
                          <div className="space-y-2 border border-black/10 bg-slate-50 p-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Системные сервисы</div>
                            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-none bg-transparent p-0">
                              <TabsTrigger value="telegram" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">Telegram</TabsTrigger>
                              <TabsTrigger value="dadata" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">DaData</TabsTrigger>
                            </TabsList>
                          </div>

                          <div className="space-y-2 border border-black/10 bg-slate-50 p-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Платежные сервисы</div>
                            <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-none bg-transparent p-0 sm:grid-cols-3">
                              <TabsTrigger value="yoomoney" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">YooMoney</TabsTrigger>
                              <TabsTrigger value="yookassa" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">YooKassa</TabsTrigger>
                              <TabsTrigger value="robokassa" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">RoboKassa</TabsTrigger>
                            </TabsList>
                          </div>

                          <div className="space-y-2 border border-black/10 bg-slate-50 p-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Сервисы доставки</div>
                            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-none bg-transparent p-0 xl:grid-cols-4">
                              <TabsTrigger value="yandex" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">Яндекс.Доставка</TabsTrigger>
                              <TabsTrigger value="cdek" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">СДЭК</TabsTrigger>
                              <TabsTrigger value="russian-post" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">Почта России</TabsTrigger>
                              <TabsTrigger value="avito" className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none">Avito</TabsTrigger>
                            </TabsList>
                          </div>
                        </div>

                        <TabsContent value="telegram" className="mt-3 space-y-3">
                          <div className="min-w-0 space-y-3 overflow-hidden border p-3">
                            <div className="flex flex-wrap items-start justify-start gap-2 xl:justify-end">
                              <Checkbox
                                id="telegram-login-enabled"
                                checked={isSettingEnabled("telegram_login_enabled")}
                                onCheckedChange={(checked) => updateSetting("telegram_login_enabled", checked ? "true" : "false")}
                              />
                              <Label htmlFor="telegram-login-enabled" className="leading-snug">Включить авторизацию через Telegram</Label>
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

                        <TabsContent value="yoomoney" className="mt-3">
                          <div className="min-w-0 space-y-3 overflow-hidden border p-3">
                            <div className="flex flex-wrap items-start justify-start gap-2 xl:justify-end">
                              <Checkbox
                                id="payments-yoomoney-enabled"
                                checked={isSettingEnabled("payments_yoomoney_enabled")}
                                onCheckedChange={(checked) => updateSetting("payments_yoomoney_enabled", checked ? "true" : "false")}
                              />
                              <Label htmlFor="payments-yoomoney-enabled" className="leading-snug">Включить оплату через YooMoney</Label>
                            </div>

                            {renderPaymentIntegrationStatus(
                              "YooMoney",
                              isSettingEnabled("payments_yoomoney_enabled"),
                              yoomoneyConfigurationIssues,
                            )}

                            {isSettingEnabled("payments_yoomoney_enabled") && yoomoneyConfigurationIssues.length > 0 && (
                              <div className="space-y-2 rounded-none border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                <div className="font-semibold">YooMoney настроен не до конца</div>
                                <p>
                                  Пока эти пункты не исправлены, checkout не будет показывать способы оплаты YooMoney.
                                </p>
                                <ul className="list-disc space-y-1 pl-5">
                                  {yoomoneyConfigurationIssues.map((issue) => (
                                    <li key={issue}>{issue}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div className="space-y-1">
                                <Label htmlFor="yoomoney-wallet-number">Номер кошелька</Label>
                                <Input
                                  id="yoomoney-wallet-number"
                                  value={settings["yoomoney_wallet_number"] || ""}
                                  onChange={(e) => updateSetting("yoomoney_wallet_number", e.target.value)}
                                  placeholder="41001..."
                                />
                                <p className="text-xs text-muted-foreground">
                                  Кошелек получателя, на который ЮMoney будет выставлять счет.
                                </p>
                              </div>

                              <div className="space-y-1">
                                <Label htmlFor="yoomoney-label-prefix">Префикс метки</Label>
                                <Input
                                  id="yoomoney-label-prefix"
                                  value={settings["yoomoney_label_prefix"] || "FD"}
                                  onChange={(e) => updateSetting("yoomoney_label_prefix", e.target.value)}
                                  placeholder="FD"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Используется в `label`, чтобы платеж можно было однозначно связать с заказом.
                                </p>
                              </div>

                              <div className="space-y-1">
                                <Label htmlFor="yoomoney-notification-secret">Секрет для уведомлений</Label>
                                <Input
                                  id="yoomoney-notification-secret"
                                  type="password"
                                  value={settings["yoomoney_notification_secret"] || ""}
                                  onChange={(e) => updateSetting("yoomoney_notification_secret", e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Нужен для проверки подписи входящих уведомлений от YooMoney.
                                </p>
                              </div>

                              <div className="space-y-1">
                                <Label htmlFor="yoomoney-access-token">Access token</Label>
                                <Input
                                  id="yoomoney-access-token"
                                  type="password"
                                  value={settings["yoomoney_access_token"] || ""}
                                  onChange={(e) => updateSetting("yoomoney_access_token", e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Используется для ручной проверки и фоновой сверки через `operation-history`.
                                </p>
                              </div>

                              <div className="space-y-1">
                                <Label htmlFor="yoomoney-timeout-minutes">Срок жизни счета, минут</Label>
                                <Input
                                  id="yoomoney-timeout-minutes"
                                  type="number"
                                  min="5"
                                  value={settings["yoomoney_payment_timeout_minutes"] || "30"}
                                  onChange={(e) => updateSetting("yoomoney_payment_timeout_minutes", e.target.value)}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div className="flex items-center gap-2 rounded-none border p-3">
                                <Checkbox
                                  id="yoomoney-allow-bank-cards"
                                  checked={isSettingEnabled("yoomoney_allow_bank_cards", true)}
                                  onCheckedChange={(checked) => updateSetting("yoomoney_allow_bank_cards", checked ? "true" : "false")}
                                />
                                <Label htmlFor="yoomoney-allow-bank-cards">Разрешить банковские карты</Label>
                              </div>
                              <div className="flex items-center gap-2 rounded-none border p-3">
                                <Checkbox
                                  id="yoomoney-allow-wallet"
                                  checked={isSettingEnabled("yoomoney_allow_wallet", true)}
                                  onCheckedChange={(checked) => updateSetting("yoomoney_allow_wallet", checked ? "true" : "false")}
                                />
                                <Label htmlFor="yoomoney-allow-wallet">Разрешить оплату кошельком YooMoney</Label>
                              </div>
                            </div>

                            <div className="space-y-3 rounded-none border border-black/10 bg-slate-50 p-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold">Проверка интеграции</div>
                                <p className="text-xs text-muted-foreground">
                                  Проверка использует текущие значения из формы. Для YooMoney мы безопасно проверяем `access token` и собираем реальную форму оплаты без создания боевого платежа.
                                </p>
                              </div>
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-[120px_minmax(0,1fr)_auto]">
                                <div className="space-y-1">
                                  <Label htmlFor="yoomoney-test-amount">Сумма, ₽</Label>
                                  <Input
                                    id="yoomoney-test-amount"
                                    value={yoomoneyTestAmount}
                                    onChange={(e) => setYoomoneyTestAmount(e.target.value)}
                                    inputMode="decimal"
                                    placeholder="100"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="yoomoney-test-method">Способ оплаты</Label>
                                  <Select value={yoomoneyTestMethod} onValueChange={setYoomoneyTestMethod}>
                                    <SelectTrigger id="yoomoney-test-method" className="h-9 rounded-none">
                                      <SelectValue placeholder="Выберите способ оплаты" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {yoomoneyTestMethodOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-end">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-9 w-full rounded-none px-4 md:w-auto"
                                    onClick={runYooMoneyIntegrationTest}
                                    disabled={yoomoneyTestRunning || !isSettingEnabled("payments_yoomoney_enabled") || yoomoneyTestMethodOptions.length === 0}
                                  >
                                    {yoomoneyTestRunning ? "Проверяем..." : "Проверить интеграцию"}
                                  </Button>
                                </div>
                              </div>

                              {yoomoneyTestError && (
                                <div className="rounded-none border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                  {yoomoneyTestError}
                                </div>
                              )}

                              {yoomoneyTestResult && (
                                <div className="space-y-3 rounded-none border border-black/10 bg-white p-3 text-sm">
                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Проверено</div>
                                      <div className="font-medium">{yoomoneyTestResult.checkedAtLabel}</div>
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Способ оплаты</div>
                                      <div className="font-medium">
                                        {(yoomoneyTestResult.paymentMethod && YOO_MONEY_PAYMENT_METHOD_LABELS[yoomoneyTestResult.paymentMethod as keyof typeof YOO_MONEY_PAYMENT_METHOD_LABELS])
                                          || yoomoneyTestResult.paymentMethod
                                          || "—"}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-muted-foreground">API токен</div>
                                      <div className={yoomoneyTestResult.tokenValid ? "font-medium text-emerald-700" : "font-medium text-red-700"}>
                                        {yoomoneyTestResult.tokenValid ? "Валиден" : "Ошибка"}
                                      </div>
                                      {yoomoneyTestResult.tokenDetail && <div className="mt-1 text-xs text-muted-foreground">{yoomoneyTestResult.tokenDetail}</div>}
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Кошелек</div>
                                      <div className="break-all font-medium">{yoomoneyTestResult.walletNumber || "—"}</div>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div className="space-y-2 rounded-none border border-black/10 bg-slate-50 p-3">
                                      <div className="text-sm font-semibold">Форма оплаты</div>
                                      <div>Action: <span className="break-all">{yoomoneyTestResult.checkoutAction || "—"}</span></div>
                                      <div>Метод формы: {yoomoneyTestResult.checkoutMethod || "—"}</div>
                                      <div>Тип платежа: {yoomoneyTestResult.paymentType || "—"}</div>
                                      <div>Сумма к оплате: {formatOptionalRubles(yoomoneyTestResult.chargeAmount)}</div>
                                      <div>Ожидаемое поступление: {formatOptionalRubles(yoomoneyTestResult.expectedReceivedAmount)}</div>
                                    </div>
                                    <div className="space-y-2 rounded-none border border-black/10 bg-slate-50 p-3">
                                      <div className="text-sm font-semibold">Последняя операция по токену</div>
                                      {yoomoneyTestResult.lastOperation ? (
                                        <>
                                          <div>Статус: {yoomoneyTestResult.lastOperation.status || "—"}</div>
                                          <div>Сумма: {yoomoneyTestResult.lastOperation.amount || "—"}</div>
                                          <div>Тип: {yoomoneyTestResult.lastOperation.type || "—"}</div>
                                          <div>Дата: {yoomoneyTestResult.lastOperation.dateTime ? formatOrderDateTime(yoomoneyTestResult.lastOperation.dateTime) : "—"}</div>
                                        </>
                                      ) : (
                                        <div className="text-muted-foreground">Операции не вернулись, но токен ответил без ошибки.</div>
                                      )}
                                    </div>
                                  </div>

                                  {yoomoneyTestResult.note && (
                                    <div className="rounded-none border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                                      {yoomoneyTestResult.note}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div className="space-y-2 rounded-none border border-black/10 bg-slate-50 p-3">
                                <div className="text-sm font-semibold">Что заполнить</div>
                                <ol className="space-y-1 text-xs text-muted-foreground">
                                  <li>1. Укажите номер кошелька, на который должны приходить платежи.</li>
                                  <li>2. Вставьте секрет для HTTP-уведомлений из кабинета YooMoney.</li>
                                  <li>3. Добавьте access token, чтобы работала ручная и фоновая сверка оплаты.</li>
                                  <li>4. При необходимости настройте префикс метки и срок жизни счета.</li>
                                  <li>5. Включите нужные способы оплаты: карта и/или кошелек.</li>
                                </ol>
                              </div>
                              <div className="space-y-2 rounded-none border border-black/10 bg-slate-50 p-3">
                                <div className="text-sm font-semibold">Как это работает</div>
                                <ol className="space-y-1 text-xs text-muted-foreground">
                                  <li>1. При оформлении заказа создается счет YooMoney, а заказ получает статус `pending_payment`.</li>
                                  <li>2. Покупатель переходит в форму YooMoney и подтверждает платеж.</li>
                                  <li>3. YooMoney присылает уведомление на webhook, а backend связывает оплату с заказом по метке `label`.</li>
                                  <li>4. Если webhook задержался, оплату можно перепроверить вручную через историю операций.</li>
                                </ol>
                              </div>
                            </div>

                            <div className="space-y-3 rounded-none border border-black/10 bg-slate-50 p-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold">Webhook и проверка платежей</div>
                                <p className="text-xs text-muted-foreground">
                                  В кабинете YooMoney укажите этот URL для HTTP-уведомлений. Он нужен для мгновенного подтверждения оплаты.
                                </p>
                              </div>
                              <div className="flex flex-col gap-2 md:flex-row">
                                <Input value={yoomoneyNotificationUrl} readOnly className="font-mono text-xs" />
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-none"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(yoomoneyNotificationUrl);
                                      toast.success("URL уведомлений скопирован");
                                    } catch {
                                      toast.error("Не удалось скопировать URL уведомлений");
                                    }
                                  }}
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  Скопировать
                                </Button>
                              </div>
                              <div className="space-y-1 text-xs text-muted-foreground">
                                <p>Что обязательно заполнить: номер кошелька, секрет уведомлений и access token.</p>
                                <p>Access token должен иметь доступ к истории операций, иначе ручная сверка оплаты работать не будет.</p>
                              </div>
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="yookassa" className="mt-3">
                          <div className="min-w-0 space-y-3 overflow-hidden border p-3">
                            <div className="flex flex-wrap items-start justify-start gap-2 xl:justify-end">
                              <Checkbox
                                id="payments-yookassa-enabled"
                                checked={isSettingEnabled("payments_yookassa_enabled")}
                                onCheckedChange={(checked) => updateSetting("payments_yookassa_enabled", checked ? "true" : "false")}
                              />
                              <Label htmlFor="payments-yookassa-enabled" className="leading-snug">Включить оплату через YooKassa</Label>
                            </div>

                            {renderPaymentIntegrationStatus(
                              "YooKassa",
                              isSettingEnabled("payments_yookassa_enabled"),
                              yookassaConfigurationIssues,
                            )}

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              {isSettingEnabled("payments_yookassa_enabled") && yookassaConfigurationIssues.length > 0 && (
                                <div className="space-y-2 rounded-none border border-red-200 bg-red-50 p-3 text-sm text-red-700 md:col-span-2">
                                  <div className="font-semibold">YooKassa настроена не до конца</div>
                                  <p>
                                    Пока эти пункты не исправлены, checkout не будет показывать способы оплаты YooKassa.
                                  </p>
                                  <ul className="list-disc space-y-1 pl-5">
                                    {yookassaConfigurationIssues.map((issue) => (
                                      <li key={issue}>{issue}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              <div className="space-y-1">
                                <Label htmlFor="yookassa-shop-id">Shop ID</Label>
                                <Input
                                  id="yookassa-shop-id"
                                  name="yookassa-shop-id"
                                  autoComplete="off"
                                  autoCorrect="off"
                                  autoCapitalize="off"
                                  spellCheck={false}
                                  data-lpignore="true"
                                  data-1p-ignore="true"
                                  data-form-type="other"
                                  value={settings["yookassa_shop_id"] || ""}
                                  onChange={(e) => updateSetting("yookassa_shop_id", e.target.value)}
                                  placeholder="123456"
                                />
                              </div>

                              <div className="space-y-1">
                                <Label htmlFor="yookassa-secret-key">Secret Key</Label>
                                <Input
                                  id="yookassa-secret-key"
                                  name="yookassa-secret-key"
                                  type="password"
                                  autoComplete="new-password"
                                  autoCorrect="off"
                                  autoCapitalize="off"
                                  spellCheck={false}
                                  data-lpignore="true"
                                  data-1p-ignore="true"
                                  data-form-type="other"
                                  value={settings["yookassa_secret_key"] || ""}
                                  onChange={(e) => updateSetting("yookassa_secret_key", e.target.value)}
                                />
                              </div>

                              <div className="space-y-1">
                                <Label htmlFor="yookassa-label-prefix">Префикс метки</Label>
                                <Input
                                  id="yookassa-label-prefix"
                                  value={settings["yookassa_label_prefix"] || "YK"}
                                  onChange={(e) => updateSetting("yookassa_label_prefix", e.target.value)}
                                  placeholder="YK"
                                />
                              </div>

                              <div className="space-y-1">
                                <Label htmlFor="yookassa-timeout-minutes">Окно ожидания оплаты, минут</Label>
                                <Input
                                  id="yookassa-timeout-minutes"
                                  type="number"
                                  min="60"
                                  value={settings["yookassa_payment_timeout_minutes"] || "60"}
                                  onChange={(e) => updateSetting("yookassa_payment_timeout_minutes", e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Для карты, СБП и ЮMoney у YooKassa базовый срок оплаты обычно ограничен одним часом, поэтому ниже 60 минут ставить не стоит.
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div className="flex items-center gap-2 rounded-none border p-3">
                                <Checkbox
                                  id="yookassa-test-mode"
                                  checked={isSettingEnabled("yookassa_test_mode", true)}
                                  onCheckedChange={(checked) => updateSetting("yookassa_test_mode", checked ? "true" : "false")}
                                />
                                <Label htmlFor="yookassa-test-mode">Тестовый магазин / тестовые ключи</Label>
                              </div>
                              <div className="flex items-center gap-2 rounded-none border p-3">
                                <Checkbox
                                  id="yookassa-allow-bank-cards"
                                  checked={isSettingEnabled("yookassa_allow_bank_cards", true)}
                                  onCheckedChange={(checked) => updateSetting("yookassa_allow_bank_cards", checked ? "true" : "false")}
                                />
                                <Label htmlFor="yookassa-allow-bank-cards">Разрешить банковские карты</Label>
                              </div>
                              <div className="flex items-center gap-2 rounded-none border p-3">
                                <Checkbox
                                  id="yookassa-allow-sbp"
                                  checked={isSettingEnabled("yookassa_allow_sbp", true)}
                                  onCheckedChange={(checked) => updateSetting("yookassa_allow_sbp", checked ? "true" : "false")}
                                />
                                <Label htmlFor="yookassa-allow-sbp">Разрешить СБП</Label>
                              </div>
                              <div className="flex items-center gap-2 rounded-none border p-3">
                                <Checkbox
                                  id="yookassa-allow-yoomoney"
                                  checked={isSettingEnabled("yookassa_allow_yoomoney", true)}
                                  onCheckedChange={(checked) => updateSetting("yookassa_allow_yoomoney", checked ? "true" : "false")}
                                />
                                <Label htmlFor="yookassa-allow-yoomoney">Разрешить ЮMoney внутри YooKassa</Label>
                              </div>
                            </div>

                            <div className="space-y-3 rounded-none border border-black/10 bg-slate-50 p-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold">Проверка интеграции</div>
                                <p className="text-xs text-muted-foreground">
                                  В тестовом магазине YooKassa мы создаем реальный тестовый платеж. В боевом режиме выполняется безопасная проверка API-доступа без создания нового платежа.
                                </p>
                              </div>
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-[120px_minmax(0,1fr)_auto]">
                                <div className="space-y-1">
                                  <Label htmlFor="yookassa-test-amount">Сумма, ₽</Label>
                                  <Input
                                    id="yookassa-test-amount"
                                    value={yookassaTestAmount}
                                    onChange={(e) => setYookassaTestAmount(e.target.value)}
                                    inputMode="decimal"
                                    placeholder="100"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="yookassa-test-method">Способ оплаты</Label>
                                  <Select value={yookassaTestMethod} onValueChange={setYookassaTestMethod}>
                                    <SelectTrigger id="yookassa-test-method" className="h-9 rounded-none">
                                      <SelectValue placeholder="Выберите способ оплаты" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {yookassaTestMethodOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-end">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-9 w-full rounded-none px-4 md:w-auto"
                                    onClick={runYooKassaIntegrationTest}
                                    disabled={yookassaTestRunning || !isSettingEnabled("payments_yookassa_enabled") || yookassaTestMethodOptions.length === 0}
                                  >
                                    {yookassaTestRunning ? "Проверяем..." : "Проверить интеграцию"}
                                  </Button>
                                </div>
                              </div>

                              {yookassaTestError && (
                                <div className="rounded-none border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                  {yookassaTestError}
                                </div>
                              )}

                              {yookassaTestResult && (
                                <div className="space-y-3 rounded-none border border-black/10 bg-white p-3 text-sm">
                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Проверено</div>
                                      <div className="font-medium">{yookassaTestResult.checkedAtLabel}</div>
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Режим</div>
                                      <div className="font-medium">
                                        {yookassaTestResult.testMode ? "Тестовый магазин" : "Боевой магазин"}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Способ оплаты</div>
                                      <div className="font-medium">
                                        {(yookassaTestResult.paymentMethod && YOO_KASSA_PAYMENT_METHOD_LABELS[yookassaTestResult.paymentMethod as keyof typeof YOO_KASSA_PAYMENT_METHOD_LABELS])
                                          || yookassaTestResult.paymentMethod
                                          || "—"}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Статус</div>
                                      <div className="font-medium">{yookassaTestResult.status || "—"}</div>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div className="space-y-2 rounded-none border border-black/10 bg-slate-50 p-3">
                                      <div className="text-sm font-semibold">Результат проверки</div>
                                      <div>Сумма: {formatOptionalRubles(yookassaTestResult.amount)}</div>
                                      <div>Тип платежа: {yookassaTestResult.paymentType || "—"}</div>
                                      <div>Payment ID: <span className="break-all">{yookassaTestResult.paymentId || "—"}</span></div>
                                      <div>Создан: {yookassaTestResult.createdAt ? formatOrderDateTime(yookassaTestResult.createdAt) : "—"}</div>
                                    </div>
                                    <div className="space-y-2 rounded-none border border-black/10 bg-slate-50 p-3">
                                      <div className="text-sm font-semibold">Что получилось</div>
                                      <div>{yookassaTestResult.detail || "—"}</div>
                                      {yookassaTestResult.confirmationUrl && (
                                        <a
                                          href={yookassaTestResult.confirmationUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex text-sm font-medium underline underline-offset-4"
                                        >
                                          Открыть страницу тестовой оплаты
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div className="space-y-2 rounded-none border border-black/10 bg-slate-50 p-3">
                                <div className="text-sm font-semibold">Что заполнить</div>
                                <ol className="space-y-1 text-xs text-muted-foreground">
                                  <li>1. Вставьте `Shop ID` и `Secret Key` из кабинета YooKassa.</li>
                                  <li>2. Оставьте включенным тестовый режим, пока проверяете тестовый магазин.</li>
                                  <li>3. При необходимости настройте префикс метки и окно ожидания оплаты.</li>
                                  <li>4. Включите нужные способы оплаты: карта, СБП и/или ЮMoney.</li>
                                  <li>5. Настройте HTTP-уведомления на URL ниже и подпишитесь на нужные события.</li>
                                </ol>
                              </div>
                              <div className="space-y-2 rounded-none border border-black/10 bg-slate-50 p-3">
                                <div className="text-sm font-semibold">Как это работает</div>
                                <ol className="space-y-1 text-xs text-muted-foreground">
                                  <li>1. При оформлении заказа backend создает платеж YooKassa, а заказ получает статус `pending_payment`.</li>
                                  <li>2. Покупатель переходит на защищенную страницу YooKassa и завершает оплату там.</li>
                                  <li>3. YooKassa присылает webhook о результате платежа, а backend обновляет статус заказа.</li>
                                  <li>4. Если нужно, статус оплаты можно перепроверить вручную из профиля или админки.</li>
                                </ol>
                              </div>
                            </div>

                            <div className="space-y-3 rounded-none border border-black/10 bg-slate-50 p-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold">Webhook и тестовый контур</div>
                                <p className="text-xs text-muted-foreground">
                                  Укажите этот URL в кабинете YooKassa в разделе HTTP-уведомлений и подпишитесь как минимум на события `payment.succeeded` и `payment.canceled`.
                                </p>
                              </div>
                              <div className="flex flex-col gap-2 md:flex-row">
                                <Input value={yookassaNotificationUrl} readOnly className="font-mono text-xs" />
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full rounded-none md:w-auto"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(yookassaNotificationUrl);
                                      toast.success("URL уведомлений YooKassa скопирован");
                                    } catch {
                                      toast.error("Не удалось скопировать URL уведомлений YooKassa");
                                    }
                                  }}
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  Скопировать
                                </Button>
                              </div>
                              <div className="space-y-1 text-xs text-muted-foreground">
                              </div>
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="dadata" className="mt-3">
                          <div className="min-w-0 space-y-1 overflow-hidden border p-3">
                            <Label htmlFor="dadata-api-key">DaData API Key</Label>
                            <Input id="dadata-api-key" type="password" value={settings["dadata_api_key"] || ""} onChange={(e) => updateSetting("dadata_api_key", e.target.value)} />
                          </div>
                        </TabsContent>

                        <TabsContent value="yandex" className="mt-3">
                          <div className="min-w-0 space-y-3 overflow-hidden border p-3">
                            <div className="flex flex-wrap items-start justify-start gap-x-6 gap-y-2 xl:justify-end">
                              <div className="flex items-start gap-2">
                                <Checkbox
                                  id="yandex-delivery-enabled"
                                  checked={isYandexDeliveryEnabled}
                                  onCheckedChange={(checked) => updateSetting("yandex_delivery_enabled", checked ? "true" : "false")}
                                />
                                <Label htmlFor="yandex-delivery-enabled" className="leading-snug">Включить Яндекс.Доставку</Label>
                              </div>
                              <div className="flex items-start gap-2">
                                <Checkbox
                                  id="yandex-delivery-test-environment"
                                  checked={isSettingEnabled("yandex_delivery_use_test_environment")}
                                  onCheckedChange={(checked) => updateSetting("yandex_delivery_use_test_environment", checked ? "true" : "false")}
                                />
                                <Label htmlFor="yandex-delivery-test-environment" className="leading-snug">Использовать тестовый контур Яндекс.Доставки</Label>
                              </div>
                            </div>

                            {renderYandexDeliveryIntegrationStatus()}

                            {yandexDeliveryConfigurationIssues.length > 0 && (
                              <div className="space-y-2 rounded-none border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                <div className="font-semibold">Яндекс.Доставка настроена не до конца</div>
                                <p>
                                  Пока эти пункты не исправлены, расчет и синхронизация доставки в боевом контуре могут работать нестабильно.
                                </p>
                                <ul className="list-disc space-y-1 pl-5">
                                  {yandexDeliveryConfigurationIssues.map((issue) => (
                                    <li key={issue}>{issue}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <div className="space-y-3 rounded-none border border-black/10 bg-slate-50 p-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold">Проверка интеграции</div>
                                <p className="text-xs text-muted-foreground">
                                  Проверка использует текущие значения из формы, даже если вы еще не нажали «Сохранить настройки».
                                </p>
                              </div>
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_120px_180px_auto]">
                                <div className="space-y-1">
                                  <Label htmlFor="yandex-delivery-test-address">Тестовый адрес</Label>
                                  <AddressAutocompleteInput
                                    id="yandex-delivery-test-address"
                                    value={yandexDeliveryTestAddress}
                                    name="yandex_delivery_test_address"
                                    onValueChange={setYandexDeliveryTestAddress}
                                    placeholder="Например: 630099, Новосибирск, Красный проспект, 25"
                                    inputClassName="rounded-none"
                                    suggestionsClassName="rounded-none"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="yandex-delivery-test-weight">Вес, кг</Label>
                                  <Input
                                    id="yandex-delivery-test-weight"
                                    value={yandexDeliveryTestWeightKg}
                                    onChange={(e) => setYandexDeliveryTestWeightKg(e.target.value)}
                                    inputMode="decimal"
                                    placeholder="0.300"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="yandex-delivery-test-declared-cost">Объявленная стоимость, ₽</Label>
                                  <Input
                                    id="yandex-delivery-test-declared-cost"
                                    value={yandexDeliveryTestDeclaredCost}
                                    onChange={(e) => setYandexDeliveryTestDeclaredCost(e.target.value)}
                                    inputMode="decimal"
                                    placeholder="1000"
                                  />
                                </div>
                                <div className="flex items-end">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-9 rounded-none px-4"
                                    onClick={runYandexDeliveryIntegrationTest}
                                    disabled={yandexDeliveryTestRunning || !isYandexDeliveryEnabled}
                                  >
                                    {yandexDeliveryTestRunning ? "Проверяем..." : "Проверить интеграцию"}
                                  </Button>
                                </div>
                              </div>

                              {yandexDeliveryTestError && (
                                <div className="rounded-none border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                  {yandexDeliveryTestError}
                                </div>
                              )}

                              {yandexDeliveryTestResult && (
                                <div className="space-y-3 rounded-none border border-black/10 bg-white p-3 text-sm">
                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Проверено</div>
                                      <div className="font-medium">{yandexDeliveryTestResult.checkedAtLabel}</div>
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Режим</div>
                                      <div className="font-medium">
                                        {yandexDeliveryTestResult.details?.testEnvironment ? "Тестовый контур" : "Боевой контур"}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-muted-foreground">SourceStationId</div>
                                      <div className="break-all font-medium">{yandexDeliveryTestResult.details?.sourceStationId || "—"}</div>
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Адрес назначения</div>
                                      <div className="font-medium">{yandexDeliveryTestResult.toAddress || "—"}</div>
                                    </div>
                                  </div>

                                  <div className="rounded-none border border-black/10 bg-slate-50 p-3 text-sm">
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Что проверялось</div>
                                    <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
                                      <span>Адрес: {yandexDeliveryTestResult.toAddress || "—"}</span>
                                      <span>Вес: {Number(yandexDeliveryTestResult.details?.requestedWeightKg ?? 0).toFixed(3)} кг</span>
                                      <span>Объявленная стоимость: {formatOptionalRubles(yandexDeliveryTestResult.details?.declaredCost)}</span>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div className="space-y-2 rounded-none border border-black/10 bg-slate-50 p-3">
                                      <div className="text-sm font-semibold">До двери</div>
                                      <div className={yandexDeliveryTestResult.homeDelivery?.available ? "text-xs text-muted-foreground" : "text-xs font-medium text-amber-700"}>
                                        Статус: {yandexDeliveryTestResult.homeDelivery?.available ? "тариф найден" : yandexDeliveryTestResult.homeDelivery?.error ? "тариф не найден" : "ожидает расчета"}
                                      </div>
                                      <div>Стоимость: {formatOptionalRubles(yandexDeliveryTestResult.homeDelivery?.estimatedCost)}</div>
                                      <div>Срок: {formatDeliveryDaysLabel(yandexDeliveryTestResult.homeDelivery?.deliveryDays)}</div>
                                      {yandexDeliveryTestResult.homeDelivery?.available && yandexDeliveryTestResult.homeDelivery?.tariff && (
                                        <div>Тариф: {yandexDeliveryTestResult.homeDelivery.tariff}</div>
                                      )}
                                      {yandexDeliveryTestResult.homeDelivery?.error && (
                                        <div className="text-red-600">Причина: {yandexDeliveryTestResult.homeDelivery.error}</div>
                                      )}
                                    </div>

                                    <div className="space-y-2 rounded-none border border-black/10 bg-slate-50 p-3">
                                      <div className="text-sm font-semibold">ПВЗ</div>
                                      {Array.isArray(yandexDeliveryTestResult.pickupPoints) && yandexDeliveryTestResult.pickupPoints.length > 0 ? (
                                        <>
                                          <div className={yandexDeliveryTestResult.pickupPointDelivery?.available ? "text-xs text-muted-foreground" : "text-xs font-medium text-amber-700"}>
                                            Статус: {yandexDeliveryTestResult.pickupPointDelivery?.available ? "тариф найден" : yandexDeliveryTestResult.pickupPointDelivery?.error ? "тариф не найден" : "ожидает расчета"}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            Найдено пунктов: {yandexDeliveryTestResult.pickupPoints.length}
                                          </div>
                                          <div className="font-medium">
                                            {yandexDeliveryTestResult.pickupPointDelivery?.point?.name || yandexDeliveryTestResult.pickupPoints[0]?.name || "Ближайший пункт выдачи"}
                                          </div>
                                          <div>{yandexDeliveryTestResult.pickupPointDelivery?.point?.address || yandexDeliveryTestResult.pickupPoints[0]?.address || "—"}</div>
                                          <div>Стоимость: {formatOptionalRubles(yandexDeliveryTestResult.pickupPointDelivery?.estimatedCost)}</div>
                                          <div>Срок: {formatDeliveryDaysLabel(yandexDeliveryTestResult.pickupPointDelivery?.deliveryDays)}</div>
                                          {yandexDeliveryTestResult.pickupPointDelivery?.available && yandexDeliveryTestResult.pickupPointDelivery?.tariff && (
                                            <div>Тариф: {yandexDeliveryTestResult.pickupPointDelivery.tariff}</div>
                                          )}
                                          {Number.isFinite(Number(yandexDeliveryTestResult.pickupPointDelivery?.point?.distanceKm ?? yandexDeliveryTestResult.pickupPoints[0]?.distanceKm)) && (
                                            <div>Расстояние: {Number(yandexDeliveryTestResult.pickupPointDelivery?.point?.distanceKm ?? yandexDeliveryTestResult.pickupPoints[0]?.distanceKm).toFixed(1)} км</div>
                                          )}
                                          {yandexDeliveryTestResult.pickupPointDelivery?.error && (
                                            <div className="text-red-600">Причина: {yandexDeliveryTestResult.pickupPointDelivery.error}</div>
                                          )}
                                        </>
                                      ) : (
                                        <div className="text-muted-foreground">Подходящие пункты выдачи не найдены.</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="space-y-3 border border-black/10 bg-slate-50 p-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold">Поиск platform_station_id через API</div>
                                <p className="text-xs text-muted-foreground">
                                  Для собственного склада боевой `Source platform_station_id` Яндекс обычно выдает через менеджера. Но этим поиском удобно получать список ПВЗ, терминалов и складов Яндекса, смотреть их ID и использовать их для диагностики или как ориентир при настройке.
                                </p>
                              </div>

                              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.2fr)_220px_120px_auto]">
                                <div className="space-y-1">
                                  <Label htmlFor="yandex-delivery-point-search-query">Адрес или населенный пункт</Label>
                                  <AddressAutocompleteInput
                                    id="yandex-delivery-point-search-query"
                                    value={yandexDeliveryPointSearchQuery}
                                    name="yandex_delivery_point_search_query"
                                    onValueChange={setYandexDeliveryPointSearchQuery}
                                    placeholder="Например: Новосибирск, Красный проспект, 25"
                                    inputClassName="h-11 rounded-none"
                                    suggestionsClassName="rounded-none"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <Label htmlFor="yandex-delivery-point-search-type">Что искать</Label>
                                  <Select value={yandexDeliveryPointSearchType} onValueChange={setYandexDeliveryPointSearchType}>
                                    <SelectTrigger id="yandex-delivery-point-search-type" className="h-11 rounded-none">
                                      <SelectValue placeholder="Выберите тип точки" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="warehouse">Склад / самопривоз</SelectItem>
                                      <SelectItem value="pickup_point">ПВЗ</SelectItem>
                                      <SelectItem value="terminal">Терминал</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <Label htmlFor="yandex-delivery-point-search-limit">Лимит</Label>
                                  <Input
                                    id="yandex-delivery-point-search-limit"
                                    value={yandexDeliveryPointSearchLimit}
                                    onChange={(e) => setYandexDeliveryPointSearchLimit(e.target.value)}
                                    inputMode="numeric"
                                    placeholder="10"
                                    className="h-11 rounded-none"
                                  />
                                </div>

                                <div className="flex items-end">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-11 w-full rounded-none px-4 md:w-auto"
                                    onClick={runYandexDeliveryPointSearch}
                                    disabled={yandexDeliveryPointSearchRunning}
                                  >
                                    {yandexDeliveryPointSearchRunning ? "Ищем..." : "Найти точки"}
                                  </Button>
                                </div>
                              </div>

                              <div className="rounded-none border border-black/10 bg-white p-3 text-xs leading-5 text-muted-foreground">
                                <div>Режим поиска: {isSettingEnabled("yandex_delivery_use_test_environment") ? "тестовый контур" : "боевой контур"}</div>
                                <div>Подсказка: для поиска кандидатов на source station чаще всего нужен тип «Склад / самопривоз», а для списка клиентских точек выдачи — «ПВЗ».</div>
                              </div>

                              {yandexDeliveryPointSearchError && (
                                <div className="rounded-none border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                  {yandexDeliveryPointSearchError}
                                </div>
                              )}

                              {yandexDeliveryPointSearchResults.length > 0 && (
                                <div className="space-y-3">
                                  {yandexDeliveryPointSearchResults.map((point, index) => (
                                    <div
                                      key={`${point.id || "point"}-${index}`}
                                      className="rounded-none border border-black/10 bg-white p-3"
                                    >
                                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                        <div className="min-w-0 space-y-1">
                                          <div className="break-words font-medium">{point.name || "Точка Яндекс.Доставки"}</div>
                                          <div className="text-xs text-muted-foreground">
                                            {formatYandexPointTypeLabel(point.pointType)}
                                            {point.availableForDropoff === true ? " · принимает самопривоз" : ""}
                                            {point.availableForC2cDropoff === true ? " · доступен c2c dropoff" : ""}
                                          </div>
                                          <div className="break-words text-sm">{point.address || "—"}</div>
                                          {point.instruction && (
                                            <div className="text-xs text-muted-foreground">
                                              {point.instruction}
                                            </div>
                                          )}
                                          <div className="break-all text-xs">
                                            <span className="text-muted-foreground">platform_station_id:</span>{" "}
                                            <span className="font-mono">{point.id || "—"}</span>
                                          </div>
                                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                            {Number.isFinite(Number(point.distanceKm)) && (
                                              <span>Расстояние: {Number(point.distanceKm).toFixed(1)} км</span>
                                            )}
                                            {Array.isArray(point.paymentMethods) && point.paymentMethods.length > 0 && (
                                              <span>Оплата: {point.paymentMethods.join(", ")}</span>
                                            )}
                                          </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 xl:justify-end">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full rounded-none sm:w-auto"
                                            disabled={!point.id}
                                            onClick={async () => {
                                              if (!point.id) return;
                                              try {
                                                await navigator.clipboard.writeText(point.id);
                                                toast.success("platform_station_id скопирован");
                                              } catch {
                                                toast.error("Не удалось скопировать platform_station_id");
                                              }
                                            }}
                                          >
                                            <Copy className="mr-2 h-4 w-4" />
                                            Скопировать ID
                                          </Button>
                                          <Button
                                            type="button"
                                            className="w-full rounded-none sm:w-auto"
                                            disabled={!point.id}
                                            onClick={() => applyYandexSourceStationId(point.id || "", point.name)}
                                          >
                                            Подставить в Source ID
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="space-y-3 border border-black/10 bg-slate-50 p-3">
                              <div className="space-y-1">
                                <div className="text-sm font-semibold">Быстрый выбор SourceStationId</div>
                                <p className="text-xs text-muted-foreground">
                                  Для сортировочного центра можно выбрать готовый ID из справочника Яндекса и сохранить его в настройках.
                                  Для собственного склада station id обычно выдает поддержка Яндекса, поэтому такой ID нужно вставить вручную.
                                </p>
                              </div>
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                                <div className="space-y-1">
                                  <Label htmlFor="yandex-delivery-source-station-preset">Пресет источника отправки</Label>
                                  <Select value={selectedYandexSourcePresetValue} onValueChange={applyYandexSourceStationPreset}>
                                    <SelectTrigger id="yandex-delivery-source-station-preset" className="h-11 rounded-none">
                                      <SelectValue placeholder="Выберите источник отправки" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="manual">Свой склад или ручной ввод</SelectItem>
                                      {YANDEX_SOURCE_STATION_PRESETS.map((preset) => (
                                        <SelectItem key={preset.id} value={preset.id}>
                                          {preset.label} - {preset.address}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-end">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-11 w-full rounded-none px-4 md:w-auto"
                                    onClick={() => updateSetting("yandex_delivery_source_station_id", "")}
                                  >
                                    Очистить ID
                                  </Button>
                                </div>
                              </div>
                              <div className="rounded-none border border-black/10 bg-white p-3 text-xs text-muted-foreground">
                                <div>
                                  Текущий режим: {isSettingEnabled("yandex_delivery_use_test_environment") ? "тестовый контур" : "боевой контур"}
                                </div>
                                <div>
                                  Текущий SourceStationId: {yandexSourceStationId || "не указан"}
                                </div>
                                {selectedYandexSourcePreset && (
                                  <div>
                                    Выбранный источник: {selectedYandexSourcePreset.label}, {selectedYandexSourcePreset.address}
                                  </div>
                                )}
                                <div className="pt-1">
                                  Значение запоминается как обычная настройка и будет использоваться во всех расчетах доставки после сохранения.
                                </div>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="yandex-delivery-api-token">API token</Label>
                              <Input
                                id="yandex-delivery-api-token"
                                type="password"
                                value={settings["yandex_delivery_api_token"] || ""}
                                onChange={(e) => updateSetting("yandex_delivery_api_token", e.target.value)}
                              />
                              <p className="text-xs text-muted-foreground">
                                Для боевого режима укажите Bearer-токен из кабинета Яндекс.Доставки. В тестовом режиме поле можно оставить пустым и использовать тестовый токен из документации.
                              </p>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="yandex-delivery-source-station-id">Source platform_station_id</Label>
                              <Input
                                id="yandex-delivery-source-station-id"
                                value={settings["yandex_delivery_source_station_id"] || ""}
                                onChange={(e) => updateSetting("yandex_delivery_source_station_id", e.target.value)}
                              />
                              <p className="text-xs text-muted-foreground">
                                Идентификатор склада отправки, который используется как точка А при расчете доставки.
                              </p>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                              <div className="space-y-1">
                                <Label htmlFor="yandex-delivery-package-length">Длина упаковки (см)</Label>
                                <Input
                                  id="yandex-delivery-package-length"
                                  value={settings["yandex_delivery_package_length_cm"] || "30"}
                                  onChange={(e) => updateSetting("yandex_delivery_package_length_cm", e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="yandex-delivery-package-height">Высота упаковки (см)</Label>
                                <Input
                                  id="yandex-delivery-package-height"
                                  value={settings["yandex_delivery_package_height_cm"] || "20"}
                                  onChange={(e) => updateSetting("yandex_delivery_package_height_cm", e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="yandex-delivery-package-width">Ширина упаковки (см)</Label>
                                <Input
                                  id="yandex-delivery-package-width"
                                  value={settings["yandex_delivery_package_width_cm"] || "10"}
                                  onChange={(e) => updateSetting("yandex_delivery_package_width_cm", e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                        </TabsContent>
                        <TabsContent value="robokassa" className="mt-3">
                          <AdminRoboKassaIntegrationTab settings={settings} updateSetting={updateSetting} />
                        </TabsContent>
                        <TabsContent value="cdek" className="mt-3">
                          <AdminCdekIntegrationTab settings={settings} updateSetting={updateSetting} />
                        </TabsContent>
                        <TabsContent value="russian-post" className="mt-3">
                          <AdminRussianPostIntegrationTab settings={settings} updateSetting={updateSetting} />
                        </TabsContent>
                        <TabsContent value="avito" className="mt-3">
                          <AdminAvitoIntegrationTab settings={settings} updateSetting={updateSetting} />
                        </TabsContent>
                      </Tabs>
                    </div>
                  )}

                  {selectedSettingsGroup === "legal" && (
                    <div className="space-y-4 border p-3">
                      <h3 className="font-semibold">Юридические тексты</h3>
                      <p className="text-sm leading-6 text-muted-foreground">
                        На телефоне удобнее редактировать каждый документ в отдельном блоке с увеличенной высотой поля.
                      </p>
                      <p className="text-sm leading-6 text-muted-foreground">
                        При пустых значениях подставляются шаблонные тексты. Перед публикацией обязательно проверьте и замените реквизиты продавца, адрес и контакты.
                      </p>
                      {[
                        ["privacy_policy", "Политика конфиденциальности"],
                        ["user_agreement", "Пользовательское соглашение"],
                        ["public_offer", "Публичная оферта"],
                        ["return_policy", "Условия возврата"],
                        ["cookie_consent_text", "Текст cookie-согласия"]
                      ].map(([key, label]) => (
                        <div key={key} className="space-y-2 rounded-none border border-gray-200 p-3">
                          <Label htmlFor={`legal-setting-${key}`} className="block leading-snug">{label}</Label>
                          <Textarea
                            id={`legal-setting-${key}`}
                            name={String(key)}
                            aria-label={String(label)}
                            value={settings[key] || ""}
                            onChange={(e) => updateSetting(key, e.target.value)}
                            rows={10}
                            className="min-h-[220px] resize-y text-sm leading-6"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedSettingsGroup === "backup" && (
                    <div className="space-y-4 border p-3">
                      <h3 className="font-semibold">Резервное копирование</h3>
                      <p className="text-sm text-muted-foreground">
                        Автоматические копии сохраняются на сервере по локальному времени машины, где запущен backend. Здесь можно настроить расписание, создать копию вручную и сразу скачать готовый файл.
                      </p>
                      <div className="space-y-4 rounded-none border border-gray-200 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1">
                            <h4 className="text-sm font-semibold uppercase tracking-[0.12em]">Резервные копии БД</h4>
                            <p className="text-sm text-muted-foreground">
                              Поддерживаются и Linux, и Windows. Если `pg_dump` не найден автоматически, укажите полный путь к нему через `DatabaseBackup__PgDumpPath`.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-none"
                              onClick={() => {
                                void refreshDatabaseBackups();
                              }}
                              disabled={databaseBackupsLoading || databaseBackupCreating}
                            >
                              <RefreshCcw className={`mr-2 h-4 w-4 ${databaseBackupsLoading ? "animate-spin" : ""}`} />
                              {databaseBackupsLoading ? "Обновление..." : "Обновить список"}
                            </Button>
                            <Button
                              type="button"
                              className="rounded-none"
                              onClick={() => {
                                void createAndDownloadDatabaseBackup();
                              }}
                              disabled={databaseBackupCreating}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              {databaseBackupCreating ? "Создание..." : "Создать и скачать"}
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-3">
                          <div className="rounded-none border border-gray-200 p-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <Label htmlFor="database-backup-enabled" className="text-sm font-semibold uppercase tracking-[0.12em]">Автобэкапы</Label>
                                <p className="text-xs leading-5 text-muted-foreground">
                                  Если включено, сервис будет создавать новые копии по расписанию и чистить старые `.dump` файлы.
                                </p>
                              </div>
                              <Checkbox
                                id="database-backup-enabled"
                                aria-label="Включить автобэкапы базы данных"
                                checked={isSettingEnabled("database_backup_enabled", true)}
                                onCheckedChange={(checked) => updateSetting("database_backup_enabled", checked ? "true" : "false")}
                              />
                            </div>
                          </div>

                          <div className="space-y-1 rounded-none border border-gray-200 p-3">
                            <Label htmlFor="database-backup-schedule">Расписание</Label>
                            <Input
                              id="database-backup-schedule"
                              value={settings["database_backup_schedule_local"] || DEFAULT_APP_SETTINGS.database_backup_schedule_local}
                              onChange={(e) => updateSetting("database_backup_schedule_local", e.target.value)}
                              placeholder="03:00,15:00"
                            />
                            <p className="text-xs text-muted-foreground">
                              Формат: `HH:mm,HH:mm`. По умолчанию выполняются две проверки в сутки: в 03:00 и 15:00.
                            </p>
                          </div>

                          <div className="space-y-1 rounded-none border border-gray-200 p-3">
                            <Label htmlFor="database-backup-retention">Хранить дней</Label>
                            <Input
                              id="database-backup-retention"
                              type="number"
                              min={1}
                              max={365}
                              value={settings["database_backup_retention_days"] || DEFAULT_APP_SETTINGS.database_backup_retention_days}
                              onChange={(e) => updateSetting("database_backup_retention_days", e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                              Старые резервные копии удаляются автоматически при очередной проверке расписания.
                            </p>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          После изменения включения, расписания или срока хранения нажмите общую кнопку сохранения настроек внизу страницы. Ручное создание и скачивание работает сразу, без отдельного сохранения.
                        </p>

                        <div className="grid gap-3 lg:grid-cols-3">
                          <div className="space-y-1 rounded-none border border-dashed border-gray-300 p-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Папка на сервере</div>
                            <div className="break-all text-sm">{databaseBackupsOverview?.rootDirectory || "-"}</div>
                          </div>
                          <div className="space-y-1 rounded-none border border-dashed border-gray-300 p-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Часовой пояс сервера</div>
                            <div className="text-sm">{databaseBackupsOverview?.timeZone || "-"}</div>
                          </div>
                          <div className="space-y-1 rounded-none border border-dashed border-gray-300 p-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Команда pg_dump</div>
                            <div className="break-all text-sm">{databaseBackupsOverview?.pgDumpCommand || "pg_dump"}</div>
                          </div>
                        </div>

                        <div className="space-y-3 rounded-none border border-gray-200 p-3">
                          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="text-sm font-semibold">Последние резервные копии</div>
                              <p className="text-xs text-muted-foreground">
                                Показываем до 100 последних `.dump` файлов из директории резервного копирования.
                              </p>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Всего в списке: {databaseBackupsOverview?.items?.length || 0}
                            </div>
                          </div>

                          {databaseBackupsOverview?.items?.length ? (
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Файл</TableHead>
                                    <TableHead>Создан</TableHead>
                                    <TableHead>Размер</TableHead>
                                    <TableHead>Источник</TableHead>
                                    <TableHead className="text-right">Действие</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {databaseBackupsOverview.items.map((item) => (
                                    <TableRow key={item.relativePath}>
                                      <TableCell>
                                        <div className="font-medium">{item.fileName}</div>
                                        <div className="text-xs text-muted-foreground">{item.relativePath}</div>
                                      </TableCell>
                                      <TableCell>{formatOrderDateTime(item.createdAt)}</TableCell>
                                      <TableCell>{formatBytes(item.sizeBytes)}</TableCell>
                                      <TableCell>{item.trigger === "manual" ? "Вручную" : item.trigger === "auto" ? "Автоматически" : item.trigger}</TableCell>
                                      <TableCell className="text-right">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className="rounded-none"
                                          onClick={() => {
                                            void downloadDatabaseBackup(item.relativePath, item.fileName).catch((error) => {
                                              toast.error(getErrorMessage(error, "Не удалось скачать резервную копию"));
                                            });
                                          }}
                                        >
                                          <Download className="mr-2 h-4 w-4" />
                                          Скачать
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          ) : (
                            <div className="rounded-none border border-dashed border-gray-300 p-4 text-sm text-muted-foreground">
                              Резервных копий пока нет. Создайте первую копию вручную или дождитесь ближайшего времени из расписания.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedSettingsGroup === "general" && (
                    <div className="space-y-3 border p-3">
                      <h3 className="font-semibold">Общие настройки</h3>
                      <p className="text-sm text-muted-foreground">
                        Здесь собраны настройки бренда, карточек каталога и страницы товара. Можно быстро переключаться между
                        подкаталогами и не пролистывать весь раздел целиком.
                      </p>
                      <Tabs value={selectedGeneralSettingsCatalog} onValueChange={setSelectedGeneralSettingsCatalog} className="space-y-4">
                        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 md:grid-cols-6">
                          <TabsTrigger value="branding" className="h-11 rounded-none border border-black data-[state=active]:bg-black data-[state=active]:text-white">
                            Брендинг
                          </TabsTrigger>
                          <TabsTrigger value="catalog-card" className="h-11 rounded-none border border-black data-[state=active]:bg-black data-[state=active]:text-white">
                            Карточки каталога
                          </TabsTrigger>
                          <TabsTrigger value="catalog-page" className="h-11 rounded-none border border-black data-[state=active]:bg-black data-[state=active]:text-white">
                            Страница каталога
                          </TabsTrigger>
                          <TabsTrigger value="product-page" className="h-11 rounded-none border border-black data-[state=active]:bg-black data-[state=active]:text-white">
                            Страница товара
                          </TabsTrigger>
                          <TabsTrigger value="social-links" className="h-11 rounded-none border border-black data-[state=active]:bg-black data-[state=active]:text-white">
                            Соцсети
                          </TabsTrigger>
                          <TabsTrigger value="upload-media" className="h-11 rounded-none border border-black data-[state=active]:bg-black data-[state=active]:text-white">
                            Загрузка медиа
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="branding" className="mt-0 space-y-3">
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
                            id="site-favicon-upload"
                            name="site_favicon_upload"
                            aria-label="Загрузка favicon"
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
                      <div className="rounded-none border border-gray-200 p-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <Label htmlFor="site-loading-animation-enabled" className="text-sm font-semibold uppercase tracking-[0.12em]">Анимация загрузки сайта</Label>
                            <p className="text-xs leading-5 text-muted-foreground">
                              Легкий стартовый экран для переходов между страницами и первой загрузки сайта.
                            </p>
                          </div>
                          <Checkbox
                            id="site-loading-animation-enabled"
                            aria-label="Включить анимацию загрузки сайта"
                            checked={(settings.site_loading_animation_enabled || DEFAULT_APP_SETTINGS.site_loading_animation_enabled) !== "false"}
                            onCheckedChange={(checked) => updateSetting("site_loading_animation_enabled", checked ? "true" : "false")}
                          />
                        </div>
                      </div>
                        </TabsContent>
                        <TabsContent value="catalog-card" className="mt-0">
                      <div className="space-y-3 border border-gray-200 p-3">
                        <div className="space-y-1">
                          <Label htmlFor="product-card-background-mode">Фон карточек товара</Label>
                          <select
                            id="product-card-background-mode"
                            value={productCardBackgroundMode}
                            onChange={(e) => updateSetting("product_card_background_mode", e.target.value)}
                            className="h-11 w-full border border-black bg-white px-3"
                          >
                            <option value="standard">Стандартный студийный</option>
                            <option value="none">Без фона</option>
                            <option value="color">Свой цвет</option>
                            <option value="auto">Автоподбор по краям изображения</option>
                          </select>
                        </div>

                        <div className="grid gap-3 md:grid-cols-[96px_minmax(0,1fr)]">
                          <div className="space-y-1">
                            <Label htmlFor="product-card-background-color-picker">Цвет</Label>
                            <input
                              id="product-card-background-color-picker"
                              type="color"
                              value={productCardBackgroundColor}
                              onChange={(e) => updateSetting("product_card_background_color", e.target.value)}
                              className="h-11 w-full cursor-pointer border border-black bg-white p-1"
                              disabled={productCardBackgroundMode !== "color"}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="product-card-background-color">HEX цвета</Label>
                            <Input
                              id="product-card-background-color"
                              value={settings.product_card_background_color || ""}
                              onChange={(e) => updateSetting("product_card_background_color", e.target.value)}
                              placeholder="#e9e3da"
                              disabled={productCardBackgroundMode !== "color"}
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="product-card-image-fit-mode">Изображение в карточке</Label>
                          <select
                            id="product-card-image-fit-mode"
                            value={productCardImageFitMode}
                            onChange={(e) => updateSetting("product_card_image_fit_mode", e.target.value)}
                            className="h-11 w-full border border-black bg-white px-3"
                          >
                            <option value="contain">Вписать целиком</option>
                            <option value="contain-zoom">Вписать крупнее</option>
                            <option value="cover">Заполнить с обрезкой</option>
                            <option value="fill">Растянуть по карточке</option>
                          </select>
                        </div>

                          <div className="space-y-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Предпросмотр</span>
                          <div className="border border-black bg-white p-3">
                            <div className="mx-auto max-w-[190px] overflow-hidden border border-black/20 bg-white shadow-sm">
                              <div className="relative aspect-[25/24] overflow-hidden border-b border-black/10" style={productCardBackgroundPreviewStyle}>
                                <span className="absolute left-2 top-2 z-[2] border border-black/10 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-black">
                                  Новинка
                                </span>
                                <img
                                  src={PRODUCT_CARD_SETTINGS_PREVIEW_IMAGE}
                                  alt="Пример товара"
                                  className={`h-full w-full ${productCardPreviewImageDisplay.objectFitClassName} ${productCardPreviewImageDisplay.paddingClassName} ${productCardPreviewImageDisplay.scaleClassName}`.trim()}
                                />
                              </div>
                              <div className="space-y-2 bg-white px-3 py-3">
                                <div className="text-sm font-bold leading-tight">Пример карточки товара</div>
                                <div className="flex items-center justify-between gap-3 text-xs">
                                  <span className="text-base font-black text-black">6500₽</span>
                                  <span className="text-muted-foreground line-through">7800₽</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 text-xs leading-5 text-muted-foreground">
                          <p>
                            `Стандартный` использует нейтральный студийный фон. `Свой цвет` задает фон вручную. `Автоподбор` считывает оттенок с внешних краев изображения. Если у фото по краям белый фон, карточка тоже станет светлой.
                          </p>
                          <p>
                            `Вписать целиком` оставляет товар полностью в кадре. `Вписать крупнее` уменьшает пустые поля без сильной обрезки. `Заполнить с обрезкой` делает карточку плотнее. `Растянуть` заполняет всю площадь, но может исказить пропорции.
                          </p>
                        </div>
                      </div>
                        </TabsContent>
                        <TabsContent value="catalog-page" className="mt-0">
                      <div className="space-y-4 border border-gray-200 p-3">
                        <div className="space-y-1">
                          <h4 className="font-semibold">Верхний слайдер коллекций</h4>
                          <p className="text-sm text-muted-foreground">
                            Блок появится в самом верху каталога. Клик по карточке коллекции сразу откроет товары этой подборки.
                          </p>
                        </div>

                        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-none border border-gray-200 px-3 py-3">
                          <div className="space-y-1">
                            <span className="block text-sm font-medium">Показывать слайдер коллекций</span>
                            <span className="block text-xs text-muted-foreground">
                              Если выключить, каталог останется без верхней карусели, а фильтр по коллекциям продолжит работать.
                            </span>
                          </div>
                          <Checkbox
                            checked={(settings.catalog_collections_slider_enabled || DEFAULT_APP_SETTINGS.catalog_collections_slider_enabled) !== "false"}
                            onCheckedChange={(checked) => updateSetting("catalog_collections_slider_enabled", checked ? "true" : "false")}
                          />
                        </label>

                        <div className="grid gap-3 xl:grid-cols-2">
                          <div className="space-y-1">
                            <Label htmlFor="catalog-collections-slider-title">Заголовок блока</Label>
                            <Input
                              id="catalog-collections-slider-title"
                              value={settings.catalog_collections_slider_title || ""}
                              onChange={(e) => updateSetting("catalog_collections_slider_title", e.target.value)}
                              placeholder="Коллекции"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="catalog-collections-slider-description">Короткое описание</Label>
                            <Textarea
                              id="catalog-collections-slider-description"
                              value={settings.catalog_collections_slider_description || ""}
                              onChange={(e) => updateSetting("catalog_collections_slider_description", e.target.value)}
                              placeholder="Например: откройте подборку и сразу перейдите к товарам коллекции."
                              className="min-h-[96px] rounded-none"
                            />
                          </div>
                        </div>

                        <p className="text-xs leading-5 text-muted-foreground">
                          Изображения для карточек коллекций задаются в словаре `Коллекции`. Если у коллекции нет картинки, слайдер покажет карточку с фирменным градиентом.
                        </p>
                      </div>
                        </TabsContent>
                        <TabsContent value="product-page" className="mt-0">
                      <div className="space-y-3 border border-gray-200 p-3">
                        <div className="grid gap-3 xl:grid-cols-2">
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <Label htmlFor="product-detail-background-mode">Фон медиа на странице товара</Label>
                              <select
                                id="product-detail-background-mode"
                                value={productDetailBackgroundMode}
                                onChange={(e) => updateSetting("product_detail_background_mode", e.target.value)}
                                className="h-11 w-full border border-black bg-white px-3"
                              >
                                <option value="standard">Стандартный студийный</option>
                                <option value="none">Без фона</option>
                                <option value="color">Свой цвет</option>
                                <option value="auto">Автоподбор по краям изображения</option>
                              </select>
                            </div>

                            <div className="grid gap-3 md:grid-cols-[96px_minmax(0,1fr)]">
                              <div className="space-y-1">
                                <Label htmlFor="product-detail-background-color-picker">Цвет</Label>
                                <input
                                  id="product-detail-background-color-picker"
                                  type="color"
                                  value={productDetailBackgroundColor}
                                  onChange={(e) => updateSetting("product_detail_background_color", e.target.value)}
                                  className="h-11 w-full cursor-pointer border border-black bg-white p-1"
                                  disabled={productDetailBackgroundMode !== "color"}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="product-detail-background-color">HEX цвета</Label>
                                <Input
                                  id="product-detail-background-color"
                                  value={settings.product_detail_background_color || ""}
                                  onChange={(e) => updateSetting("product_detail_background_color", e.target.value)}
                                  placeholder="#e9e3da"
                                  disabled={productDetailBackgroundMode !== "color"}
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label htmlFor="product-detail-image-fit-mode">Изображение на странице товара</Label>
                              <select
                                id="product-detail-image-fit-mode"
                                value={productDetailImageFitMode}
                                onChange={(e) => updateSetting("product_detail_image_fit_mode", e.target.value)}
                                className="h-11 w-full border border-black bg-white px-3"
                              >
                                <option value="contain">Вписать целиком</option>
                                <option value="contain-zoom">Вписать крупнее</option>
                                <option value="cover">Заполнить с обрезкой</option>
                                <option value="fill">Растянуть по карточке</option>
                              </select>
                            </div>

                            <div className="space-y-1">
                          <Label htmlFor="product-detail-media-size-mode">Медиа на странице товара</Label>
                          <select
                            id="product-detail-media-size-mode"
                            value={productDetailMediaSizeMode}
                            onChange={(e) => updateSetting("product_detail_media_size_mode", e.target.value)}
                            className="h-11 w-full border border-black bg-white px-3"
                          >
                            <option value="compact">Компактный</option>
                            <option value="standard">Стандартный</option>
                            <option value="large">Крупный</option>
                          </select>
                        </div>

                          </div>

                          <div className="space-y-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Предпросмотр</span>
                          <div className="border border-black bg-white p-3">
                            <div className={`mx-auto flex max-w-[260px] flex-col gap-3 border border-black/20 bg-white p-3 shadow-sm ${productDetailMediaPreviewLayout.panelHeightClassName}`}>
                              <div
                                className={`relative min-h-0 flex-1 overflow-hidden border border-black/10 ${productDetailMediaPreviewLayout.framePaddingClassName}`}
                                style={productDetailBackgroundPreviewStyle}
                              >
                                <span className="absolute left-2 top-2 z-[2] border border-black/10 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-black">
                                  Новинка
                                </span>
                                <img
                                  src={PRODUCT_CARD_SETTINGS_PREVIEW_IMAGE}
                                  alt="Пример медиа товара"
                                  className={`h-full w-full ${productDetailPreviewImageDisplay.objectFitClassName} ${productDetailPreviewImageDisplay.scaleClassName} ${productDetailMediaPreviewLayout.mediaPaddingClassName}`.trim()}
                                />
                              </div>
                              <div className="flex gap-2">
                                {[0, 1, 2].map((index) => (
                                  <div
                                    key={index}
                                    className={`overflow-hidden border ${index === 0 ? "border-black" : "border-black/20 opacity-70"} ${productDetailMediaPreviewLayout.thumbnailClassName}`}
                                    style={productDetailBackgroundMode === "auto" ? buildProductCardBackgroundStyleFromColor("#ffffff") : productDetailBackgroundPreviewStyle}
                                  >
                                    <img
                                      src={PRODUCT_CARD_SETTINGS_PREVIEW_IMAGE}
                                      alt=""
                                      className={`h-full w-full ${productDetailPreviewImageDisplay.objectFitClassName} ${productDetailPreviewImageDisplay.thumbnailScaleClassName} ${productDetailImageFitMode === "fill" || productDetailImageFitMode === "cover" ? "" : "p-1.5"}`.trim()}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        </div>

                        <p className="text-xs leading-5 text-muted-foreground">
                          `Компактный` старается уместить главный кадр и миниатюры в экран без лишней прокрутки. `Стандартный` оставляет больше воздуха. `Крупный` делает акцент на изображении, если для вас фото важнее описания.
                        </p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          Здесь можно отдельно настроить фон и способ показа изображения на странице товара. Это удобно, если
                          карточки каталога должны быть одними, а в карточке товара нужен другой режим, например `Растянуть по
                          карточке` или свой фон.
                        </p>
                      </div>
                        </TabsContent>
                        <TabsContent value="social-links" className="mt-0">
                          <AdminSocialLinksSettings
                            value={settings.social_links_config_json || DEFAULT_APP_SETTINGS.social_links_config_json}
                            onChange={(nextValue) => updateSetting("social_links_config_json", nextValue)}
                          />
                        </TabsContent>
                        <TabsContent value="upload-media" className="mt-0">
                          <div className="space-y-4 border border-gray-200 p-3">
                            <div className="space-y-1">
                              <h4 className="font-semibold">Оптимизация изображений перед загрузкой</h4>
                              <p className="text-sm text-muted-foreground">
                                Эти настройки применяются на клиенте до отправки файла на сервер. Видео не пережимаются, а GIF, SVG и ICO остаются без изменений.
                              </p>
                            </div>

                            <div className="grid gap-3 xl:grid-cols-2">
                              {IMAGE_UPLOAD_CONTEXTS.map((context) => {
                                const uploadOptions = getImageUploadSettings(settings, context.key);
                                const enabledKey = getImageUploadSettingKey(context.key, "enabled");
                                const widthKey = getImageUploadSettingKey(context.key, "max_width");
                                const heightKey = getImageUploadSettingKey(context.key, "max_height");
                                const qualityKey = getImageUploadSettingKey(context.key, "quality");
                                const enabledId = `${context.key}-upload-enabled`;

                                return (
                                  <div key={context.key} className="space-y-3 border border-gray-200 p-3">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                      <div className="space-y-1">
                                        <div className="font-semibold">{context.label}</div>
                                        <p className="text-sm text-muted-foreground">{context.description}</p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Checkbox
                                          id={enabledId}
                                          checked={uploadOptions.enabled}
                                          onCheckedChange={(checked) => updateSetting(enabledKey, checked ? "true" : "false")}
                                        />
                                        <Label htmlFor={enabledId}>Оптимизировать</Label>
                                      </div>
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-3">
                                      <div className="space-y-1">
                                        <Label htmlFor={`${context.key}-max-width`}>Макс. ширина</Label>
                                        <Input
                                          id={`${context.key}-max-width`}
                                          type="number"
                                          min={320}
                                          max={6000}
                                          value={settings[widthKey] || ""}
                                          onChange={(e) => updateSetting(widthKey, e.target.value)}
                                          className="rounded-none"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <Label htmlFor={`${context.key}-max-height`}>Макс. высота</Label>
                                        <Input
                                          id={`${context.key}-max-height`}
                                          type="number"
                                          min={320}
                                          max={6000}
                                          value={settings[heightKey] || ""}
                                          onChange={(e) => updateSetting(heightKey, e.target.value)}
                                          className="rounded-none"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <Label htmlFor={`${context.key}-quality`}>Качество JPEG/WebP</Label>
                                        <Input
                                          id={`${context.key}-quality`}
                                          type="number"
                                          min={60}
                                          max={100}
                                          value={settings[qualityKey] || ""}
                                          onChange={(e) => updateSetting(qualityKey, e.target.value)}
                                          className="rounded-none"
                                        />
                                      </div>
                                    </div>

                                    <p className="text-xs text-muted-foreground">
                                      Текущий режим: до {uploadOptions.maxWidth}x{uploadOptions.maxHeight}px, качество {uploadOptions.quality}%.
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </div>
                  )}

                </div>

              </div>


              {selectedSettingsGroup !== "account-merge" && (
                <div className="mt-3 flex gap-2">
                  <Button onClick={saveSettings}>Сохранить настройки</Button>
                </div>
              )}
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
                      <Label htmlFor="telegram-bot-name">Название бота *</Label>
                      <span className="text-xs text-muted-foreground">
                        {telegramBotForm.name.trim().length}/{TELEGRAM_BOT_LIMITS.name}
                      </span>
                    </div>
                    <Input
                      id="telegram-bot-name"
                      name="telegram_bot_name"
                      aria-label="Название Telegram-бота"
                      value={telegramBotForm.name}
                      onChange={(e) => setTelegramBotForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Например: Fashion Demon Bot"
                      maxLength={TELEGRAM_BOT_LIMITS.name}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="telegram-bot-username-field">Username</Label>
                      <span className="text-xs text-muted-foreground">
                        {telegramBotForm.username.trim().length}/{TELEGRAM_BOT_LIMITS.username}
                      </span>
                    </div>
                    <Input
                      id="telegram-bot-username-field"
                      name="telegram_bot_username"
                      aria-label="Username Telegram-бота"
                      value={telegramBotForm.username}
                      placeholder="@my_bot"
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telegram-bot-image-url">URL картинки</Label>
                  <Input
                    id="telegram-bot-image-url"
                    name="telegram_bot_image_url"
                    aria-label="URL изображения Telegram-бота"
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
                      id="telegram-bot-image-upload"
                      name="telegram_bot_image"
                      aria-label="Загрузка изображения Telegram-бота"
                      ref={telegramBotImageInputRef}
                      type="file"
                      accept="image/*,.avif,.jfif"
                      className="hidden"
                      onChange={(e) => uploadTelegramBotImage(e.target.files?.[0])}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telegram-bot-token-field">Токен бота *</Label>
                  <Input
                    id="telegram-bot-token-field"
                    name="telegram_bot_token"
                    aria-label="Токен Telegram-бота"
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
                      void syncTelegramBotFormWithTelegram();
                    }}
                    disabled={telegramBotChecking}
                  >
                    {telegramBotChecking ? "Проверка..." : "Проверить и синхронизировать"}
                  </Button>
                  {telegramBotValidationError && (
                    <div className="border border-red-300 bg-red-50 p-2 text-xs text-red-700">
                      {telegramBotValidationError}
                    </div>
                  )}
                </div>

                {telegramBotCheckInfo && (
                  <div className="border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
                    <div>ID: {telegramBotCheckInfo.id || "—"}</div>
                    <div>Username: {telegramBotCheckInfo.username || "—"}</div>
                    <div>Имя: {getTelegramBotValidationDisplayName(telegramBotCheckInfo) || "—"}</div>
                    <div>Описание: {truncateTelegramPreviewText(telegramBotCheckInfo.description) || "—"}</div>
                    <div>Краткое описание: {truncateTelegramPreviewText(telegramBotCheckInfo.shortDescription, 64) || "—"}</div>
                    <div>Команды: {Array.isArray(telegramBotCheckInfo.commands) ? telegramBotCheckInfo.commands.length : 0}</div>
                    {getTelegramBotWebhookSummary(telegramBotCheckInfo) && (
                      <div>Webhook: {getTelegramBotWebhookSummary(telegramBotCheckInfo)}</div>
                    )}
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="telegram-bot-description">Описание</Label>
                    <span className="text-xs text-muted-foreground">
                      {telegramBotForm.description.trim().length}/{TELEGRAM_BOT_LIMITS.description}
                    </span>
                  </div>
                  <Textarea
                    id="telegram-bot-description"
                    name="telegram_bot_description"
                    aria-label="Описание Telegram-бота"
                    value={telegramBotForm.description}
                    onChange={(e) => setTelegramBotForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Описание бота (setMyDescription)"
                    maxLength={TELEGRAM_BOT_LIMITS.description}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="telegram-bot-short-description">Краткое описание</Label>
                    <span className="text-xs text-muted-foreground">
                      {telegramBotForm.shortDescription.trim().length}/{TELEGRAM_BOT_LIMITS.shortDescription}
                    </span>
                  </div>
                  <Input
                    id="telegram-bot-short-description"
                    name="telegram_bot_short_description"
                    aria-label="Краткое описание Telegram-бота"
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
                            <Label htmlFor={`telegram-bot-command-${index}`}>Команда</Label>
                            <span className="text-xs text-muted-foreground">
                              {normalizeTelegramCommandForValidation(command.command).length}/{TELEGRAM_BOT_LIMITS.command}
                            </span>
                          </div>
                          <Input
                            id={`telegram-bot-command-${index}`}
                            name={`telegram_bot_command_${index + 1}`}
                            aria-label={`Команда Telegram-бота ${index + 1}`}
                            value={command.command}
                            onChange={(e) => updateTelegramBotCommand(index, "command", e.target.value.toLowerCase())}
                            placeholder="/start"
                            maxLength={TELEGRAM_BOT_LIMITS.command + 1}
                            className="font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <Label htmlFor={`telegram-bot-command-description-${index}`}>Описание</Label>
                            <span className="text-xs text-muted-foreground">
                              {command.description.trim().length}/{TELEGRAM_BOT_LIMITS.commandDescription}
                            </span>
                          </div>
                          <Input
                            id={`telegram-bot-command-description-${index}`}
                            name={`telegram_bot_command_description_${index + 1}`}
                            aria-label={`Описание команды Telegram-бота ${index + 1}`}
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
                  <Tabs value={activeTelegramReplyTemplateKey} onValueChange={setActiveTelegramReplyTemplateKey} className="space-y-3">
                    <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-none bg-transparent p-0 md:grid-cols-3 xl:grid-cols-4">
                      {telegramBotForm.replyTemplates.map((template) => (
                        <TabsTrigger
                          key={`telegram-template-tab-${template.key}`}
                          value={template.key}
                          className="h-auto min-h-11 justify-start rounded-none border border-black/15 px-3 py-2 text-left text-xs leading-tight whitespace-normal data-[state=active]:border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          {template.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <div className="space-y-3">
                    {telegramBotForm.replyTemplates.map((template) => (
                      <div
                        key={template.key}
                        className={template.key === activeTelegramReplyTemplateKey ? "space-y-2 rounded border p-3" : "hidden"}
                      >
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
                  </Tabs>
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

          {isOpen && selectedAdminTab === "products" && (
          <section className="mt-8 border border-black p-4 sm:p-6">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-black uppercase tracking-tighter sm:text-2xl">
                {editingId ? 'Редактировать товар' : 'Добавить новый товар'}
              </h2>
              <Button type="button" variant="outline" onClick={closeProductForm} className="w-full rounded-none sm:w-auto">
                НАЗАД К СПИСКУ
              </Button>
            </div>
              <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="prod-price">Цена (₽)</Label>
                    <Input
                      id="prod-price"
                      type="number"
                      value={formData.basePrice}
                      onChange={(e) => setFormData({...formData, basePrice: e.target.value})}
                      required
                      className="rounded-none border-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-discount">Скидка (%)</Label>
                    <Input
                      id="prod-discount"
                      type="number"
                      min="0"
                      max="100"
                      value={formData.discountPercent}
                      onChange={(e) => setFormData({...formData, discountPercent: e.target.value})}
                      className="rounded-none border-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-discounted">Цена со скидкой</Label>
                    <Input
                      id="prod-discounted"
                      type="number"
                      value={formData.discountedPrice}
                      onChange={(e) => setFormData({...formData, discountedPrice: e.target.value})}
                      className="rounded-none border-black"
                    />
                  </div>
                </div>

                <div className="space-y-4 border border-black bg-stone-50 p-4 md:p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="text-base font-bold uppercase tracking-wide">Медиа</div>
                      <p className="text-xs text-muted-foreground">
                        Фото идут через общую галерею: можно загрузить новый файл в галерею или выбрать уже существующий. Прямая загрузка сразу в слот отключена.
                      </p>
                    </div>
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" size="sm" variant="outline" className="rounded-none border-black" onClick={addMediaSlot}>
                            <PlusCircle className="mr-1 h-4 w-4" /> Добавить медиа
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Добавляет новый слот в конец медиагалереи товара.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <TooltipProvider delayDuration={150}>
                  <div className="grid gap-4 xl:grid-cols-3">
                    {formData.media.map((item, mediaIndex) => {
                      const slot = mediaIndex + 1;
                      const isVideo = item.type === "video";
                      const hasPreview = item.url.trim().length > 0;
                      const isCover = mediaIndex === 0;
                      const isIcon = item.type === "image" && item.url.trim().length > 0 && item.url === resolvedCatalogImageUrl;
                      return (
                        <div key={`media-slot-${slot}`} className="border border-black bg-white">
                          <div className="grid min-h-[104px] grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-black px-4 py-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="flex h-10 w-10 items-center justify-center border border-black bg-black text-sm font-black text-white">
                                {slot}
                              </div>
                              <div className="min-w-0 space-y-2">
                                <div className="flex min-h-[24px] flex-wrap items-center gap-2 font-semibold">
                                  {isVideo ? <Play className="h-4 w-4" /> : <Images className="h-4 w-4" />}
                                  <span>{isVideo ? "Видео" : "Фото"}</span>
                                  {isCover && <span className="border border-black px-2 py-0.5 text-[10px] uppercase tracking-wide">Обложка</span>}
                                  {isIcon && <span className="border border-black px-2 py-0.5 text-[10px] uppercase tracking-wide">Иконка</span>}
                                </div>
                                <p className="min-h-[2.5rem] text-xs leading-5 text-muted-foreground">
                                  {isCover && isIcon
                                    ? "Этот файл сейчас главный и в галерее товара, и в карточке каталога."
                                    : isCover
                                      ? "Этот элемент открывает галерею товара первым."
                                      : isIcon
                                        ? "Это фото выбрано для карточки товара в каталоге и списках."
                                        : "Порядок влияет на показ в карточке товара."}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-start gap-2 self-start">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="outline"
                                      className="h-9 w-9 rounded-none border-black"
                                      onClick={() => moveMediaSlot(slot, -1)}
                                      disabled={slot === 1}
                                      aria-label="Переместить выше"
                                    >
                                      <ArrowUp className="h-4 w-4" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{slot === 1 ? "Элемент уже стоит первым." : "Поднимает элемент на одну позицию выше."}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="outline"
                                      className="h-9 w-9 rounded-none border-black"
                                      onClick={() => moveMediaSlot(slot, 1)}
                                      disabled={slot === formData.media.length}
                                      aria-label="Переместить ниже"
                                    >
                                      <ArrowDown className="h-4 w-4" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{slot === formData.media.length ? "Элемент уже стоит последним." : "Опускает элемент на одну позицию ниже."}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="outline"
                                      className="h-9 w-9 rounded-none border-black"
                                      onClick={() => requestRemoveMediaSlot(slot)}
                                      aria-label="Удалить медиа"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>Удаляет этот медиа-элемент из товара после подтверждения.</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>

                          <div className="space-y-4 p-4">
                            <div className="flex aspect-[4/5] items-center justify-center overflow-hidden border border-dashed border-black/40 bg-stone-100 p-3">
                              {hasPreview ? (
                                isVideo ? (
                                  <video src={item.url} controls className="h-full w-full bg-black object-contain" />
                                ) : (
                                  <img src={item.url} alt={`Медиа ${slot}`} className="max-h-full max-w-full object-contain" />
                                )
                              ) : (
                                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                                  {isVideo ? "Добавьте видео товара, чтобы сразу увидеть превью." : "Добавьте фото товара, чтобы сразу увидеть превью."}
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`media-type-${slot}`}>Тип</Label>
                              <select
                                id={`media-type-${slot}`}
                                value={item.type}
                                onChange={(e) => updateMediaSlot(slot, { type: e.target.value as "image" | "video" })}
                                className="h-11 w-full border border-black bg-white px-3"
                              >
                                <option value="image">Фото</option>
                                <option value="video">Видео</option>
                              </select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`media-url-${slot}`}>URL медиа</Label>
                              <Input
                                id={`media-url-${slot}`}
                                placeholder={isVideo ? "https://example.com/video.mp4" : "https://example.com/image.jpg"}
                                value={item.url}
                                onChange={(e) => updateMediaSlot(slot, { url: e.target.value })}
                                className="h-11 rounded-none border-black"
                              />
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex w-full">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-11 w-full justify-center rounded-none border-black"
                                      onClick={() => setMediaSlotAsCover(slot)}
                                      disabled={isCover || !hasPreview}
                                    >
                                      Сделать обложкой
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {!hasPreview
                                    ? "Сначала загрузите файл в этот слот."
                                    : isCover
                                      ? "Этот элемент уже открывает галерею товара первым."
                                      : "Перемещает медиа в начало галереи товара. Иконка каталога выбирается отдельно."}
                                </TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex w-full">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-11 w-full justify-center rounded-none border-black"
                                      onClick={() => setMediaSlotAsIcon(slot)}
                                      disabled={!hasPreview || isVideo || isIcon}
                                    >
                                      Сделать иконкой
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {!hasPreview
                                    ? "Сначала загрузите фото в этот слот."
                                    : isVideo
                                      ? "Иконкой товара может быть только фото."
                                      : isIcon
                                        ? "Это фото уже используется как иконка товара в списках и карточках."
                                        : "Выбирает это фото для карточки товара в каталоге, админ-списке и превью."}
                                </TooltipContent>
                              </Tooltip>
                            </div>

                            {!isVideo && (
                              <div className="grid gap-2 sm:grid-cols-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <label className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center whitespace-nowrap border border-black px-3 text-center text-sm font-bold">
                                      <ImagePlus className="mr-2 h-4 w-4" />
                                      Загрузить в галерею
                                      <input
                                        id={`media-gallery-upload-${slot}`}
                                        name={`media_gallery_upload_${slot}`}
                                        aria-label={`Загрузка изображения для слота ${slot + 1}`}
                                        type="file"
                                        accept="image/*,.avif,.jfif"
                                        className="hidden"
                                        onChange={(e) => uploadMediaToGalleryAndAssign(e.target.files?.[0] || null, slot)}
                                        disabled={uploading}
                                      />
                                    </label>
                                  </TooltipTrigger>
                                  <TooltipContent>Загружает фото в общую галерею и сразу подставляет его в этот слот.</TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex w-full">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-11 w-full justify-center rounded-none border-black"
                                        onClick={() => openMediaGalleryPicker(slot)}
                                      >
                                        <Images className="mr-2 h-4 w-4" /> Из галереи
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>Открывает общую галерею и позволяет выбрать уже загруженное фото.</TooltipContent>
                                </Tooltip>
                              </div>
                            )}

                            <div className="rounded-none border border-dashed border-black/40 px-3 py-2 text-xs text-muted-foreground">
                              {isVideo
                                ? "Для видео сейчас используется ссылка в поле URL. Прямая загрузка в слот отключена."
                                : "Фото можно только загрузить в общую галерею или выбрать из уже загруженных изображений."}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </TooltipProvider>
                </div>

                <div className="space-y-4 border border-black bg-white p-4 md:p-5">
                  <div className="space-y-1">
                    <div className="text-base font-bold uppercase tracking-wide">Словари товара</div>
                    <p className="text-xs text-muted-foreground">
                      Категории и размеры вынесены в первые вкладки, чтобы быстрее собрать карточку товара. Остальные справочники доступны рядом и не перегружают форму.
                    </p>
                  </div>

                  <Tabs
                    value={selectedProductEditorDictionaryTab}
                    onValueChange={(value) => setSelectedProductEditorDictionaryTab(value as DictionaryKind)}
                    className="w-full"
                  >
                    <TabsList className="grid h-auto grid-cols-2 gap-2 rounded-none bg-transparent p-0 xl:grid-cols-5">
                      {productEditorDictionaryTabs.map((tab) => (
                        <TabsTrigger
                          key={tab.key}
                          value={tab.key}
                          className="rounded-none border border-black bg-white px-3 py-3 data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          <span className="flex w-full items-center justify-between gap-2">
                            <span>{tab.label}</span>
                            <span className="text-xs opacity-70">{tab.count}</span>
                          </span>
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    <TabsContent value="categories" className="mt-4 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" className="rounded-none border-black" onClick={() => openProductDictionarySelector("categories")}>
                          Словарь
                        </Button>
                        <Button type="button" variant="outline" className="rounded-none border-black" onClick={() => createDictionaryItem("categories", true)}>
                          +
                        </Button>
                      </div>

                      {formData.categories.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {formData.categories.map((category) => (
                            <div key={category} className="flex items-center gap-2 border border-black bg-stone-50 px-3 py-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getDictionaryDotColor(category) }} />
                              <span className="font-medium">{category}</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-auto rounded-none px-1 text-xs"
                                onClick={() => removeDictionaryValueFromProduct("categories", category)}
                              >
                                Удалить
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Категория пока не выбрана.</p>
                      )}
                    </TabsContent>

<TabsContent value="collections" className="mt-4 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" className="rounded-none border-black" onClick={() => openProductDictionarySelector("collections")}>
                          Словарь
                        </Button>
                        <Button type="button" variant="outline" className="rounded-none border-black" onClick={() => createDictionaryItem("collections", true)}>
                          +
                        </Button>
                      </div>

                      {formData.collections.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {formData.collections.map((collection) => (
                            <div key={collection} className="flex items-center gap-2 border border-black bg-stone-50 px-3 py-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getDictionaryDotColor(collection) }} />
                              <span className="font-medium">{collection}</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-auto rounded-none px-1 text-xs"
                                onClick={() => removeDictionaryValueFromProduct("collections", collection)}
                              >
                                Удалить
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Коллекции пока не выбраны.</p>
                      )}
                    </TabsContent>

                    <TabsContent value="sizes" className="mt-4 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" className="rounded-none border-black" onClick={() => openProductDictionarySelector("sizes")}>
                          Словарь
                        </Button>
                        <Button type="button" variant="outline" className="rounded-none border-black" onClick={() => createDictionaryItem("sizes", true)}>
                          +
                        </Button>
                      </div>

                      {formData.sizes.length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {formData.sizes.map((size) => (
                            <div key={size} className="flex h-full flex-col gap-3 border border-black bg-stone-50 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <span className="inline-flex h-12 min-w-12 items-center justify-center border border-black bg-white px-4 text-lg font-black">
                                  {size}
                                </span>
                                <span className="text-xs uppercase tracking-wide text-muted-foreground">Размер</span>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor={`stock-${size}`} className="text-xs uppercase tracking-wide text-muted-foreground">
                                  Остаток
                                </Label>
                                <Input
                                  id={`stock-${size}`}
                                  type="number"
                                  min="0"
                                  value={formData.sizeStock[size] ?? 0}
                                  onChange={(e) => updateSizeStock(size, e.target.value)}
                                  className="h-11 rounded-none border-black bg-white"
                                />
                              </div>

                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="mt-auto h-11 w-full rounded-none border-black"
                                onClick={() => removeDictionaryValueFromProduct("sizes", size)}
                              >
                                Удалить размер
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Размеры пока не выбраны.</p>
                      )}
                    </TabsContent>

                    <TabsContent value="materials" className="mt-4 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" className="rounded-none border-black" onClick={() => openProductDictionarySelector("materials")}>
                          Словарь
                        </Button>
                        <Button type="button" variant="outline" className="rounded-none border-black" onClick={() => createDictionaryItem("materials", true)}>
                          +
                        </Button>
                      </div>

                      {formData.materials.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {formData.materials.map((material) => (
                            <div key={material} className="flex items-center gap-2 border border-black bg-stone-50 px-3 py-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getDictionaryDotColor(material) }} />
                              <span className="font-medium">{material}</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-auto rounded-none px-1 text-xs"
                                onClick={() => removeDictionaryValueFromProduct("materials", material)}
                              >
                                Удалить
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Материалы пока не выбраны.</p>
                      )}
                    </TabsContent>

                    <TabsContent value="colors" className="mt-4 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" className="rounded-none border-black" onClick={() => openProductDictionarySelector("colors")}>
                          Словарь
                        </Button>
                        <Button type="button" variant="outline" className="rounded-none border-black" onClick={() => createDictionaryItem("colors", true)}>
                          +
                        </Button>
                      </div>

                      {formData.colors.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {formData.colors.map((color) => (
                            <div key={color} className="flex items-center gap-2 border border-black bg-stone-50 px-3 py-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getDictionaryDotColor(color) }} />
                              <span className="font-medium">{color}</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-auto rounded-none px-1 text-xs"
                                onClick={() => removeDictionaryValueFromProduct("colors", color)}
                              >
                                Удалить
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Цвета пока не выбраны.</p>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>

                <div className="flex flex-wrap gap-8">
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
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="reviews-enabled"
                      checked={formData.reviewsEnabled !== false}
                      onCheckedChange={(checked) => setFormData({ ...formData, reviewsEnabled: !!checked })}
                    />
                    <Label htmlFor="reviews-enabled" className="cursor-pointer font-bold uppercase">Отзывы включены</Label>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="prod-sku">Артикул</Label>
                    <Input
                      id="prod-sku"
                      value={formData.sku}
                      onChange={(e) => setFormData({...formData, sku: e.target.value})}
                      className="h-11 rounded-none border-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-print">Принт</Label>
                    <Input
                      id="prod-print"
                      value={formData.printType}
                      onChange={(e) => setFormData({...formData, printType: e.target.value})}
                      className="h-11 rounded-none border-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-fit">Лекала</Label>
                    <Input
                      id="prod-fit"
                      value={formData.fit}
                      onChange={(e) => setFormData({...formData, fit: e.target.value})}
                      className="h-11 rounded-none border-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-gender">Пол</Label>
                    <select id="prod-gender" value={formData.gender} onChange={(e) => setFormData({...formData, gender: e.target.value})} className="h-11 w-full border border-black bg-white px-3">
                      <option value="">Выберите пол</option>
                      <option value="male">мужской</option>
                      <option value="female">женский</option>
                      <option value="unisex">unisex</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-shipping">Отправка</Label>
                    <Input
                      id="prod-shipping"
                      value={formData.shipping}
                      onChange={(e) => setFormData({...formData, shipping: e.target.value})}
                      className="h-11 rounded-none border-black"
                    />
                  </div>
                </div>

                {editingId && (
                  <div className="space-y-4 border-t border-black/10 pt-6">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-lg font-bold uppercase tracking-widest">Отзывы по товару</h3>
                        <p className="text-sm text-muted-foreground">
                          Здесь можно скрывать отзывы, мягко удалять их без физического удаления из базы и при необходимости восстанавливать.
                        </p>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {productReviewsLoading ? "Загрузка..." : `Всего отзывов: ${productReviews.length}`}
                      </div>
                    </div>

                    {productReviewsLoading ? (
                      <p className="text-sm text-muted-foreground">Загружаем отзывы...</p>
                    ) : productReviews.length > 0 ? (
                      <div className="space-y-4">
                        {productReviews.map((review) => (
                          <div key={review.id} className="space-y-3 border border-black/10 bg-stone-50 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold">{review.author || "Покупатель"}</span>
                                  {review.isDeleted ? (
                                    <span className="border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                                      Удален
                                    </span>
                                  ) : review.isHidden ? (
                                    <span className="border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                      Скрыт
                                    </span>
                                  ) : (
                                    <span className="border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                      Опубликован
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                  <span>Создан: {review.createdAt ? new Date(review.createdAt).toLocaleString("ru-RU") : "—"}</span>
                                  {review.editedAt && <span>Изменен: {new Date(review.editedAt).toLocaleString("ru-RU")}</span>}
                                  {review.deletedAt && <span>Удален: {new Date(review.deletedAt).toLocaleString("ru-RU")}</span>}
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {review.isDeleted ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-none"
                                    onClick={() => handleModerateReview(review.id, "restore")}
                                  >
                                    <RefreshCcw className="mr-2 h-4 w-4" />
                                    Восстановить
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-none"
                                    onClick={() => handleModerateReview(review.id, review.isHidden ? "show" : "hide")}
                                  >
                                    {review.isHidden ? (
                                      <>
                                        <Eye className="mr-2 h-4 w-4" />
                                        Показать
                                      </>
                                    ) : (
                                      <>
                                        <EyeOff className="mr-2 h-4 w-4" />
                                        Скрыть
                                      </>
                                    )}
                                  </Button>
                                )}
                                {!review.isDeleted && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-none"
                                    onClick={() => handleModerateReview(review.id, "delete")}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Удалить
                                  </Button>
                                )}
                              </div>
                            </div>

                            <div className="text-sm leading-relaxed whitespace-pre-wrap">{review.text}</div>

                            {Array.isArray(review.media) && review.media.length > 0 && (
                              <div className="flex flex-wrap gap-3 pt-1">
                                {review.media.map((mediaUrl, index) => (
                                  /\.(mp4|webm|mov|m4v|avi|ogg)(\?.*)?$/i.test(mediaUrl) ? (
                                    <video key={`${mediaUrl}-${index}`} src={mediaUrl} controls className="h-28 w-28 border border-black/10 object-cover" />
                                  ) : (
                                    <img key={`${mediaUrl}-${index}`} src={mediaUrl} alt="" className="h-28 w-28 border border-black/10 object-cover" />
                                  )
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Пока отзывов нет.</p>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeProductForm} className="h-11 rounded-none" disabled={productSubmitting}>
                    ОТМЕНА
                  </Button>
                  <Button type="submit" className="h-11 bg-black text-white hover:bg-gray-800 rounded-none font-bold uppercase tracking-widest" disabled={productSubmitting}>
                    {productSubmitting ? (editingId ? 'ОБНОВЛЕНИЕ...' : 'СОЗДАНИЕ...') : (editingId ? 'ОБНОВИТЬ ТОВАР' : 'СОЗДАТЬ ТОВАР')}
                  </Button>
                </div>
              </form>
          </section>
          )}



          <Dialog open={mediaDeleteDialog.open} onOpenChange={(open) => setMediaDeleteDialog(open ? mediaDeleteDialog : { open: false, slot: null })}>
            <DialogContent className="max-w-md rounded-none border-black">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase">Подтвердить удаление медиа</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>
                  Удалить {mediaDeleteTarget?.type === "video" ? "видео" : "фото"}{mediaDeleteDialog.slot ? ` #${mediaDeleteDialog.slot}` : ""} из товара?
                </p>
                <p className="text-muted-foreground">
                  Элемент будет удален из порядка показа. Если это была обложка, основной станет следующий медиа-элемент.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-none" onClick={() => setMediaDeleteDialog({ open: false, slot: null })}>
                  Отмена
                </Button>
                <Button type="button" className="rounded-none bg-red-600 text-white hover:bg-red-700" onClick={confirmRemoveMediaSlot}>
                  Удалить
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={productUpdateConfirmOpen} onOpenChange={(open) => { if (!productSubmitting) setProductUpdateConfirmOpen(open); }}>
            <DialogContent className="max-w-md rounded-none border-black">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase">Подтвердить обновление товара</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>
                  Сохранить изменения в товаре «{formData.name || "без названия"}»?
                </p>
                <p className="text-muted-foreground">
                  После подтверждения карточка товара будет обновлена в каталоге и в админке.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-none" onClick={() => setProductUpdateConfirmOpen(false)} disabled={productSubmitting}>
                  Отмена
                </Button>
                <Button type="button" className="rounded-none bg-black text-white hover:bg-gray-800" onClick={() => void submitProductForm()} disabled={productSubmitting}>
                  {productSubmitting ? "Обновление..." : "Обновить товар"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={dictionaryCreateDialog.open} onOpenChange={(open) => { if (!open) closeCreateDictionaryDialog(); }}>
            <DialogContent className="max-w-xl rounded-none border-black">
              <form onSubmit={(e) => { e.preventDefault(); void submitCreateDictionaryItem(); }} className="space-y-4">
                <DialogHeader>
                  <DialogTitle className="text-xl font-black uppercase">
                    Добавить в словарь: {dictionaryGroups.find((group) => group.key === dictionaryCreateDialog.kind)?.label}
                  </DialogTitle>
                </DialogHeader>

                {dictionaryCreateDialog.attachToProduct && (
                  <div className="rounded-none border border-black bg-stone-50 px-3 py-2 text-sm">
                    После сохранения значение сразу добавится в текущий товар.
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="create-dictionary-name">Название *</Label>
                    <Input
                      id="create-dictionary-name"
                      value={dictionaryCreateDialog.name}
                      onChange={(e) => setDictionaryCreateDialog((prev) => ({ ...prev, name: e.target.value }))}
                      className="h-11 rounded-none border-black"
                      placeholder="Например, Хлопок"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-dictionary-slug">Slug</Label>
                    <Input
                      id="create-dictionary-slug"
                      value={dictionaryCreateDialog.slug}
                      onChange={(e) => setDictionaryCreateDialog((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
                      className="h-11 rounded-none border-black"
                      placeholder="latin-slug"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_64px_160px]">
                  <div className="space-y-2">
                    <Label htmlFor="create-dictionary-color">Цвет метки</Label>
                    <Input
                      id="create-dictionary-color"
                      value={dictionaryCreateDialog.color}
                      onChange={(e) => setDictionaryCreateDialog((prev) => ({ ...prev, color: e.target.value }))}
                      className="h-11 rounded-none border-black"
                      placeholder="#3b82f6"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-dictionary-color-picker">Пикер</Label>
                    <input
                      id="create-dictionary-color-picker"
                      type="color"
                      value={dictionaryCreateDialog.color || "#3b82f6"}
                      onChange={(e) => setDictionaryCreateDialog((prev) => ({ ...prev, color: e.target.value }))}
                      className="h-11 w-full cursor-pointer rounded-none border border-black bg-white p-1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-dictionary-sort-order">Порядок</Label>
                    <Input
                      id="create-dictionary-sort-order"
                      type="number"
                      min="0"
                      step="1"
                      value={dictionaryCreateDialog.sortOrder}
                      onChange={(e) => setDictionaryCreateDialog((prev) => ({ ...prev, sortOrder: e.target.value }))}
                      className="h-11 rounded-none border-black"
                      placeholder="0"
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-3 rounded-none border border-black bg-white px-3 py-3 text-sm">
                  <Checkbox
                    checked={dictionaryCreateDialog.showColorInCatalog}
                    onCheckedChange={(checked) => setDictionaryCreateDialog((prev) => ({ ...prev, showColorInCatalog: !!checked }))}
                  />
                  <span>Показывать цвет в каталоге</span>
                </label>

                <div className="space-y-2">
                  <Label htmlFor="create-dictionary-description">Описание</Label>
                  <Textarea
                    id="create-dictionary-description"
                    value={dictionaryCreateDialog.description}
                    onChange={(e) => setDictionaryCreateDialog((prev) => ({ ...prev, description: e.target.value }))}
                    className="min-h-[110px] rounded-none border-black"
                    placeholder="Необязательно, но помогает быстрее ориентироваться в словаре"
                  />
                </div>

                {dictionaryCreateDialog.kind === "collections" && (
                  <div className="space-y-3 rounded-none border border-black/10 p-3">
                    <div className="space-y-2">
                      <Label htmlFor="create-dictionary-preview-mode">Режим изображения коллекции</Label>
                      <Select
                        value={dictionaryCreateDialog.previewMode}
                        onValueChange={(value) => setDictionaryCreateDialog((prev) => ({ ...prev, previewMode: value as CollectionPreviewMode }))}
                      >
                        <SelectTrigger id="create-dictionary-preview-mode" className="h-11 rounded-none border-black">
                          <SelectValue placeholder="Выберите режим" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gallery">Большое изображение из галереи</SelectItem>
                          <SelectItem value="products">Автоколлаж из товаров коллекции</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {dictionaryCreateDialog.previewMode === "gallery" ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" className="rounded-none" onClick={openCollectionCreateGalleryPicker}>
                            <Images className="mr-2 h-4 w-4" /> Выбрать из галереи
                          </Button>
                          {dictionaryCreateDialog.imageUrl?.trim() && (
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-none"
                              onClick={() => setDictionaryCreateDialog((prev) => ({ ...prev, imageUrl: "" }))}
                            >
                              <X className="mr-2 h-4 w-4" /> Убрать изображение
                            </Button>
                          )}
                        </div>
                        {dictionaryCreateDialog.imageUrl?.trim() ? (
                          <div className="overflow-hidden border border-black/10 bg-stone-50">
                            <img src={dictionaryCreateDialog.imageUrl} alt={dictionaryCreateDialog.name || "Коллекция"} className="h-44 w-full object-cover" />
                          </div>
                        ) : (
                          <div className="rounded-none border border-dashed border-black/20 px-3 py-4 text-sm text-muted-foreground">
                            Выберите готовое изображение из общей галереи. Оно станет основным кадром коллекции.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {getCollectionPreviewImagesFromProducts(dictionaryCreateDialog.name).length > 0 ? (
                          <div className="grid grid-cols-3 gap-2 overflow-hidden">
                            {getCollectionPreviewImagesFromProducts(dictionaryCreateDialog.name).map((imageUrl, index) => (
                              <div key={`create-collection-preview-${index}`} className="overflow-hidden border border-black/10 bg-stone-50">
                                <img src={imageUrl} alt="" className="h-32 w-full object-cover" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-none border border-dashed border-black/20 px-3 py-4 text-sm text-muted-foreground">
                            Когда у коллекции появятся товары с фото, блок автоматически соберёт широкий коллаж из их изображений.
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">Этот режим собирает витрину из всех изображений товаров коллекции и автоматически меняет композицию в слайдере.</p>
                      </div>
                    )}
                  </div>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" className="rounded-none" onClick={closeCreateDictionaryDialog} disabled={dictionaryCreateDialog.submitting}>
                    Отмена
                  </Button>
                  <Button type="submit" className="rounded-none bg-black text-white hover:bg-gray-800" disabled={dictionaryCreateDialog.submitting}>
                    {dictionaryCreateDialog.submitting ? "Создание..." : "Добавить"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={productDictionarySelector.open} onOpenChange={(open) => setProductDictionarySelector((prev) => ({ ...prev, open }))}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto rounded-none border-black">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase">
                  Справочник: {dictionaryGroups.find((group) => group.key === productDictionarySelector.kind)?.label}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                {getSortedDictionaryItems(productDictionarySelector.kind).map((item) => {
                  const selected = getProductDictionarySelected(productDictionarySelector.kind, item.name);
                  return (
                    <div key={`${productDictionarySelector.kind}-${item.id}`} className="flex flex-col gap-3 border border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-semibold">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color || getDictionaryDotColor(item.name) }} />
                          <span>{item.name}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Порядок: {item.sortOrder ?? 0}</p>
                        {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                      </div>
                      <Button
                        type="button"
                        variant={selected ? "secondary" : "outline"}
                        className="w-full rounded-none sm:w-auto"
                        onClick={() => addDictionaryValueToProduct(productDictionarySelector.kind, item.name)}
                        disabled={selected}
                      >
                        {selected ? "Выбрано" : "Выбрать"}
                      </Button>
                    </div>
                  );
                })}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-none" onClick={closeProductDictionarySelector}>Закрыть</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
          <Dialog open={Boolean(galleryPickerTarget)} onOpenChange={(open) => { if (!open) closeGalleryPicker(); }}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto rounded-none border-black">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase">
                  {galleryPickerTarget?.type === "product-media"
                    ? "Выбрать изображение для товара"
                    : "Выбрать изображение коллекции из галереи"}
                </DialogTitle>
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
                    id="media-gallery-picker-upload"
                    name="media_gallery_picker_upload"
                    aria-label="Загрузка изображения из медиагалереи"
                    ref={mediaGalleryUploadInputRef}
                    type="file"
                    accept="image/*,.avif,.jfif"
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

                <div className="flex flex-col gap-2 border border-gray-200 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between">
                  <div>
                    {mediaGalleryLoading
                      ? "Загружаем галерею..."
                      : mediaGalleryTotalItems > 0
                        ? `Показано ${mediaGalleryPageStart}-${mediaGalleryPageEnd} из ${mediaGalleryTotalItems}`
                        : "Изображения не найдены"}
                  </div>
                  <div className="text-muted-foreground">Страница {Math.min(mediaGalleryPage, safeMediaGalleryTotalPages)} из {safeMediaGalleryTotalPages}</div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {filteredGalleryPickerImages.map((image) => (
                    <button
                      type="button"
                      key={`picker-${image.id}`}
                      className="border border-gray-200 text-left hover:border-black transition-colors"
                      onClick={() => assignSelectedGalleryImage(image.url)}
                    >
                      <img src={image.url} alt={image.name} className="w-full h-36 object-cover bg-gray-100" />
                      <div className="p-2">
                        <div className="text-sm font-semibold truncate">{image.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{image.description || 'Без описания'}</div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-muted-foreground">Всего изображений: {mediaGalleryTotalItems}</div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-none"
                      onClick={() => setMediaGalleryPage((prev) => Math.max(1, prev - 1))}
                      disabled={mediaGalleryLoading || mediaGalleryPage <= 1}
                    >
                      Назад
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-none"
                      onClick={() => setMediaGalleryPage((prev) => Math.min(safeMediaGalleryTotalPages, prev + 1))}
                      disabled={mediaGalleryLoading || mediaGalleryPage >= safeMediaGalleryTotalPages}
                    >
                      Вперед
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </main>
        {hasGalleryUploadQueue && (
          <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex max-w-[calc(100vw-2rem)] justify-end">
            {isGalleryUploadPanelOpen ? (
              <div className="pointer-events-auto w-[min(420px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white shadow-2xl shadow-black/15">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-900">
                      <Upload className="h-4 w-4" />
                      Загрузка в галерею
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Файлов: {galleryUploadQueue.length} · Успешно: {galleryUploadSuccessCount} · Ошибок: {galleryUploadErrorCount}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-none"
                    onClick={() => setIsGalleryUploadPanelOpen(false)}
                    aria-label="Закрыть окно загрузки"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-3 px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(galleryUploadUploadedBytes)} / {formatBytes(galleryUploadTotalBytes)}
                      {galleryUploadSpeed > 0 ? ` · ${formatBytes(galleryUploadSpeed)}/с` : ""}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!galleryUploading && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-none"
                          onClick={clearGalleryUploadQueue}
                        >
                          Очистить
                        </Button>
                      )}
                    </div>
                  </div>

                  <Progress value={galleryUploadProgress} className="h-2 rounded-none" />

                  <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                    {galleryUploadQueue.map((item) => (
                      <div key={item.id} className="border border-black/10 bg-stone-50 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{item.fileName}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              В галерее: {item.assignedName} · {formatBytes(item.fileSize)}
                            </div>
                          </div>
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            {item.status === "success"
                              ? "Готово"
                              : item.status === "error"
                                ? "Ошибка"
                                : item.status === "uploading"
                                  ? "Загрузка"
                                  : "Ожидание"}
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          <Progress value={item.progressPercent} className="h-2 rounded-none" />
                          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                            <span>{Math.round(item.progressPercent)}%</span>
                            <span>
                              {formatBytes(item.uploadedBytes)} / {formatBytes(item.fileSize)}
                              {item.speedBytesPerSecond > 0 ? ` · ${formatBytes(item.speedBytesPerSecond)}/с` : ""}
                            </span>
                          </div>
                          {item.error && (
                            <div className="text-xs text-red-600">{item.error}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="pointer-events-auto h-auto rounded-none border-black bg-white px-4 py-3 text-left shadow-lg hover:bg-stone-50"
                onClick={() => setIsGalleryUploadPanelOpen(true)}
              >
                <div className="flex items-center gap-3">
                  <Upload className="h-4 w-4" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Загрузки галереи</div>
                    <div className="text-xs text-muted-foreground">
                      {galleryUploading
                        ? `Идёт загрузка · ${galleryUploadProgress}%`
                        : `Готово: ${galleryUploadSuccessCount} · Ошибок: ${galleryUploadErrorCount}`}
                    </div>
                  </div>
                </div>
              </Button>
            )}
          </div>
        )}
        {!embedded && <Footer />}
      </div>
  );
}
