const VISITOR_ID_STORAGE_KEY = "siteVisitorId";

const createVisitorId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `visitor-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
};

export const getOrCreateVisitorId = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const existing = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY);
  if (existing && existing.trim()) {
    return existing.trim();
  }

  const nextVisitorId = createVisitorId();
  window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, nextVisitorId);
  return nextVisitorId;
};
