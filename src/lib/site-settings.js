export const PUBLIC_SETTINGS_CACHE_KEY = "sitePublicSettings";
export const PUBLIC_LEGAL_SETTINGS_CACHE_PREFIX = "sitePublicLegal:";
export const SITE_BRANDING_UPDATED_EVENT = "site-branding-updated";

let memorySettings = null;
let publicSettingsPromise = null;
let getPublicSettingsPromise = null;
let hasLoadedPublicSettings = false;
let getPublicLegalDocumentPromise = null;
const legalDocumentCache = new Map();
const legalDocumentPromises = new Map();

const loadGetPublicSettings = async () => {
  getPublicSettingsPromise ??= import("@/lib/public-settings-api").then(
    (module) => module.getPublicSettings,
  );
  return getPublicSettingsPromise;
};

const loadGetPublicLegalDocument = async () => {
  getPublicLegalDocumentPromise ??= import("@/lib/public-settings-api").then(
    (module) => module.getPublicLegalDocument,
  );
  return getPublicLegalDocumentPromise;
};

const getLegalCacheKey = (key) =>
  `${PUBLIC_LEGAL_SETTINGS_CACHE_PREFIX}${String(key || "").trim()}`;

export const getCachedPublicSettings = () => {
  if (memorySettings) {
    return memorySettings;
  }

  try {
    const raw = localStorage.getItem(PUBLIC_SETTINGS_CACHE_KEY);
    memorySettings = raw ? JSON.parse(raw) : {};
    return memorySettings;
  } catch {
    memorySettings = {};
    return {};
  }
};

export const setCachedPublicSettings = (settings) => {
  const normalized = settings && typeof settings === "object" ? settings : {};
  memorySettings = normalized;
  localStorage.setItem(PUBLIC_SETTINGS_CACHE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(SITE_BRANDING_UPDATED_EVENT, { detail: normalized }));
  return normalized;
};

export const fetchPublicSettings = async ({ force = false } = {}) => {
  if (!force && hasLoadedPublicSettings && memorySettings) {
    return memorySettings;
  }

  if (!force && publicSettingsPromise) {
    return publicSettingsPromise;
  }

  publicSettingsPromise = (async () => {
    try {
      const getPublicSettings = await loadGetPublicSettings();
      const settings = await getPublicSettings();
      const normalized = settings && typeof settings === "object" ? settings : {};
      hasLoadedPublicSettings = true;
      return setCachedPublicSettings(normalized);
    } catch {
      return getCachedPublicSettings();
    } finally {
      publicSettingsPromise = null;
    }
  })();

  return publicSettingsPromise;
};

export const getCachedPublicLegalText = (key) => {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) {
    return "";
  }

  if (legalDocumentCache.has(normalizedKey)) {
    return legalDocumentCache.get(normalizedKey) || "";
  }

  try {
    const raw = localStorage.getItem(getLegalCacheKey(normalizedKey));
    const value = raw ? JSON.parse(raw) : "";
    const normalizedValue = typeof value === "string" ? value : "";
    legalDocumentCache.set(normalizedKey, normalizedValue);
    return normalizedValue;
  } catch {
    legalDocumentCache.set(normalizedKey, "");
    return "";
  }
};

export const setCachedPublicLegalText = (key, value) => {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) {
    return "";
  }

  const normalizedValue = typeof value === "string" ? value : "";
  legalDocumentCache.set(normalizedKey, normalizedValue);

  try {
    localStorage.setItem(
      getLegalCacheKey(normalizedKey),
      JSON.stringify(normalizedValue),
    );
  } catch {
    // Ignore storage write failures and keep legal text fetch resilient.
  }

  return normalizedValue;
};

export const fetchPublicLegalText = async (key, { force = false } = {}) => {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) {
    return "";
  }

  if (!force) {
    const cachedValue = getCachedPublicLegalText(normalizedKey);
    if (cachedValue) {
      return cachedValue;
    }
  }

  if (!force && legalDocumentPromises.has(normalizedKey)) {
    return legalDocumentPromises.get(normalizedKey);
  }

  const promise = (async () => {
    try {
      const getPublicLegalDocument = await loadGetPublicLegalDocument();
      const payload = await getPublicLegalDocument(normalizedKey);
      return setCachedPublicLegalText(normalizedKey, payload?.value || "");
    } catch {
      return getCachedPublicLegalText(normalizedKey);
    } finally {
      legalDocumentPromises.delete(normalizedKey);
    }
  })();

  legalDocumentPromises.set(normalizedKey, promise);
  return promise;
};
