export const SITE_SOCIAL_LINK_PRESET_IDS = [
  "instagram",
  "telegram",
  "vk",
  "youtube",
  "tiktok",
  "whatsapp",
  "facebook",
  "x",
  "linkedin",
  "pinterest",
  "rutube",
  "dzen",
  "website",
  "email",
  "phone",
  "custom",
] as const;

export type SiteSocialLinkPresetId = (typeof SITE_SOCIAL_LINK_PRESET_IDS)[number];

export const SITE_SOCIAL_ICON_KEYS = [
  "instagram",
  "telegram",
  "vk",
  "youtube",
  "tiktok",
  "whatsapp",
  "facebook",
  "x",
  "linkedin",
  "pinterest",
  "rutube",
  "dzen",
  "mail",
  "phone",
  "globe",
  "message",
  "play",
  "at-sign",
] as const;

export type SiteSocialIconKey = (typeof SITE_SOCIAL_ICON_KEYS)[number];

export type SiteSocialLinkIconMode = "preset" | "custom";
export type SiteSocialLinkColorMode = "standard" | "custom";
export type SiteSocialLinkBackgroundMode = "standard" | "custom" | "none";
export type SiteSocialLinkPlacement = "header" | "footer" | "page";

export interface SiteSocialLinkPresetOption {
  id: SiteSocialLinkPresetId;
  label: string;
  defaultLabel: string;
  urlPlaceholder: string;
  defaultIconKey: SiteSocialIconKey;
  backgroundColor: string;
  iconColor: string;
  standaloneColor: string;
}

export interface SiteSocialIconOption {
  id: SiteSocialIconKey;
  label: string;
}

export interface SiteSocialLinkItem {
  id: string;
  presetId: SiteSocialLinkPresetId;
  label: string;
  description: string;
  url: string;
  iconMode: SiteSocialLinkIconMode;
  iconKey: SiteSocialIconKey;
  customIconUrl: string;
  backgroundMode: SiteSocialLinkBackgroundMode;
  backgroundColor: string;
  iconColorMode: SiteSocialLinkColorMode;
  iconColor: string;
  enabled: boolean;
  openInNewTab: boolean;
  showInHeader: boolean;
  showInFooter: boolean;
  showOnPage: boolean;
  sortOrder: number;
}

export interface SiteSocialLinksConfig {
  enabled: boolean;
  headerEnabled: boolean;
  footerEnabled: boolean;
  pageEnabled: boolean;
  pageTitle: string;
  pageDescription: string;
  items: SiteSocialLinkItem[];
}

export interface SiteSocialLinkVisuals {
  showBackground: boolean;
  backgroundColor: string;
  iconColor: string;
  outlineColor: string;
}

export const SITE_SOCIAL_LINK_PRESET_OPTIONS: readonly SiteSocialLinkPresetOption[] = [
  {
    id: "instagram",
    label: "Instagram",
    defaultLabel: "Instagram",
    urlPlaceholder: "https://instagram.com/your_store",
    defaultIconKey: "instagram",
    backgroundColor: "#e1306c",
    iconColor: "#ffffff",
    standaloneColor: "#e1306c",
  },
  {
    id: "telegram",
    label: "Telegram",
    defaultLabel: "Telegram",
    urlPlaceholder: "https://t.me/your_store",
    defaultIconKey: "telegram",
    backgroundColor: "#27a7e7",
    iconColor: "#ffffff",
    standaloneColor: "#27a7e7",
  },
  {
    id: "vk",
    label: "VK",
    defaultLabel: "VK",
    urlPlaceholder: "https://vk.com/your_store",
    defaultIconKey: "vk",
    backgroundColor: "#0077ff",
    iconColor: "#ffffff",
    standaloneColor: "#0077ff",
  },
  {
    id: "youtube",
    label: "YouTube",
    defaultLabel: "YouTube",
    urlPlaceholder: "https://youtube.com/@your_store",
    defaultIconKey: "youtube",
    backgroundColor: "#ff0000",
    iconColor: "#ffffff",
    standaloneColor: "#ff0000",
  },
  {
    id: "tiktok",
    label: "TikTok",
    defaultLabel: "TikTok",
    urlPlaceholder: "https://www.tiktok.com/@your_store",
    defaultIconKey: "tiktok",
    backgroundColor: "#111111",
    iconColor: "#ffffff",
    standaloneColor: "#111111",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    defaultLabel: "WhatsApp",
    urlPlaceholder: "https://wa.me/79990000000",
    defaultIconKey: "whatsapp",
    backgroundColor: "#25d366",
    iconColor: "#ffffff",
    standaloneColor: "#25d366",
  },
  {
    id: "facebook",
    label: "Facebook",
    defaultLabel: "Facebook",
    urlPlaceholder: "https://facebook.com/your_store",
    defaultIconKey: "facebook",
    backgroundColor: "#1877f2",
    iconColor: "#ffffff",
    standaloneColor: "#1877f2",
  },
  {
    id: "x",
    label: "X / Twitter",
    defaultLabel: "X",
    urlPlaceholder: "https://x.com/your_store",
    defaultIconKey: "x",
    backgroundColor: "#111111",
    iconColor: "#ffffff",
    standaloneColor: "#111111",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    defaultLabel: "LinkedIn",
    urlPlaceholder: "https://linkedin.com/company/your_store",
    defaultIconKey: "linkedin",
    backgroundColor: "#0a66c2",
    iconColor: "#ffffff",
    standaloneColor: "#0a66c2",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    defaultLabel: "Pinterest",
    urlPlaceholder: "https://pinterest.com/your_store",
    defaultIconKey: "pinterest",
    backgroundColor: "#bd081c",
    iconColor: "#ffffff",
    standaloneColor: "#bd081c",
  },
  {
    id: "rutube",
    label: "RuTube",
    defaultLabel: "RuTube",
    urlPlaceholder: "https://rutube.ru/channel/00000000",
    defaultIconKey: "rutube",
    backgroundColor: "#111111",
    iconColor: "#ffffff",
    standaloneColor: "#111111",
  },
  {
    id: "dzen",
    label: "Дзен",
    defaultLabel: "Дзен",
    urlPlaceholder: "https://dzen.ru/your_store",
    defaultIconKey: "dzen",
    backgroundColor: "#111111",
    iconColor: "#ffffff",
    standaloneColor: "#111111",
  },
  {
    id: "website",
    label: "Сайт",
    defaultLabel: "Сайт",
    urlPlaceholder: "https://your-store.example",
    defaultIconKey: "globe",
    backgroundColor: "#111111",
    iconColor: "#ffffff",
    standaloneColor: "#111111",
  },
  {
    id: "email",
    label: "E-mail",
    defaultLabel: "E-mail",
    urlPlaceholder: "mailto:hello@your-store.example",
    defaultIconKey: "mail",
    backgroundColor: "#111111",
    iconColor: "#ffffff",
    standaloneColor: "#111111",
  },
  {
    id: "phone",
    label: "Телефон",
    defaultLabel: "Телефон",
    urlPlaceholder: "tel:+79990000000",
    defaultIconKey: "phone",
    backgroundColor: "#111111",
    iconColor: "#ffffff",
    standaloneColor: "#111111",
  },
  {
    id: "custom",
    label: "Своя ссылка",
    defaultLabel: "Соцсеть",
    urlPlaceholder: "https://example.com/profile",
    defaultIconKey: "globe",
    backgroundColor: "#111111",
    iconColor: "#ffffff",
    standaloneColor: "#111111",
  },
] as const;

export const SITE_SOCIAL_ICON_OPTIONS: readonly SiteSocialIconOption[] = [
  { id: "instagram", label: "Instagram" },
  { id: "telegram", label: "Telegram" },
  { id: "vk", label: "VK" },
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "facebook", label: "Facebook" },
  { id: "x", label: "X / Twitter" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "pinterest", label: "Pinterest" },
  { id: "rutube", label: "RuTube" },
  { id: "dzen", label: "Дзен" },
  { id: "mail", label: "Почта" },
  { id: "phone", label: "Телефон" },
  { id: "globe", label: "Сайт" },
  { id: "message", label: "Сообщение" },
  { id: "play", label: "Видео" },
  { id: "at-sign", label: "@ / ник" },
] as const;

const SITE_SOCIAL_LINK_PRESET_MAP = new Map<SiteSocialLinkPresetId, SiteSocialLinkPresetOption>(
  SITE_SOCIAL_LINK_PRESET_OPTIONS.map((item) => [item.id, item]),
);

const SITE_SOCIAL_ICON_MAP = new Map<SiteSocialIconKey, SiteSocialIconOption>(
  SITE_SOCIAL_ICON_OPTIONS.map((item) => [item.id, item]),
);

const DEFAULT_SOCIAL_PAGE_TITLE = "Мы в соцсетях";
const DEFAULT_SOCIAL_PAGE_DESCRIPTION =
  "Выберите удобную площадку и подписывайтесь на обновления магазина.";

const DEFAULT_SOCIAL_PRESET = SITE_SOCIAL_LINK_PRESET_OPTIONS[0];
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const normalizeText = (value: unknown, fallback = "") => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || fallback;
};

const normalizeBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }

  return fallback;
};

const normalizeColor = (value: unknown, fallback: string) => {
  const normalizedValue = normalizeText(value, fallback).toLowerCase();
  return HEX_COLOR_PATTERN.test(normalizedValue) ? normalizedValue : fallback;
};

const normalizeSortOrder = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return fallback;
};

const normalizePresetId = (value: unknown): SiteSocialLinkPresetId => {
  const normalizedValue = normalizeText(value) as SiteSocialLinkPresetId;
  return SITE_SOCIAL_LINK_PRESET_MAP.has(normalizedValue)
    ? normalizedValue
    : DEFAULT_SOCIAL_PRESET.id;
};

const normalizeIconKey = (
  value: unknown,
  fallback: SiteSocialIconKey,
): SiteSocialIconKey => {
  const normalizedValue = normalizeText(value) as SiteSocialIconKey;
  return SITE_SOCIAL_ICON_MAP.has(normalizedValue) ? normalizedValue : fallback;
};

const normalizeIconMode = (value: unknown): SiteSocialLinkIconMode =>
  value === "custom" ? "custom" : "preset";

const normalizeColorMode = (value: unknown): SiteSocialLinkColorMode =>
  value === "custom" ? "custom" : "standard";

const normalizeBackgroundMode = (value: unknown): SiteSocialLinkBackgroundMode => {
  if (value === "custom" || value === "none") {
    return value;
  }

  return "standard";
};

export const getSiteSocialLinkPreset = (
  presetId: SiteSocialLinkPresetId,
): SiteSocialLinkPresetOption =>
  SITE_SOCIAL_LINK_PRESET_MAP.get(presetId) || DEFAULT_SOCIAL_PRESET;

export const createSiteSocialLinkId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `social_${Math.random().toString(36).slice(2, 10)}`;
};

export const createSiteSocialLinkItem = (
  presetId: SiteSocialLinkPresetId = DEFAULT_SOCIAL_PRESET.id,
  sortOrder = 0,
): SiteSocialLinkItem => {
  const preset = getSiteSocialLinkPreset(presetId);

  return {
    id: createSiteSocialLinkId(),
    presetId: preset.id,
    label: preset.defaultLabel,
    description: "",
    url: "",
    iconMode: "preset",
    iconKey: preset.defaultIconKey,
    customIconUrl: "",
    backgroundMode: "standard",
    backgroundColor: preset.backgroundColor,
    iconColorMode: "standard",
    iconColor: preset.iconColor,
    enabled: true,
    openInNewTab: true,
    showInHeader: true,
    showInFooter: true,
    showOnPage: true,
    sortOrder,
  };
};

export const DEFAULT_SITE_SOCIAL_LINKS_CONFIG: SiteSocialLinksConfig = {
  enabled: true,
  headerEnabled: true,
  footerEnabled: true,
  pageEnabled: false,
  pageTitle: DEFAULT_SOCIAL_PAGE_TITLE,
  pageDescription: DEFAULT_SOCIAL_PAGE_DESCRIPTION,
  items: [],
};

const normalizeSiteSocialLinkItem = (
  value: unknown,
  index: number,
): SiteSocialLinkItem => {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const preset = getSiteSocialLinkPreset(normalizePresetId(source.presetId));
  const iconMode = normalizeIconMode(source.iconMode);

  return {
    id: normalizeText(source.id, `social-item-${index + 1}`),
    presetId: preset.id,
    label: normalizeText(source.label, preset.defaultLabel),
    description: normalizeText(source.description),
    url: normalizeText(source.url),
    iconMode,
    iconKey: normalizeIconKey(source.iconKey, preset.defaultIconKey),
    customIconUrl: normalizeText(source.customIconUrl),
    backgroundMode: normalizeBackgroundMode(source.backgroundMode),
    backgroundColor: normalizeColor(source.backgroundColor, preset.backgroundColor),
    iconColorMode: normalizeColorMode(source.iconColorMode),
    iconColor: normalizeColor(source.iconColor, preset.iconColor),
    enabled: normalizeBoolean(source.enabled, true),
    openInNewTab: normalizeBoolean(source.openInNewTab, true),
    showInHeader: normalizeBoolean(source.showInHeader, true),
    showInFooter: normalizeBoolean(source.showInFooter, true),
    showOnPage: normalizeBoolean(source.showOnPage, true),
    sortOrder: normalizeSortOrder(source.sortOrder, index),
  };
};

export const normalizeSiteSocialLinksConfig = (
  value: unknown,
): SiteSocialLinksConfig => {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawItems = Array.isArray(source.items) ? source.items : [];

  const items = rawItems
    .map((item, index) => normalizeSiteSocialLinkItem(item, index))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index }));

  return {
    enabled: normalizeBoolean(source.enabled, true),
    headerEnabled: normalizeBoolean(source.headerEnabled, true),
    footerEnabled: normalizeBoolean(source.footerEnabled, true),
    pageEnabled: normalizeBoolean(source.pageEnabled, true),
    pageTitle: normalizeText(source.pageTitle, DEFAULT_SOCIAL_PAGE_TITLE),
    pageDescription: normalizeText(
      source.pageDescription,
      DEFAULT_SOCIAL_PAGE_DESCRIPTION,
    ),
    items,
  };
};

export const parseSiteSocialLinksConfig = (
  value: unknown,
): SiteSocialLinksConfig => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return normalizeSiteSocialLinksConfig(DEFAULT_SITE_SOCIAL_LINKS_CONFIG);
    }

    try {
      return normalizeSiteSocialLinksConfig(JSON.parse(trimmed));
    } catch {
      return normalizeSiteSocialLinksConfig(DEFAULT_SITE_SOCIAL_LINKS_CONFIG);
    }
  }

  return normalizeSiteSocialLinksConfig(value);
};

export const serializeSiteSocialLinksConfig = (
  value: SiteSocialLinksConfig,
): string => JSON.stringify(normalizeSiteSocialLinksConfig(value));

export const DEFAULT_SITE_SOCIAL_LINKS_CONFIG_JSON = serializeSiteSocialLinksConfig(
  DEFAULT_SITE_SOCIAL_LINKS_CONFIG,
);

export const getSiteSocialLinksForPlacement = (
  config: SiteSocialLinksConfig,
  placement: SiteSocialLinkPlacement,
): SiteSocialLinkItem[] => {
  if (!config.enabled) {
    return [];
  }

  const placementEnabled =
    placement === "header"
      ? config.headerEnabled
      : placement === "footer"
        ? config.footerEnabled
        : config.pageEnabled;

  if (!placementEnabled) {
    return [];
  }

  return config.items
    .filter((item) => {
      if (!item.enabled || !item.url.trim()) {
        return false;
      }

      if (placement === "header") return item.showInHeader;
      if (placement === "footer") return item.showInFooter;
      return item.showOnPage;
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
};

export const getSiteSocialLinkVisuals = (
  item: SiteSocialLinkItem,
): SiteSocialLinkVisuals => {
  const preset = getSiteSocialLinkPreset(item.presetId);
  const showBackground = item.backgroundMode !== "none";
  const backgroundColor =
    item.backgroundMode === "custom"
      ? normalizeColor(item.backgroundColor, preset.backgroundColor)
      : preset.backgroundColor;
  const iconColor =
    item.iconColorMode === "custom"
      ? normalizeColor(item.iconColor, preset.iconColor)
      : showBackground
        ? preset.iconColor
        : preset.standaloneColor;

  return {
    showBackground,
    backgroundColor,
    iconColor,
    outlineColor: showBackground ? backgroundColor : `${preset.standaloneColor}33`,
  };
};

export const shouldOpenSiteSocialLinkInNewTab = (item: SiteSocialLinkItem) => {
  const url = item.url.trim().toLowerCase();
  if (!item.openInNewTab || !url) {
    return false;
  }

  return !url.startsWith("mailto:") && !url.startsWith("tel:") && !url.startsWith("/");
};

export const formatSiteSocialLinkDisplayUrl = (url: string) => {
  const trimmed = normalizeText(url);
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("mailto:")) {
    return trimmed.replace(/^mailto:/i, "");
  }

  if (trimmed.startsWith("tel:")) {
    return trimmed.replace(/^tel:/i, "");
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.host.replace(/^www\./i, "");
  } catch {
    return trimmed;
  }
};
