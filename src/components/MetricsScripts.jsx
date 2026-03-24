import { useEffect } from "react";
import { fetchPublicSettings } from "@/lib/site-settings";
import {
  COOKIE_CONSENT_UPDATED_EVENT,
  hasCookieConsent,
} from "@/lib/cookie-consent";

const METRIC_KEYS = [
  ["metrics_yandex_metrika_enabled", "metrics_yandex_metrika_code"],
  ["metrics_google_analytics_enabled", "metrics_google_analytics_code"],
  ["metrics_vk_pixel_enabled", "metrics_vk_pixel_code"],
];

const isEnabled = (value) => {
  const normalized = String(value || "false").toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on";
};

const injectSnippet = (snippet, key) => {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = snippet;

  wrapper.querySelectorAll("script").forEach((script, index) => {
    const next = document.createElement("script");
    Array.from(script.attributes).forEach((attr) =>
      next.setAttribute(attr.name, attr.value),
    );
    next.text = script.text;
    next.dataset.metricKey = `${key}-${index}`;
    document.head.appendChild(next);
  });
};

export default function MetricsScripts() {
  useEffect(() => {
    let mounted = true;
    const injected = [];
    const injectedKeys = new Set();

    const load = async () => {
      if (!hasCookieConsent()) {
        return;
      }

      const settings = await fetchPublicSettings();
      if (!mounted) return;

      METRIC_KEYS.forEach(([enabledKey, codeKey]) => {
        if (!isEnabled(settings?.[enabledKey])) return;
        const code = settings?.[codeKey];
        if (!code || typeof code !== "string" || injectedKeys.has(codeKey)) {
          return;
        }

        injectSnippet(code, codeKey);
        injectedKeys.add(codeKey);
        injected.push(codeKey);
      });
    };

    void load();

    const handleConsentAccepted = () => {
      void load();
    };

    window.addEventListener(
      COOKIE_CONSENT_UPDATED_EVENT,
      handleConsentAccepted,
    );

    return () => {
      mounted = false;
      window.removeEventListener(
        COOKIE_CONSENT_UPDATED_EVENT,
        handleConsentAccepted,
      );
      injected.forEach((key) => {
        document
          .querySelectorAll(`script[data-metric-key^="${key}-"]`)
          .forEach((node) => node.remove());
      });
    };
  }, []);

  return null;
}
