const API_URL = import.meta.env.VITE_API_URL || "/api";

const getToken = () => localStorage.getItem("authToken");
const getAdminToken = () => localStorage.getItem("adminToken");

const request = async (path, options = {}) => {
  const headers = options.headers || {};
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
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

export const FLOW = {
  getNewProducts: async () => request("/products/new"),

  getPopularProducts: async () => request("/products/popular"),

  getAllProducts: async () => request("/products"),

  catalogFilter: async ({ input } = {}) => {
    const products = await request("/products");
    return sortProducts(products, input?.sortBy);
  },

  getSingleProduct: async ({ input }) => request(`/products/${input.slug}`),

  getSimilarProducts: async ({ input }) => {
    const products = await request("/products");
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

  createProduct: async ({ input }) => request("/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }),

  updateProduct: async ({ input }) => request(`/products/${input.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }),

  deleteProduct: async ({ input }) => request(`/products/${input.id}`, {
    method: "DELETE",
  }),

  adminUpload: async ({ input }) => {
    const res = await request("/admin/upload", {
      method: "POST",
      body: input,
    });
    const urls = Array.isArray(res?.urls) ? res.urls : [];
    return { urls: urls.map((u) => (u.startsWith("http") ? u : `${API_URL}${u}`)) };
  },

  uploadMedia: async ({ input }) => {
    const res = await request("/upload", {
      method: "POST",
      body: input,
    });
    const urls = Array.isArray(res?.urls) ? res.urls : [];
    return { urls: urls.map((u) => (u.startsWith("http") ? u : `${API_URL}${u}`)) };
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
    localStorage.setItem("authToken", result.token);
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
    localStorage.setItem("authToken", result.token);
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

  signOut: async () => {
    await request("/auth/logout", { method: "POST" });
    localStorage.removeItem("authToken");
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

  adminLogout: async () => {
    await request("/admin/logout", { method: "POST" });
    localStorage.removeItem("adminToken");
    return true;
  },
};
