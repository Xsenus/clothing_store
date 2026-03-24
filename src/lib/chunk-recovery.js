const CHUNK_RECOVERY_STORAGE_KEY = "fashion_demon_chunk_recovery";
const CHUNK_RECOVERY_WINDOW_MS = 15_000;
const RECOVERABLE_CHUNK_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Unable to preload CSS/i,
  /CSS_CHUNK_LOAD_FAILED/i,
];

const getErrorText = (error) => {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  const message = typeof error.message === "string" ? error.message : "";
  const name = typeof error.name === "string" ? error.name : "";
  const stack = typeof error.stack === "string" ? error.stack : "";
  return [name, message, stack].filter(Boolean).join(" ");
};

const getCurrentPath = () => {
  if (typeof window === "undefined") {
    return "/";
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
};

const readRecoverySnapshot = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);
    const path = typeof parsedValue?.path === "string" ? parsedValue.path : "";
    const attemptedAt = Number(parsedValue?.attemptedAt ?? 0);
    return path && Number.isFinite(attemptedAt)
      ? { path, attemptedAt }
      : null;
  } catch {
    return null;
  }
};

export const isRecoverableChunkError = (error) => {
  const errorText = getErrorText(error);
  return RECOVERABLE_CHUNK_PATTERNS.some((pattern) => pattern.test(errorText));
};

export const attemptChunkRecovery = ({ error, source = "unknown" } = {}) => {
  if (typeof window === "undefined") {
    return false;
  }

  const currentPath = getCurrentPath();
  const snapshot = readRecoverySnapshot();
  const now = Date.now();

  if (
    snapshot &&
    snapshot.path === currentPath &&
    now - snapshot.attemptedAt <= CHUNK_RECOVERY_WINDOW_MS
  ) {
    return false;
  }

  try {
    window.sessionStorage.setItem(
      CHUNK_RECOVERY_STORAGE_KEY,
      JSON.stringify({
        path: currentPath,
        attemptedAt: now,
        source,
        error: getErrorText(error).slice(0, 500),
      }),
    );
  } catch {
    // Ignore storage write failures and still try to recover with a reload.
  }

  window.location.reload();
  return true;
};
