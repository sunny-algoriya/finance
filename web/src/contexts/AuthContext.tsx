import React, { createContext, useContext, useEffect, useState } from "react";
import { getToken, logout as logoutService } from "../services/auth";
import { setUnauthorizedHandler } from "../services/api";

export type AuthContextValue = {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  isHydrating: boolean;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthContext.Provider");
  }
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAccessToken(null);
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const token = await getToken();
      if (mounted) {
        setAccessToken(token);
        setIsHydrating(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const authContext = React.useMemo(
    () => ({ accessToken, setAccessToken, isHydrating }),
    [accessToken, isHydrating],
  );

  if (isHydrating) return null;

  return (
    <AuthContext.Provider value={authContext}>{children}</AuthContext.Provider>
  );
}
