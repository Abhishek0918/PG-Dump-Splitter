export type JobStatus = "queued" | "running" | "completed" | "failed" | string;

export interface JobResponse {
  job_id: string;
  source_path: string;
  source_type: string;
  input_name: string;
  status: JobStatus;
  message?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  output_dir?: string | null;
  archive_path?: string | null;
  object_count: number;
  warning_count: number;
  file_size_bytes: number;
  processed_bytes: number;
  progress_percent: number;
  stage: string;
  current_step: string;
  duration_seconds?: number | null;
  memory_bytes?: number | null;
  objects_processed: number;
  events_count: number;
  repository_mode?: boolean;
}

export interface JobEvent {
  id: number;
  job_id: string;
  created_at: string;
  level: string;
  stage: string;
  message: string;
  metadata: Record<string, unknown>;
}

export interface DumpObject {
  object_id: string;
  object_type: string;
  schema?: string | null;
  name: string;
  path?: string | null;
  dependencies?: string[];
  attributes?: Record<string, unknown>;
  line_start?: number | null;
  line_end?: number | null;
}

export interface TreeNode {
  name: string;
  type?: string;
  kind?: string;
  icon?: string;
  path?: string;
  object_id?: string;
  object_type?: string;
  schema?: string | null;
  count?: number;
  children?: TreeNode[];
}

export interface TreePayload {
  job_id: string;
  tree?: TreeNode;
  manifest?: {
    navigator?: TreeNode;
    schemas?: string[];
    statistics?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface VisualizationPayload {
  erd?: {
    tables?: Array<{
      id: string;
      label: string;
      schema?: string | null;
      full_name?: string;
      column_count?: number;
      columns?: Array<{ name: string; data_type?: string; primary_key?: boolean; foreign_key?: boolean }>;
    }>;
    relationships?: Array<{
      source_table: string;
      target_table: string;
      source_columns?: string[];
      target_columns?: string[];
      constraint_name?: string | null;
      type?: string;
    }>;
  };
  dependency_graph?: {
    nodes?: Array<{ id: string; label?: string; schema?: string | null; type?: string }>;
    edges?: Array<{ source: string; target: string; type?: string }>;
  };
}

export interface RestoreScript {
  script_name: string;
  path: string;
  mode: string;
  schema?: string | null;
  object_count: number;
  includes_data: boolean;
  warnings?: string[];
  objects?: string[];
}

export interface RestorePlan {
  job_id?: string;
  scripts?: RestoreScript[];
  schemas?: string[];
  warnings?: string[];
}

export interface RestoreScriptPayload {
  job_id: string;
  mode: string;
  schema?: string | null;
  script_name: string;
  path: string;
  sql: string;
  metadata: RestoreScript;
}

export interface SourcePayload {
  object_id: string;
  path?: string | null;
  sql?: string | null;
}

export interface SearchPayload {
  job_id: string;
  query: string;
  count: number;
  items: DumpObject[];
  facets: {
    by_type?: Record<string, number>;
    by_schema?: Record<string, number>;
  };
}
