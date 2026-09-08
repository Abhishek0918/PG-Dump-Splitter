import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, setAuthToken } from "../api";
import type { ServerUser } from "../api";
import { useAuth } from "../hooks/useAuth";
import type { JobResponse, TreeNode, VisualizationPayload, SchemaIntelligencePayload, RestorePlan } from "../types";

export type { ServerUser } from "../api";
export type ThemeMode = "system" | "light" | "dark";

// ─── helpers ──────────────────────────────────────────
function loadLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) as T;
  } catch {
    return fallback;
  }
}

// ─── Auth Context ─────────────────────────────────────
interface AuthContextValue {
  user: ServerUser | null;
  loading: boolean;
  signIn: (email: string, password: string, remember: boolean) => Promise<ServerUser>;
  signUp: (name: string, email: string, password: string, confirm: string) => Promise<ServerUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAppAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAppAuth must be used inside AppProviders");
  return ctx;
}

// ─── Theme Context ────────────────────────────────────
interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside AppProviders");
  return ctx;
}

// ─── Workspace Context ────────────────────────────────
interface WorkspaceContextValue {
  jobs: JobResponse[];
  activeJob: JobResponse | null;
  setActiveJob: (job: JobResponse | null) => void;
  refreshJobs: (openFirst?: boolean) => Promise<void>;
  openJob: (jobId: string) => Promise<void>;
  // Artifact data loaded after a job completes
  navigatorTree: TreeNode | undefined;
  outputTree: TreeNode | undefined;
  visualization: VisualizationPayload | null;
  schemaIntelligence: SchemaIntelligencePayload | null;
  restorePlan: RestorePlan | null;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside AppProviders");
  return ctx;
}

// ─── Combined Provider ────────────────────────────────
export function AppProviders({ children }: { children: ReactNode }) {
  // Auth
  const auth = useAuth();

  // Theme
  const [theme, setThemeState] = useState<ThemeMode>(() => loadLocal<ThemeMode>("pgsplit.theme", "system"));

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      const resolved = theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      localStorage.setItem("pgsplit.theme", JSON.stringify(theme));
    };
    applyTheme();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  // Workspace
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [activeJob, setActiveJob] = useState<JobResponse | null>(null);
  const [navigatorTree, setNavigatorTree] = useState<TreeNode | undefined>();
  const [outputTree, setOutputTree] = useState<TreeNode | undefined>();
  const [visualization, setVisualization] = useState<VisualizationPayload | null>(null);
  const [schemaIntelligence, setSchemaIntelligence] = useState<SchemaIntelligencePayload | null>(null);
  const [restorePlan, setRestorePlan] = useState<RestorePlan | null>(null);

  const loadArtifacts = useCallback(async (jobId: string) => {
    const [treeResult, vizResult, intelligenceResult, restoreResult] = await Promise.allSettled([
      api.tree(jobId),
      api.visualization(jobId),
      api.schemaIntelligence(jobId),
      api.restorePlan(jobId),
    ]);
    if (treeResult.status === "fulfilled") {
      setNavigatorTree(treeResult.value.manifest?.navigator);
      setOutputTree(treeResult.value.tree);
    }
    if (vizResult.status === "fulfilled") setVisualization(vizResult.value);
    if (intelligenceResult.status === "fulfilled") setSchemaIntelligence(intelligenceResult.value);
    if (restoreResult.status === "fulfilled") setRestorePlan(restoreResult.value);
  }, []);

  const openJob = useCallback(async (jobId: string) => {
    const job = await api.job(jobId);
    setActiveJob(job);
    if (job.status === "completed") await loadArtifacts(jobId);
  }, [loadArtifacts]);

  const refreshJobs = useCallback(async (openFirst = false) => {
    try {
      const payload = await api.jobs();
      setJobs(payload);
      if (openFirst && payload.length && !activeJob) {
        await openJob(payload[0].job_id);
      }
    } catch {
      // Silently ignore — pages handle their own error display
    }
  }, [activeJob, openJob]);

  // Auto-fetch jobs when user becomes available
  useEffect(() => {
    if (!auth.user) return;
    void refreshJobs(true);
  }, [auth.user]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider value={auth}>
      <ThemeContext.Provider value={{ theme, setTheme }}>
        <WorkspaceContext.Provider
          value={{
            jobs,
            activeJob,
            setActiveJob,
            refreshJobs,
            openJob,
            navigatorTree,
            outputTree,
            visualization,
            schemaIntelligence,
            restorePlan,
          }}
        >
          {children}
        </WorkspaceContext.Provider>
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}
