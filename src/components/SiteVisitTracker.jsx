import { useEffect } from "react";
import { useLocation } from "react-router";

import { apiRequest } from "@/lib/public-http";
import { getOrCreateVisitorId } from "@/lib/visitor-id";

const LAST_TRACKED_VISIT_KEY = "fashion_demon_last_site_visit_track";
const STRICT_MODE_DEDUP_WINDOW_MS = 2000;

const shouldTrackLocation = (pathname, search) => {
  if (!pathname || pathname.startsWith("/admin")) {
    return false;
  }

  if (pathname === "/profile") {
    const params = new URLSearchParams(search);
    if (params.get("tab") === "admin") {
      return false;
    }
  }

  return true;
};

const shouldSkipRecentDuplicate = (trackKey) => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const rawValue = window.sessionStorage.getItem(LAST_TRACKED_VISIT_KEY);
    if (!rawValue) {
      return false;
    }

    const parsedValue = JSON.parse(rawValue);
    const lastKey = typeof parsedValue?.key === "string" ? parsedValue.key : "";
    const trackedAt = Number(parsedValue?.trackedAt ?? 0);
    return (
      lastKey === trackKey &&
      Date.now() - trackedAt <= STRICT_MODE_DEDUP_WINDOW_MS
    );
  } catch {
    return false;
  }
};

const persistTrackedVisit = (trackKey) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      LAST_TRACKED_VISIT_KEY,
      JSON.stringify({
        key: trackKey,
        trackedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore storage write failures and keep tracking lightweight.
  }
};

const scheduleVisitTracking = (callback) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(callback, { timeout: 1500 });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = window.setTimeout(callback, 450);
  return () => window.clearTimeout(timeoutId);
};

export default function SiteVisitTracker() {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname || "/";
    const search = location.search || "";
    if (!shouldTrackLocation(pathname, search)) {
      return undefined;
    }

    const trackKey = `${pathname}${search}`;
    if (shouldSkipRecentDuplicate(trackKey)) {
      return undefined;
    }

    persistTrackedVisit(trackKey);
    const visitorId = getOrCreateVisitorId();

    return scheduleVisitTracking(() => {
      void apiRequest("/tracking/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId,
          path: trackKey,
        }),
        keepalive: true,
      }).catch(() => {
        // Site visit tracking should never break navigation.
      });
    });
  }, [location.pathname, location.search]);

  return null;
}
