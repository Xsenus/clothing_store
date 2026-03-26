import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { clearProductLikeStateCache } from "@/lib/product-like-state";

const AuthContext = createContext(undefined);
let authApiPromise = null;

const loadAuthApi = async () => {
  authApiPromise ??= import("@/lib/api-mapping").then((module) => ({
    getProfile: module.getProfile,
    refreshSession: module.refreshSession,
    signIn: module.signIn,
    signOut: module.signOut,
    signUp: module.signUp,
    telegramLogin: module.telegramLogin,
    verifySignup: module.verifySignup,
  }));
  return authApiPromise;
};

const normalizeAuthUser = (rawUser) => {
  if (!rawUser || typeof rawUser !== "object") {
    return null;
  }

  const email = String(rawUser.email || "").trim();
  const name = String(rawUser.name || "").trim();
  const nickname = String(rawUser.nickname || "").trim();
  const id = String(rawUser.id || "").trim();
  const isAdmin = !!rawUser.isAdmin;

  if (!email && !name && !nickname && !id) {
    return null;
  }

  return {
    ...rawUser,
    id: id || undefined,
    email,
    name,
    nickname,
    isAdmin,
  };
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const isAuthenticated = !!user;

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const { getProfile } = await loadAuthApi();
        const me = await getProfile();
        setUser(normalizeAuthUser(me));
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    const token = localStorage.getItem("authToken");
    const refreshToken = localStorage.getItem("refreshToken");
    if (token) {
      bootstrap();
    } else if (refreshToken) {
      loadAuthApi()
        .then(({ refreshSession }) => refreshSession())
        .then(() => bootstrap())
        .catch(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const signIn = async (_provider, formData) => {
    const {
      getProfile,
      signIn: apiSignIn,
      signUp: apiSignUp,
      telegramLogin,
      verifySignup,
    } = await loadAuthApi();
    const email = formData.get ? formData.get("email") : formData.email;
    const password = formData.get ? formData.get("password") : formData.password;
    const flow = formData.get ? formData.get("flow") : formData.flow;

    if (flow === "telegram") {
      const telegramPayload = formData.get ? JSON.parse(formData.get("telegramPayload") || "{}") : formData.telegramPayload;
      const result = await telegramLogin({ input: telegramPayload });
      setUser(normalizeAuthUser(result.user));
      return { signingIn: true };
    }

    if (flow === "telegram-state" || flow === "external-state" || flow === "session") {
      const token = formData.get ? formData.get("token") : formData.token;
      const refreshToken = formData.get ? formData.get("refreshToken") : formData.refreshToken;
      const rawUser = formData.get ? formData.get("user") : formData.user;
      const nextUser = typeof rawUser === "string" ? JSON.parse(rawUser || "{}") : rawUser;
      if (token) localStorage.setItem("authToken", token);
      if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
      setUser(normalizeAuthUser(nextUser));
      return { signingIn: true };
    }

    if (flow === "signUp") {
      await apiSignUp({ input: { email, password } });
      return { signingIn: false };
    }
    if (flow === "email-verification") {
      const result = await verifySignup({ input: { email, code: password } });
      setUser(normalizeAuthUser(result.user));
      return { signingIn: true };
    }
    const result = await apiSignIn({ input: { email, password } });
    if (result.user) {
      setUser(normalizeAuthUser(result.user));
      return { signingIn: true };
    }

    const me = await getProfile();
    setUser(normalizeAuthUser(me));
    return { signingIn: true };
  };

  const signOut = async () => {
    const { signOut: apiSignOut } = await loadAuthApi();
    await apiSignOut();
    clearProductLikeStateCache();
    setUser(null);
  };

  const value = useMemo(
    () => ({ isAuthenticated, isLoading, signIn, signOut, user }),
    [isAuthenticated, isLoading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const useAuthActions = () => {
  const { signIn, signOut } = useAuth();
  return { signIn, signOut };
};

export const useConvexAuth = () => {
  const { isAuthenticated, isLoading } = useAuth();
  return { isAuthenticated, isLoading };
};

export const Authenticated = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : null;
};

export const Unauthenticated = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return !isAuthenticated ? <>{children}</> : null;
};
