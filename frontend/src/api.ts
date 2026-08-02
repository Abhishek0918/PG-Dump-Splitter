import type {
  DumpObject,
  JobEvent,
  JobResponse,
  RestorePlan,
  RestoreScriptPayload,
  SearchPayload,
  SourcePayload,
  TreePayload,
  VisualizationPayload
} from "./types";

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload === "object" && payload !== null && "detail" in payload ? String(payload.detail) : response.statusText;
    throw new Error(detail);
  }
  return payload as T;
}

export const api = {
  jobs: (limit = 100) => requestJson<JobResponse[]>(`/api/jobs?limit=${limit}`),
  job: (jobId: string) => requestJson<JobResponse>(`/api/jobs/${encodeURIComponent(jobId)}`),
  events: (jobId: string) => requestJson<JobEvent[]>(`/api/jobs/${encodeURIComponent(jobId)}/events?limit=200`),
  tree: (jobId: string) => requestJson<TreePayload>(`/api/jobs/${encodeURIComponent(jobId)}/tree`),
  visualization: (jobId: string) => requestJson<VisualizationPayload>(`/api/jobs/${encodeURIComponent(jobId)}/visualization`),
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
