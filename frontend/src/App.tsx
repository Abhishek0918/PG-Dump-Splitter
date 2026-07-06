import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import { DataMigration } from "./components/DataMigration";
import { passwordStrength, useLocalAuth } from "./hooks/useLocalAuth";
import type { LocalUser } from "./hooks/useLocalAuth";
import type { DumpObject, JobEvent, JobResponse, RestorePlan, RestoreScript, TreeNode, VisualizationPayload } from "./types";
import { escapeHtml, formatBytes, formatCount, formatDate, formatDuration, highlightSql, iconText, prettyJobName, safeFilename } from "./utils";

type View = "overview" | "files" | "erd" | "dependency" | "sql" | "restore" | "migration";
type InputMode = "path" | "upload";
type ThemeMode = "system" | "light" | "dark";
type ProductView = "home" | "profile" | "splitter" | "migration";

const viewLabels: Record<View, string> = {
  overview: "Overview",
  files: "Output Files",
  erd: "ERD",
  dependency: "Dependency Graph",
  sql: "SQL Preview",
  restore: "Restore Planner",
  migration: "Data Migration"
};

const tabs = (Object.entries(viewLabels) as Array<[View, string]>).filter(([view]) => view !== "migration");

function loadLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) as T;
  } catch {
    return fallback;
  }
}

function initialsFor(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : (parts[0] || "LU").slice(0, 2)).toUpperCase();
}

function flattenTree(node?: TreeNode): TreeNode[] {
  if (!node) return [];
  return [node, ...(node.children || []).flatMap(flattenTree)];
}

function filterTree(node: TreeNode | undefined, query: string): TreeNode | undefined {
  if (!node || !query.trim()) return node;
  const needle = query.toLowerCase();
  const ownMatch = [node.name, node.path, node.object_id, node.object_type, node.schema].some((value) => String(value || "").toLowerCase().includes(needle));
  const children = (node.children || []).map((child) => filterTree(child, query)).filter(Boolean) as TreeNode[];
  if (ownMatch || children.length) return { ...node, children };
  return undefined;
}

function downloadText(filename: string, text: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 400);
}

export default function App() {
  const { user, signIn, signUp, signOut, resetUsers } = useLocalAuth();
  const [theme, setTheme] = useState<ThemeMode>(() => loadLocal<ThemeMode>("pgsplit.theme", "system"));
  const [productView, setProductView] = useState<ProductView>(() => loadLocal<ProductView>("pgsplit.productView", "home"));
  const [activeView, setActiveView] = useState<View>("overview");
  const [inputMode, setInputMode] = useState<InputMode>("path");
  const [dumpPath, setDumpPath] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [activeJob, setActiveJob] = useState<JobResponse | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [navigatorTree, setNavigatorTree] = useState<TreeNode | undefined>();
  const [outputTree, setOutputTree] = useState<TreeNode | undefined>();
  const [visualization, setVisualization] = useState<VisualizationPayload | null>(null);
  const [restorePlan, setRestorePlan] = useState<RestorePlan | null>(null);
  const [selectedObject, setSelectedObject] = useState<DumpObject | null>(null);
  const [selectedSql, setSelectedSql] = useState("");
  const [sqlSearch, setSqlSearch] = useState("");
  const [selectedRestoreSql, setSelectedRestoreSql] = useState("");
  const [restoreMode, setRestoreMode] = useState("full");
  const [restoreSchema, setRestoreSchema] = useState("");
  const [objectFilter, setObjectFilter] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchResults, setSearchResults] = useState<DumpObject[]>([]);
  const [jobFilter, setJobFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [jobSort, setJobSort] = useState("created-desc");
  const [compactJobs, setCompactJobs] = useState(() => localStorage.getItem("pgsplit.compactJobs") === "1");
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem("pgsplit.focusMode") === "1");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [samples, setSamples] = useState<Array<{ time: number; processed: number }>>([]);

  const completed = activeJob?.status === "completed";
  const activeJobId = activeJob?.job_id || "";

  useEffect(() => {
    const applyTheme = () => {
      const resolved = theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      localStorage.setItem("pgsplit.theme", theme);
    };
    applyTheme();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("pgsplit.focusMode", focusMode ? "1" : "0");
  }, [focusMode]);

  useEffect(() => {
    if (activeJob?.status === "running" || activeJob?.status === "queued" || activeJob?.status === "failed") {
      setConsoleOpen(true);
    }
    if (activeJob?.status === "completed") {
      setConsoleOpen(false);
    }
  }, [activeJob?.status]);

  useEffect(() => {
    localStorage.setItem("pgsplit.productView", productView);
  }, [productView]);

  useEffect(() => {
    if (!user) return;
    void refreshJobs(true);
  }, [user]);

  useEffect(() => {
    if (!activeJobId || !["queued", "running"].includes(String(activeJob?.status))) return;
    const timer = window.setInterval(() => void refreshJob(activeJobId), 1000);
    return () => window.clearInterval(timer);
  }, [activeJobId, activeJob?.status]);

  useEffect(() => {
    if (!activeJobId || !globalSearch.trim() || !completed) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const payload = await api.search(activeJobId, globalSearch.trim());
        setSearchResults(payload.items || []);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [activeJobId, completed, globalSearch]);

  const throughput = useMemo(() => {
    if (samples.length < 2) return 0;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const seconds = (last.time - first.time) / 1000;
    return seconds > 0 ? Math.max((last.processed - first.processed) / seconds, 0) : 0;
  }, [samples]);

  const eta = useMemo(() => {
    if (!activeJob || !throughput) return null;
    const remaining = Math.max((activeJob.file_size_bytes || 0) - (activeJob.processed_bytes || 0), 0);
    return remaining > 0 ? remaining / throughput : null;
  }, [activeJob, throughput]);

  const sortedJobs = useMemo(() => {
    let next = [...jobs];
    if (jobFilter.trim()) {
      const needle = jobFilter.toLowerCase();
      next = next.filter((job) => [job.job_id, job.input_name, job.source_path, job.status].some((value) => String(value || "").toLowerCase().includes(needle)));
    }
    if (statusFilter !== "all") next = next.filter((job) => job.status === statusFilter);
    next.sort((a, b) => {
      if (jobSort === "created-asc") return String(a.created_at).localeCompare(String(b.created_at));
      if (jobSort === "size-desc") return (b.file_size_bytes || 0) - (a.file_size_bytes || 0);
      if (jobSort === "duration-desc") return (b.duration_seconds || 0) - (a.duration_seconds || 0);
      return String(b.created_at).localeCompare(String(a.created_at));
    });
    return next;
  }, [jobs, jobFilter, statusFilter, jobSort]);

  const selectedRestoreScript = useMemo(() => {
    const scripts = restorePlan?.scripts || [];
    return scripts.find((script) => script.mode === restoreMode && (script.schema || "") === (restoreMode === "schema" ? restoreSchema : "")) ||
      (restoreMode === "schema" && !restoreSchema ? scripts.find((script) => script.script_name === "schema_only.sql") : undefined) ||
      scripts[0];
  }, [restoreMode, restorePlan?.scripts, restoreSchema]);

  async function refreshJobs(openFirst = false) {
    try {
      const payload = await api.jobs();
      setJobs(payload);
      if (openFirst && payload.length && !activeJob) await openJob(payload[0].job_id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshJob(jobId: string) {
    try {
      const job = await api.job(jobId);
      setActiveJobState(job);
      await loadEvents(jobId);
      if (job.status === "completed") {
        setBusy(false);
        await loadArtifacts(jobId);
        await refreshJobs(false);
      }
      if (job.status === "failed") {
        setBusy(false);
        setMessage(job.message || "Processing failed.");
      }
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function setActiveJobState(job: JobResponse) {
    setActiveJob(job);
    setSamples((previous) => {
      const now = Date.now();
      return [...previous, { time: now, processed: Number(job.processed_bytes) || 0 }].filter((sample) => now - sample.time <= 8000);
    });
  }

  async function openJob(jobId: string) {
    const job = await api.job(jobId);
    setActiveJobState(job);
    await loadEvents(jobId);
    if (job.status === "completed") await loadArtifacts(jobId);
  }

  async function loadEvents(jobId: string) {
    try {
      setEvents(await api.events(jobId));
    } catch {
      setEvents([]);
    }
  }

  async function loadArtifacts(jobId: string) {
    const [treeResult, vizResult, restoreResult] = await Promise.allSettled([api.tree(jobId), api.visualization(jobId), api.restorePlan(jobId)]);
    if (treeResult.status === "fulfilled") {
      setNavigatorTree(treeResult.value.manifest?.navigator);
      setOutputTree(treeResult.value.tree);
    }
    if (vizResult.status === "fulfilled") setVisualization(vizResult.value);
    if (restoreResult.status === "fulfilled") setRestorePlan(restoreResult.value);
  }

  async function submitPath(event: FormEvent) {
    event.preventDefault();
    if (!dumpPath.trim()) return setMessage("Enter a dump path.");
    setBusy(true);
    setMessage("");
    try {
      const job = await api.submitPath(dumpPath.trim());
      setActiveJobState(job);
      await refreshJobs(false);
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("dump-file") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return setMessage("Select a .sql file.");
    setBusy(true);
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);
    const request = new XMLHttpRequest();
    request.open("POST", "/api/jobs/upload");
    request.upload.onprogress = (progress) => {
      if (!progress.lengthComputable) return;
      setActiveJob((previous) => ({
        ...(previous || emptyUploadJob(file.name)),
        status: "running",
        stage: "uploading",
        current_step: `Uploaded ${formatBytes(progress.loaded)} of ${formatBytes(progress.total)}`,
        progress_percent: Math.min(20, (progress.loaded / progress.total) * 20),
        processed_bytes: progress.loaded,
        file_size_bytes: progress.total
      }));
    };
    request.onload = () => {
      try {
        const payload = JSON.parse(request.responseText || "{}") as JobResponse;
        if (request.status < 200 || request.status >= 300) throw new Error(String((payload as unknown as { detail?: string }).detail || request.statusText));
        setActiveJobState(payload);
        void refreshJobs(false);
      } catch (error) {
        setBusy(false);
        setMessage(error instanceof Error ? error.message : String(error));
      }
    };
    request.onerror = () => {
      setBusy(false);
      setMessage("Upload failed.");
    };
    request.send(formData);
  }

  async function selectObject(objectId?: string) {
    if (!activeJobId || !objectId) return;
    try {
      const object = await api.object(activeJobId, objectId);
      const source = await api.source(activeJobId, objectId);
      setSelectedObject(object);
      setSelectedSql(source.sql || "");
      setActiveView("sql");
      if (!focusMode) setInspectorOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function previewRestoreScript() {
    if (!activeJobId || !selectedRestoreScript) return;
    try {
      const payload = await api.restoreScript(activeJobId, selectedRestoreScript.mode, selectedRestoreScript.schema);
      setSelectedRestoreSql(payload.sql || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  if (!user) {
    return <AuthScreen onSignIn={signIn} onSignUp={signUp} onReset={resetUsers} />;
  }

  if (productView === "home") {
    return (
      <ProductShell user={user} view={productView} setView={setProductView} theme={theme} setTheme={setTheme} signOut={signOut}>
        <HomeDashboard
          user={user}
          jobs={jobs}
          activeJob={activeJob}
          onOpenProfile={() => setProductView("profile")}
          onOpenSplitter={() => setProductView("splitter")}
          onOpenMigration={() => setProductView("migration")}
          onOpenJob={(jobId) => {
            void openJob(jobId);
            setProductView("splitter");
          }}
        />
      </ProductShell>
    );
  }

  if (productView === "profile") {
    return (
      <ProductShell user={user} view={productView} setView={setProductView} theme={theme} setTheme={setTheme} signOut={signOut}>
        <ProfilePanel user={user} jobs={jobs} activeJob={activeJob} onOpenSplitter={() => setProductView("splitter")} />
      </ProductShell>
    );
  }

  if (productView === "migration") {
    return (
      <ProductShell user={user} view={productView} setView={setProductView} theme={theme} setTheme={setTheme} signOut={signOut}>
        <DataMigration />
      </ProductShell>
    );
  }

  const progress = Math.max(0, Math.min(Number(activeJob?.progress_percent) || 0, 100));
  const breadcrumb = ["Workspace", activeJob ? prettyJobName(activeJob) : null, viewLabels[activeView], selectedObject?.schema, selectedObject?.object_type, selectedObject?.name].filter(Boolean);

  return (
    <div className={`ide-shell ${focusMode ? "focus-mode" : ""} ${consoleOpen ? "console-open" : "console-collapsed"}`}>
      <header className="splitter-header">
        <div className="splitter-product-bar">
          <button className="splitter-brand" onClick={() => setProductView("home")} type="button">
            <span className="brand-mark">PG</span>
            <span>
              <strong>PGSplit Workspace</strong>
              <small>PostgreSQL dump splitter</small>
            </span>
          </button>
          <nav className="splitter-product-nav">
            <button className="tool-button" onClick={() => setProductView("home")}>Home</button>
            <button className="tool-button active">Database Schema Splitter</button>
            <button className="tool-button" onClick={() => setProductView("migration")}>Migration</button>
            <button className="tool-button" onClick={() => setProductView("profile")}>Profile</button>
          </nav>
          <div className="splitter-product-actions">
            <div className="user-chip"><span>{initialsFor(user.name || user.email)}</span><strong>{user.name || user.email}</strong></div>
            <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeMode)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>
            <button className="tool-button" onClick={signOut}>Logout</button>
          </div>
        </div>
        <div className="splitter-job-bar">
          <div className="job-context">
            <span className={`status-pill ${activeJob?.status || "idle"}`}>{activeJob?.status || "Idle"}</span>
            <div>
              <strong>{activeJob ? prettyJobName(activeJob) : "No active job"}</strong>
              <small>{activeJob?.current_step || "Choose a dump source to begin."}</small>
            </div>
          </div>
          <div className="job-search">
            <input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Search objects, paths, schemas..." />
            <button className="tool-button" onClick={() => setActiveView("overview")}>Search</button>
          </div>
          <div className="job-progress">
            <div className="progress-track"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>
            <strong>{Math.round(progress)}%</strong>
          </div>
          <div className="job-actions">
            <button className={`tool-button ${focusMode ? "active" : ""}`} onClick={() => setFocusMode((value) => !value)}>{focusMode ? "Exit Focus" : "Focus"}</button>
            <button className={`tool-button ${inspectorOpen ? "active" : ""}`} onClick={() => setInspectorOpen((value) => !value)}>Inspector</button>
            <button className="tool-button" onClick={() => void refreshJobs(false)}>Refresh</button>
            <a className={`tool-link ${completed ? "" : "disabled"}`} href={completed ? `/api/jobs/${activeJobId}/manifest` : "#"} target="_blank" rel="noreferrer">Manifest</a>
            <a className={`tool-link primary ${completed ? "" : "disabled"}`} href={completed ? `/api/jobs/${activeJobId}/download` : "#"}>Download</a>
          </div>
        </div>
      </header>

      <main className={`workspace ${inspectorOpen ? "" : "right-collapsed"}`}>
        {!focusMode && (
          <aside className="pane navigator-pane">
            <div className="pane-header"><h2>Navigator</h2></div>
            <section className="navigator-section">
              <div className="section-line"><h3>Objects</h3><input value={objectFilter} onChange={(event) => setObjectFilter(event.target.value)} placeholder="Search objects" /></div>
              <TreeView node={filterTree(navigatorTree, objectFilter)} selectedId={selectedObject?.object_id} onSelect={selectObject} empty="Run or open a completed job." />
            </section>
          </aside>
        )}

        <section className="main-pane">
          <nav className="workbench-tabs">
            {tabs.map(([view, label]) => <button key={view} className={`workbench-tab ${activeView === view ? "active" : ""}`} onClick={() => setActiveView(view)}>{label}</button>)}
          </nav>
          <div className="breadcrumb-bar">{breadcrumb.map((part, index) => <span key={`${part}-${index}`}><span className={index === breadcrumb.length - 1 ? "breadcrumb-part" : ""}>{part}</span>{index < breadcrumb.length - 1 && <span className="breadcrumb-separator">/</span>}</span>)}</div>
          {message && <section className="message visible">{message}</section>}

          {activeView === "overview" && (
            <section className="workbench-view active">
              <section className="quick-start-card">
                <div className="quick-start-copy"><span className="eyebrow">New split</span><h2>Process a PostgreSQL dump</h2><p>Choose a local path or upload a SQL file. Progress, logs, output files, restore scripts, and previews appear in this workspace.</p></div>
                <div className="quick-start-controls">
                  <div className="segmented"><button className={`segment ${inputMode === "path" ? "active" : ""}`} onClick={() => setInputMode("path")}>Use path</button><button className={`segment ${inputMode === "upload" ? "active" : ""}`} onClick={() => setInputMode("upload")}>Upload file</button></div>
                  {inputMode === "path" ? <form className="input-form active" onSubmit={submitPath}><label>SQL dump path</label><div className="inline-submit"><input value={dumpPath} onChange={(event) => setDumpPath(event.target.value)} placeholder="C:\\Users\\abhishek.singh\\Downloads\\dump.sql" disabled={busy} /><button className="run-button" disabled={busy}>Start Split</button></div></form> : <form className="input-form active" onSubmit={submitUpload}><label>SQL dump file</label><div className="inline-submit"><input name="dump-file" type="file" accept=".sql" disabled={busy} /><button className="run-button" disabled={busy}>Upload & Process</button></div></form>}
                </div>
              </section>
              {globalSearch.trim() && <SearchResults query={globalSearch} items={searchResults} onSelect={selectObject} />}
              <div className="overview-grid">
                <Metric label="Objects" value={formatCount(activeJob?.object_count || activeJob?.objects_processed)} />
                <Metric label="Processed" value={`${formatBytes(activeJob?.processed_bytes)} / ${formatBytes(activeJob?.file_size_bytes)}`} />
                <Metric label="Read Speed" value={throughput ? `${formatBytes(throughput)}/s` : "-"} />
                <Metric label="ETA" value={eta ? formatDuration(eta) : "-"} />
                <Metric label="Memory" value={activeJob?.memory_bytes ? formatBytes(activeJob.memory_bytes) : "Unavailable"} />
                <Metric label="Events" value={formatCount(activeJob?.events_count)} />
              </div>
              <JobHistory jobs={sortedJobs} compact={compactJobs} onCompact={() => { const next = !compactJobs; setCompactJobs(next); localStorage.setItem("pgsplit.compactJobs", next ? "1" : "0"); }} onOpen={openJob} activeId={activeJobId} filters={{ jobFilter, statusFilter, jobSort, setJobFilter, setStatusFilter, setJobSort }} />
            </section>
          )}

          {activeView === "files" && <section className="workbench-view active"><TreeView node={filterTree(outputTree, objectFilter)} selectedId={selectedObject?.object_id} onSelect={selectObject} empty="Output files will appear here." /></section>}
          {activeView === "erd" && <section className="workbench-view active"><ErdView visualization={visualization} filter={objectFilter} /></section>}
          {activeView === "dependency" && <section className="workbench-view active"><DependencyView visualization={visualization} filter={objectFilter} /></section>}
          {activeView === "sql" && <section className="workbench-view active"><SqlPreview selectedObject={selectedObject} sql={selectedSql} query={sqlSearch} setQuery={setSqlSearch} /></section>}
          {activeView === "restore" && <section className="workbench-view active"><RestorePlanner plan={restorePlan} jobId={activeJobId} mode={restoreMode} schema={restoreSchema} selectedScript={selectedRestoreScript} sql={selectedRestoreSql} setMode={setRestoreMode} setSchema={setRestoreSchema} onPreview={previewRestoreScript} /></section>}
          {activeView === "migration" && <section className="workbench-view active"><DataMigration /></section>}
        </section>

        <aside className="pane details-pane">
          <div className="pane-header"><h2>Details</h2><button className="icon-control" onClick={() => setInspectorOpen(false)}>&gt;</button></div>
          <DetailsCard title="Job Details" rows={[
            ["Job ID", activeJob?.job_id || "-"], ["Source", prettyJobName(activeJob)], ["File Size", formatBytes(activeJob?.file_size_bytes)], ["Status", activeJob?.status || "-"], ["Created", formatDate(activeJob?.created_at)], ["Started", formatDate(activeJob?.started_at)], ["Finished", formatDate(activeJob?.finished_at)], ["Duration", formatDuration(activeJob?.duration_seconds)], ["Objects", formatCount(activeJob?.object_count)], ["Warnings", formatCount(activeJob?.warning_count)]
          ]} />
          <DetailsCard title="Selected Object" rows={[
            ["Name", selectedObject?.name || "-"], ["Type", selectedObject?.object_type || "-"], ["Schema", selectedObject?.schema || "-"], ["Path", selectedObject?.path || "-"], ["Dependencies", selectedObject?.dependencies?.join(", ") || "-"]
          ]} />
        </aside>
      </main>

      <section className="console-pane">
        <button className="console-header" type="button" onClick={() => setConsoleOpen((value) => !value)}>
          <h2>{consoleOpen ? "Hide Console" : "Show Console"}</h2>
          <div className="console-metrics"><span>stage: {activeJob?.stage || "idle"}</span><span>speed: {throughput ? `${formatBytes(throughput)}/s` : "-"}</span><span>eta: {eta ? formatDuration(eta) : "-"}</span></div>
        </button>
        {consoleOpen && <div className="console-log">{events.length ? events.map((event) => <div className="console-row" key={event.id}><span>{formatDate(event.created_at)}</span><span className={`level-${event.level}`}>{event.level}</span><span>{event.stage}</span><span>{event.message}</span></div>) : "No job events yet."}</div>}
      </section>
    </div>
  );
}

function AuthScreen({ onSignIn, onSignUp, onReset }: { onSignIn: (email: string, password: string, remember: boolean) => Promise<unknown>; onSignUp: (name: string, email: string, password: string, confirm: string) => Promise<unknown>; onReset: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signupPassword, setSignupPassword] = useState("");
  const score = passwordStrength(signupPassword);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await onSignIn(String(form.get("email") || ""), String(form.get("password") || ""), Boolean(form.get("remember")));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await onSignUp(String(form.get("name") || ""), String(form.get("email") || ""), String(form.get("password") || ""), String(form.get("confirm") || ""));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="auth-screen">
      <div className="auth-visual"><div className="auth-brand"><div className="brand-mark auth-mark">PG</div><div><h1>PG Dump Splitter</h1><p>Local workspace for splitting, exploring, and restoring PostgreSQL dumps.</p></div></div><div className="auth-points"><span>React workspace</span><span>No external user DB</span><span>Browser-only session</span></div></div>
      <div className="auth-card">
        <div className="auth-card-header"><span className="eyebrow">Private workspace</span><h2>{mode === "signup" ? "Create your local account" : "Sign in to continue"}</h2><p>Accounts are stored only in this browser. Use this for local/demo access, not production security.</p></div>
        <div className="segmented auth-tabs"><button className={`segment ${mode === "login" ? "active" : ""}`} onClick={() => { setMode("login"); setMessage(""); }}>Login</button><button className={`segment ${mode === "signup" ? "active" : ""}`} onClick={() => { setMode("signup"); setMessage(""); }}>Sign up</button></div>
        {mode === "login" ? <form className="auth-form active" onSubmit={handleLogin}><label>Email</label><input name="email" type="email" placeholder="you@example.com" /><label>Password</label><div className="password-field"><input name="password" type={showPassword ? "text" : "password"} placeholder="Your password" /><button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button></div><label className="check-row"><input name="remember" type="checkbox" defaultChecked /> Keep me signed in locally</label><button className="run-button auth-submit">Login</button></form> : <form className="auth-form active" onSubmit={handleSignup}><label>Name</label><input name="name" placeholder="Your name" /><label>Email</label><input name="email" type="email" placeholder="you@example.com" /><label>Password</label><input name="password" type="password" placeholder="At least 8 characters" value={signupPassword} onChange={(event) => setSignupPassword(event.target.value)} /><div className="strength-meter"><span className={score >= 4 ? "strong" : score >= 3 ? "medium" : ""} style={{ width: `${[0, 18, 42, 72, 100][score]}%` }} /></div><p className="auth-hint">{score >= 4 ? "Strong password." : "Use 8+ characters with letters, numbers, and symbols."}</p><label>Confirm password</label><input name="confirm" type="password" placeholder="Repeat password" /><button className="run-button auth-submit">Create Account</button></form>}
        <div className={`auth-message ${message ? "error" : ""}`}>{message}</div>
        <div className="auth-footer"><span>Local-only auth</span><button className="link-button danger" onClick={() => { if (confirm("Reset all local accounts in this browser?")) onReset(); }}>Reset local accounts</button></div>
      </div>
    </section>
  );
}

function ProductShell({ user, view, setView, theme, setTheme, signOut, children }: { user: LocalUser; view: ProductView; setView: (view: ProductView) => void; theme: ThemeMode; setTheme: (theme: ThemeMode) => void; signOut: () => void; children: ReactNode }) {
  return (
    <div className="product-shell">
      <header className="product-toolbar">
        <button className="product-brand" onClick={() => setView("home")} type="button">
          <span className="brand-mark">PG</span>
          <span>
            <strong>PGSplit Workspace</strong>
            <small>Schema split and PostgreSQL migration</small>
          </span>
        </button>
        <nav className="product-nav">
          <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}>Profile</button>
          <button className={view === "splitter" ? "active" : ""} onClick={() => setView("splitter")}>Database Schema Splitter</button>
          <button className={view === "migration" ? "active" : ""} onClick={() => setView("migration")}>Database Migration</button>
        </nav>
        <div className="product-actions">
          <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeMode)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <div className="user-chip"><span>{initialsFor(user.name || user.email)}</span><strong>{user.name || user.email}</strong></div>
          <button className="tool-button" onClick={signOut}>Logout</button>
        </div>
      </header>
      <main className="product-main">{children}</main>
    </div>
  );
}

function HomeDashboard({ user, jobs, activeJob, onOpenProfile, onOpenSplitter, onOpenMigration, onOpenJob }: { user: LocalUser; jobs: JobResponse[]; activeJob: JobResponse | null; onOpenProfile: () => void; onOpenSplitter: () => void; onOpenMigration: () => void; onOpenJob: (jobId: string) => void }) {
  const completedJobs = jobs.filter((job) => job.status === "completed").length;
  const runningJobs = jobs.filter((job) => job.status === "running" || job.status === "queued").length;
  const totalBytes = jobs.reduce((sum, job) => sum + (job.file_size_bytes || 0), 0);
  const latestJobs = jobs.slice(0, 5);

  return (
    <div className="hub-layout">
      <section className="hub-hero">
        <div>
          <span className="eyebrow">Workspace</span>
          <h2>Welcome, {user.name || user.email}</h2>
          <p>Choose the module you want to work with. The splitter keeps the existing IDE features, while the migration planner focuses on PostgreSQL RDS-to-RDS movement.</p>
        </div>
        <div className="hub-stats">
          <Metric label="Jobs" value={formatCount(jobs.length)} />
          <Metric label="Completed" value={formatCount(completedJobs)} />
          <Metric label="Running" value={formatCount(runningJobs)} />
          <Metric label="Total Size" value={formatBytes(totalBytes)} />
        </div>
      </section>

      <section className="module-grid">
        <button className="module-card profile" onClick={onOpenProfile}>
          <span className="module-icon">ID</span>
          <strong>Profile</strong>
          <p>View your local workspace account, session details, and recent activity.</p>
        </button>
        <button className="module-card splitter primary" onClick={onOpenSplitter}>
          <span className="module-icon">SQL</span>
          <strong>Database Schema Splitter</strong>
          <p>Split PostgreSQL dumps, browse objects, preview SQL, generate restore scripts, and download output.</p>
        </button>
        <button className="module-card migration" onClick={onOpenMigration}>
          <span className="module-icon">RDS</span>
          <strong>Database Migration</strong>
          <p>Design a PostgreSQL RDS-to-RDS migration runbook with commands, validations, and cutover steps.</p>
        </button>
      </section>

      <section className="hub-panel">
        <div className="panel-title">
          <div>
            <h3>Recent splitter jobs</h3>
            <p>{activeJob ? `Active: ${prettyJobName(activeJob)} (${activeJob.status})` : "No active splitter job selected."}</p>
          </div>
          <button className="tool-button" onClick={onOpenSplitter}>Open Splitter</button>
        </div>
        <div className="recent-jobs">
          {latestJobs.length ? latestJobs.map((job) => (
            <button className="recent-job" key={job.job_id} onClick={() => onOpenJob(job.job_id)}>
              <span>
                <strong>{prettyJobName(job)}</strong>
                <small>{formatBytes(job.file_size_bytes)} | {formatDate(job.created_at)}</small>
              </span>
              <span className={`status-pill ${job.status}`}>{job.status}</span>
            </button>
          )) : <div className="empty-state">No jobs yet. Open the schema splitter to process your first dump.</div>}
        </div>
      </section>
    </div>
  );
}

function ProfilePanel({ user, jobs, activeJob, onOpenSplitter }: { user: LocalUser; jobs: JobResponse[]; activeJob: JobResponse | null; onOpenSplitter: () => void }) {
  return (
    <div className="profile-layout">
      <section className="profile-card">
        <div className="profile-avatar">{initialsFor(user.name || user.email)}</div>
        <div>
          <span className="eyebrow">Profile</span>
          <h2>{user.name || "Local User"}</h2>
          <p>{user.email}</p>
        </div>
      </section>
      <section className="profile-grid">
        <DetailsCard title="Account" rows={[
          ["Auth Type", "Local browser email/password"],
          ["Created", formatDate(user.created_at)],
          ["Storage", "localStorage + WebCrypto PBKDF2 hash"],
          ["Server DB", "Not used for users"]
        ]} />
        <DetailsCard title="Workspace" rows={[
          ["Jobs", formatCount(jobs.length)],
          ["Active Job", activeJob ? prettyJobName(activeJob) : "-"],
          ["Active Status", activeJob?.status || "-"],
          ["Objects Parsed", formatCount(activeJob?.object_count)]
        ]} />
      </section>
      <section className="hub-panel">
        <div className="panel-title">
          <div>
            <h3>Security note</h3>
            <p>This login is intentionally lightweight and local-only. It gates the browser workspace, but it is not production server-side authentication.</p>
          </div>
          <button className="run-button" onClick={onOpenSplitter}>Go to Schema Splitter</button>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article>;
}

function TreeView({ node, selectedId, onSelect, empty }: { node?: TreeNode; selectedId?: string; onSelect: (objectId?: string) => void; empty: string }) {
  if (!node) return <div className="tree-wrap empty-state">{empty}</div>;
  return <div className="tree-wrap">{renderNode(node, true, selectedId, onSelect)}</div>;
}

function renderNode(node: TreeNode, root: boolean, selectedId: string | undefined, onSelect: (objectId?: string) => void) {
  const clickable = Boolean(node.object_id);
  const kind = node.icon || node.object_type || node.kind || node.type || "object";
  return (
    <div className={`tree-node ${root ? "root" : ""}`} key={`${node.path || node.object_id || node.name}-${root}`}>
      <button className={`tree-label ${clickable ? "clickable" : ""} ${selectedId === node.object_id ? "selected" : ""}`} onClick={() => clickable && onSelect(node.object_id)} type="button">
        <span className={`tree-icon icon-${kind}`}>{iconText(kind)}</span><strong>{node.name}</strong>{node.count !== undefined && <span className="tree-count">{node.count}</span>}{node.object_type && <span className="tree-tag">{node.object_type}</span>}
      </button>
      {(node.children || []).map((child) => renderNode(child, false, selectedId, onSelect))}
    </div>
  );
}

function SearchResults({ query, items, onSelect }: { query: string; items: DumpObject[]; onSelect: (objectId?: string) => void }) {
  return <section className="search-results-panel"><div className="panel-title"><div><h3>Search Results</h3><p>{items.length.toLocaleString()} matches for "{query}"</p></div></div><div className="search-results">{items.length ? items.map((item) => <button className="search-result" key={item.object_id} onClick={() => onSelect(item.object_id)}><span className={`tree-icon icon-${item.object_type}`}>{iconText(item.object_type)}</span><span><span className="result-title">{item.schema ? `${item.schema}.${item.name}` : item.name}</span><span className="result-path">{item.path || item.object_id}</span></span><span className="tree-tag">{item.object_type}</span></button>) : <div className="command-empty">No matching objects found.</div>}</div></section>;
}

function JobHistory({ jobs, compact, activeId, filters, onCompact, onOpen }: { jobs: JobResponse[]; compact: boolean; activeId: string; filters: { jobFilter: string; statusFilter: string; jobSort: string; setJobFilter: (value: string) => void; setStatusFilter: (value: string) => void; setJobSort: (value: string) => void }; onCompact: () => void; onOpen: (jobId: string) => void }) {
  return <div className="jobs-panel"><div className="jobs-toolbar"><input value={filters.jobFilter} onChange={(event) => filters.setJobFilter(event.target.value)} placeholder="Search jobs" /><select value={filters.statusFilter} onChange={(event) => filters.setStatusFilter(event.target.value)}><option value="all">All</option><option value="completed">Completed</option><option value="running">Running</option><option value="failed">Failed</option><option value="queued">Queued</option></select><select value={filters.jobSort} onChange={(event) => filters.setJobSort(event.target.value)}><option value="created-desc">Newest</option><option value="created-asc">Oldest</option><option value="size-desc">Largest</option><option value="duration-desc">Slowest</option></select><button className="tool-button" onClick={onCompact}>{compact ? "List" : "Compact"}</button></div><div className={`jobs-list ${compact ? "compact" : ""}`}>{jobs.length ? jobs.map((job) => <div className={`job-row ${activeId === job.job_id ? "active" : ""}`} key={job.job_id}><button className="job-open" onClick={() => void onOpen(job.job_id)}><span className="job-name">{prettyJobName(job)}</span><span className="job-meta">{formatBytes(job.file_size_bytes)} | {formatDate(job.created_at)}</span></button><span className={`status-pill ${job.status}`}>{job.status}</span><span className="job-meta">{formatDuration(job.duration_seconds)}</span></div>) : "No jobs found."}</div></div>;
}

function ErdView({ visualization, filter }: { visualization: VisualizationPayload | null; filter: string }) {
  const allTables = visualization?.erd?.tables || [];
  const allRelationships = visualization?.erd?.relationships || [];
  const tables = selectVisibleErdTables(allTables, allRelationships, filter).slice(0, 80);
  const visibleIds = new Set(tables.map((table) => table.id));
  const relationships = allRelationships.filter((relationship) => visibleIds.has(relationship.source_table) && visibleIds.has(relationship.target_table));
  const layout = buildErdLayout(tables);

  if (!allTables.length) {
    return <div className="diagram-wrap empty-state">ERD is not ready.</div>;
  }

  return (
    <div className="diagram-wrap erd-diagram-wrap">
      <div className="viz-stat-row">
        <Metric label="Visible Tables" value={formatCount(tables.length)} />
        <Metric label="FK Relationships" value={formatCount(relationships.length)} />
        <Metric label="Total Tables" value={formatCount(allTables.length)} />
      </div>
      <div className="diagram-toolbar">
        <span>{filter ? `Showing tables connected to "${filter}".` : "Showing database ERD. Use Navigator search to focus a table."}</span>
        {tables.length < allTables.length && <strong>{formatCount(allTables.length - tables.length)} tables hidden for readability</strong>}
      </div>
      <div className="svg-canvas">
        <svg className="erd-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="Entity relationship diagram">
          <defs>
            <marker id="erd-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" className="svg-arrow" />
            </marker>
          </defs>
          <g className="relationship-layer">
            {relationships.map((relationship, index) => {
              const source = layout.positions.get(relationship.source_table);
              const target = layout.positions.get(relationship.target_table);
              if (!source || !target) return null;
              const path = connectorPath(source, target, index);
              const labelX = (source.x + target.x + source.width) / 2;
              const labelY = (source.y + target.y) / 2 - 8;
              return (
                <g key={`${relationship.source_table}-${relationship.target_table}-${index}`}>
                  <path d={path} className="erd-link" markerEnd="url(#erd-arrow)" />
                  <text x={labelX} y={labelY} className="erd-link-label">{relationship.constraint_name || "FK"}</text>
                </g>
              );
            })}
          </g>
          <g className="table-layer">
            {tables.map((table) => {
              const position = layout.positions.get(table.id);
              if (!position) return null;
              const columns = (table.columns || []).slice(0, 8);
              return (
                <g className="erd-table-node" key={table.id} transform={`translate(${position.x}, ${position.y})`}>
                  <rect className="erd-table-box" width={position.width} height={position.height} rx="12" />
                  <rect className="erd-table-head" width={position.width} height="40" rx="12" />
                  <text x="14" y="25" className="erd-table-title">{table.full_name || table.id}</text>
                  {columns.map((column, index) => (
                    <g key={`${table.id}-${column.name}`} transform={`translate(14, ${58 + index * 24})`}>
                      <text className={`erd-column ${column.primary_key ? "pk" : ""} ${column.foreign_key ? "fk" : ""}`} x="0" y="0">
                        {column.primary_key ? "PK " : column.foreign_key ? "FK " : ""}{column.name}
                      </text>
                      <text className="erd-column-type-svg" x={position.width - 28} y="0" textAnchor="end">{column.data_type || ""}</text>
                    </g>
                  ))}
                  {(table.columns?.length || 0) > columns.length && <text x="14" y={position.height - 14} className="erd-more">+{(table.columns?.length || 0) - columns.length} more columns</text>}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

function DependencyView({ visualization, filter }: { visualization: VisualizationPayload | null; filter: string }) {
  const [objectType, setObjectType] = useState("functions");
  const relationships = visualization?.erd?.relationships || [];
  const tableTree = buildFkDependencyTree(relationships, filter);
  const dependentObjects = buildDependentObjects(visualization, objectType, filter);
  const objectTypes = ["functions", "views", "constraints", "indexes", "triggers", "materialized_views", "policies", "sequences"];

  if (!visualization) {
    return <div className="diagram-wrap empty-state">Dependency graph is not ready.</div>;
  }

  return (
    <div className="diagram-wrap dependency-diagram-wrap">
      <div className="viz-stat-row">
        <Metric label="Parent Tables" value={formatCount(tableTree.parentCount)} />
        <Metric label="Dependent Tables" value={formatCount(tableTree.dependentTableCount)} />
        <Metric label="FK Mappings" value={formatCount(tableTree.relationshipCount)} />
      </div>
      <div className="dependency-layout">
        <section className="dependency-panel">
          <div className="panel-title">
            <div>
              <h3>Foreign-Key Dependency Tree</h3>
              <p>Parent tables are referenced by child tables. Use Navigator search to focus a table.</p>
            </div>
          </div>
          {tableTree.parents.length ? (
            <div className="dependency-tree">
              {tableTree.parents.slice(0, 80).map((parent) => (
                <article className="dependency-parent" key={parent.table}>
                  <div className="dependency-parent-head">
                    <strong>{parent.table}</strong>
                    <span>{formatCount(parent.children.length)} child tables</span>
                  </div>
                  <div className="dependency-children">
                    {parent.children.slice(0, 24).map((child) => (
                      <div className="dependency-child" key={`${parent.table}-${child.table}`}>
                        <span>{child.table}</span>
                        <small>{child.columns.join(", ") || "FK"} -&gt; {child.targetColumns.join(", ") || "PK"}</small>
                      </div>
                    ))}
                    {parent.children.length > 24 && <div className="dependency-more">+{parent.children.length - 24} more child tables</div>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">No FK parent-child mappings found.</div>
          )}
        </section>
        <section className="dependency-panel">
          <div className="panel-title">
            <div>
              <h3>Other Dependent Objects</h3>
              <p>Objects that depend on tables or other database objects.</p>
            </div>
            <select value={objectType} onChange={(event) => setObjectType(event.target.value)}>
              {objectTypes.map((type) => <option key={type} value={type}>{type.replace("_", " ")}</option>)}
            </select>
          </div>
          <div className="dependent-object-list">
            {dependentObjects.length ? dependentObjects.slice(0, 140).map((item) => (
              <article className="dependent-object" key={`${item.id}-${item.dependsOn}`}>
                <span className={`tree-icon icon-${item.type}`}>{iconText(item.type)}</span>
                <div>
                  <strong>{item.id}</strong>
                  <small>depends on {item.dependsOn}</small>
                </div>
              </article>
            )) : <div className="empty-state">No dependent {objectType.replace("_", " ")} found.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

type ErdTable = NonNullable<NonNullable<VisualizationPayload["erd"]>["tables"]>[number];
type ErdRelationship = NonNullable<NonNullable<VisualizationPayload["erd"]>["relationships"]>[number];
type DiagramPosition = { x: number; y: number; width: number; height: number };

function selectVisibleErdTables(tables: ErdTable[], relationships: ErdRelationship[], filter: string): ErdTable[] {
  const query = filter.trim().toLowerCase();
  if (!query) return tables;
  const directIds = new Set(
    tables
      .filter((table) => [table.id, table.label, table.schema, table.full_name].some((value) => String(value || "").toLowerCase().includes(query)))
      .map((table) => table.id)
  );
  const connectedIds = new Set(directIds);
  relationships.forEach((relationship) => {
    if (directIds.has(relationship.source_table)) connectedIds.add(relationship.target_table);
    if (directIds.has(relationship.target_table)) connectedIds.add(relationship.source_table);
  });
  return tables.filter((table) => connectedIds.has(table.id));
}

function buildErdLayout(tables: ErdTable[]): { width: number; height: number; positions: Map<string, DiagramPosition> } {
  const cardWidth = 300;
  const baseHeight = 96;
  const rowGap = 44;
  const columnGap = 46;
  const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.max(tables.length, 1)))));
  const positions = new Map<string, DiagramPosition>();
  tables.forEach((table, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const height = Math.max(baseHeight, 72 + Math.min(table.columns?.length || 0, 8) * 24);
    positions.set(table.id, {
      x: 28 + column * (cardWidth + columnGap),
      y: 34 + row * (250 + rowGap),
      width: cardWidth,
      height,
    });
  });
  const rows = Math.max(1, Math.ceil(tables.length / columns));
  return {
    width: 56 + columns * cardWidth + (columns - 1) * columnGap,
    height: 70 + rows * 250 + (rows - 1) * rowGap,
    positions,
  };
}

function connectorPath(source: DiagramPosition, target: DiagramPosition, index: number): string {
  const sourceX = source.x + source.width;
  const sourceY = source.y + 34 + (index % 4) * 8;
  const targetX = target.x;
  const targetY = target.y + 34 + (index % 4) * 8;
  const midX = sourceX + (targetX - sourceX) / 2;
  if (source.x === target.x) {
    const loopX = source.x + source.width + 34 + (index % 5) * 10;
    return `M ${sourceX} ${sourceY} C ${loopX} ${sourceY}, ${loopX} ${targetY}, ${target.x + target.width} ${targetY}`;
  }
  return `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;
}

function buildFkDependencyTree(relationships: ErdRelationship[], filter: string): {
  parentCount: number;
  dependentTableCount: number;
  relationshipCount: number;
  parents: Array<{ table: string; children: Array<{ table: string; columns: string[]; targetColumns: string[]; constraint?: string | null }> }>;
} {
  const query = filter.trim().toLowerCase();
  const parents = new Map<string, Array<{ table: string; columns: string[]; targetColumns: string[]; constraint?: string | null }>>();
  relationships.forEach((relationship) => {
    const parent = relationship.target_table;
    const child = relationship.source_table;
    if (!parent || !child) return;
    if (query && ![parent, child, relationship.constraint_name, ...(relationship.source_columns || []), ...(relationship.target_columns || [])].some((value) => String(value || "").toLowerCase().includes(query))) {
      return;
    }
    const children = parents.get(parent) || [];
    if (!children.some((item) => item.table === child && item.constraint === relationship.constraint_name)) {
      children.push({
        table: child,
        columns: relationship.source_columns || [],
        targetColumns: relationship.target_columns || [],
        constraint: relationship.constraint_name,
      });
    }
    parents.set(parent, children);
  });
  const rows = [...parents.entries()]
    .map(([table, children]) => ({ table, children: children.sort((a, b) => a.table.localeCompare(b.table)) }))
    .sort((a, b) => b.children.length - a.children.length || a.table.localeCompare(b.table));
  const dependentTables = new Set(rows.flatMap((row) => row.children.map((child) => child.table)));
  return {
    parentCount: rows.length,
    dependentTableCount: dependentTables.size,
    relationshipCount: relationships.length,
    parents: rows,
  };
}

function buildDependentObjects(visualization: VisualizationPayload | null, objectType: string, filter: string): Array<{ id: string; type: string; dependsOn: string }> {
  const nodes = new Map((visualization?.dependency_graph?.nodes || []).map((node) => [node.id, node]));
  const query = filter.trim().toLowerCase();
  return (visualization?.dependency_graph?.edges || [])
    .map((edge) => {
      const node = nodes.get(edge.target);
      return { id: edge.target, type: node?.type || "unknown", dependsOn: edge.source };
    })
    .filter((item) => item.type === objectType)
    .filter((item) => !query || [item.id, item.type, item.dependsOn].some((value) => value.toLowerCase().includes(query)))
    .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
}

function SqlPreview({ selectedObject, sql, query, setQuery }: { selectedObject: DumpObject | null; sql: string; query: string; setQuery: (value: string) => void }) {
  return <><div className="sql-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SQL" /><button className="tool-button" onClick={() => navigator.clipboard.writeText(sql)}>Copy</button><button className="tool-button" onClick={() => downloadText(`${safeFilename(selectedObject?.name || "object")}.sql`, sql, "text/sql")} disabled={!sql}>Download Source</button><span className="sql-meta">{selectedObject ? `${selectedObject.object_type} | ${selectedObject.schema || "_global"} | ${selectedObject.path || ""}` : "No source selected"}</span></div><pre className="sql-preview"><code dangerouslySetInnerHTML={{ __html: highlightSql(sql, query) }} /></pre></>;
}

function RestorePlanner({ plan, jobId, mode, schema, selectedScript, sql, setMode, setSchema, onPreview }: { plan: RestorePlan | null; jobId: string; mode: string; schema: string; selectedScript?: RestoreScript; sql: string; setMode: (value: string) => void; setSchema: (value: string) => void; onPreview: () => void }) {
  return <><div className="restore-toolbar"><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="full">Full restore</option><option value="schema">Schema-only / selected schema</option><option value="data">Data-only</option><option value="post_data">Post-data</option></select><select value={schema} onChange={(event) => setSchema(event.target.value)}><option value="">All schemas</option>{(plan?.schemas || []).map((item) => <option key={item} value={item}>{item}</option>)}</select><button className="tool-button" onClick={onPreview} disabled={!selectedScript}>Preview Script</button><a className={`tool-link primary ${jobId ? "" : "disabled"}`} href={jobId ? `/api/jobs/${jobId}/restore-download` : "#"}>Download Restore ZIP</a></div><div className="restore-layout"><section className="restore-panel"><div className="panel-title"><div><h3>Generated Scripts</h3><p>{plan?.scripts?.length ? `${plan.scripts.length} scripts | ${(plan.schemas || []).length} schemas` : "Restore scripts will appear after a completed split."}</p></div></div><div className="restore-scripts">{(plan?.scripts || []).map((script) => <article className={`restore-script-card ${script.path === selectedScript?.path ? "active" : ""}`} key={script.path}><div><span className="restore-script-title">{script.script_name}</span><span className="restore-script-meta">{script.mode} {script.schema || ""} | {formatCount(script.object_count)} objects | data {script.includes_data ? "yes" : "no"}</span></div></article>)}</div>{(selectedScript?.warnings || plan?.warnings || []).map((warning) => <div className="warning-line" key={warning}>{warning}</div>)}</section><section className="restore-panel restore-preview-panel"><div className="panel-title"><div><h3>Restore Preview</h3><p>{selectedScript?.path || "Select a restore script to inspect its psql include order."}</p></div></div><pre className="sql-preview restore-preview"><code dangerouslySetInnerHTML={{ __html: highlightSql(sql || "No restore script selected.") }} /></pre></section></div></>;
}

function DetailsCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <section className="details-card"><h3>{title}</h3><dl className="details-list">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>;
}

function emptyUploadJob(name: string): JobResponse {
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
    events_count: 0
  };
}
