const MAX_FIELD_LENGTH = 1200;

const trimField = (value, maxLength = MAX_FIELD_LENGTH) => {
  const normalized = String(value ?? "").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
};

const getErrorPayload = (error, errorInfo, source) => {
  const location =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : "";
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";

  return {
    source: trimField(source, 120),
    name: trimField(error?.name || "Error", 120),
    message: trimField(error?.message || error),
    stack: trimField(error?.stack, 2400),
    componentStack: trimField(errorInfo?.componentStack, 2400),
    location: trimField(location, 500),
    userAgent: trimField(userAgent, 500),
  };
};

export const reportClientError = (error, errorInfo, source = "unknown") => {
  if (typeof window === "undefined") {
    return;
  }

  const body = JSON.stringify(getErrorPayload(error, errorInfo, source));

  try {
    if (navigator?.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/client-errors", blob)) {
        return;
      }
    }
  } catch {
    // Fall through to fetch.
  }

  try {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Client error reporting must never create another app error.
  }
};
