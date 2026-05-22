import { getBrowserStorageItem, setBrowserStorageItem } from "@/lib/browser-storage";
import { hasCookieConsent } from "@/lib/cookie-consent";
import { getOrCreateVisitorId } from "@/lib/visitor-id";

const TOP_MAIL_RU_COUNTER_ID = "3768010";
const TOP_MAIL_RU_SCRIPT_ID = "tmr-code";
const TOP_MAIL_RU_SCRIPT_SRC = "https://top-fwz1.mail.ru/js/code.js";
const TOP_MAIL_RU_ORDER_GOAL = "order";
const TRACKED_ORDERS_STORAGE_KEY = "topMailRuTrackedOrders";
const PAGE_VIEW_DEDUP_MS = 1000;

type TopMailRuHit = Record<string, unknown> & {
  id: string;
  type: "pageView" | "reachGoal";
};

declare global {
  interface Window {
    _tmr?: TopMailRuHit[];
  }
}

let lastPageViewKey = "";
let lastPageViewAt = 0;

const getQueue = () => {
  if (typeof window === "undefined") {
    return null;
  }

  window._tmr = window._tmr || [];
  return window._tmr;
};

const getVisitorId = (providedVisitorId?: string | null) => {
  const normalizedVisitorId = String(providedVisitorId || "").trim();
  return normalizedVisitorId || getOrCreateVisitorId();
};

const ensureTopMailRuScript = () => {
  if (typeof document === "undefined") {
    return;
  }

  if (document.getElementById(TOP_MAIL_RU_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = TOP_MAIL_RU_SCRIPT_ID;
  script.type = "text/javascript";
  script.async = true;
  script.src = TOP_MAIL_RU_SCRIPT_SRC;

  const firstScript = document.getElementsByTagName("script")[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
    return;
  }

  document.head.appendChild(script);
};

const withVisitorIdentity = (hit: TopMailRuHit, visitorId?: string | null) => {
  const resolvedVisitorId = getVisitorId(visitorId);
  if (!resolvedVisitorId) {
    return hit;
  }

  return {
    ...hit,
    pid: resolvedVisitorId,
    userid: resolvedVisitorId,
  };
};

const normalizeMoneyValue = (value?: number | string | null) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return Math.round(numericValue * 100) / 100;
};

const readTrackedOrders = () => {
  try {
    const rawValue = getBrowserStorageItem(TRACKED_ORDERS_STORAGE_KEY, "session");
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsedValue)
      ? parsedValue.filter((value) => typeof value === "string")
      : [];
  } catch {
    return [];
  }
};

const rememberTrackedOrder = (orderKey: string) => {
  try {
    const trackedOrders = readTrackedOrders();
    const nextTrackedOrders = [
      orderKey,
      ...trackedOrders.filter((value) => value !== orderKey),
    ].slice(0, 50);

    setBrowserStorageItem(
      TRACKED_ORDERS_STORAGE_KEY,
      JSON.stringify(nextTrackedOrders),
      "session",
    );
  } catch {
    // Ignore storage failures: analytics must never affect checkout.
  }
};

export const trackTopMailRuPageView = ({
  url,
  visitorId,
}: {
  url?: string | null;
  visitorId?: string | null;
} = {}) => {
  if (typeof window === "undefined" || !hasCookieConsent()) {
    return false;
  }

  const queue = getQueue();
  if (!queue) {
    return false;
  }

  const normalizedUrl = String(url || window.location.href).trim();
  const dedupKey = normalizedUrl || window.location.href;
  const now = Date.now();
  if (lastPageViewKey === dedupKey && now - lastPageViewAt <= PAGE_VIEW_DEDUP_MS) {
    return false;
  }

  lastPageViewKey = dedupKey;
  lastPageViewAt = now;

  queue.push(withVisitorIdentity({
    id: TOP_MAIL_RU_COUNTER_ID,
    type: "pageView",
    start: now,
    url: normalizedUrl,
  }, visitorId));

  ensureTopMailRuScript();
  return true;
};

export const trackTopMailRuOrder = ({
  orderId,
  orderNumber,
  value,
  visitorId,
}: {
  orderId?: string | number | null;
  orderNumber?: string | number | null;
  value?: number | string | null;
  visitorId?: string | null;
} = {}) => {
  if (typeof window === "undefined" || !hasCookieConsent()) {
    return false;
  }

  const orderKey = String(orderId || orderNumber || "").trim();
  if (orderKey && readTrackedOrders().includes(orderKey)) {
    return false;
  }

  const queue = getQueue();
  if (!queue) {
    return false;
  }

  const hit: TopMailRuHit = {
    id: TOP_MAIL_RU_COUNTER_ID,
    type: "reachGoal",
    goal: TOP_MAIL_RU_ORDER_GOAL,
  };

  const normalizedValue = normalizeMoneyValue(value);
  if (normalizedValue !== null) {
    hit.value = normalizedValue;
  }

  queue.push(withVisitorIdentity(hit, visitorId));
  ensureTopMailRuScript();

  if (orderKey) {
    rememberTrackedOrder(orderKey);
  }

  return true;
};
