import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";

const resetWindowScroll = () => {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });

  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });

  window.setTimeout(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, 80);
};

export default function RouteScrollManager() {
  const { pathname, search, hash } = useLocation();
  const navigationType = useNavigationType();
  const previousRouteRef = useRef(null);

  useLayoutEffect(() => {
    if (typeof window === "undefined" || !("scrollRestoration" in window.history)) {
      return undefined;
    }

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined" || hash) {
      return;
    }

    const nextRoute = `${pathname}${search}`;
    const previousRoute = previousRouteRef.current;
    previousRouteRef.current = nextRoute;

    const previousPathname = previousRoute?.split("?")[0] ?? null;
    const pathnameChanged = previousPathname !== pathname;
    const pushedToNewEntry = navigationType === "PUSH";
    const initialLoad = previousRoute === null;

    if (initialLoad || pathnameChanged || pushedToNewEntry) {
      resetWindowScroll();
    }
  }, [pathname, search, hash, navigationType]);

  return null;
}
