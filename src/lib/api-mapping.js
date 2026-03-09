const API_URL = import.meta.env.VITE_API_URL || "/api";
const WINDOW_ORIGIN = typeof window !== "undefined" ? window.location.origin : "http://localhost";
const API_ORIGIN = (() => {
  try {
    return new URL(API_URL, WINDOW_ORIGIN).origin;
  } catch {
    return WINDOW_ORIGIN;
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
    || path.startsWith("/auth/refresh");
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
  }

  if (!res.ok) {
    const text = await res.text();
    const error = new Error(text || `Request failed: ${res.status}`);
    error.status = res.status;
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
  }
  return sorted;
};

const normalizeProduct = (product) => {
  if (!product) return product;
  const productId = product._id || product.id;
  return {
    ...product,
    _id: productId,
    id: productId,
  };
};

const normalizeProducts = (products) =>
  Array.isArray(products) ? products.map(normalizeProduct) : [];

export const FLOW = {
  getNewProducts: async () => normalizeProducts(await request("/products/new")),

  getPopularProducts: async () => normalizeProducts(await request("/products/popular")),

  getAllProducts: async () => normalizeProducts(await request("/products")),

  catalogFilter: async ({ input } = {}) => {
    const products = normalizeProducts(await request("/products"));
    return sortProducts(products, input?.sortBy);
  },

  getSingleProduct: async ({ input }) => normalizeProduct(await request(`/products/${input.slug}`)),

  getSimilarProducts: async ({ input }) => {
    const products = normalizeProducts(await request("/products"));
    return products.filter(
      (p) => p.category === input.category && p._id !== input.productId
    ).slice(0, 4);
  },

  toggleLike: async ({ input }) => request("/likes/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: input.productId }),
  }),

  getUserOrders: async () => request("/orders"),

  getUserLikes: async () => request("/likes"),

  checkLike: async ({ input }) => {
    const likes = await request("/likes");
    return { liked: likes.some((like) => like.productId === input.productId) };
  },

  getProfile: async () => request("/profile"),

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

  uploadMedia: async ({ input }) => {
    const res = await request("/upload", {
      method: "POST",
      body: input,
    });
    const urls = Array.isArray(res?.urls) ? res.urls : [];
    return { urls: urls.map(toAbsoluteMediaUrl) };
  },

  createOrder: async ({ input }) => request("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }),

  getCart: async () => request("/cart"),

  addToCart: async ({ input }) => request("/cart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }),

  updateCartQuantity: async ({ input }) => request(`/cart/${input.cartItemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity: input.quantity }),
  }),

  removeCartItem: async ({ input }) => request(`/cart/${input.cartItemId}`, {
    method: "DELETE",
  }),

  clearCart: async () => request("/cart", { method: "DELETE" }),

  addProductReview: async ({ input }) => request(`/products/${input.productId}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: input.text, media: input.media || [] }),
  }),

  deleteProductReview: async ({ input }) =>
    request(`/products/${input.productId}/reviews/${input.reviewId}`, {
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

  adminGetUsers: async () => request("/admin/users"),

  adminUpdateUser: async ({ input }) => request(`/admin/users/${input.userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isAdmin: input.isAdmin, isBlocked: input.isBlocked }),
  }),

  adminDeleteUser: async ({ input }) => request(`/admin/users/${input.userId}`, {
    method: "DELETE",
  }),

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
