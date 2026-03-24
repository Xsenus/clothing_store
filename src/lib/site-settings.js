import { getPublicSettings } from "@/lib/api-mapping";

export const PUBLIC_SETTINGS_CACHE_KEY = "sitePublicSettings";
export const SITE_BRANDING_UPDATED_EVENT = "site-branding-updated";

let memorySettings = null;
let publicSettingsPromise = null;
let hasLoadedPublicSettings = false;

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
