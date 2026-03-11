export const DEFAULT_SITE_TITLE = "fashiondemon";
export const DEFAULT_SITE_DESCRIPTION =
  "fashiondemon - магазин одежды и стритвира с новыми коллекциями, актуальными моделями и доставкой по России.";

const LEGACY_SITE_TITLES = new Set(["Fashiondemon"]);

export const normalizeSiteTitle = (value) => {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    return DEFAULT_SITE_TITLE;
  }

  if (LEGACY_SITE_TITLES.has(normalized)) {
    return DEFAULT_SITE_TITLE;
  }

  return normalized;
};

export const buildDocumentTitle = (pageTitle, siteTitle = DEFAULT_SITE_TITLE) => {
  const baseTitle = normalizeSiteTitle(siteTitle);
  const normalizedPageTitle = typeof pageTitle === "string" ? pageTitle.trim() : "";

  if (!normalizedPageTitle || normalizedPageTitle.toLowerCase() === baseTitle.toLowerCase()) {
    return baseTitle;
  }

  return `${normalizedPageTitle} | ${baseTitle}`;
};

export const resolveUrl = (value = "/") => {
  if (typeof window === "undefined") {
    return value || "";
  }

  try {
    return new URL(value || "/", window.location.origin).toString();
  } catch {
    return "";
  }
};

export const stripHtml = (value = "") =>
  String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const truncateText = (value = "", maxLength = 160) => {
  const normalized = stripHtml(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
};
