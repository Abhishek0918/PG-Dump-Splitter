const state = {
  inputMode: "path",
  runMode: "splitter",
  activeView: "navigator",
  jobId: null,
  pollingTimer: null,
  activeJob: null,
  jobs: [],
  navigator: null,
  outputTree: null,
  visualization: null,
  filterText: "",
};

const elements = {
  modePath: document.getElementById("mode-path"),
  modeUpload: document.getElementById("mode-upload"),
  runSplitter: document.getElementById("run-splitter"),
  runVisualization: document.getElementById("run-visualization"),
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
  manifestInlineLink: document.getElementById("manifest-inline-link"),
  treeWrap: document.getElementById("tree-wrap"),
  navigatorWrap: document.getElementById("navigator-wrap"),
  erdWrap: document.getElementById("erd-wrap"),
  dependencyWrap: document.getElementById("dependency-wrap"),
  objectDependencyWrap: document.getElementById("object-dependency-wrap"),
  navigatorTab: document.getElementById("navigator-tab"),
  filesTab: document.getElementById("files-tab"),
  erdTab: document.getElementById("erd-tab"),
  dependencyTab: document.getElementById("dependency-tab"),
  objectDependencyTab: document.getElementById("object-dependency-tab"),
  navigatorView: document.getElementById("navigator-view"),
  filesView: document.getElementById("files-view"),
  erdView: document.getElementById("erd-view"),
  dependencyView: document.getElementById("dependency-view"),
  objectDependencyView: document.getElementById("object-dependency-view"),
  refreshJobs: document.getElementById("refresh-jobs"),
  jobsList: document.getElementById("jobs-list"),
  objectFilter: document.getElementById("object-filter"),
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

function setInputMode(mode) {
  state.inputMode = mode;
  elements.modePath.classList.toggle("active", mode === "path");
  elements.modeUpload.classList.toggle("active", mode === "upload");
  elements.pathForm.classList.toggle("active", mode === "path");
  elements.uploadForm.classList.toggle("active", mode === "upload");
  elements.pathSubmit.classList.toggle("hidden", mode !== "path");
  elements.uploadSubmit.classList.toggle("hidden", mode !== "upload");
  clearMessage();
}

function setRunMode(mode) {
  state.runMode = mode;
  elements.runSplitter.classList.toggle("active", mode === "splitter");
  elements.runVisualization.classList.toggle("active", mode === "visualization");
}

function setActiveView(view) {
  state.activeView = view;
  const viewMap = [
    ["navigator", elements.navigatorTab, elements.navigatorView],
    ["files", elements.filesTab, elements.filesView],
    ["erd", elements.erdTab, elements.erdView],
    ["dependency", elements.dependencyTab, elements.dependencyView],
    ["object-dependency", elements.objectDependencyTab, elements.objectDependencyView],
  ];
  for (const [key, tab, panel] of viewMap) {
    tab.classList.toggle("active", key === view);
    panel.classList.toggle("active", key === view);
  }
}

function setBusy(isBusy) {
  elements.pathSubmit.disabled = isBusy;
  elements.uploadSubmit.disabled = isBusy;
  elements.dumpPath.disabled = isBusy;
  elements.dumpFile.disabled = isBusy;
  elements.modePath.disabled = isBusy;
  elements.modeUpload.disabled = isBusy;
  elements.runSplitter.disabled = isBusy;
  elements.runVisualization.disabled = isBusy;
}

function setProgress(percent, status, step) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  elements.progressBar.style.width = `${safePercent}%`;
  elements.percentLabel.textContent = `${Math.round(safePercent)}%`;
  elements.statusLabel.textContent = humanizeStatus(status || "queued");
  elements.stepLabel.textContent = step || "Waiting to start";
}

function renderJob(job) {
  state.activeJob = job;
  state.jobId = job.job_id;
  renderJobs();
  setProgress(job.progress_percent, job.status, job.current_step);

  elements.details.jobId.textContent = job.job_id || "-";
  elements.details.source.textContent = prettyJobName(job);
  elements.details.fileSize.textContent = formatBytes(job.file_size_bytes);
  elements.details.status.textContent = humanizeStatus(job.status || "-");
  elements.details.created.textContent = formatDate(job.created_at);
  elements.details.started.textContent = formatDate(job.started_at);
  elements.details.finished.textContent = formatDate(job.finished_at);
  elements.details.duration.textContent = formatDuration(job.duration_seconds);
  elements.details.objects.textContent = formatCount(job.object_count);
  elements.details.warnings.textContent = formatCount(job.warning_count);

  if (job.status === "completed") {
    setBusy(false);
    stopPolling();
    enableOutputActions(job);
    loadJobArtifacts(job.job_id);
  } else if (job.status === "failed") {
    setBusy(false);
    stopPolling();
    showError(job.message || "Processing failed.");
  }
}

async function submitPath(event) {
  event.preventDefault();
  const dumpPath = elements.dumpPath.value.trim();
  if (!dumpPath) {
    showError("Enter the path.");
    return;
  }

  setBusy(true);
  clearMessage();
  setProgress(0, "queued", `Submitting ${state.runMode} job`);

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
  setProgress(0, "uploading", `Uploading file for ${state.runMode}`);

  const formData = new FormData();
  formData.append("file", file);

  const request = new XMLHttpRequest();
  request.open("POST", "/api/jobs/upload");
  request.upload.onprogress = (uploadEvent) => {
    if (!uploadEvent.lengthComputable) {
      return;
    }
    const percent = Math.min(20, (uploadEvent.loaded / uploadEvent.total) * 20);
    setProgress(percent, "uploading", `Uploaded ${formatBytes(uploadEvent.loaded)} of ${formatBytes(uploadEvent.total)}`);
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
  if (!state.pollingTimer) {
    return;
  }
  window.clearInterval(state.pollingTimer);
  state.pollingTimer = null;
}

async function loadJobArtifacts(jobId) {
  renderExplorerPlaceholder(elements.navigatorWrap, "Loading project structure...");
  renderExplorerPlaceholder(elements.treeWrap, "Loading output files...");
  renderExplorerPlaceholder(elements.erdWrap, "Loading ERD...");
  renderExplorerPlaceholder(elements.dependencyWrap, "Loading dependency graph...");
  renderExplorerPlaceholder(elements.objectDependencyWrap, "Loading object dependencies...");

  try {
    const [treePayload, visualizationPayload] = await Promise.all([
      requestJson(`/api/jobs/${jobId}/tree`),
      loadVisualizationPayload(jobId),
    ]);
    state.navigator = treePayload.manifest?.navigator || null;
    state.outputTree = treePayload.tree || null;
    state.visualization = visualizationPayload;
    clearMessage();
    renderAllViews();
    setActiveView(state.runMode === "visualization" ? "erd" : "navigator");
  } catch (error) {
    showError(error.message);
  }
}

async function loadVisualizationPayload(jobId) {
  try {
    return await requestJson(`/api/jobs/${jobId}/visualization`);
  } catch (error) {
    const message = String(error.message || "");
    if (!/not found|missing|ready/i.test(message)) {
      throw error;
    }
    const objectsPayload = await requestJson(`/api/jobs/${jobId}/objects`);
    return buildVisualizationFromObjects(objectsPayload.items || []);
  }
}

function buildVisualizationFromObjects(objects) {
  const items = Array.isArray(objects) ? objects : [];
  const tables = items.filter((item) => item.object_type === "tables");
  const tableIdSet = new Set(tables.map((item) => item.object_id));
  const dependencyEdges = [];
  const relationships = [];
  const seenRelationships = new Set();

  const erdTables = tables.map((item) => ({
    id: item.object_id,
    label: item.name,
    schema: item.schema,
    full_name: item.object_id,
    column_count: Array.isArray(item.attributes?.columns) ? item.attributes.columns.length : 0,
    columns: (Array.isArray(item.attributes?.columns) ? item.attributes.columns : []).map((column) => ({
      name: column.name,
      data_type: column.data_type,
      not_null: Boolean(column.not_null),
      primary_key: Boolean(column.primary_key),
      foreign_key: Boolean(column.foreign_key),
    })),
  }));

  for (const item of items) {
    const dependencies = Array.isArray(item.dependencies) ? item.dependencies : [];
    for (const dependency of dependencies) {
      dependencyEdges.push({
        source: dependency,
        target: item.object_id,
        type: "dependency",
      });
      if (item.object_type === "tables" && tableIdSet.has(dependency)) {
        appendRelationship(
          relationships,
          seenRelationships,
          {
            source_table: dependency,
            source_columns: [],
            target_table: item.object_id,
            target_columns: [],
            constraint_name: null,
            type: "foreign_key",
          }
        );
      }
    }

    if (item.object_type === "tables") {
      const foreignKeys = Array.isArray(item.attributes?.foreign_keys) ? item.attributes.foreign_keys : [];
      for (const foreignKey of foreignKeys) {
        appendRelationship(
          relationships,
          seenRelationships,
          {
            source_table: item.object_id,
            source_columns: Array.isArray(foreignKey.columns) ? foreignKey.columns : [],
            target_table: foreignKey.references_table,
            target_columns: Array.isArray(foreignKey.references_columns) ? foreignKey.references_columns : [],
            constraint_name: foreignKey.constraint_name || null,
            type: "foreign_key",
          }
        );
      }
    }
  }

  return {
    erd: {
      tables: erdTables,
      relationships,
    },
    dependency_graph: {
      nodes: items.map((item) => ({
        id: item.object_id,
        label: item.name,
        schema: item.schema,
        type: item.object_type,
      })),
      edges: dependencyEdges,
    },
    object_dependencies: items
      .filter((item) => Array.isArray(item.dependencies) && item.dependencies.length)
      .map((item) => ({
        object_id: item.object_id,
        name: item.name,
        schema: item.schema,
        object_type: item.object_type,
        depends_on: item.dependencies,
        dependency_count: item.dependencies.length,
      }))
      .sort((a, b) => {
        if (b.dependency_count !== a.dependency_count) {
          return b.dependency_count - a.dependency_count;
        }
        return String(a.object_id).localeCompare(String(b.object_id));
      }),
    statistics: {
      table_count: erdTables.length,
      relationship_count: relationships.length,
      object_count: items.length,
      dependency_count: dependencyEdges.length,
    },
  };
}

function renderAllViews() {
  renderNavigator();
  renderFiles();
  renderErd();
  renderDependencyGraph();
  renderObjectDependencies();
}

function renderNavigator() {
  if (!state.navigator) {
    renderExplorerPlaceholder(elements.navigatorWrap, "Project structure will appear here");
    return;
  }
  const filtered = filterNavigator(state.navigator, normalizedFilterText());
  if (!filtered) {
    elements.navigatorWrap.classList.remove("empty-state");
    elements.navigatorWrap.innerHTML = '<div class="empty-panel"><strong>No matching objects</strong><span>Try a broader filter for schemas, tables, or views.</span></div>';
    return;
  }
  elements.navigatorWrap.classList.remove("empty-state");
  elements.navigatorWrap.innerHTML = renderNavigatorNode(filtered, true);
}

function renderFiles() {
  if (!state.outputTree) {
    renderExplorerPlaceholder(elements.treeWrap, "Output files will appear here");
    return;
  }
  const filtered = filterFileTree(state.outputTree, normalizedFilterText());
  if (!filtered) {
    elements.treeWrap.classList.remove("empty-state");
    elements.treeWrap.innerHTML = '<div class="empty-panel"><strong>No matching files</strong><span>Try a broader search for file names, paths, or object types.</span></div>';
    return;
  }
  elements.treeWrap.classList.remove("empty-state");
  elements.treeWrap.innerHTML = renderFileTree(filtered, true);
}

function renderErd() {
  const erd = state.visualization?.erd;
  if (!erd || !Array.isArray(erd.tables)) {
    renderExplorerPlaceholder(elements.erdWrap, "ERD will appear here");
    return;
  }

  const filteredErd = filterErdDiagram(erd, normalizedFilterText());
  if (!filteredErd.tables.length) {
    elements.erdWrap.classList.remove("empty-state");
    elements.erdWrap.innerHTML = '<div class="empty-panel"><strong>No matching ERD tables</strong><span>Try searching by schema, table name, or column name.</span></div>';
    return;
  }

  const layout = buildErdLayout(filteredErd.tables);
  const cards = layout.tables.map((table) => renderErdCard(table)).join("");
  const paths = filteredErd.relationships
    .map((relationship) => renderErdRelationship(relationship, layout.tableMap))
    .filter(Boolean)
    .join("");

  elements.erdWrap.classList.remove("empty-state");
  elements.erdWrap.innerHTML = `
    ${renderVizStats({
      table_count: filteredErd.tables.length,
      relationship_count: filteredErd.relationships.length,
      object_count: filteredErd.tables.length,
      dependency_count: filteredErd.relationships.length,
    })}
    <div class="erd-stage">
      <div class="erd-canvas" style="width:${layout.width}px;height:${layout.height}px;">
        <svg class="erd-svg" viewBox="0 0 ${layout.width} ${layout.height}" preserveAspectRatio="none">
          ${paths}
        </svg>
        ${cards}
      </div>
    </div>
  `;
}

function renderDependencyGraph() {
  const graph = state.visualization?.dependency_graph;
  if (!graph) {
    renderExplorerPlaceholder(elements.dependencyWrap, "Dependency graph will appear here");
    return;
  }

  const filteredGraph = filterDependencyGraph(graph, normalizedFilterText());
  if (!filteredGraph.nodes.length && !filteredGraph.edges.length) {
    elements.dependencyWrap.classList.remove("empty-state");
    elements.dependencyWrap.innerHTML = '<div class="empty-panel"><strong>No matching dependencies</strong><span>Try searching by object name, schema, or dependency id.</span></div>';
    return;
  }

  const edges = filteredGraph.edges
    .slice(0, 120)
    .map(
      (edge) => `
        <div class="edge-row">
          <span>${escapeHtml(shortObjectLabel(edge.source))}</span>
          <span class="edge-arrow">→</span>
          <span>${escapeHtml(shortObjectLabel(edge.target))}</span>
        </div>
      `
    )
    .join("");

  elements.dependencyWrap.classList.remove("empty-state");
  elements.dependencyWrap.innerHTML = `
    ${renderVizStats({
      table_count: 0,
      relationship_count: 0,
      object_count: filteredGraph.nodes.length,
      dependency_count: filteredGraph.edges.length,
    })}
    <div class="edge-list">${edges || '<div class="empty-panel"><strong>No dependencies recorded</strong></div>'}</div>
  `;
}

function renderObjectDependencies() {
  const rows = state.visualization?.object_dependencies || [];
  if (!rows.length) {
    renderExplorerPlaceholder(elements.objectDependencyWrap, "Object dependencies will appear here");
    return;
  }

  const filteredRows = filterObjectDependencies(rows, normalizedFilterText());
  if (!filteredRows.length) {
    elements.objectDependencyWrap.classList.remove("empty-state");
    elements.objectDependencyWrap.innerHTML = '<div class="empty-panel"><strong>No matching dependency objects</strong><span>Try searching by object id, schema, or dependency name.</span></div>';
    return;
  }

  const cards = filteredRows
    .slice(0, 80)
    .map(
      (row) => `
        <section class="dependency-card">
          <h4>${escapeHtml(row.object_id)}</h4>
          <div class="dependency-chip-row">
            ${(row.depends_on || []).map((dependency) => `<span class="dependency-chip">${escapeHtml(shortObjectLabel(dependency))}</span>`).join("")}
          </div>
        </section>
      `
    )
    .join("");

  elements.objectDependencyWrap.classList.remove("empty-state");
  elements.objectDependencyWrap.innerHTML = `
    ${renderVizStats({
      table_count: 0,
      relationship_count: 0,
      object_count: filteredRows.length,
      dependency_count: filteredRows.reduce((total, row) => total + (row.dependency_count || 0), 0),
    })}
    <div class="dependency-list">${cards}</div>
  `;
}

function renderVizStats(stats) {
  const safe = stats || {};
  return `
    <div class="viz-stat-row">
      <div class="viz-stat"><span>Tables</span><strong>${formatCount(safe.table_count)}</strong></div>
      <div class="viz-stat"><span>Relationships</span><strong>${formatCount(safe.relationship_count)}</strong></div>
      <div class="viz-stat"><span>Objects</span><strong>${formatCount(safe.object_count)}</strong></div>
      <div class="viz-stat"><span>Dependencies</span><strong>${formatCount(safe.dependency_count)}</strong></div>
    </div>
  `;
}

function renderNavigatorNode(node, isRoot = false) {
  const children = (node.children || []).map((child) => renderNavigatorNode(child)).join("");
  const count = node.count !== undefined ? `<span class="tree-count">${escapeHtml(node.count)}</span>` : "";
  return `
    <div class="tree-node ${isRoot ? "root" : ""}">
      <div class="tree-label">
        <span class="tree-icon">${escapeHtml(iconForKind(node.icon || node.kind))}</span>
        <strong>${escapeHtml(node.name)}</strong>
        ${count}
      </div>
      ${children}
    </div>
  `;
}

function renderFileTree(node, isRoot = true) {
  const isFile = node.type === "file";
  const objectType = node.object_type ? `<span class="tree-tag">${escapeHtml(node.object_type)}</span>` : "";
  const children = (node.children || []).map((child) => renderFileTree(child, false)).join("");
  return `
    <div class="tree-node ${isRoot ? "root" : ""}">
      <div class="tree-label ${isFile ? "file-link" : ""}">
        <span class="tree-icon">${escapeHtml(isFile ? "sql" : "dir")}</span>
        <strong>${escapeHtml(node.name)}</strong>
        ${objectType}
      </div>
      ${children}
    </div>
  `;
}

function renderErdCard(table) {
  const columnRows = (table.columns || [])
    .map(
      (column) => `
        <div class="erd-column-row">
          <div class="erd-column-main">
            <span class="erd-column-name">${escapeHtml(column.name)}</span>
            <div class="erd-column-flags">
              ${column.primary_key ? '<span class="erd-flag erd-flag-key">PK</span>' : ""}
              ${column.foreign_key ? '<span class="erd-flag erd-flag-link">FK</span>' : ""}
            </div>
          </div>
          <div class="erd-column-meta">
            <span class="erd-column-type">${escapeHtml(column.data_type || "")}</span>
            ${column.not_null ? '<span class="erd-flag erd-flag-nn">NN</span>' : ""}
          </div>
        </div>
      `
    )
    .join("");

  return `
    <section class="erd-card" style="left:${table.x}px;top:${table.y}px;width:${table.width}px;">
      <div class="erd-card-header">${escapeHtml(table.full_name || table.label)}</div>
      <div class="erd-card-body">
        ${columnRows || '<div class="erd-column-row"><span class="erd-column-name">No parsed columns</span></div>'}
      </div>
    </section>
  `;
}

function renderErdRelationship(relationship, tableMap) {
  const source = tableMap[relationship.source_table];
  const target = tableMap[relationship.target_table];
  if (!source || !target) {
    return "";
  }
  const sourceLeft = source.x <= target.x;
  const startX = sourceLeft ? source.x + source.width : source.x;
  const endX = sourceLeft ? target.x : target.x + target.width;
  const startY = resolveColumnAnchorY(source, relationship.source_columns?.[0]);
  const endY = resolveColumnAnchorY(target, relationship.target_columns?.[0]);
  const midX = startX + (endX - startX) / 2;
  return `<path class="erd-link" d="M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}" />`;
}

function resolveColumnAnchorY(table, columnName) {
  if (!columnName || !Array.isArray(table.columns) || !table.columns.length) {
    return table.y + table.headerHeight + table.rowHeight / 2;
  }
  const index = table.columns.findIndex((column) => String(column.name).toLowerCase() === String(columnName).toLowerCase());
  const safeIndex = index >= 0 ? index : 0;
  return table.y + table.headerHeight + safeIndex * table.rowHeight + table.rowHeight / 2;
}

function filterNavigator(node, filterText) {
  if (!node) {
    return null;
  }
  if (!filterText) {
    return node;
  }
  const ownText = [node.name, node.object_type, node.schema, node.object_id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const children = (node.children || [])
    .map((child) => filterNavigator(child, filterText))
    .filter(Boolean);
  if (ownText.includes(filterText) || children.length) {
    return { ...node, children };
  }
  return null;
}

function filterFileTree(node, filterText) {
  if (!node) {
    return null;
  }
  if (!filterText) {
    return node;
  }
  const ownMatch = matchesFilter([node.name, node.path, node.type, node.object_type, node.object_id], filterText);
  if (node.type === "file") {
    return ownMatch ? node : null;
  }
  const children = (node.children || [])
    .map((child) => filterFileTree(child, filterText))
    .filter(Boolean);
  if (ownMatch || children.length) {
    return { ...node, children };
  }
  return null;
}

function filterErdDiagram(erd, filterText) {
  if (!filterText) {
    return erd;
  }
  const matchedTableIds = new Set(
    (erd.tables || [])
      .filter((table) =>
        matchesFilter(
          [
            table.id,
            table.label,
            table.schema,
            table.full_name,
            ...(Array.isArray(table.columns) ? table.columns.flatMap((column) => [column.name, column.data_type]) : []),
          ],
          filterText
        )
      )
      .map((table) => table.id)
  );

  const relationships = (erd.relationships || []).filter((relationship) => {
    const relationshipMatch = matchesFilter(
      [
        relationship.source_table,
        relationship.target_table,
        relationship.constraint_name,
        ...(Array.isArray(relationship.source_columns) ? relationship.source_columns : []),
        ...(Array.isArray(relationship.target_columns) ? relationship.target_columns : []),
      ],
      filterText
    );
    return relationshipMatch || matchedTableIds.has(relationship.source_table) || matchedTableIds.has(relationship.target_table);
  });

  const relatedTableIds = new Set([...matchedTableIds]);
  for (const relationship of relationships) {
    relatedTableIds.add(relationship.source_table);
    relatedTableIds.add(relationship.target_table);
  }

  return {
    tables: (erd.tables || []).filter((table) => relatedTableIds.has(table.id)),
    relationships,
  };
}

function filterDependencyGraph(graph, filterText) {
  if (!filterText) {
    return graph;
  }
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const directNodeIds = new Set(
    nodes
      .filter((node) => matchesFilter([node.id, node.label, node.schema, node.type], filterText))
      .map((node) => node.id)
  );
  const filteredEdges = edges.filter(
    (edge) =>
      matchesFilter([edge.source, edge.target, edge.type], filterText) ||
      directNodeIds.has(edge.source) ||
      directNodeIds.has(edge.target)
  );
  const referencedNodeIds = new Set([...directNodeIds]);
  for (const edge of filteredEdges) {
    referencedNodeIds.add(edge.source);
    referencedNodeIds.add(edge.target);
  }
  return {
    nodes: nodes.filter((node) => referencedNodeIds.has(node.id)),
    edges: filteredEdges,
  };
}

function filterObjectDependencies(rows, filterText) {
  if (!filterText) {
    return rows;
  }
  return rows.filter((row) =>
    matchesFilter(
      [
        row.object_id,
        row.name,
        row.schema,
        row.object_type,
        ...(Array.isArray(row.depends_on) ? row.depends_on : []),
      ],
      filterText
    )
  );
}

function renderJobs() {
  if (!state.jobs.length) {
    elements.jobsList.textContent = "No jobs yet.";
    return;
  }

  elements.jobsList.innerHTML = state.jobs
    .map((job) => {
      const progress = Math.max(0, Math.min(100, Number(job.progress_percent) || 0));
      const canDownload = job.status === "completed";
      return `
        <div class="job-row">
          <button class="job-card job-open ${job.job_id === state.jobId ? "active" : ""}" type="button" data-job-id="${escapeHtml(job.job_id)}">
            <span class="job-name">${escapeHtml(prettyJobName(job))}</span>
            <div class="job-meta-row">
              <span>${escapeHtml(humanizeStatus(job.status))}</span>
              <span>${progress}%</span>
            </div>
            <div class="job-progress-mini"><span style="width:${progress}%"></span></div>
          </button>
          <div class="job-actions">
            <button class="job-open-button" type="button" data-open-job="${escapeHtml(job.job_id)}">Open</button>
            <a class="job-download ${canDownload ? "" : "disabled"}" href="${canDownload ? `/api/jobs/${encodeURIComponent(job.job_id)}/download` : "#"}" aria-disabled="${canDownload ? "false" : "true"}">Download</a>
          </div>
        </div>
      `;
    })
    .join("");

  elements.jobsList.querySelectorAll("[data-job-id], [data-open-job]").forEach((button) => {
    button.addEventListener("click", async () => {
      const jobId = button.getAttribute("data-job-id") || button.getAttribute("data-open-job");
      if (!jobId) {
        return;
      }
      try {
        const job = await requestJson(`/api/jobs/${jobId}`);
        renderJob(job);
      } catch (error) {
        showError(error.message);
      }
    });
  });
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

function enableOutputActions(job) {
  elements.downloadLink.classList.remove("disabled");
  elements.downloadLink.removeAttribute("aria-disabled");
  elements.downloadLink.href = `/api/jobs/${job.job_id}/download`;
  elements.downloadLink.textContent = archiveDownloadName(job);

  elements.manifestLink.classList.remove("disabled");
  elements.manifestLink.removeAttribute("aria-disabled");
  elements.manifestLink.href = `/api/jobs/${job.job_id}/manifest`;

  elements.manifestInlineLink.classList.remove("disabled");
  elements.manifestInlineLink.removeAttribute("aria-disabled");
  elements.manifestInlineLink.href = `/api/jobs/${job.job_id}/manifest`;
}

function renderExplorerPlaceholder(element, title) {
  element.classList.add("empty-state");
  element.innerHTML = `
    <div class="empty-panel">
      <div class="empty-graphic"></div>
      <strong>${escapeHtml(title)}</strong>
      <span>Start a split to view schemas, tables, views, and other database objects.</span>
    </div>
  `;
}

function showError(message) {
  elements.message.textContent = message;
  elements.message.classList.add("visible", "error");
}

function clearMessage() {
  elements.message.textContent = "";
  elements.message.classList.remove("visible", "error");
}

function prettyJobName(job) {
  const preferred = String(job.input_name || "").trim();
  const fallback = String(job.source_path || job.job_id || "").trim();
  const raw = preferred || fallback;
  const leaf = raw.split(/[\\/]/).pop() || raw;
  return leaf.replace(/^[0-9a-f]{32}_/i, "");
}

function archiveDownloadName(job) {
  const name = prettyJobName(job);
  const stem = name.replace(/\.sql$/i, "") || "dump";
  return `${stem}_split_output.zip`;
}

function buildErdLayout(tables) {
  const cardWidth = 320;
  const rowHeight = 28;
  const headerHeight = 38;
  const footerGap = 14;
  const gapX = 52;
  const gapY = 44;
  const padding = 24;
  const columnCount = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(Math.max(tables.length, 1)))));
  const columnHeights = Array.from({ length: columnCount }, () => padding);
  const placedTables = [];
  const tableMap = {};

  for (const table of tables) {
    const height = headerHeight + Math.max(table.columns.length, 1) * rowHeight + footerGap;
    let columnIndex = 0;
    for (let index = 1; index < columnCount; index += 1) {
      if (columnHeights[index] < columnHeights[columnIndex]) {
        columnIndex = index;
      }
    }
    const x = padding + columnIndex * (cardWidth + gapX);
    const y = columnHeights[columnIndex];
    columnHeights[columnIndex] += height + gapY;
    const placed = { ...table, x, y, width: cardWidth, height, rowHeight, headerHeight };
    placedTables.push(placed);
    tableMap[table.id] = placed;
  }

  return {
    tables: placedTables,
    tableMap,
    width: padding * 2 + columnCount * cardWidth + Math.max(columnCount - 1, 0) * gapX,
    height: Math.max(...columnHeights, padding) + padding,
  };
}

function shortObjectLabel(objectId) {
  const value = String(objectId || "");
  return value.length > 68 ? `${value.slice(0, 65)}...` : value;
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
    return String(value);
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

function formatCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "-";
  }
  return number.toLocaleString();
}

function humanizeStatus(status) {
  const value = String(status || "queued").toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function matchesFilter(values, filterText) {
  return values
    .filter((value) => value !== null && value !== undefined)
    .some((value) => String(value).toLowerCase().includes(filterText));
}

function normalizedFilterText() {
  return String(state.filterText || "").trim().toLowerCase();
}

function appendRelationship(collection, seen, relationship) {
  if (!relationship.source_table || !relationship.target_table) {
    return;
  }
  const key = [
    relationship.source_table,
    ...(Array.isArray(relationship.source_columns) ? relationship.source_columns : []),
    relationship.target_table,
    ...(Array.isArray(relationship.target_columns) ? relationship.target_columns : []),
  ].join("|");
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  collection.push(relationship);
}

function iconForKind(kind) {
  const icons = {
    workspace: "wrk",
    project: "prj",
    connection: "db",
    database: "db",
    schemas: "sch",
    schema: "sch",
    tables: "tbl",
    views: "viw",
    functions: "fn",
    sequences: "seq",
    indexes: "idx",
    triggers: "trg",
    policies: "rls",
    data: "cpy",
    folder: "dir",
    file: "sql",
  };
  return icons[kind] || "obj";
}

function escapeHtml(value) {
  const safe = String(value ?? "");
  return safe.replace(/[&<>"']/g, (char) => {
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

elements.modePath.addEventListener("click", () => setInputMode("path"));
elements.modeUpload.addEventListener("click", () => setInputMode("upload"));
elements.runSplitter.addEventListener("click", () => setRunMode("splitter"));
elements.runVisualization.addEventListener("click", () => setRunMode("visualization"));
elements.pathForm.addEventListener("submit", submitPath);
elements.uploadForm.addEventListener("submit", submitUpload);
elements.navigatorTab.addEventListener("click", () => setActiveView("navigator"));
elements.filesTab.addEventListener("click", () => setActiveView("files"));
elements.erdTab.addEventListener("click", () => setActiveView("erd"));
elements.dependencyTab.addEventListener("click", () => setActiveView("dependency"));
elements.objectDependencyTab.addEventListener("click", () => setActiveView("object-dependency"));
elements.refreshJobs.addEventListener("click", loadJobs);
elements.objectFilter.addEventListener("input", (event) => {
  state.filterText = event.target.value || "";
  renderAllViews();
});

renderExplorerPlaceholder(elements.navigatorWrap, "Project structure will appear here");
renderExplorerPlaceholder(elements.treeWrap, "Output files will appear here");
renderExplorerPlaceholder(elements.erdWrap, "ERD will appear here");
renderExplorerPlaceholder(elements.dependencyWrap, "Dependency graph will appear here");
renderExplorerPlaceholder(elements.objectDependencyWrap, "Object dependencies will appear here");
loadJobs();
