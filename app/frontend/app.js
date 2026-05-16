const state = {
  mode: "path",
  jobId: null,
  pollingTimer: null,
  activeJob: null,
  jobs: [],
  navigator: null,
  outputTree: null,
  selectedObject: null,
  objectCache: new Map(),
  explorerView: "navigator",
  filterText: "",
};

const elements = {
  modePath: document.getElementById("mode-path"),
  modeUpload: document.getElementById("mode-upload"),
  pathForm: document.getElementById("path-form"),
  uploadForm: document.getElementById("upload-form"),
  pathSubmit: document.getElementById("path-submit"),
  uploadSubmit: document.getElementById("upload-submit"),
  dumpPath: document.getElementById("dump-path"),
  dumpFile: document.getElementById("dump-file"),
  statusLabel: document.getElementById("status-label"),
  stepLabel: document.getElementById("step-label"),
  percentLabel: document.getElementById("percent-label"),
  progressBar: document.getElementById("progress-bar"),
  message: document.getElementById("message"),
  downloadLink: document.getElementById("download-link"),
  manifestLink: document.getElementById("manifest-link"),
  summaryGrid: document.getElementById("summary-grid"),
  treeWrap: document.getElementById("tree-wrap"),
  navigatorWrap: document.getElementById("navigator-wrap"),
  navigatorTab: document.getElementById("navigator-tab"),
  filesTab: document.getElementById("files-tab"),
  navigatorView: document.getElementById("navigator-view"),
  filesView: document.getElementById("files-view"),
  refreshJobs: document.getElementById("refresh-jobs"),
  jobsList: document.getElementById("jobs-list"),
  objectFilter: document.getElementById("object-filter"),
  objectMeta: document.getElementById("object-meta"),
  objectPill: document.getElementById("object-pill"),
  sourcePreview: document.getElementById("source-preview"),
  loadSource: document.getElementById("load-source"),
  details: {
    jobId: document.getElementById("detail-job-id"),
    source: document.getElementById("detail-source"),
    fileSize: document.getElementById("detail-file-size"),
    status: document.getElementById("detail-status"),
    created: document.getElementById("detail-created"),
    started: document.getElementById("detail-started"),
    finished: document.getElementById("detail-finished"),
    duration: document.getElementById("detail-duration"),
    objects: document.getElementById("detail-objects"),
    warnings: document.getElementById("detail-warnings"),
  },
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || response.statusText);
  }
  return payload;
}

function setMode(mode) {
  state.mode = mode;
  elements.modePath.classList.toggle("active", mode === "path");
  elements.modeUpload.classList.toggle("active", mode === "upload");
  elements.pathForm.classList.toggle("active", mode === "path");
  elements.uploadForm.classList.toggle("active", mode === "upload");
  clearMessage();
}

function setExplorerView(view) {
  state.explorerView = view;
  elements.navigatorTab.classList.toggle("active", view === "navigator");
  elements.filesTab.classList.toggle("active", view === "files");
  elements.navigatorView.classList.toggle("active", view === "navigator");
  elements.filesView.classList.toggle("active", view === "files");
}

function setBusy(isBusy) {
  elements.pathSubmit.disabled = isBusy;
  elements.uploadSubmit.disabled = isBusy;
  elements.dumpPath.disabled = isBusy;
  elements.dumpFile.disabled = isBusy;
  elements.modePath.disabled = isBusy;
  elements.modeUpload.disabled = isBusy;
}

function setProgress(percent, status, step) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  elements.progressBar.style.width = `${safePercent}%`;
  elements.percentLabel.textContent = `${Math.round(safePercent)}%`;
  elements.statusLabel.innerHTML = `<span class="badge ${escapeHtml(status || "queued")}">${escapeHtml(status || "queued")}</span>`;
  elements.stepLabel.textContent = step || "Waiting";
}

function renderJob(job) {
  state.activeJob = job;
  state.jobId = job.job_id;
  renderJobs();
  setProgress(job.progress_percent, job.status, job.current_step);

  elements.details.jobId.textContent = job.job_id || "-";
  elements.details.source.textContent = `${job.source_type || "-"} | ${job.input_name || job.source_path || "-"}`;
  elements.details.fileSize.textContent = formatBytes(job.file_size_bytes);
  elements.details.status.textContent = job.status || "-";
  elements.details.created.textContent = formatDate(job.created_at);
  elements.details.started.textContent = formatDate(job.started_at);
  elements.details.finished.textContent = formatDate(job.finished_at);
  elements.details.duration.textContent = formatDuration(job.duration_seconds);
  elements.details.objects.textContent = String(job.object_count || 0);
  elements.details.warnings.textContent = String(job.warning_count || 0);

  if (job.status === "completed") {
    setBusy(false);
    stopPolling();
    enableOutputActions(job.job_id);
    loadOutputStructure(job.job_id);
  } else if (job.status === "failed") {
    setBusy(false);
    stopPolling();
    showError(job.message || "Processing failed");
  }
}

async function submitPath(event) {
  event.preventDefault();
  const dumpPath = elements.dumpPath.value.trim();
  if (!dumpPath) {
    showError("Enter a dump path first.");
    return;
  }

  setBusy(true);
  clearMessage();
  setProgress(0, "queued", "Submitting path job");

  try {
    const job = await requestJson("/api/jobs/path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dump_path: dumpPath }),
    });
    renderJob(job);
    startPolling(job.job_id);
  } catch (error) {
    setBusy(false);
    showError(error.message);
  }
}

function submitUpload(event) {
  event.preventDefault();
  const file = elements.dumpFile.files[0];
  if (!file) {
    showError("Select a .sql file first.");
    return;
  }

  setBusy(true);
  clearMessage();
  setProgress(0, "uploading", "Uploading SQL file");

  const formData = new FormData();
  formData.append("file", file);

  const request = new XMLHttpRequest();
  request.open("POST", "/api/jobs/upload");
  request.upload.onprogress = (event) => {
    if (!event.lengthComputable) {
      return;
    }
    const percent = Math.min(20, (event.loaded / event.total) * 20);
    setProgress(percent, "uploading", `Uploaded ${formatBytes(event.loaded)} of ${formatBytes(event.total)}`);
  };
  request.onload = () => {
    try {
      const payload = JSON.parse(request.responseText || "{}");
      if (request.status < 200 || request.status >= 300) {
        throw new Error(payload.detail || request.statusText);
      }
      renderJob(payload);
      startPolling(payload.job_id);
    } catch (error) {
      setBusy(false);
      showError(error.message);
    }
  };
  request.onerror = () => {
    setBusy(false);
    showError("Upload failed.");
  };
  request.send(formData);
}

function startPolling(jobId) {
  stopPolling();
  state.pollingTimer = window.setInterval(async () => {
    try {
      const job = await requestJson(`/api/jobs/${jobId}`);
      renderJob(job);
    } catch (error) {
      stopPolling();
      setBusy(false);
      showError(error.message);
    }
  }, 1000);
}

function stopPolling() {
  if (state.pollingTimer) {
    window.clearInterval(state.pollingTimer);
    state.pollingTimer = null;
  }
}

async function loadOutputStructure(jobId) {
  elements.navigatorWrap.textContent = "Loading navigator...";
  elements.treeWrap.textContent = "Loading output files...";
  try {
    const payload = await requestJson(`/api/jobs/${jobId}/tree`);
    state.objectCache = new Map();
    state.selectedObject = null;
    state.navigator = payload.manifest?.navigator || null;
    state.outputTree = payload.tree || null;
    renderSummary(payload.manifest || {});
    renderSelectedObject();
    renderNavigator();
    renderFiles();
  } catch (error) {
    elements.navigatorWrap.textContent = error.message;
    elements.treeWrap.textContent = error.message;
  }
}

function renderSummary(manifest) {
  const summary = manifest.summary || {};
  const byType = manifest.counts_by_type || {};
  const bySchema = manifest.counts_by_schema || {};
  const schemaIndex = manifest.schema_index || {};
  const cards = [
    ["Schemas", (summary.schemas || []).length],
    ["Objects", summary.objects || 0],
    ["Dependencies", summary.dependencies || 0],
    ["Restore Items", summary.restore_items || 0],
    ["Top Object Type", topEntry(byType)],
    ["Top Schema", topEntry(bySchema)],
    ["Indexed Schemas", Object.keys(schemaIndex).length],
  ];
  elements.summaryGrid.innerHTML = cards
    .map(([label, value]) => `<div class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`)
    .join("");
}

function renderFiles() {
  if (!state.outputTree) {
    elements.treeWrap.textContent = "No generated file tree available.";
    return;
  }
  elements.treeWrap.innerHTML = renderFileTree(state.outputTree, true);
}

function renderFileTree(node, isRoot = true) {
  if (!node) {
    return "No output structure available.";
  }
  const isFile = node.type === "file";
  const objectType = node.object_type ? `<span class="tree-tag">${escapeHtml(node.object_type)}</span>` : "";
  const children = (node.children || []).map((child) => renderFileTree(child, false)).join("");
  return `
    <div class="tree-node ${isRoot ? "root" : ""}">
      <div class="tree-label ${isFile ? "file" : "folder"} ${isFile ? "clickable file-link" : ""}" ${isFile ? `data-object-id="${escapeHtml(node.object_id || "")}"` : ""}>
        <span>${isFile ? "file" : "folder"}</span>
        <strong>${escapeHtml(node.name)}</strong>${objectType}
      </div>
      ${children}
    </div>
  `;
}

function renderNavigator() {
  if (!state.navigator) {
    elements.navigatorWrap.textContent = "No completed job selected.";
    return;
  }
  const filtered = filterNavigator(state.navigator, state.filterText.trim().toLowerCase());
  elements.navigatorWrap.innerHTML = renderNavigatorNode(filtered, true);
  bindTreeInteractions(elements.navigatorWrap);
}

function renderNavigatorNode(node, isRoot = false) {
  if (!node) {
    return `<div class="empty-callout">No navigator nodes match the current filter.</div>`;
  }
  const children = (node.children || []).map((child) => renderNavigatorNode(child)).join("");
  const kind = node.kind || "node";
  const count = node.count !== undefined ? `<span class="tree-count">${escapeHtml(String(node.count))}</span>` : "";
  const objectAttrs = node.object_id ? `data-object-id="${escapeHtml(node.object_id)}"` : "";
  return `
    <div class="tree-node ${isRoot ? "root" : ""}">
      <div class="tree-label ${node.object_id ? "clickable" : ""}" data-kind="${escapeHtml(kind)}" ${objectAttrs}>
        <span class="icon">${escapeHtml(iconForKind(node.icon || kind))}</span>
        <strong>${escapeHtml(node.name)}</strong>
        ${count}
      </div>
      ${children}
    </div>
  `;
}

function filterNavigator(node, filterText) {
  if (!filterText) {
    return node;
  }
  const ownText = [node.name, node.object_type, node.schema, node.object_id].filter(Boolean).join(" ").toLowerCase();
  const children = (node.children || [])
    .map((child) => filterNavigator(child, filterText))
    .filter(Boolean);
  if (ownText.includes(filterText) || children.length) {
    return { ...node, children };
  }
  return null;
}

function bindTreeInteractions(container) {
  container.querySelectorAll("[data-object-id]").forEach((element) => {
    element.addEventListener("click", () => {
      const objectId = element.getAttribute("data-object-id");
      if (!objectId) {
        return;
      }
      selectObject(objectId);
    });
  });
}

async function selectObject(objectId) {
  if (!state.jobId) {
    return;
  }
  if (state.objectCache.has(objectId)) {
    state.selectedObject = state.objectCache.get(objectId);
    renderSelectedObject();
    return;
  }
  try {
    const obj = await requestJson(`/api/jobs/${state.jobId}/object?object_id=${encodeURIComponent(objectId)}`);
    state.objectCache.set(objectId, obj);
    state.selectedObject = obj;
    renderSelectedObject();
  } catch (error) {
    showError(error.message);
  }
}

function renderSelectedObject() {
  const obj = state.selectedObject;
  if (!obj) {
    elements.objectPill.textContent = "No selection";
    elements.objectMeta.textContent = "Select a node from the navigator to inspect its metadata.";
    elements.loadSource.disabled = true;
    elements.sourcePreview.textContent = "Select an object to preview its split SQL file.";
    return;
  }
  elements.objectPill.textContent = obj.object_type || "object";
  const dependencies = (obj.dependencies || []).length ? obj.dependencies.join(", ") : "No recorded dependencies";
  elements.objectMeta.innerHTML = `
    <dl class="meta-list">
      <div><dt>Object ID</dt><dd>${escapeHtml(obj.object_id || "-")}</dd></div>
      <div><dt>Schema</dt><dd>${escapeHtml(obj.schema || "_global")}</dd></div>
      <div><dt>Name</dt><dd>${escapeHtml(obj.name || "-")}</dd></div>
      <div><dt>Path</dt><dd>${escapeHtml(obj.path || "-")}</dd></div>
      <div><dt>Lines</dt><dd>${escapeHtml(String(obj.line_start || "-"))} to ${escapeHtml(String(obj.line_end || "-"))}</dd></div>
      <div><dt>Dependencies</dt><dd>${escapeHtml(dependencies)}</dd></div>
    </dl>
  `;
  elements.loadSource.disabled = false;
}

async function loadSelectedSource() {
  if (!state.selectedObject || !state.jobId) {
    return;
  }
  elements.sourcePreview.textContent = "Loading SQL preview...";
  try {
    const payload = await requestJson(`/api/jobs/${state.jobId}/source?object_id=${encodeURIComponent(state.selectedObject.object_id)}`);
    elements.sourcePreview.textContent = payload.sql || "-- empty file --";
  } catch (error) {
    elements.sourcePreview.textContent = error.message;
  }
}

async function loadJobs() {
  try {
    const jobs = await requestJson("/api/jobs?limit=20");
    state.jobs = jobs;
    renderJobs();
  } catch (error) {
    elements.jobsList.textContent = error.message;
  }
}

function renderJobs() {
  if (!state.jobs.length) {
    elements.jobsList.textContent = "No jobs yet.";
    return;
  }
  elements.jobsList.innerHTML = state.jobs
    .map((job) => `
      <button class="job-card ${job.job_id === state.jobId ? "active" : ""}" type="button" data-job-id="${escapeHtml(job.job_id)}">
        <span class="job-name">${escapeHtml(job.input_name || job.source_path || job.job_id)}</span>
        <span class="job-meta">${escapeHtml(job.status)} | ${Math.round(job.progress_percent || 0)}%</span>
      </button>
    `)
    .join("");
  elements.jobsList.querySelectorAll("[data-job-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const jobId = button.getAttribute("data-job-id");
      if (!jobId) {
        return;
      }
      const job = await requestJson(`/api/jobs/${jobId}`);
      renderJob(job);
      if (job.status === "completed") {
        enableOutputActions(jobId);
        loadOutputStructure(jobId);
      }
    });
  });
}

function enableOutputActions(jobId) {
  elements.downloadLink.classList.remove("disabled");
  elements.downloadLink.removeAttribute("aria-disabled");
  elements.downloadLink.href = `/api/jobs/${jobId}/download`;
  elements.manifestLink.classList.remove("disabled");
  elements.manifestLink.removeAttribute("aria-disabled");
  elements.manifestLink.href = `/api/jobs/${jobId}/manifest`;
}

function showError(message) {
  elements.message.textContent = message;
  elements.message.classList.add("error");
}

function clearMessage() {
  elements.message.textContent = "";
  elements.message.classList.remove("error");
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes <= 0) {
    return "-";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = bytes;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatDuration(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return "-";
  }
  if (seconds < 60) {
    return `${seconds.toFixed(1)} sec`;
  }
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} sec`;
}

function topEntry(payload) {
  const entries = Object.entries(payload);
  if (!entries.length) {
    return "-";
  }
  entries.sort((a, b) => b[1] - a[1]);
  return `${entries[0][0]} (${entries[0][1]})`;
}

function iconForKind(kind) {
  const icons = {
    workspace: "workspace",
    project: "project",
    connection: "plug",
    database: "db",
    schemas: "schemas",
    schema: "schema",
    tables: "table",
    views: "view",
    functions: "fn",
    sequences: "seq",
    indexes: "idx",
    triggers: "trg",
    policies: "rls",
    data: "data",
    folder: "dir",
    file: "sql",
  };
  return icons[kind] || "obj";
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char];
  });
}

elements.modePath.addEventListener("click", () => setMode("path"));
elements.modeUpload.addEventListener("click", () => setMode("upload"));
elements.pathForm.addEventListener("submit", submitPath);
elements.uploadForm.addEventListener("submit", submitUpload);
elements.navigatorTab.addEventListener("click", () => setExplorerView("navigator"));
elements.filesTab.addEventListener("click", () => setExplorerView("files"));
elements.refreshJobs.addEventListener("click", loadJobs);
elements.objectFilter.addEventListener("input", (event) => {
  state.filterText = event.target.value || "";
  renderNavigator();
});
elements.loadSource.addEventListener("click", loadSelectedSource);

loadJobs();
