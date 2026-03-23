export interface ProductLikeStateSnapshot {
  productId: string;
  liked?: boolean;
  likesCount?: number;
}

type ProductLikeStatePatch = Partial<Pick<ProductLikeStateSnapshot, "liked" | "likesCount">>;
type ProductLikeStateListener = (snapshot: ProductLikeStateSnapshot) => void;

const productLikeStateById = new Map<string, ProductLikeStateSnapshot>();
const productLikeListenersById = new Map<string, Set<ProductLikeStateListener>>();

const normalizeProductId = (productId?: string | null) => String(productId || "").trim();

const normalizeLikesCount = (likesCount?: number | null) => {
  const normalized = Number(likesCount);
  return Number.isFinite(normalized) ? Math.max(0, normalized) : undefined;
};

const hasOwn = <T extends object>(value: T, key: keyof T) =>
  Object.prototype.hasOwnProperty.call(value, key);

export const getCachedProductLikeState = (productId?: string | null) => {
  const normalizedProductId = normalizeProductId(productId);
  if (!normalizedProductId) {
    return null;
  }

  const snapshot = productLikeStateById.get(normalizedProductId);
  return snapshot ? { ...snapshot } : null;
};

export const setCachedProductLikeState = (productId: string, patch: ProductLikeStatePatch) => {
  const normalizedProductId = normalizeProductId(productId);
  if (!normalizedProductId) {
    return null;
  }

  const currentSnapshot = productLikeStateById.get(normalizedProductId) ?? { productId: normalizedProductId };
  const nextSnapshot: ProductLikeStateSnapshot = {
    ...currentSnapshot,
    ...(hasOwn(patch, "liked") && typeof patch.liked === "boolean" ? { liked: patch.liked } : {}),
    ...(hasOwn(patch, "likesCount") ? { likesCount: normalizeLikesCount(patch.likesCount) } : {}),
  };

  productLikeStateById.set(normalizedProductId, nextSnapshot);

  const listeners = productLikeListenersById.get(normalizedProductId);
  if (listeners) {
    const payload = { ...nextSnapshot };
    listeners.forEach((listener) => listener(payload));
  }

  return { ...nextSnapshot };
};

export const subscribeProductLikeState = (productId: string, listener: ProductLikeStateListener) => {
  const normalizedProductId = normalizeProductId(productId);
  if (!normalizedProductId) {
    return () => {};
  }

  const listeners = productLikeListenersById.get(normalizedProductId) ?? new Set<ProductLikeStateListener>();
  listeners.add(listener);
  productLikeListenersById.set(normalizedProductId, listeners);

  return () => {
    const currentListeners = productLikeListenersById.get(normalizedProductId);
    if (!currentListeners) {
      return;
    }

    currentListeners.delete(listener);
    if (currentListeners.size === 0) {
      productLikeListenersById.delete(normalizedProductId);
    }
  };
};

export const clearProductLikeStateCache = () => {
  productLikeStateById.clear();
};
