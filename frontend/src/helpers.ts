import { getAuthToken } from "./api";
import type { JobResponse, TreeNode } from "./types";

export function downloadText(filename: string, text: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 400);
}

export async function downloadAuthorized(url: string, filename: string): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error(response.statusText || "Download failed");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 400);
}

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) as T;
  } catch {
    return fallback;
  }
}

export function initialsFor(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : (parts[0] || "LU").slice(0, 2)).toUpperCase();
}

export function filterTree(node: TreeNode | undefined, query: string): TreeNode | undefined {
  if (!node || !query.trim()) return node;
  const needle = query.toLowerCase();
  const ownMatch = [node.name, node.path, node.object_id, node.object_type, node.schema].some((value) => String(value || "").toLowerCase().includes(needle));
  const children = (node.children || []).map((child) => filterTree(child, query)).filter(Boolean) as TreeNode[];
  if (ownMatch || children.length) return { ...node, children };
  return undefined;
}

export function emptyUploadJob(name: string): JobResponse {
  return {
    job_id: "uploading",
    source_path: name,
    source_type: "upload",
    input_name: name,
    status: "running",
    created_at: new Date().toISOString(),
    object_count: 0,
    warning_count: 0,
    file_size_bytes: 0,
    processed_bytes: 0,
    progress_percent: 0,
    stage: "uploading",
    current_step: "Uploading SQL file",
    objects_processed: 0,
    events_count: 0,
  };
}
