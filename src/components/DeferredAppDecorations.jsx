import React, { useEffect, useState } from "react";
import CookieBanner from "@/components/CookieBanner";
import MetricsScripts from "@/components/MetricsScripts";
import SafeRenderBoundary from "@/components/SafeRenderBoundary";
import SiteBranding from "@/components/SiteBranding";
import SiteVisitTracker from "@/components/SiteVisitTracker";
import { Toaster as Sonner } from "@/components/ui/sonner";

const scheduleIdleLoad = (callback, timeout = 1200) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = window.setTimeout(callback, 300);
  return () => window.clearTimeout(timeoutId);
};

export default function DeferredAppDecorations() {
  const [isShellReady, setIsShellReady] = useState(false);
  const [isCookieReady, setIsCookieReady] = useState(false);

  useEffect(() => {
    const cancelIdle = scheduleIdleLoad(() => setIsShellReady(true));
    const cookieTimeoutId = window.setTimeout(() => setIsCookieReady(true), 1600);

    return () => {
      cancelIdle();
      window.clearTimeout(cookieTimeoutId);
    };
  }, []);

  if (!isShellReady && !isCookieReady) {
    return null;
  }

  return (
    <>
      {isShellReady ? (
        <>
          <SafeRenderBoundary source="sonner">
            <Sonner />
          </SafeRenderBoundary>
          <SafeRenderBoundary source="metrics-scripts">
            <MetricsScripts />
          </SafeRenderBoundary>
          <SafeRenderBoundary source="site-branding">
            <SiteBranding />
          </SafeRenderBoundary>
          <SafeRenderBoundary source="site-visit-tracker">
            <SiteVisitTracker />
          </SafeRenderBoundary>
        </>
      ) : null}
      {isCookieReady ? (
        <SafeRenderBoundary source="cookie-banner">
          <CookieBanner />
        </SafeRenderBoundary>
      ) : null}
    </>
  );
}
