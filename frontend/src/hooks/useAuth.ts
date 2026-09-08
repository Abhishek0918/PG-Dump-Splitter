import { useCallback, useEffect, useState } from "react";
import { api, setAuthToken } from "../api";
import type { ServerUser } from "../api";

export type { ServerUser } from "../api";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

export function useAuth() {
  const [user, setUser] = useState<ServerUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.me()
      .then((payload) => {
        if (alive) setUser(payload);
      })
      .catch(() => {
        setAuthToken(null);
        if (alive) setUser(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const signUp = useCallback(async (name: string, emailInput: string, password: string, confirm: string): Promise<ServerUser> => {
    const email = normalizeEmail(emailInput);
    if (!name.trim()) throw new Error("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    if (password !== confirm) throw new Error("Passwords do not match.");
    const payload = await api.register(name.trim(), email, password);
    setAuthToken(payload.access_token, true);
    setUser(payload.user);
    return payload.user;
  }, []);

  const signIn = useCallback(async (emailInput: string, password: string, remember: boolean): Promise<ServerUser> => {
    const email = normalizeEmail(emailInput);
    const payload = await api.login(email, password, remember);
    setAuthToken(payload.access_token, remember);
    setUser(payload.user);
    return payload.user;
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await api.logout();
    } finally {
      setAuthToken(null);
      setUser(null);
    }
  }, []);

  return { user, signUp, signIn, signOut, loading };
}
