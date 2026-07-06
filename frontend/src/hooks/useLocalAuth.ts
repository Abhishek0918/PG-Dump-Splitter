import { useCallback, useEffect, useState } from "react";

const USERS_KEY = "pgsplit.auth.users";
const SESSION_KEY = "pgsplit.auth.session";

export interface LocalUser {
  name: string;
  email: string;
  created_at: string;
  password_hash: string;
  password_salt: string;
}

type Users = Record<string, LocalUser>;

function loadJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    return JSON.parse(storage.getItem(key) || JSON.stringify(fallback)) as T;
  } catch {
    return fallback;
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value || "");
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBytes = base64ToBytes(salt);
  const saltBuffer = saltBytes.buffer.slice(saltBytes.byteOffset, saltBytes.byteOffset + saltBytes.byteLength) as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBuffer, iterations: 120000, hash: "SHA-256" }, keyMaterial, 256);
  return bytesToBase64(new Uint8Array(bits));
}

function loadUsers(): Users {
  return loadJson<Users>(localStorage, USERS_KEY, {});
}

function saveUsers(users: Users): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function sessionUser(): LocalUser | null {
  const session = loadJson<{ email?: string } | null>(localStorage, SESSION_KEY, null) || loadJson<{ email?: string } | null>(sessionStorage, SESSION_KEY, null);
  if (!session?.email) return null;
  return loadUsers()[normalizeEmail(session.email)] || null;
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

export function useLocalAuth() {
  const [user, setUser] = useState<LocalUser | null>(() => sessionUser());

  useEffect(() => {
    setUser(sessionUser());
  }, []);

  const signUp = useCallback(async (name: string, emailInput: string, password: string, confirm: string): Promise<LocalUser> => {
    const email = normalizeEmail(emailInput);
    if (!name.trim()) throw new Error("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    if (password !== confirm) throw new Error("Passwords do not match.");
    const users = loadUsers();
    if (users[email]) throw new Error("A local account already exists for this email.");
    const salt = randomSalt();
    const nextUser: LocalUser = {
      name: name.trim(),
      email,
      created_at: new Date().toISOString(),
      password_salt: salt,
      password_hash: await hashPassword(password, salt)
    };
    users[email] = nextUser;
    saveUsers(users);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email, created_at: new Date().toISOString(), remember: true }));
    setUser(nextUser);
    return nextUser;
  }, []);

  const signIn = useCallback(async (emailInput: string, password: string, remember: boolean): Promise<LocalUser> => {
    const email = normalizeEmail(emailInput);
    const target = loadUsers()[email];
    if (!target) throw new Error("No local account found for that email.");
    const hash = await hashPassword(password, target.password_salt);
    if (hash !== target.password_hash) throw new Error("Password is incorrect.");
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(SESSION_KEY, JSON.stringify({ email, created_at: new Date().toISOString(), remember }));
    setUser(target);
    return target;
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  const resetUsers = useCallback(() => {
    localStorage.removeItem(USERS_KEY);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  return { user, signUp, signIn, signOut, resetUsers };
}
