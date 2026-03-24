import { useEffect, useMemo, useState } from "react";
import { LegalModal } from "@/components/LegalModal";
import { Button } from "@/components/ui/button";
import {
  acceptCookieConsent,
  hasCookieConsent,
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
    if (!hasCookieConsent()) {
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
      <div className="fixed bottom-4 left-4 right-4 z-[100] border border-white/20 bg-black/92 p-3 text-white shadow-2xl backdrop-blur md:left-auto md:max-w-md">
        <p className="text-xs leading-relaxed text-white/88 md:text-sm">
          {summaryText}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="ghost"
            className="h-9 rounded-none px-3 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:bg-white/10 hover:text-white"
            onClick={() => setDetailsOpen(true)}
          >
            Подробнее
          </Button>
          <Button
            variant="outline"
            className="h-9 rounded-none border-white/35 bg-transparent px-3 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:bg-white/10 hover:text-white"
            onClick={() => setVisible(false)}
          >
            Позже
          </Button>
          <Button
            className="h-9 rounded-none bg-white px-3 text-xs font-semibold uppercase tracking-[0.14em] text-black hover:bg-gray-200"
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
