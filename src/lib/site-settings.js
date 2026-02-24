import { FLOW } from "@/lib/api-mapping";

const key = "sitePublicSettings";

export const getCachedPublicSettings = () => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const fetchPublicSettings = async () => {
  try {
    const settings = await FLOW.getPublicSettings();
    const normalized = settings && typeof settings === "object" ? settings : {};
    localStorage.setItem(key, JSON.stringify(normalized));
    return normalized;
  } catch {
    return getCachedPublicSettings();
  }
};

