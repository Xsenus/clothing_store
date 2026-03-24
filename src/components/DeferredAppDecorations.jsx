import React, { lazy, Suspense, useEffect, useState } from "react";

const CookieBanner = lazy(() => import("@/components/CookieBanner"));
const MetricsScripts = lazy(() => import("@/components/MetricsScripts"));
const SiteBranding = lazy(() => import("@/components/SiteBranding"));
const Sonner = lazy(() =>
  import("@/components/ui/sonner").then((module) => ({ default: module.Toaster })),
);

const scheduleIdleLoad = (callback) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(callback, { timeout: 1200 });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = window.setTimeout(callback, 300);
  return () => window.clearTimeout(timeoutId);
};

export default function DeferredAppDecorations() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => scheduleIdleLoad(() => setIsReady(true)), []);

  if (!isReady) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <Sonner />
      <CookieBanner />
      <MetricsScripts />
      <SiteBranding />
    </Suspense>
  );
}
