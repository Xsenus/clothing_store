export const COOKIE_CONSENT_KEY = "cookieConsentAccepted";
export const COOKIE_CONSENT_UPDATED_EVENT = "cookie-consent-updated";

export const hasCookieConsent = () => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(COOKIE_CONSENT_KEY) === "1";
  } catch {
    return false;
  }
};

export const acceptCookieConsent = () => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, "1");
  } catch {
    // Ignore storage failures and still notify listeners.
  }

  window.dispatchEvent(
    new CustomEvent(COOKIE_CONSENT_UPDATED_EVENT, {
      detail: { accepted: true },
    }),
  );
};
