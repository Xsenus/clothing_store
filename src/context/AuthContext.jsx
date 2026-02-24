import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { FLOW } from "@/lib/api-mapping";

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const isAuthenticated = !!user;

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const me = await FLOW.getProfile();
        if (me && me.email) {
          setUser({ email: me.email, name: me.name });
        }
      } catch (err) {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    const token = localStorage.getItem("authToken");
    if (token) {
      bootstrap();
    } else {
      setIsLoading(false);
    }
  }, []);

  const signIn = async (_provider, formData) => {
    const email = formData.get ? formData.get("email") : formData.email;
    const password = formData.get ? formData.get("password") : formData.password;
    const flow = formData.get ? formData.get("flow") : formData.flow;

    if (flow === "signUp") {
      await FLOW.signUp({ input: { email, password } });
      return { signingIn: false };
    }
    if (flow === "email-verification") {
      const result = await FLOW.verifySignup({ input: { email, code: password } });
      setUser(result.user);
      return { signingIn: true };
    }
    const result = await FLOW.signIn({ input: { email, password } });
    setUser(result.user);
    return { signingIn: true };
  };

  const signOut = async () => {
    await FLOW.signOut();
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
