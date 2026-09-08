import type {
  DumpObject,
  JobEvent,
  JobResponse,
  RestorePlan,
  RestoreScriptPayload,
  SchemaIntelligencePayload,
  SearchPayload,
  SourcePayload,
  TreePayload,
  VisualizationPayload
} from "./types";

const TOKEN_KEY = "pgsplit.auth.token";

export interface ServerUser {
  user_id: string;
  name: string;
  email: string;
  created_at: string;
  last_login_at?: string | null;
}

export interface AuthPayload {
  access_token: string;
  token_type: "bearer" | string;
  expires_at: string;
  user: ServerUser;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null, remember = true): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (!token) return;
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, token);
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) setAuthToken(null);
    const detail = typeof payload === "object" && payload !== null && "detail" in payload ? String(payload.detail) : response.statusText;
    throw new Error(detail);
  }
  return payload as T;
}

export const api = {
  register: (name: string, email: string, password: string) =>
    requestJson<AuthPayload>("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    }),
  login: (email: string, password: string, remember_me: boolean) =>
    requestJson<AuthPayload>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, remember_me })
    }),
  logout: () => requestJson<{ status: string }>("/api/auth/logout", { method: "POST" }),
  me: () => requestJson<ServerUser>("/api/auth/me"),
  jobs: (limit = 100) => requestJson<JobResponse[]>(`/api/jobs?limit=${limit}`),
  job: (jobId: string) => requestJson<JobResponse>(`/api/jobs/${encodeURIComponent(jobId)}`),
  events: (jobId: string) => requestJson<JobEvent[]>(`/api/jobs/${encodeURIComponent(jobId)}/events?limit=200`),
  tree: (jobId: string) => requestJson<TreePayload>(`/api/jobs/${encodeURIComponent(jobId)}/tree`),
  visualization: (jobId: string) => requestJson<VisualizationPayload>(`/api/jobs/${encodeURIComponent(jobId)}/visualization`),
  schemaIntelligence: (jobId: string) => requestJson<SchemaIntelligencePayload>(`/api/jobs/${encodeURIComponent(jobId)}/schema-intelligence`),
  restorePlan: (jobId: string) => requestJson<RestorePlan>(`/api/jobs/${encodeURIComponent(jobId)}/restore-plan`),
  object: (jobId: string, objectId: string) =>
    requestJson<DumpObject>(`/api/jobs/${encodeURIComponent(jobId)}/object?object_id=${encodeURIComponent(objectId)}`),
  source: (jobId: string, objectId: string) =>
    requestJson<SourcePayload>(`/api/jobs/${encodeURIComponent(jobId)}/source?object_id=${encodeURIComponent(objectId)}`),
  search: (jobId: string, query: string) =>
    requestJson<SearchPayload>(`/api/jobs/${encodeURIComponent(jobId)}/search?q=${encodeURIComponent(query)}&limit=80`),
  submitPath: (dumpPath: string) =>
    requestJson<JobResponse>("/api/jobs/path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dump_path: dumpPath })
    }),
  restoreScript: (jobId: string, mode: string, schema?: string | null) => {
    const params = new URLSearchParams({ mode, format: "json" });
    if (schema) params.set("schema", schema);
    return requestJson<RestoreScriptPayload>(`/api/jobs/${encodeURIComponent(jobId)}/restore-script?${params.toString()}`);
  }
};
