const API_URL = import.meta.env.VITE_API_URL || "/api";
const WINDOW_ORIGIN = typeof window !== "undefined" ? window.location.origin : "http://localhost";
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

const toAbsoluteMediaUrl = (url) => {
  if (!url) return url;
  const normalizedUrl = String(url).trim();
  if (!normalizedUrl) return normalizedUrl;

  if (
    normalizedUrl.startsWith("http://")
    || normalizedUrl.startsWith("https://")
    || normalizedUrl.startsWith("//")
    || normalizedUrl.startsWith("data:")
    || normalizedUrl.startsWith("blob:")
  ) {
    return normalizedUrl;
  }

  if (normalizedUrl.startsWith("/")) {
    if (API_PATH_BASE && (normalizedUrl.startsWith("/uploads/") || normalizedUrl.startsWith("/media/"))) {
      return `${API_ORIGIN}${API_PATH_BASE}${normalizedUrl}`;
    }

    return `${API_ORIGIN}${normalizedUrl}`;
  }

  return `${API_ORIGIN}/${normalizedUrl}`;
};

const getToken = () => localStorage.getItem("authToken");
const getRefreshToken = () => localStorage.getItem("refreshToken");
const getAdminToken = () => localStorage.getItem("adminToken");

const saveAuthTokens = ({ token, refreshToken }) => {
  if (token) {
    localStorage.setItem("authToken", token);
  }
  if (refreshToken) {
    localStorage.setItem("refreshToken", refreshToken);
  }
};

const clearAuthTokens = () => {
  localStorage.removeItem("authToken");
  localStorage.removeItem("refreshToken");
};

const shouldSkipRefresh = (path) => {
  return path.startsWith("/auth/login")
    || path.startsWith("/auth/signup")
    || path.startsWith("/auth/verify")
    || path.startsWith("/auth/resend")
    || path.startsWith("/auth/reset")
    || path.startsWith("/auth/refresh")
    || path.startsWith("/auth/telegram");
};

const refreshAuthSession = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers,
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    clearAuthTokens();
    return false;
  }

  const payload = await res.json();
  saveAuthTokens(payload || {});
  return !!payload?.token;
};

const request = async (path, options = {}, retry = true) => {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const adminToken = getAdminToken();
  if (adminToken) {
    headers["X-Admin-Token"] = adminToken;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && retry && !shouldSkipRefresh(path)) {
    const refreshed = await refreshAuthSession();
    if (refreshed) {
      return request(path, options, false);
    }

    clearAuthTokens();
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/profile")) {
      window.location.replace("/");
    }
  }

  if (!res.ok) {
    const text = await res.text();
    let payload = null;
    let message = text || `Request failed: ${res.status}`;

    if (text) {
      try {
        payload = JSON.parse(text);
        if (typeof payload?.detail === "string" && payload.detail.trim()) {
          message = payload.detail;
        } else if (typeof payload?.message === "string" && payload.message.trim()) {
          message = payload.message;
        }
      } catch {
        payload = null;
      }
    }

    const error = new Error(message);
    error.status = res.status;
    error.payload = payload;
    throw error;
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
};

const sortProducts = (products, sortBy) => {
  const sorted = [...products];
  if (sortBy === "price-asc") {
    sorted.sort((a, b) => a.price - b.price);
  } else if (sortBy === "price-desc") {
    sorted.sort((a, b) => b.price - a.price);
  } else if (sortBy === "popular") {
    sorted.sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
  } else if (sortBy === "new") {
    sorted.sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0));
  } else if (sortBy === "sale") {
    const getDiscount = (item) => {
      const basePrice = Number(item.basePrice ?? item.oldPrice ?? item.price ?? 0);
      const currentPrice = Number(item.discountedPrice ?? item.price ?? 0);
      if (!Number.isFinite(basePrice) || basePrice <= 0 || !Number.isFinite(currentPrice)) return 0;
      return Math.max(basePrice - currentPrice, 0);
    };
    sorted.sort((a, b) => getDiscount(b) - getDiscount(a));
  }
  return sorted;
};

const normalizeProduct = (product) => {
  if (!product) return product;
  const productId = product._id || product.id;
  const images = Array.isArray(product.images) ? product.images.map(toAbsoluteMediaUrl) : [];
  const media = Array.isArray(product.media)
    ? product.media.map((item) => ({ ...item, url: toAbsoluteMediaUrl(item?.url) }))
    : [];
  return {
    ...product,
    _id: productId,
    id: productId,
    images,
    media,
  };
};

const normalizeProducts = (products) =>
  Array.isArray(products) ? products.map(normalizeProduct) : [];

export const FLOW = {
  getNewProducts: async () => normalizeProducts(await request("/products/new")),

  getPopularProducts: async () => normalizeProducts(await request("/products/popular")),

  getAllProducts: async () => normalizeProducts(await request("/products")),

  getCatalogFilters: async () => request("/products/filters"),

  catalogFilter: async ({ input } = {}) => {
    const products = normalizeProducts(await request("/products"));
    return sortProducts(products, input?.sortBy);
  },

  getSingleProduct: async ({ input }) => normalizeProduct(await request(`/products/${input.slug}`)),

  getSimilarProducts: async ({ input }) => {
    const products = normalizeProducts(await request("/products"));
    const targetCategory = String(input.category || "").trim().toLowerCase();
    if (!targetCategory) {
      return [];
    }

    return products.filter((product) => {
      if (product._id === input.productId) return false;

      const categories = Array.isArray(product.categories) && product.categories.length > 0
        ? product.categories
        : (product.category ? [product.category] : []);

      return categories.some((category) => String(category || "").trim().toLowerCase() === targetCategory);
    }).slice(0, 4);
  },

  toggleLike: async ({ input }) => request("/likes/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: input.productId }),
  }),

  getUserOrders: async () => request("/orders"),

  createOrder: async ({ input }) => request("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }),

  getUserLikes: async () => request("/likes"),

  checkLike: async ({ input }) => {
    const likes = await request("/likes");
    return { liked: likes.some((like) => like.productId === input.productId) };
  },

  getProfile: async () => request("/profile"),

  getCart: async () => request("/cart"),

  addToCart: async ({ input }) => request("/cart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }),

  updateCartQuantity: async ({ input }) => request(`/cart/${encodeURIComponent(input.cartItemId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity: input.quantity }),
  }),

  removeCartItem: async ({ input }) => request(`/cart/${encodeURIComponent(input.cartItemId)}`, {
    method: "DELETE",
  }),

  clearCart: async () => request("/cart", {
    method: "DELETE",
  }),


  startEmailVerification: async ({ input }) => request("/profile/email/verify/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: input.value }),
  }),

  confirmEmailVerification: async ({ input }) => request("/profile/email/verify/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: input.value, code: input.code }),
  }),

  startPhoneVerification: async ({ input }) => request("/profile/phone/verify/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: input.value }),
  }),

  getPhoneVerificationStatus: async ({ input }) => request(`/profile/phone/verify/status/${encodeURIComponent(input.state)}`),


  createProfile: async ({ input }) => request("/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }),

  updateProfile: async ({ input }) => request("/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }),

  createProduct: async ({ input }) => normalizeProduct(await request("/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })),

  updateProduct: async ({ input }) => normalizeProduct(await request(`/products/${input.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })),

  deleteProduct: async ({ input }) => request(`/products/${input.id}`, {
    method: "DELETE",
  }),

  adminUpload: async ({ input }) => {
    const res = await request("/admin/upload", {
      method: "POST",
      body: input,
    });
    const urls = Array.isArray(res?.urls) ? res.urls : [];
    return { urls: urls.map(toAbsoluteMediaUrl) };
  },

  adminUploadFavicon: async ({ input }) => {
    const res = await request("/admin/upload/favicon", {
      method: "POST",
      body: input,
    });

    return { url: toAbsoluteMediaUrl(res?.url) };
  },

  uploadMedia: async ({ input }) => {
    const res = await request("/upload", {
      method: "POST",
      body: input,
    });
    const urls = Array.isArray(res?.urls) ? res.urls : [];
    return { urls: urls.map(toAbsoluteMediaUrl) };
  },

  getAdminGalleryImages: async () => {
    const images = await request("/admin/gallery");
    return Array.isArray(images)
      ? images.map((item) => ({
        ...item,
        url: toAbsoluteMediaUrl(item.url),
      }))
      : [];
  },

  uploadAdminGalleryImage: async ({ input }) => {
    const image = await request("/admin/gallery", {
      method: "POST",
      body: input,
    });

    return {
      ...image,
      url: toAbsoluteMediaUrl(image?.url),
    };
  },

  updateAdminGalleryImage: async ({ input }) => {
    const image = await request(`/admin/gallery/${input.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.name, description: input.description }),
    });

    return {
      ...image,
      url: toAbsoluteMediaUrl(image?.url),
    };
  },

  deleteAdminGalleryImage: async ({ input }) => request(`/admin/gallery/${input.id}`, {
    method: "DELETE",
  }),


  signIn: async ({ input }) => {
    const result = await request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    saveAuthTokens(result || {});
    return result;
  },

  signUp: async ({ input }) => {
    const result = await request("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return result;
  },

  resendCode: async ({ input }) => request("/auth/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }),

  verifySignup: async ({ input }) => {
    const result = await request("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    saveAuthTokens(result || {});
    return result;
  },

  requestPasswordReset: async ({ input }) =>
    request("/auth/reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  confirmPasswordReset: async ({ input }) =>
    request("/auth/reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  refreshSession: async () => {
    const refreshed = await refreshAuthSession();
    if (!refreshed) {
      throw new Error("Unable to refresh session");
    }
    return { ok: true };
  },


  telegramStartAuth: async ({ input }) => request("/auth/telegram/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input || {}),
  }),

  telegramAuthStatus: async ({ input }) => request(`/auth/telegram/status/${encodeURIComponent(input.state)}`),

  telegramLogin: async ({ input }) => {
    const result = await request("/auth/telegram/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    saveAuthTokens(result || {});
    return result;
  },

  dadataSuggestAddresses: async ({ input }) => request("/integrations/dadata/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: input.query, count: input.count || 5 }),
  }),

  yandexDeliveryCalculate: async ({ input }) => request("/integrations/yandex/delivery/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }),

  signOut: async () => {
    const refreshToken = getRefreshToken();
    try {
      await request("/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Не блокируем выход пользователя, если backend недоступен.
    } finally {
      clearAuthTokens();
    }
    return true;
  },

  adminLogin: async ({ input }) => {
    const result = await request("/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    localStorage.setItem("adminToken", result.token);
    return result;
  },

  adminMe: async () => request("/admin/me"),

  adminGetOrders: async () => request("/admin/orders"),

  adminUpdateOrder: async ({ input }) => request(`/admin/orders/${input.orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.payload),
  }),

  adminGetUsers: async () => request("/admin/users"),

  adminUpdateUser: async ({ input }) => request(`/admin/users/${input.userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      isAdmin: input.isAdmin,
      isBlocked: input.isBlocked,
      email: input.email,
      name: input.name,
      phone: input.phone,
      nickname: input.nickname,
      shippingAddress: input.shippingAddress,
      password: input.password,
    }),
  }),

  adminDeleteUser: async ({ input }) => request(`/admin/users/${input.userId}`, {
    method: "DELETE",
  }),


  adminGetTelegramBots: async () => request("/admin/telegram-bots"),

  adminValidateTelegramBot: async ({ input }) => {
    try {
      return await request("/admin/telegram-bots/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    } catch (error) {
      if (error?.status !== 404) throw error;

      return request("/admin/telegram-bots/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    }
  },

  adminCreateTelegramBot: async ({ input }) => request("/admin/telegram-bots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }),

  adminUpdateTelegramBot: async ({ input }) => request(`/admin/telegram-bots/${input.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.payload),
  }),

  adminDeleteTelegramBot: async ({ input }) => request(`/admin/telegram-bots/${input.id}`, {
    method: "DELETE",
  }),

  adminCheckTelegramBot: async ({ input }) => request(`/admin/telegram-bots/${input.id}/check`, {
    method: "POST",
  }),


  adminGetDictionaries: async () => request("/admin/dictionaries"),

  adminCreateDictionaryItem: async ({ input }) => request(`/admin/dictionaries/${input.kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      slug: input.slug,
      color: input.color,
      description: input.description,
      isActive: input.isActive,
      showInCatalogFilter: input.showInCatalogFilter,
    }),
  }),

  adminDeleteDictionaryItem: async ({ input }) => request(`/admin/dictionaries/${input.kind}/${input.id}`, {
    method: "DELETE",
  }),

  adminUpdateDictionaryItem: async ({ input }) => request(`/admin/dictionaries/${input.kind}/${input.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      slug: input.slug,
      color: input.color,
      description: input.description,
      isActive: input.isActive,
      showInCatalogFilter: input.showInCatalogFilter,
    }),
  }),

  adminGetStockHistory: async () => request("/admin/history/stocks"),

  adminGetPriceHistory: async () => request("/admin/history/prices"),

  adminGetSettings: async () => request("/admin/settings"),

  adminSaveSettings: async ({ input }) => request("/admin/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }),

  adminRunSeedDemoData: async () => {
    try {
      return await request("/admin/operations/seed-demo-data", {
        method: "POST",
      });
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error
        ? Number(error.status)
        : null;
      const message = error instanceof Error ? error.message : String(error || "");
      const isNotFound = status === 404 || message.includes("404") || message.includes("Not Found");
      if (!isNotFound) {
        throw error;
      }

      return request("/admin/seed-demo-data", {
        method: "POST",
      });
    }
  },

  getPublicSettings: async () => request("/settings/public"),

  adminLogout: async () => {
    try {
      await request("/admin/logout", { method: "POST" });
    } catch {
      // Не блокируем локальный logout при сетевых ошибках.
    } finally {
      localStorage.removeItem("adminToken");
    }
    return true;
  },
};
