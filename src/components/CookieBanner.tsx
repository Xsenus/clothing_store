import { useEffect, useMemo, useState } from "react";
import { LegalModal } from "@/components/LegalModal";
import { Button } from "@/components/ui/button";
import {
  acceptCookieConsent,
  hasCookieConsentDecision,
  rejectCookieConsent,
} from "@/lib/cookie-consent";
import { COOKIE_CONSENT_TEXT } from "@/lib/legal-defaults/cookie-consent";
import { fetchPublicLegalText } from "@/lib/site-settings";

const buildCookieSummary = (text: string) => {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Мы используем cookie для корректной работы сайта и улучшения сервиса.";
  }

  const firstSentence = normalized.match(/^.+?[.!?](?:\s|$)/)?.[0]?.trim();
  if (firstSentence && firstSentence.length <= 120) {
    return firstSentence;
  }

  return normalized.length > 120
    ? `${normalized.slice(0, 117).trim()}...`
    : normalized;
};

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState(COOKIE_CONSENT_TEXT);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoaded, setDetailsLoaded] = useState(false);

  const summaryText = useMemo(() => buildCookieSummary(text), [text]);

  useEffect(() => {
    if (!hasCookieConsentDecision()) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!detailsOpen || detailsLoaded) {
      return;
    }

    let mounted = true;
    const load = async () => {
      const nextText = await fetchPublicLegalText("cookie_consent_text");
      if (!mounted) {
        return;
      }

      if (nextText) {
        setText(nextText);
      }
      setDetailsLoaded(true);
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [detailsLoaded, detailsOpen]);

  if (!visible) {
    return null;
  }

  return (
    <>
      <div className="fixed bottom-3 left-3 right-3 z-[100] max-w-[calc(100vw-1.5rem)] border border-white/20 bg-black/92 p-3 text-white shadow-2xl backdrop-blur sm:bottom-4 sm:left-4 sm:right-4 sm:max-w-[calc(100vw-2rem)] md:left-auto md:max-w-md">
        <p className="text-xs leading-relaxed text-white/88 md:text-sm">
          {summaryText}
        </p>
        <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          <Button
            variant="ghost"
            className="h-9 w-full rounded-none px-3 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:bg-white/10 hover:text-white sm:w-auto"
            onClick={() => setDetailsOpen(true)}
          >
            Подробнее
          </Button>
          <Button
            variant="outline"
            className="h-9 w-full rounded-none border-white/35 bg-transparent px-3 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:bg-white/10 hover:text-white sm:w-auto"
            onClick={() => {
              rejectCookieConsent();
              setVisible(false);
            }}
          >
            Отклонить
          </Button>
          <Button
            className="h-9 w-full rounded-none bg-white px-3 text-xs font-semibold uppercase tracking-[0.14em] text-black hover:bg-gray-200 sm:w-auto"
            onClick={() => {
              acceptCookieConsent();
              setVisible(false);
            }}
          >
            Принять
          </Button>
        </div>
      </div>
      <LegalModal
        isOpen={detailsOpen}
        onClose={setDetailsOpen}
        title="Использование cookie"
        content={text}
      />
    </>
  );
}
