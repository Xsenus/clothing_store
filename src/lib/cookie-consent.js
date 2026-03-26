import { apiRequest } from "@/lib/public-http";
import { getOrCreateVisitorId } from "@/lib/visitor-id";

export const COOKIE_CONSENT_KEY = "cookieConsentAccepted";
export const COOKIE_CONSENT_UPDATED_EVENT = "cookie-consent-updated";

export const getCookieConsentDecision = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (storedValue === "1" || storedValue === "accepted") {
      return "accepted";
    }

    if (storedValue === "0" || storedValue === "rejected") {
      return "rejected";
    }
  } catch {
    return null;
  }

  return null;
};

export const hasCookieConsentDecision = () => getCookieConsentDecision() !== null;

export const hasCookieConsent = () => {
  return getCookieConsentDecision() === "accepted";
};

const trackCookieConsentDecision = (decision) => {
  if (typeof window === "undefined") {
    return;
  }

  const visitorId = getOrCreateVisitorId();
  void apiRequest("/tracking/cookie-consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      visitorId: visitorId ?? null,
      decision,
    }),
    keepalive: true,
  }).catch(() => {
    // Cookie consent tracking should never affect the banner interaction.
  });
};

const persistCookieConsentDecision = (decision) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, decision);
  } catch {
    // Ignore storage failures and still notify listeners.
  }

  window.dispatchEvent(
    new CustomEvent(COOKIE_CONSENT_UPDATED_EVENT, {
      detail: {
        accepted: decision === "accepted",
        decision,
      },
    }),
  );

  trackCookieConsentDecision(decision);
};

export const acceptCookieConsent = () => {
  persistCookieConsentDecision("accepted");
};

export const rejectCookieConsent = () => {
  persistCookieConsentDecision("rejected");
};
