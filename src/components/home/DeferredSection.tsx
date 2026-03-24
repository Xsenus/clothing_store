import { useEffect, useRef, useState, type ReactNode } from "react";

interface DeferredSectionProps {
  children: ReactNode;
  placeholder: ReactNode;
  rootMargin?: string;
  idleTimeout?: number | null;
}

const scheduleIdleLoad = (callback: () => void, timeout = 1800) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = window.setTimeout(callback, Math.min(timeout, 900));
  return () => window.clearTimeout(timeoutId);
};

export default function DeferredSection({
  children,
  placeholder,
  rootMargin = "320px 0px",
  idleTimeout = null,
}: DeferredSectionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isVisible || typeof window === "undefined" || !containerRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isVisible, rootMargin]);

  useEffect(() => {
    if (isVisible || idleTimeout == null) {
      return;
    }

    return scheduleIdleLoad(() => setIsVisible(true), idleTimeout);
  }, [idleTimeout, isVisible]);

  return <div ref={containerRef}>{isVisible ? children : placeholder}</div>;
}
