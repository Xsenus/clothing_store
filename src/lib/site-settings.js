import { FLOW } from "@/lib/api-mapping";

export const PUBLIC_SETTINGS_CACHE_KEY = "sitePublicSettings";
export const SITE_BRANDING_UPDATED_EVENT = "site-branding-updated";

export const getCachedPublicSettings = () => {
  try {
    const raw = localStorage.getItem(PUBLIC_SETTINGS_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const setCachedPublicSettings = (settings) => {
  const normalized = settings && typeof settings === "object" ? settings : {};
  localStorage.setItem(PUBLIC_SETTINGS_CACHE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(SITE_BRANDING_UPDATED_EVENT, { detail: normalized }));
  return normalized;
};

export const fetchPublicSettings = async () => {
  try {
    const settings = await FLOW.getPublicSettings();
    const normalized = settings && typeof settings === "object" ? settings : {};
    return setCachedPublicSettings(normalized);
  } catch {
    return getCachedPublicSettings();
  }
};
