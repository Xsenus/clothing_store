export const HOME_TRUST_SETTINGS_KEYS = [
  "home_trust_hero_json",
  "home_trust_benefits_json",
  "home_trust_about_json",
  "home_trust_reviews_json",
  "home_about_nav_to_page_enabled",
];

export const HOME_TRUST_ICON_OPTIONS = [
  "flame",
  "shirt",
  "truck",
  "shield",
  "sparkles",
  "refresh",
  "badge-check",
  "message",
];

export const HOME_TRUST_BENEFIT_LAYOUT_OPTIONS = ["left", "center", "right"];

export const DEFAULT_HOME_TRUST_HERO = {
  enabled: true,
  eyebrow: "",
  eyebrowEnabled: false,
  title: "Смелость - это стиль",
  subtitle: "Переосмысляем уличную моду с демоническим характером",
  primaryCtaText: "Смотреть новинки",
  primaryCtaUrl: "/catalog?sort=new",
  secondaryCtaText: "Выбрать свой образ",
  secondaryCtaUrl: "/catalog",
  secondaryCtaEnabled: true,
  metaText: "Доставка 1-7 дней в среднем • Бесплатно от 5000 ₽ • Возврат 14 дней",
};

export const DEFAULT_HOME_TRUST_BENEFITS = {
  enabled: true,
  title: "Почему выбирают Fashion Demon",
  items: [
    {
      id: "bold-design",
      icon: "flame",
      layout: "left",
      title: "Смелый дизайн",
      description: "Уникальные принты, крой и детали, которых нет у других.",
      sortOrder: 10,
      enabled: true,
    },
    {
      id: "real-quality",
      icon: "shirt",
      layout: "center",
      title: "Реальное качество",
      description: "Плотные ткани, аккуратная фурнитура и пошив. Носится долго.",
      sortOrder: 20,
      enabled: true,
    },
    {
      id: "honest-delivery",
      icon: "truck",
      layout: "right",
      title: "Честные сроки",
      description: "Понятная доставка без лишних обещаний. Средний срок - 1-7 дней.",
      sortOrder: 30,
      enabled: true,
    },
    {
      id: "easy-return",
      icon: "shield",
      layout: "left",
      title: "Легко купить и вернуть",
      description: "Удобная оплата и возврат в течение 14 дней.",
      sortOrder: 40,
      enabled: true,
    },
  ],
};

export const DEFAULT_HOME_TRUST_ABOUT = {
  enabled: true,
  eyebrow: "О нас",
  title: "Fashion Demon - магазин для тех, кто выбирает характер",
  text:
    "Мы собираем выразительный streetwear с акцентом на посадку, материалы и детали. Каждая вещь должна выглядеть уверенно в образе и спокойно переживать повседневную носку.",
  highlights: [
    {
      id: "real-store",
      title: "Реальный магазин",
      description: "Принимаем заказы, отвечаем на вопросы и сопровождаем покупку до получения.",
      enabled: true,
      sortOrder: 10,
    },
    {
      id: "clear-terms",
      title: "Понятные условия",
      description: "Сроки, доставка, оплата и возврат описаны заранее, без мелкого шрифта.",
      enabled: true,
      sortOrder: 20,
    },
    {
      id: "support",
      title: "Поддержка",
      description: "Если нужен размер, статус заказа или помощь с возвратом - мы на связи.",
      enabled: true,
      sortOrder: 30,
    },
  ],
};

export const DEFAULT_HOME_TRUST_REVIEWS = {
  enabled: true,
  title: "Что говорят покупатели",
  description: "Отзывы добавляются вручную из открытых источников. У каждого отзыва есть ссылка на оригинал.",
  sourceLabel: "Отзывы взяты с Otzovik",
  items: [
    {
      id: "otzovik-18405429",
      text: "Заказывала пару вещичек (зипка + тишка). Мне все очень понравилось! доставка относительно быстрая. По размерам все отлично подошло, качество хорошее.",
      author: "polporer",
      location: "Россия • 6 июн 2026",
      source: "Otzovik",
      sourceUrl: "https://otzovik.com/review_18405429.html",
      sortOrder: 10,
      enabled: true,
    },
    {
      id: "otzovik-18396489",
      text: "Покупаю давно тут еще со времён когда в тг и озоне были вещи, качество нормальное, цены низкие, доставка быстрая;",
      author: "dianka m",
      location: "Россия • 3 июн 2026",
      source: "Otzovik",
      sourceUrl: "https://otzovik.com/review_18396489.html",
      sortOrder: 20,
      enabled: true,
    },
  ],
};

export const DEFAULT_HOME_TRUST_SETTINGS = {
  home_trust_hero_json: JSON.stringify(DEFAULT_HOME_TRUST_HERO),
  home_trust_benefits_json: JSON.stringify(DEFAULT_HOME_TRUST_BENEFITS),
  home_trust_about_json: JSON.stringify(DEFAULT_HOME_TRUST_ABOUT),
  home_trust_reviews_json: JSON.stringify(DEFAULT_HOME_TRUST_REVIEWS),
  home_about_nav_to_page_enabled: "false",
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseObjectSetting = (rawValue, fallback) => {
  if (isPlainObject(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return isPlainObject(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const normalizeBoolean = (value, fallback = true) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    switch (value.trim().toLowerCase()) {
      case "1":
      case "true":
      case "yes":
      case "on":
        return true;
      case "0":
      case "false":
      case "no":
      case "off":
        return false;
      default:
        return fallback;
    }
  }

  return fallback;
};

const normalizeString = (value, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
};

const normalizeOptionalString = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeUrl = (value, fallback = "") => {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) return fallback;
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }

  return fallback;
};

const normalizeSortOrder = (value, fallback) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const normalizeItemId = (value, fallback) => {
  const trimmed = normalizeOptionalString(value);
  return trimmed || fallback;
};

const normalizeIcon = (value, fallback = "sparkles") => {
  const trimmed = normalizeOptionalString(value);
  return HOME_TRUST_ICON_OPTIONS.includes(trimmed) ? trimmed : fallback;
};

const normalizeBenefitLayout = (value, fallback = "left") => {
  const trimmed = normalizeOptionalString(value);
  return HOME_TRUST_BENEFIT_LAYOUT_OPTIONS.includes(trimmed) ? trimmed : fallback;
};

const sortVisibleItems = (items) =>
  [...items]
    .filter((item) => item.enabled !== false)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

const withBenefitFallbackLayouts = (items) =>
  items.map((item, index) => ({
    ...item,
    layout: normalizeBenefitLayout(
      item.layout,
      HOME_TRUST_BENEFIT_LAYOUT_OPTIONS[index % HOME_TRUST_BENEFIT_LAYOUT_OPTIONS.length],
    ),
  }));

export const parseHomeTrustHero = (rawValue) => {
  const source = parseObjectSetting(rawValue, DEFAULT_HOME_TRUST_HERO);
  return {
    enabled: normalizeBoolean(source.enabled, DEFAULT_HOME_TRUST_HERO.enabled),
    eyebrow: normalizeOptionalString(source.eyebrow),
    eyebrowEnabled: normalizeBoolean(source.eyebrowEnabled, DEFAULT_HOME_TRUST_HERO.eyebrowEnabled),
    title: normalizeString(source.title, DEFAULT_HOME_TRUST_HERO.title),
    subtitle: normalizeString(source.subtitle, DEFAULT_HOME_TRUST_HERO.subtitle),
    primaryCtaText: normalizeString(source.primaryCtaText, DEFAULT_HOME_TRUST_HERO.primaryCtaText),
    primaryCtaUrl: normalizeUrl(source.primaryCtaUrl, DEFAULT_HOME_TRUST_HERO.primaryCtaUrl),
    secondaryCtaText: normalizeString(source.secondaryCtaText, DEFAULT_HOME_TRUST_HERO.secondaryCtaText),
    secondaryCtaUrl: normalizeUrl(source.secondaryCtaUrl, DEFAULT_HOME_TRUST_HERO.secondaryCtaUrl),
    secondaryCtaEnabled: normalizeBoolean(
      source.secondaryCtaEnabled,
      DEFAULT_HOME_TRUST_HERO.secondaryCtaEnabled,
    ),
    metaText: normalizeString(source.metaText, DEFAULT_HOME_TRUST_HERO.metaText),
  };
};

export const parseHomeTrustBenefits = (rawValue) => {
  const source = parseObjectSetting(rawValue, DEFAULT_HOME_TRUST_BENEFITS);
  const rawItems = Array.isArray(source.items) ? source.items : DEFAULT_HOME_TRUST_BENEFITS.items;
  const items = rawItems.map((item, index) => {
    const fallback = DEFAULT_HOME_TRUST_BENEFITS.items[index] || DEFAULT_HOME_TRUST_BENEFITS.items[0];
    return {
      id: normalizeItemId(item?.id, fallback.id || `benefit-${index + 1}`),
      icon: normalizeIcon(item?.icon, fallback.icon),
      layout: normalizeOptionalString(item?.layout),
      title: normalizeString(item?.title, fallback.title),
      description: normalizeString(item?.description, fallback.description),
      sortOrder: normalizeSortOrder(item?.sortOrder, fallback.sortOrder ?? (index + 1) * 10),
      enabled: normalizeBoolean(item?.enabled, fallback.enabled !== false),
    };
  });

  const allItems = withBenefitFallbackLayouts(
    [...items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
  );

  return {
    enabled: normalizeBoolean(source.enabled, DEFAULT_HOME_TRUST_BENEFITS.enabled),
    title: normalizeString(source.title, DEFAULT_HOME_TRUST_BENEFITS.title),
    items: withBenefitFallbackLayouts(sortVisibleItems(items)),
    allItems,
  };
};

export const parseHomeTrustAbout = (rawValue) => {
  const source = parseObjectSetting(rawValue, DEFAULT_HOME_TRUST_ABOUT);
  const rawHighlights = Array.isArray(source.highlights)
    ? source.highlights
    : DEFAULT_HOME_TRUST_ABOUT.highlights;
  const highlights = rawHighlights.map((item, index) => {
    const fallback = DEFAULT_HOME_TRUST_ABOUT.highlights[index] || DEFAULT_HOME_TRUST_ABOUT.highlights[0];
    return {
      id: normalizeItemId(item?.id, fallback.id || `highlight-${index + 1}`),
      title: normalizeString(item?.title, fallback.title),
      description: normalizeString(item?.description, fallback.description),
      sortOrder: normalizeSortOrder(item?.sortOrder, fallback.sortOrder ?? (index + 1) * 10),
      enabled: normalizeBoolean(item?.enabled, fallback.enabled !== false),
    };
  });

  return {
    enabled: normalizeBoolean(source.enabled, DEFAULT_HOME_TRUST_ABOUT.enabled),
    eyebrow: normalizeString(source.eyebrow, DEFAULT_HOME_TRUST_ABOUT.eyebrow),
    title: normalizeString(source.title, DEFAULT_HOME_TRUST_ABOUT.title),
    text: normalizeString(source.text, DEFAULT_HOME_TRUST_ABOUT.text),
    highlights: sortVisibleItems(highlights),
    allHighlights: highlights.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
  };
};

export const parseHomeTrustReviews = (rawValue) => {
  const source = parseObjectSetting(rawValue, DEFAULT_HOME_TRUST_REVIEWS);
  const rawItems = Array.isArray(source.items) ? source.items : DEFAULT_HOME_TRUST_REVIEWS.items;
  const items = rawItems.map((item, index) => {
    const fallback = DEFAULT_HOME_TRUST_REVIEWS.items[index] || DEFAULT_HOME_TRUST_REVIEWS.items[0];
    return {
      id: normalizeItemId(item?.id, fallback.id || `review-${index + 1}`),
      text: normalizeString(item?.text, fallback.text),
      author: normalizeString(item?.author, fallback.author),
      location: normalizeOptionalString(item?.location),
      source: normalizeString(item?.source, fallback.source || "Otzovik"),
      sourceUrl: normalizeUrl(item?.sourceUrl, ""),
      sortOrder: normalizeSortOrder(item?.sortOrder, fallback.sortOrder ?? (index + 1) * 10),
      enabled: normalizeBoolean(item?.enabled, fallback.enabled !== false),
    };
  });

  return {
    enabled: normalizeBoolean(source.enabled, DEFAULT_HOME_TRUST_REVIEWS.enabled),
    title: normalizeString(source.title, DEFAULT_HOME_TRUST_REVIEWS.title),
    description: normalizeOptionalString(source.description),
    sourceLabel: normalizeString(source.sourceLabel, DEFAULT_HOME_TRUST_REVIEWS.sourceLabel),
    items: sortVisibleItems(items),
    allItems: items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
  };
};

export const parseHomeTrustSettings = (settings = {}) => ({
  hero: parseHomeTrustHero(settings.home_trust_hero_json),
  benefits: parseHomeTrustBenefits(settings.home_trust_benefits_json),
  about: parseHomeTrustAbout(settings.home_trust_about_json),
  reviews: parseHomeTrustReviews(settings.home_trust_reviews_json),
});

export const serializeHomeTrustSetting = (value) => JSON.stringify(value, null, 2);
