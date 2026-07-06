export function formatBytes(value?: number | null): string {
  const bytes = Number(value) || 0;
  if (bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = bytes;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current.toFixed(current >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function formatDuration(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  if (value < 60) return `${value.toFixed(1)} sec`;
  return `${Math.floor(value / 60)} min ${Math.round(value % 60)} sec`;
}

export function formatCount(value?: number | null): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : "-";
}

export function prettyJobName(job?: { input_name?: string; source_path?: string; job_id?: string } | null): string {
  const raw = String(job?.input_name || job?.source_path || job?.job_id || "");
  return raw.split(/[\\/]/).pop() || raw || "No active job";
}

export function iconText(kind?: string | null): string {
  const map: Record<string, string> = {
    schemas: "SCH",
    schema: "SCH",
    tables: "TBL",
    views: "VIEW",
    materialized_views: "MV",
    functions: "FN",
    triggers: "TRG",
    indexes: "IDX",
    sequences: "SEQ",
    constraints: "FK",
    enums: "ENUM",
    types: "TYPE",
    policies: "RLS",
    grants: "GRANT",
    comments: "NOTE",
    data: "CPY",
    restore: "RST",
    manifest: "JSON",
    file: "SQL",
    directory: "DIR"
  };
  return map[String(kind || "")] || String(kind || "OBJ").slice(0, 4).toUpperCase();
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] || char);
}

export function highlightSql(sql: string, query = ""): string {
  let html = escapeHtml(sql || "Select an object to preview SQL.");
  html = html.replace(
    /\b(CREATE|TABLE|VIEW|FUNCTION|TRIGGER|ALTER|COPY|SELECT|FROM|WHERE|JOIN|PRIMARY|KEY|FOREIGN|REFERENCES|INSERT|UPDATE|DELETE|AS|BEGIN|END|LANGUAGE|CONSTRAINT|INDEX|SCHEMA|POLICY|GRANT|OWNER|SEQUENCE|TYPE|ENUM|EXTENSION|MATERIALIZED)\b/gi,
    '<span class="sql-keyword">$1</span>'
  );
  if (query.trim()) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(escaped, "gi"), (match) => `<mark class="sql-hit">${match}</mark>`);
  }
  return html;
}

export function safeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "object";
}
