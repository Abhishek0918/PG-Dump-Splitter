import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, getAuthToken } from "../api";
import { useAppAuth, useWorkspace } from "../contexts/AppContext";
import { TreeView } from "../components/TreeView";
import { SearchResults } from "../components/SearchResults";
import { SchemaIntelligencePanel } from "../components/SchemaIntelligencePanel";
import { JobHistory } from "../components/JobHistory";
import { ErdView } from "../components/ErdView";
import { DependencyView } from "../components/DependencyView";
import { SqlPreview } from "../components/SqlPreview";
import { RestorePlanner } from "../components/RestorePlanner";
import { DetailsCard } from "../components/DetailsCard";
import { Metric } from "../components/Metric";
import { downloadAuthorized, emptyUploadJob, filterTree } from "../helpers";
import type { DumpObject, JobEvent, JobResponse } from "../types";
import {
  formatBytes,
  formatCount,
  formatDate,
  formatDuration,
  prettyJobName,
  safeFilename
} from "../utils";

type View = "overview" | "files" | "erd" | "dependency" | "sql" | "restore";
type InputMode = "path" | "upload";

const viewLabels: Record<View, string> = {
  overview: "Overview",
  files: "Output Files",
  erd: "ERD",
  dependency: "Dependency Graph",
  sql: "SQL Preview",
  restore: "Restore Planner"
};

const tabs = Object.entries(viewLabels) as Array<[View, string]>;

export default function SplitterPage() {
  const { user } = useAppAuth();
  const {
    jobs,
    activeJob,
    setActiveJob,
    refreshJobs,
    openJob,
    navigatorTree,
    outputTree,
    visualization,
    schemaIntelligence,
    restorePlan
  } = useWorkspace();

  const [activeView, setActiveView] = useState<View>("overview");
  const [inputMode, setInputMode] = useState<InputMode>("path");
  const [dumpPath, setDumpPath] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<JobEvent[]>([]);
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
    if (!activeJobId) {
      setEvents([]);
      return;
    }
    void loadEvents(activeJobId);
  }, [activeJobId]);

  useEffect(() => {
    if (!activeJobId || !["queued", "running"].includes(String(activeJob?.status))) return;
    const timer = window.setInterval(() => void refreshActiveJob(activeJobId), 1000);
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
      next = next.filter((job) =>
        [job.job_id, job.input_name, job.source_path, job.status].some((value) =>
          String(value || "").toLowerCase().includes(needle)
        )
      );
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
    return (
      scripts.find(
        (script) =>
          script.mode === restoreMode &&
          (script.schema || "") === (restoreMode === "schema" ? restoreSchema : "")
      ) ||
      (restoreMode === "schema" && !restoreSchema
        ? scripts.find((script) => script.script_name === "schema_only.sql")
        : undefined) ||
      scripts[0]
    );
  }, [restoreMode, restorePlan?.scripts, restoreSchema]);

  const filteredNavigatorTree = useMemo(
    () => filterTree(navigatorTree, objectFilter),
    [navigatorTree, objectFilter]
  );
  const filteredOutputTree = useMemo(
    () => filterTree(outputTree, objectFilter),
    [outputTree, objectFilter]
  );

  function updateJobWithSamples(job: JobResponse) {
    setActiveJob(job);
    setSamples((previous) => {
      const now = Date.now();
      return [...previous, { time: now, processed: Number(job.processed_bytes) || 0 }].filter(
        (sample) => now - sample.time <= 8000
      );
    });
  }

  async function refreshActiveJob(jobId: string) {
    try {
      const job = await api.job(jobId);
      updateJobWithSamples(job);
      await loadEvents(jobId);
      if (job.status === "completed") {
        setBusy(false);
        await openJob(jobId);
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

  async function loadEvents(jobId: string) {
    try {
      setEvents(await api.events(jobId));
    } catch {
      setEvents([]);
    }
  }

  async function submitPath(event: FormEvent) {
    event.preventDefault();
    if (!dumpPath.trim()) return setMessage("Enter a dump path.");
    setBusy(true);
    setMessage("");
    try {
      const job = await api.submitPath(dumpPath.trim());
      updateJobWithSamples(job);
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
    const token = getAuthToken();
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.upload.onprogress = (progress) => {
      if (!progress.lengthComputable) return;
      setActiveJob({
        ...(activeJob || emptyUploadJob(file.name)),
        status: "running",
        stage: "uploading",
        current_step: `Uploaded ${formatBytes(progress.loaded)} of ${formatBytes(progress.total)}`,
        progress_percent: Math.min(20, (progress.loaded / progress.total) * 20),
        processed_bytes: progress.loaded,
        file_size_bytes: progress.total
      });
    };
    request.onload = () => {
      try {
        const payload = JSON.parse(request.responseText || "{}") as JobResponse;
        if (request.status < 200 || request.status >= 300) {
          throw new Error(String((payload as unknown as { detail?: string }).detail || request.statusText));
        }
        updateJobWithSamples(payload);
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

  const progress = Math.max(0, Math.min(Number(activeJob?.progress_percent) || 0, 100));
  const breadcrumb = [
    "Workspace",
    activeJob ? prettyJobName(activeJob) : null,
    viewLabels[activeView],
    selectedObject?.schema,
    selectedObject?.object_type,
    selectedObject?.name
  ].filter(Boolean);

  if (!user) return null;

  return (
    <div className={`ide-shell ${focusMode ? "focus-mode" : ""} ${consoleOpen ? "console-open" : "console-collapsed"}`}>
      <header className="splitter-header">
        <div className="splitter-job-bar">
          <div className="job-context">
            <span className={`status-pill ${activeJob?.status || "idle"}`}>{activeJob?.status || "Idle"}</span>
            <div>
              <strong>{activeJob ? prettyJobName(activeJob) : "No active job"}</strong>
              <small>{activeJob?.current_step || "Choose a dump source to begin."}</small>
            </div>
          </div>
          <div className="job-search">
            <input
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              placeholder="Search objects, paths, schemas..."
            />
            <button className="tool-button" onClick={() => setActiveView("overview")}>Search</button>
          </div>
          <div className="job-progress">
            <div className="progress-track"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>
            <strong>{Math.round(progress)}%</strong>
          </div>
          <div className="job-actions">
            <button
              className={`tool-button ${focusMode ? "active" : ""}`}
              onClick={() => setFocusMode((value) => !value)}
            >
              {focusMode ? "Exit Focus" : "Focus"}
            </button>
            <button
              className={`tool-button ${inspectorOpen ? "active" : ""}`}
              onClick={() => setInspectorOpen((value) => !value)}
            >
              Inspector
            </button>
            <button className="tool-button" onClick={() => void refreshJobs(false)}>Refresh</button>
            <button
              className={`tool-link ${completed ? "" : "disabled"}`}
              disabled={!completed}
              onClick={() =>
                void downloadAuthorized(
                  `/api/jobs/${activeJobId}/manifest`,
                  `${safeFilename(prettyJobName(activeJob) || "manifest")}.manifest.json`
                )
              }
            >
              Manifest
            </button>
            <button
              className={`tool-link primary ${completed ? "" : "disabled"}`}
              disabled={!completed}
              onClick={() =>
                void downloadAuthorized(
                  `/api/jobs/${activeJobId}/download`,
                  `${safeFilename(prettyJobName(activeJob) || "dump")}_split_output.zip`
                )
              }
            >
              Download
            </button>
          </div>
        </div>
      </header>

      <main className={`workspace ${inspectorOpen ? "" : "right-collapsed"}`}>
        {!focusMode && (
          <aside className="pane navigator-pane">
            <div className="pane-header"><h2>Navigator</h2></div>
            <section className="navigator-section">
              <div className="section-line">
                <h3>Objects</h3>
                <input
                  value={objectFilter}
                  onChange={(event) => setObjectFilter(event.target.value)}
                  placeholder="Search objects"
                />
              </div>
              <TreeView
                node={filteredNavigatorTree}
                selectedId={selectedObject?.object_id}
                onSelect={selectObject}
                empty="Run or open a completed job."
              />
            </section>
          </aside>
        )}

        <section className="main-pane">
          <nav className="workbench-tabs">
            {tabs.map(([view, label]) => (
              <button
                key={view}
                className={`workbench-tab ${activeView === view ? "active" : ""}`}
                onClick={() => setActiveView(view)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="breadcrumb-bar">
            {breadcrumb.map((part, index) => (
              <span key={`${part}-${index}`}>
                <span className={index === breadcrumb.length - 1 ? "breadcrumb-part" : ""}>{part}</span>
                {index < breadcrumb.length - 1 && <span className="breadcrumb-separator">/</span>}
              </span>
            ))}
          </div>
          {message && <section className="message visible">{message}</section>}

          {activeView === "overview" && (
            <section className="workbench-view active">
              <section className="quick-start-card">
                <div className="quick-start-copy">
                  <span className="eyebrow">New split</span>
                  <h2>Process a PostgreSQL dump</h2>
                  <p>Choose a local path or upload a SQL file. Progress, logs, output files, restore scripts, and previews appear in this workspace.</p>
                </div>
                <div className="quick-start-controls">
                  <div className="segmented">
                    <button
                      className={`segment ${inputMode === "path" ? "active" : ""}`}
                      onClick={() => setInputMode("path")}
                    >
                      Use path
                    </button>
                    <button
                      className={`segment ${inputMode === "upload" ? "active" : ""}`}
                      onClick={() => setInputMode("upload")}
                    >
                      Upload file
                    </button>
                  </div>
                  {inputMode === "path" ? (
                    <form className="input-form active" onSubmit={submitPath}>
                      <label>SQL dump path</label>
                      <div className="inline-submit">
                        <input
                          value={dumpPath}
                          onChange={(event) => setDumpPath(event.target.value)}
                          placeholder="C:\\Users\\abhishek.singh\\Downloads\\dump.sql"
                          disabled={busy}
                        />
                        <button className="run-button" disabled={busy}>Start Split</button>
                      </div>
                    </form>
                  ) : (
                    <form className="input-form active" onSubmit={submitUpload}>
                      <label>SQL dump file</label>
                      <div className="inline-submit">
                        <input name="dump-file" type="file" accept=".sql" disabled={busy} />
                        <button className="run-button" disabled={busy}>Upload & Process</button>
                      </div>
                    </form>
                  )}
                </div>
              </section>

              {globalSearch.trim() && (
                <SearchResults query={globalSearch} items={searchResults} onSelect={selectObject} />
              )}

              <div className="overview-grid">
                <Metric label="Objects" value={formatCount(activeJob?.object_count || activeJob?.objects_processed)} />
                <Metric label="Processed" value={`${formatBytes(activeJob?.processed_bytes)} / ${formatBytes(activeJob?.file_size_bytes)}`} />
                <Metric label="Read Speed" value={throughput ? `${formatBytes(throughput)}/s` : "-"} />
                <Metric label="ETA" value={eta ? formatDuration(eta) : "-"} />
                <Metric label="Memory" value={activeJob?.memory_bytes ? formatBytes(activeJob.memory_bytes) : "Unavailable"} />
                <Metric label="Events" value={formatCount(activeJob?.events_count)} />
              </div>

              <SchemaIntelligencePanel intelligence={schemaIntelligence} />

              <JobHistory
                jobs={sortedJobs}
                compact={compactJobs}
                onCompact={() => {
                  const next = !compactJobs;
                  setCompactJobs(next);
                  localStorage.setItem("pgsplit.compactJobs", next ? "1" : "0");
                }}
                onOpen={(jobId) => void openJob(jobId)}
                activeId={activeJobId}
                filters={{ jobFilter, statusFilter, jobSort, setJobFilter, setStatusFilter, setJobSort }}
              />
            </section>
          )}

          {activeView === "files" && (
            <section className="workbench-view active">
              <TreeView
                node={filteredOutputTree}
                selectedId={selectedObject?.object_id}
                onSelect={selectObject}
                empty="Output files will appear here."
              />
            </section>
          )}

          {activeView === "erd" && (
            <section className="workbench-view active">
              <ErdView visualization={visualization} filter={objectFilter} />
            </section>
          )}

          {activeView === "dependency" && (
            <section className="workbench-view active">
              <DependencyView visualization={visualization} filter={objectFilter} />
            </section>
          )}

          {activeView === "sql" && (
            <section className="workbench-view active">
              <SqlPreview
                selectedObject={selectedObject}
                sql={selectedSql}
                query={sqlSearch}
                setQuery={setSqlSearch}
              />
            </section>
          )}

          {activeView === "restore" && (
            <section className="workbench-view active">
              <RestorePlanner
                plan={restorePlan}
                jobId={activeJobId}
                mode={restoreMode}
                schema={restoreSchema}
                selectedScript={selectedRestoreScript}
                sql={selectedRestoreSql}
                setMode={setRestoreMode}
                setSchema={setRestoreSchema}
                onPreview={previewRestoreScript}
              />
            </section>
          )}
        </section>

        <aside className="pane details-pane">
          <div className="pane-header">
            <h2>Details</h2>
            <button className="icon-control" onClick={() => setInspectorOpen(false)}>&gt;</button>
          </div>
          <DetailsCard
            title="Job Details"
            rows={[
              ["Job ID", activeJob?.job_id || "-"],
              ["Source", prettyJobName(activeJob)],
              ["File Size", formatBytes(activeJob?.file_size_bytes)],
              ["Status", activeJob?.status || "-"],
              ["Created", formatDate(activeJob?.created_at)],
              ["Started", formatDate(activeJob?.started_at)],
              ["Finished", formatDate(activeJob?.finished_at)],
              ["Duration", formatDuration(activeJob?.duration_seconds)],
              ["Objects", formatCount(activeJob?.object_count)],
              ["Warnings", formatCount(activeJob?.warning_count)]
            ]}
          />
          <DetailsCard
            title="Selected Object"
            rows={[
              ["Name", selectedObject?.name || "-"],
              ["Type", selectedObject?.object_type || "-"],
              ["Schema", selectedObject?.schema || "-"],
              ["Path", selectedObject?.path || "-"],
              ["Dependencies", selectedObject?.dependencies?.join(", ") || "-"]
            ]}
          />
        </aside>
      </main>

      <section className="console-pane">
        <button className="console-header" type="button" onClick={() => setConsoleOpen((value) => !value)}>
          <h2>{consoleOpen ? "Hide Console" : "Show Console"}</h2>
          <div className="console-metrics">
            <span>stage: {activeJob?.stage || "idle"}</span>
            <span>speed: {throughput ? `${formatBytes(throughput)}/s` : "-"}</span>
            <span>eta: {eta ? formatDuration(eta) : "-"}</span>
          </div>
        </button>
        {consoleOpen && (
          <div className="console-log">
            {events.length
              ? events.map((event) => (
                  <div className="console-row" key={event.id}>
                    <span>{formatDate(event.created_at)}</span>
                    <span className={`level-${event.level}`}>{event.level}</span>
                    <span>{event.stage}</span>
                    <span>{event.message}</span>
                  </div>
                ))
              : "No job events yet."}
          </div>
        )}
      </section>
    </div>
  );
}
