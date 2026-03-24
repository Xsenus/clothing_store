const API_URL = import.meta.env.VITE_API_URL || "/api";
const WINDOW_ORIGIN =
  typeof window !== "undefined" ? window.location.origin : "http://localhost";
const API_ORIGIN = (() => {
  try {
    return new URL(API_URL, WINDOW_ORIGIN).origin;
  } catch {
    return WINDOW_ORIGIN;
  }
})();

const API_PATH_BASE = (() => {
  try {
    const parsed = new URL(API_URL, WINDOW_ORIGIN);
    const pathname = parsed.pathname || "";
    if (!pathname || pathname === "/") return "";
    return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  } catch {
    return "";
  }
})();

const getToken = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem("authToken");
  } catch {
    return null;
  }
};

const getAdminToken = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem("adminToken");
  } catch {
    return null;
  }
};

const buildRequestUrl = (path) => `${API_URL}${path}`;

const parseErrorPayload = async (response) => {
  const text = await response.text();
  let payload = null;
  let message = text || `Request failed: ${response.status}`;

  if (text) {
    try {
      payload = JSON.parse(text);
      if (typeof payload?.detail === "string" && payload.detail.trim()) {
        message = payload.detail;
      } else if (
        typeof payload?.message === "string" &&
        payload.message.trim()
      ) {
        message = payload.message;
      }
    } catch {
      payload = null;
    }
  }

  const error = new Error(message);
  error.status = response.status;
  error.payload = payload;
  return error;
};

export const toAbsoluteMediaUrl = (url) => {
  if (!url) return url;
  const normalizedUrl = String(url).trim();
  if (!normalizedUrl) return normalizedUrl;

  if (
    normalizedUrl.startsWith("http://") ||
    normalizedUrl.startsWith("https://") ||
    normalizedUrl.startsWith("//") ||
    normalizedUrl.startsWith("data:") ||
    normalizedUrl.startsWith("blob:")
  ) {
    return normalizedUrl;
  }

  if (normalizedUrl.startsWith("/")) {
    if (
      API_PATH_BASE &&
      (normalizedUrl.startsWith("/uploads/") ||
        normalizedUrl.startsWith("/media/"))
    ) {
      return `${API_ORIGIN}${API_PATH_BASE}${normalizedUrl}`;
    }

    return `${API_ORIGIN}${normalizedUrl}`;
  }

  return `${API_ORIGIN}/${normalizedUrl}`;
};

export const apiRequest = async (path, options = {}) => {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  const adminToken = getAdminToken();

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (adminToken && !headers.has("X-Admin-Token")) {
    headers.set("X-Admin-Token", adminToken);
  }

  const response = await fetch(buildRequestUrl(path), {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw await parseErrorPayload(response);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};
