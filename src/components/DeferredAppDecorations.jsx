import React, { lazy, Suspense, useEffect, useState } from "react";

const CookieBanner = lazy(() => import("@/components/CookieBanner"));
const MetricsScripts = lazy(() => import("@/components/MetricsScripts"));
const SiteBranding = lazy(() => import("@/components/SiteBranding"));
const SiteVisitTracker = lazy(() => import("@/components/SiteVisitTracker"));
const Sonner = lazy(() =>
  import("@/components/ui/sonner").then((module) => ({
    default: module.Toaster,
  })),
);

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
    <Suspense fallback={null}>
      {isShellReady ? (
        <>
          <Sonner />
          <MetricsScripts />
          <SiteBranding />
          <SiteVisitTracker />
        </>
      ) : null}
      {isCookieReady ? <CookieBanner /> : null}
    </Suspense>
  );
}
