import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router";

export default function RouteScrollManager() {
  const { pathname } = useLocation();
  const previousPathnameRef = useRef(pathname);

  useLayoutEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return;
    }

    previousPathnameRef.current = pathname;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
