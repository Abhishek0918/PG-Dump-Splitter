const STORAGE = {
  authUsers: "pgsplit.auth.users",
  authSession: "pgsplit.auth.session",
  theme: "pgsplit.theme",
  layout: "pgsplit.layout",
  pins: "pgsplit.pins",
  compactJobs: "pgsplit.compactJobs",
  focusMode: "pgsplit.focusMode",
};

const state = {
  currentUser: null,
  workspaceStarted: false,
  inputMode: "path",
  activeView: "overview",
  jobId: null,
  activeJob: null,
  jobs: [],
  events: [],
  navigator: null,
  outputTree: null,
  visualization: null,
  restorePlan: null,
  selectedRestoreScript: null,
  selectedRestoreSql: "",
  selectedObject: null,
  selectedSql: "",
  sourceBlobUrl: null,
  filterText: "",
  globalSearch: "",
  searchResults: [],
  searchFacets: null,
  searchTimer: null,
  commandOpen: false,
  commandQuery: "",
  commandResults: [],
  commandItems: [],
  commandIndex: 0,
  commandTimer: null,
  jobFilter: "",
  jobStatusFilter: "all",
  jobSort: "created-desc",
  pollingTimer: null,
  metricsSamples: [],
  pins: loadJson(STORAGE.pins, []),
  compactJobs: localStorage.getItem(STORAGE.compactJobs) === "1",
  focusMode: localStorage.getItem(STORAGE.focusMode) === "1",
};

const elements = {
  root: document.documentElement,
  authScreen: document.getElementById("auth-screen"),
  authTitle: document.getElementById("auth-title"),
  authCopy: document.getElementById("auth-copy"),
  loginTab: document.getElementById("auth-login-tab"),
  signupTab: document.getElementById("auth-signup-tab"),
  loginForm: document.getElementById("login-form"),
  signupForm: document.getElementById("signup-form"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  rememberUser: document.getElementById("remember-user"),
  signupName: document.getElementById("signup-name"),
  signupEmail: document.getElementById("signup-email"),
  signupPassword: document.getElementById("signup-password"),
  signupConfirm: document.getElementById("signup-confirm"),
  passwordStrengthBar: document.getElementById("password-strength-bar"),
  passwordStrengthLabel: document.getElementById("password-strength-label"),
  switchToSignup: document.getElementById("switch-to-signup"),
  switchToLogin: document.getElementById("switch-to-login"),
  clearLocalUsers: document.getElementById("clear-local-users"),
  authMessage: document.getElementById("auth-message"),
  shell: document.querySelector(".ide-shell"),
  workspace: document.getElementById("workspace"),
  activeJobLabel: document.getElementById("active-job-label"),
  themeSelect: document.getElementById("theme-select"),
  refreshJobs: document.getElementById("refresh-jobs"),
  manifestLink: document.getElementById("manifest-link"),
  downloadLink: document.getElementById("download-link"),
  focusToggle: document.getElementById("focus-toggle"),
  inspectorToggle: document.getElementById("inspector-toggle"),
  logoutButton: document.getElementById("logout-button"),
  userChip: document.getElementById("user-chip"),
  userInitials: document.getElementById("user-initials"),
  userName: document.getElementById("user-name"),
  globalSearch: document.getElementById("global-search"),
  commandOpen: document.getElementById("command-open"),
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
  collapseLeft: document.getElementById("collapse-left"),
  collapseRight: document.getElementById("collapse-right"),
  objectFilter: document.getElementById("object-filter"),
  navigatorWrap: document.getElementById("navigator-wrap"),
  overviewTab: document.getElementById("overview-tab"),
  filesTab: document.getElementById("files-tab"),
  erdTab: document.getElementById("erd-tab"),
  dependencyTab: document.getElementById("dependency-tab"),
  sqlTab: document.getElementById("sql-tab"),
  restoreTab: document.getElementById("restore-tab"),
  breadcrumbBar: document.getElementById("breadcrumb-bar"),
  overviewView: document.getElementById("overview-view"),
  filesView: document.getElementById("files-view"),
  erdView: document.getElementById("erd-view"),
  dependencyView: document.getElementById("dependency-view"),
  sqlView: document.getElementById("sql-view"),
  restoreView: document.getElementById("restore-view"),
  treeWrap: document.getElementById("tree-wrap"),
  erdWrap: document.getElementById("erd-wrap"),
  dependencyWrap: document.getElementById("dependency-wrap"),
  message: document.getElementById("message"),
  searchResultsPanel: document.getElementById("search-results-panel"),
  searchSummary: document.getElementById("search-summary"),
  searchFacets: document.getElementById("search-facets"),
  searchResults: document.getElementById("search-results"),
  clearSearch: document.getElementById("clear-search"),
  jobFilter: document.getElementById("job-filter"),
  jobStatusFilter: document.getElementById("job-status-filter"),
  jobSort: document.getElementById("job-sort"),
  jobViewToggle: document.getElementById("job-view-toggle"),
  jobsList: document.getElementById("jobs-list"),
  sqlSearch: document.getElementById("sql-search"),
  copySql: document.getElementById("copy-sql"),
  sourceDownload: document.getElementById("source-download"),
  sqlMeta: document.getElementById("sql-meta"),
  sqlPreview: document.getElementById("sql-preview"),
  restoreMode: document.getElementById("restore-mode"),
  restoreSchema: document.getElementById("restore-schema"),
  restorePreviewButton: document.getElementById("restore-preview-button"),
  restoreDownloadLink: document.getElementById("restore-download-link"),
  restoreSummary: document.getElementById("restore-summary"),
  restoreScripts: document.getElementById("restore-scripts"),
  restoreWarnings: document.getElementById("restore-warnings"),
  restorePreviewMeta: document.getElementById("restore-preview-meta"),
  restorePreview: document.getElementById("restore-preview"),
  commandOverlay: document.getElementById("command-overlay"),
  commandInput: document.getElementById("command-input"),
  commandClose: document.getElementById("command-close"),
  commandList: document.getElementById("command-list"),
  consoleStage: document.getElementById("console-stage"),
  consoleThroughput: document.getElementById("console-throughput"),
  consoleEta: document.getElementById("console-eta"),
  consoleLog: document.getElementById("console-log"),
  metricObjects: document.getElementById("metric-objects"),
  metricProcessed: document.getElementById("metric-processed"),
  metricSpeed: document.getElementById("metric-speed"),
  metricEta: document.getElementById("metric-eta"),
  metricMemory: document.getElementById("metric-memory"),
  metricEvents: document.getElementById("metric-events"),
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
    objectName: document.getElementById("object-name"),
    objectType: document.getElementById("object-type"),
    objectSchema: document.getElementById("object-schema"),
    objectPath: document.getElementById("object-path"),
    objectDependencies: document.getElementById("object-dependencies"),
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

function initialize() {
  applyTheme(localStorage.getItem(STORAGE.theme) || "system");
  applyLayout(loadLayoutPreference());
  applyFocusMode(state.focusMode);
  setInputMode("path");
  setActiveView("overview");
  bindEvents();
  setAuthMode("login");
  renderEmptyStates();
  const user = getSessionUser();
  if (user) {
    enterWorkspace(user);
  } else {
    showAuthScreen();
  }
}

function bindEvents() {
  elements.loginTab.addEventListener("click", () => setAuthMode("login"));
  elements.signupTab.addEventListener("click", () => setAuthMode("signup"));
  elements.switchToSignup.addEventListener("click", () => setAuthMode("signup"));
  elements.switchToLogin.addEventListener("click", () => setAuthMode("login"));
  elements.loginForm.addEventListener("submit", submitLogin);
  elements.signupForm.addEventListener("submit", submitSignup);
  elements.signupPassword.addEventListener("input", renderPasswordStrength);
  elements.clearLocalUsers.addEventListener("click", resetLocalAccounts);
  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => togglePasswordVisibility(button));
  });
  elements.themeSelect.addEventListener("change", () => applyTheme(elements.themeSelect.value));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((localStorage.getItem(STORAGE.theme) || "system") === "system") {
      applyTheme("system");
    }
  });
  elements.modePath.addEventListener("click", () => setInputMode("path"));
  elements.modeUpload.addEventListener("click", () => setInputMode("upload"));
  elements.pathForm.addEventListener("submit", submitPath);
  elements.uploadForm.addEventListener("submit", submitUpload);
  elements.refreshJobs.addEventListener("click", loadJobs);
  elements.focusToggle.addEventListener("click", () => applyFocusMode(!state.focusMode));
  elements.inspectorToggle.addEventListener("click", () => togglePane("right"));
  elements.logoutButton.addEventListener("click", logout);
  elements.globalSearch.addEventListener("input", (event) => {
    state.globalSearch = event.target.value.trim();
    if (state.globalSearch) setActiveView("overview");
    queueObjectSearch(state.globalSearch);
  });
  elements.globalSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && state.searchResults[0]) selectObject(state.searchResults[0].object_id);
  });
  elements.commandOpen.addEventListener("click", () => openCommandPalette());
  elements.commandClose.addEventListener("click", closeCommandPalette);
  elements.commandOverlay.addEventListener("click", (event) => {
    if (event.target === elements.commandOverlay) closeCommandPalette();
  });
  elements.commandInput.addEventListener("input", () => {
    state.commandQuery = elements.commandInput.value.trim();
    renderCommandPalette();
    queueCommandObjectSearch(state.commandQuery);
  });
  elements.commandInput.addEventListener("keydown", handleCommandKeydown);
  elements.clearSearch.addEventListener("click", clearObjectSearch);
  elements.collapseLeft.addEventListener("click", () => togglePane("left"));
  elements.collapseRight.addEventListener("click", () => togglePane("right"));
  elements.objectFilter.addEventListener("input", (event) => {
    state.filterText = event.target.value.toLowerCase();
    renderNavigator();
    renderFiles();
    renderErd();
    renderDependencyGraph();
  });
  elements.jobFilter.addEventListener("input", (event) => {
    state.jobFilter = event.target.value.toLowerCase();
    renderJobs();
  });
  elements.jobStatusFilter.addEventListener("change", () => {
    state.jobStatusFilter = elements.jobStatusFilter.value;
    renderJobs();
  });
  elements.jobSort.addEventListener("change", () => {
    state.jobSort = elements.jobSort.value;
    renderJobs();
  });
  elements.jobViewToggle.addEventListener("click", () => {
    state.compactJobs = !state.compactJobs;
    localStorage.setItem(STORAGE.compactJobs, state.compactJobs ? "1" : "0");
    renderJobs();
  });
  elements.sqlSearch.addEventListener("input", renderSqlPreview);
  elements.copySql.addEventListener("click", copySql);
  elements.restoreMode.addEventListener("change", () => {
    renderRestorePlanner();
  });
  elements.restoreSchema.addEventListener("change", () => {
    renderRestorePlanner();
  });
  elements.restorePreviewButton.addEventListener("click", () => previewSelectedRestoreScript());
  window.addEventListener("keydown", handleGlobalKeydown);
  bindTab(elements.overviewTab, "overview");
  bindTab(elements.filesTab, "files");
  bindTab(elements.erdTab, "erd");
  bindTab(elements.dependencyTab, "dependency");
  bindTab(elements.sqlTab, "sql");
  bindTab(elements.restoreTab, "restore");
  bindResizer(document.getElementById("left-resizer"), "left");
  bindResizer(document.getElementById("right-resizer"), "right");
  bindResizer(document.getElementById("console-resizer"), "console");
}

function setAuthMode(mode) {
  const isSignup = mode === "signup";
  elements.loginTab.classList.toggle("active", !isSignup);
  elements.signupTab.classList.toggle("active", isSignup);
  elements.loginForm.classList.toggle("active", !isSignup);
  elements.signupForm.classList.toggle("active", isSignup);
  elements.authTitle.textContent = isSignup ? "Create your local account" : "Sign in to continue";
  elements.authCopy.textContent = isSignup
    ? "Your account is saved only in this browser. Nothing is uploaded to a user database."
    : "Accounts are stored only in this browser using local storage. Use this for local/demo access, not production security.";
  clearAuthMessage();
  window.setTimeout(() => (isSignup ? elements.signupName : elements.loginEmail).focus(), 0);
}

async function submitSignup(event) {
  event.preventDefault();
  clearAuthMessage();
  const name = elements.signupName.value.trim();
  const email = normalizeEmail(elements.signupEmail.value);
  const password = elements.signupPassword.value;
  const confirm = elements.signupConfirm.value;
  if (!name) return showAuthMessage("Enter your name.", "error");
  if (!isValidEmail(email)) return showAuthMessage("Enter a valid email address.", "error");
  if (password.length < 8) return showAuthMessage("Password must be at least 8 characters.", "error");
  if (password !== confirm) return showAuthMessage("Passwords do not match.", "error");
  const users = loadAuthUsers();
  if (users[email]) return showAuthMessage("A local account already exists for this email.", "error");
  const passwordRecord = await createPasswordRecord(password);
  const user = {
    name,
    email,
    created_at: new Date().toISOString(),
    ...passwordRecord,
  };
  users[email] = user;
  saveAuthUsers(users);
  saveSession(email, true);
  showAuthMessage("Account created. Opening your workspace...", "success");
  window.setTimeout(() => enterWorkspace(user), 250);
}

async function submitLogin(event) {
  event.preventDefault();
  clearAuthMessage();
  const email = normalizeEmail(elements.loginEmail.value);
  const password = elements.loginPassword.value;
  if (!isValidEmail(email)) return showAuthMessage("Enter a valid email address.", "error");
  if (!password) return showAuthMessage("Enter your password.", "error");
  const users = loadAuthUsers();
  const user = users[email];
  if (!user) return showAuthMessage("No local account found for that email.", "error");
  const isValid = await verifyPassword(password, user);
  if (!isValid) return showAuthMessage("Password is incorrect.", "error");
  saveSession(email, elements.rememberUser.checked);
  showAuthMessage("Login successful. Loading workspace...", "success");
  window.setTimeout(() => enterWorkspace(user), 180);
}

function showAuthScreen() {
  stopPolling();
  state.currentUser = null;
  elements.shell.classList.add("hidden");
  elements.authScreen.classList.remove("hidden");
  window.setTimeout(() => elements.loginEmail.focus(), 0);
}

function enterWorkspace(user) {
  state.currentUser = user;
  elements.authScreen.classList.add("hidden");
  elements.shell.classList.remove("hidden");
  renderCurrentUser();
  if (!state.workspaceStarted) {
    state.workspaceStarted = true;
    loadJobs();
  } else {
    loadJobs(false);
  }
}

function logout() {
  localStorage.removeItem(STORAGE.authSession);
  sessionStorage.removeItem(STORAGE.authSession);
  showAuthScreen();
  showAuthMessage("You have been logged out from this browser session.", "success");
}

function renderCurrentUser() {
  const user = state.currentUser || {};
  elements.userName.textContent = user.name || user.email || "Local user";
  elements.userInitials.textContent = initialsFor(user.name || user.email || "LU");
  elements.userChip.title = user.email || "Local user";
}

function getSessionUser() {
  const session = loadJson(STORAGE.authSession, null) || loadSessionJson(STORAGE.authSession, null);
  if (!session?.email) return null;
  const users = loadAuthUsers();
  return users[normalizeEmail(session.email)] || null;
}

function saveSession(email, remember) {
  const session = {
    email: normalizeEmail(email),
    created_at: new Date().toISOString(),
    remember: Boolean(remember),
  };
  localStorage.removeItem(STORAGE.authSession);
  sessionStorage.removeItem(STORAGE.authSession);
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(STORAGE.authSession, JSON.stringify(session));
}

function loadAuthUsers() {
  const users = loadJson(STORAGE.authUsers, {});
  return users && typeof users === "object" ? users : {};
}

function saveAuthUsers(users) {
  localStorage.setItem(STORAGE.authUsers, JSON.stringify(users));
}

async function createPasswordRecord(password) {
  const salt = randomSalt();
  return { password_hash: await hashPassword(password, salt), password_salt: salt, hash_version: "pbkdf2-sha256" };
}

async function verifyPassword(password, user) {
  const hash = await hashPassword(password, user.password_salt || "");
  return safeEqual(hash, user.password_hash || "");
}

async function hashPassword(password, salt) {
  if (window.crypto?.subtle && window.TextEncoder) {
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await window.crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: base64ToBytes(salt), iterations: 120000, hash: "SHA-256" },
      keyMaterial,
      256,
    );
    return bytesToBase64(new Uint8Array(bits));
  }
  return fallbackHash(`${salt}:${password}`);
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return bytesToBase64(bytes);
}

function togglePasswordVisibility(button) {
  const input = document.getElementById(button.dataset.togglePassword);
  if (!input) return;
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  button.textContent = isPassword ? "Hide" : "Show";
}

function renderPasswordStrength() {
  const password = elements.signupPassword.value;
  const score = passwordStrength(password);
  const percent = [0, 18, 42, 72, 100][score];
  elements.passwordStrengthBar.style.width = `${percent}%`;
  elements.passwordStrengthBar.className = score >= 4 ? "strong" : score >= 3 ? "medium" : "";
  elements.passwordStrengthLabel.textContent = strengthLabel(score);
}

function passwordStrength(password) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

function strengthLabel(score) {
  if (score >= 4) return "Strong password.";
  if (score === 3) return "Good password. Add length or symbols for extra strength.";
  if (score > 0) return "Weak password. Use 8+ characters with letters, numbers, and symbols.";
  return "Use 8+ characters with letters, numbers, and symbols.";
}

function resetLocalAccounts() {
  const confirmed = window.confirm("Reset all local accounts in this browser? This will not delete split jobs or output files.");
  if (!confirmed) return;
  localStorage.removeItem(STORAGE.authUsers);
  localStorage.removeItem(STORAGE.authSession);
  sessionStorage.removeItem(STORAGE.authSession);
  elements.loginForm.reset();
  elements.signupForm.reset();
  renderPasswordStrength();
  setAuthMode("signup");
  showAuthMessage("Local accounts were reset. Create a new account to continue.", "success");
}

function showAuthMessage(message, type = "info") {
  elements.authMessage.textContent = message;
  elements.authMessage.className = `auth-message ${type}`;
}

function clearAuthMessage() {
  elements.authMessage.textContent = "";
  elements.authMessage.className = "auth-message";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function initialsFor(value) {
  const parts = String(value || "Local User").trim().split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : String(parts[0] || "LU").slice(0, 2);
  return initials.toUpperCase();
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value || "");
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function fallbackHash(value) {
  let hashA = 0xdeadbeef;
  let hashB = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charCodeAt(index);
    hashA = Math.imul(hashA ^ char, 2654435761);
    hashB = Math.imul(hashB ^ char, 1597334677);
  }
  hashA = Math.imul(hashA ^ (hashA >>> 16), 2246822507) ^ Math.imul(hashB ^ (hashB >>> 13), 3266489909);
  hashB = Math.imul(hashB ^ (hashB >>> 16), 2246822507) ^ Math.imul(hashA ^ (hashA >>> 13), 3266489909);
  return `fallback-${(hashB >>> 0).toString(16)}${(hashA >>> 0).toString(16)}`;
}

function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

function bindTab(element, view) {
  element.addEventListener("click", () => setActiveView(view));
}

function applyTheme(mode) {
  const resolved = mode === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode;
  localStorage.setItem(STORAGE.theme, mode);
  elements.themeSelect.value = mode;
  elements.root.dataset.theme = resolved;
}

function applyLayout(layout) {
  const rightCollapsed = layout.rightCollapsed === undefined ? true : Boolean(layout.rightCollapsed);
  if (layout.leftWidth) elements.root.style.setProperty("--left-width", `${layout.leftWidth}px`);
  if (layout.rightWidth) elements.root.style.setProperty("--right-width", `${layout.rightWidth}px`);
  if (layout.consoleHeight) elements.root.style.setProperty("--console-height", `${layout.consoleHeight}px`);
  elements.workspace.classList.toggle("left-collapsed", Boolean(layout.leftCollapsed));
  elements.workspace.classList.toggle("right-collapsed", rightCollapsed);
  elements.inspectorToggle.classList.toggle("active", !rightCollapsed);
  elements.inspectorToggle.textContent = rightCollapsed ? "Inspector" : "Hide Inspector";
}

function saveLayout(patch) {
  const layout = { ...loadLayoutPreference(), ...patch, uiVersion: 2 };
  localStorage.setItem(STORAGE.layout, JSON.stringify(layout));
  applyLayout(layout);
}

function loadLayoutPreference() {
  const layout = loadJson(STORAGE.layout, {});
  if (layout.uiVersion === 2) return layout;
  const migrated = { ...layout, rightCollapsed: true, consoleHeight: 138, uiVersion: 2 };
  localStorage.setItem(STORAGE.layout, JSON.stringify(migrated));
  return migrated;
}

function togglePane(side) {
  const key = side === "left" ? "leftCollapsed" : "rightCollapsed";
  const isCollapsed = elements.workspace.classList.contains(`${side}-collapsed`);
  saveLayout({ [key]: !isCollapsed });
}

function applyFocusMode(enabled) {
  state.focusMode = Boolean(enabled);
  localStorage.setItem(STORAGE.focusMode, state.focusMode ? "1" : "0");
  elements.shell.classList.toggle("focus-mode", state.focusMode);
  elements.focusToggle.classList.toggle("active", state.focusMode);
  elements.focusToggle.textContent = state.focusMode ? "Exit Focus" : "Focus";
}

function bindResizer(handle, pane) {
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const styles = getComputedStyle(elements.root);
    const startLeft = parseInt(styles.getPropertyValue("--left-width"), 10) || 330;
    const startRight = parseInt(styles.getPropertyValue("--right-width"), 10) || 330;
    const startConsole = parseInt(styles.getPropertyValue("--console-height"), 10) || 190;

    const move = (moveEvent) => {
      if (pane === "left") saveLayout({ leftWidth: clamp(startLeft + moveEvent.clientX - startX, 240, 520), leftCollapsed: false });
      if (pane === "right") saveLayout({ rightWidth: clamp(startRight - (moveEvent.clientX - startX), 260, 520), rightCollapsed: false });
      if (pane === "console") saveLayout({ consoleHeight: clamp(startConsole - (moveEvent.clientY - startY), 110, 360) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

function setInputMode(mode) {
  state.inputMode = mode;
  elements.modePath.classList.toggle("active", mode === "path");
  elements.modeUpload.classList.toggle("active", mode === "upload");
  elements.pathForm.classList.toggle("active", mode === "path");
  elements.uploadForm.classList.toggle("active", mode === "upload");
}

function setActiveView(view) {
  state.activeView = view;
  const views = [
    ["overview", elements.overviewTab, elements.overviewView],
    ["files", elements.filesTab, elements.filesView],
    ["erd", elements.erdTab, elements.erdView],
    ["dependency", elements.dependencyTab, elements.dependencyView],
    ["sql", elements.sqlTab, elements.sqlView],
    ["restore", elements.restoreTab, elements.restoreView],
  ];
  for (const [key, tab, panel] of views) {
    tab.classList.toggle("active", key === view);
    panel.classList.toggle("active", key === view);
  }
  renderBreadcrumb();
}

function setBusy(isBusy) {
  elements.pathSubmit.disabled = isBusy;
  elements.uploadSubmit.disabled = isBusy;
  elements.dumpPath.disabled = isBusy;
  elements.dumpFile.disabled = isBusy;
}

async function submitPath(event) {
  event.preventDefault();
  const dumpPath = elements.dumpPath.value.trim();
  if (!dumpPath) return showError("Enter a dump path.");
  setBusy(true);
  clearError();
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
  if (!file) return showError("Select a .sql file.");
  setBusy(true);
  clearError();
  setProgress(0, "uploading", "Uploading SQL file");
  const formData = new FormData();
  formData.append("file", file);
  const request = new XMLHttpRequest();
  request.open("POST", "/api/jobs/upload");
  request.upload.onprogress = (uploadEvent) => {
    if (!uploadEvent.lengthComputable) return;
    setProgress(Math.min(20, (uploadEvent.loaded / uploadEvent.total) * 20), "uploading", `Uploaded ${formatBytes(uploadEvent.loaded)} of ${formatBytes(uploadEvent.total)}`);
  };
  request.onload = () => {
    try {
      const payload = JSON.parse(request.responseText || "{}");
      if (request.status < 200 || request.status >= 300) throw new Error(payload.detail || request.statusText);
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
      await loadEvents(jobId);
    } catch (error) {
      stopPolling();
      setBusy(false);
      showError(error.message);
    }
  }, 1000);
}

function stopPolling() {
  if (state.pollingTimer) window.clearInterval(state.pollingTimer);
  state.pollingTimer = null;
}

function renderJob(job) {
  state.activeJob = job;
  state.jobId = job.job_id;
  recordMetricSample(job);
  setProgress(job.progress_percent, job.status, job.current_step);
  renderJobDetails(job);
  renderProgressMetrics(job);
  updateLinks(job);
  elements.activeJobLabel.textContent = `${prettyJobName(job)} | ${humanizeStatus(job.status)}`;
  renderBreadcrumb();
  loadJobs(false);
  if (job.status === "completed") {
    setBusy(false);
    stopPolling();
    loadJobArtifacts(job.job_id);
    loadEvents(job.job_id);
  } else if (job.status === "failed") {
    setBusy(false);
    stopPolling();
    loadEvents(job.job_id);
    showError(job.message || "Processing failed.");
  }
}

function setProgress(percent, status, step) {
  const safe = clamp(Number(percent) || 0, 0, 100);
  elements.progressBar.style.width = `${safe}%`;
  elements.percentLabel.textContent = `${Math.round(safe)}%`;
  elements.statusLabel.textContent = humanizeStatus(status || "idle");
  elements.statusLabel.className = `status-pill ${status || "idle"}`;
  elements.stepLabel.textContent = step || "Waiting";
}

async function loadJobs(renderFirst = true) {
  try {
    const jobs = await requestJson("/api/jobs?limit=100");
    state.jobs = jobs;
    renderJobs();
    if (renderFirst && jobs.length && !state.activeJob) renderJob(jobs[0]);
  } catch (error) {
    showError(error.message);
  }
}

function queueObjectSearch(query, delay = 220) {
  window.clearTimeout(state.searchTimer);
  state.searchTimer = window.setTimeout(() => performObjectSearch(query), delay);
}

async function performObjectSearch(query) {
  if (!state.jobId || !state.activeJob || state.activeJob.status !== "completed") {
    state.searchResults = [];
    state.searchFacets = null;
    renderSearchResults();
    return;
  }
  const normalized = String(query || "").trim();
  if (!normalized) {
    state.searchResults = [];
    renderSearchResults();
    return;
  }
  renderSearchLoading(normalized);
  try {
    const payload = await requestJson(`/api/jobs/${state.jobId}/search?q=${encodeURIComponent(normalized)}&limit=80`);
    if (state.globalSearch !== normalized && elements.commandInput.value.trim() !== normalized) return;
    state.searchResults = payload.items || [];
    state.searchFacets = payload.facets || null;
    renderSearchResults(normalized);
    if (state.commandOpen && state.commandQuery === normalized) renderCommandPalette();
  } catch (error) {
    showError(error.message);
  }
}

function clearObjectSearch() {
  state.globalSearch = "";
  state.searchResults = [];
  elements.globalSearch.value = "";
  elements.objectFilter.value = "";
  state.filterText = "";
  renderSearchResults();
  renderAllViews();
}

function renderSearchLoading(query) {
  elements.searchResultsPanel.classList.remove("hidden");
  elements.searchSummary.textContent = `Searching for "${query}"...`;
  elements.searchFacets.innerHTML = "";
  renderSkeleton(elements.searchResults, 4);
}

function renderSearchResults(query = state.globalSearch) {
  const hasQuery = Boolean(String(query || "").trim());
  if (!hasQuery) {
    elements.searchResultsPanel.classList.add("hidden");
    elements.searchSummary.textContent = "Search completed objects from the toolbar or Ctrl+K.";
    elements.searchResults.innerHTML = "";
    elements.searchFacets.innerHTML = "";
    return;
  }
  elements.searchResultsPanel.classList.remove("hidden");
  elements.searchSummary.textContent = `${state.searchResults.length.toLocaleString()} matches for "${query}"`;
  elements.searchFacets.innerHTML = renderFacetChips(state.searchFacets?.by_type || {});
  if (!state.searchResults.length) {
    elements.searchResults.innerHTML = '<div class="command-empty">No matching objects found.</div>';
    return;
  }
  elements.searchResults.innerHTML = state.searchResults.map((object) => renderSearchResult(object)).join("");
  elements.searchResults.querySelectorAll("[data-search-object]").forEach((button) => {
    button.addEventListener("click", () => selectObject(button.dataset.searchObject));
  });
}

function renderSearchResult(object) {
  return `
    <button class="search-result" type="button" data-search-object="${escapeHtml(object.object_id)}">
      <span class="tree-icon icon-${escapeHtml(object.object_type)}">${escapeHtml(iconText(object.object_type))}</span>
      <span>
        <span class="result-title">${escapeHtml(formatObjectLabel(object))}</span>
        <span class="result-path">${escapeHtml(object.path || object.object_id || "")}</span>
      </span>
      <span class="tree-tag">${escapeHtml(object.object_type)}</span>
    </button>
  `;
}

function renderFacetChips(facets) {
  const entries = Object.entries(facets || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return entries.map(([type, count]) => `<span class="facet-chip">${escapeHtml(type)} ${formatCount(count)}</span>`).join("");
}

function handleGlobalKeydown(event) {
  const isCommandShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
  if (isCommandShortcut) {
    event.preventDefault();
    openCommandPalette(state.globalSearch || "");
  }
  if (event.key === "Escape" && state.commandOpen) {
    event.preventDefault();
    closeCommandPalette();
  }
}

function openCommandPalette(seed = "") {
  state.commandOpen = true;
  state.commandQuery = seed;
  state.commandIndex = 0;
  if (!seed) state.commandResults = [];
  elements.commandOverlay.classList.remove("hidden");
  elements.commandInput.value = seed;
  renderCommandPalette();
  queueCommandObjectSearch(seed);
  window.setTimeout(() => elements.commandInput.focus(), 0);
}

function closeCommandPalette() {
  state.commandOpen = false;
  elements.commandOverlay.classList.add("hidden");
}

function queueCommandObjectSearch(query) {
  window.clearTimeout(state.commandTimer);
  if (!String(query || "").trim()) {
    state.commandResults = [];
    renderCommandPalette();
    return;
  }
  state.commandTimer = window.setTimeout(() => performCommandObjectSearch(query), 180);
}

async function performCommandObjectSearch(query) {
  const normalized = String(query || "").trim();
  if (!state.jobId || !normalized || state.activeJob?.status !== "completed") {
    state.commandResults = [];
    renderCommandPalette();
    return;
  }
  try {
    const payload = await requestJson(`/api/jobs/${state.jobId}/search?q=${encodeURIComponent(normalized)}&limit=12`);
    if (state.commandQuery !== normalized) return;
    state.commandResults = payload.items || [];
    renderCommandPalette();
  } catch {
    state.commandResults = [];
    renderCommandPalette();
  }
}

function handleCommandKeydown(event) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.commandIndex = Math.min(state.commandIndex + 1, Math.max(state.commandItems.length - 1, 0));
    renderCommandPalette();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    state.commandIndex = Math.max(state.commandIndex - 1, 0);
    renderCommandPalette();
  } else if (event.key === "Enter") {
    event.preventDefault();
    executeCommand(state.commandItems[state.commandIndex]);
  }
}

function renderCommandPalette() {
  if (!state.commandOpen) return;
  const query = state.commandQuery.toLowerCase();
  const commands = buildCommandItems();
  const objectItems = state.commandResults.map((object) => ({
    kind: "object",
    title: formatObjectLabel(object),
    meta: object.path || object.object_id,
    badge: object.object_type,
    object,
  }));
  state.commandItems = [...commands, ...objectItems].filter((item) => {
    if (!query || item.kind === "object") return true;
    return [item.title, item.meta, item.badge].some((value) => String(value || "").toLowerCase().includes(query));
  });
  if (state.commandIndex >= state.commandItems.length) state.commandIndex = Math.max(state.commandItems.length - 1, 0);
  if (!state.commandItems.length) {
    elements.commandList.innerHTML = '<div class="command-empty">No commands or objects found.</div>';
    return;
  }
  elements.commandList.innerHTML = state.commandItems.map((item, index) => renderCommandItem(item, index)).join("");
  elements.commandList.querySelectorAll("[data-command-index]").forEach((button) => {
    button.addEventListener("click", () => executeCommand(state.commandItems[Number(button.dataset.commandIndex)]));
  });
}

function buildCommandItems() {
  const completed = state.activeJob?.status === "completed";
  return [
    { kind: "command", title: "Focus global search", meta: "Search objects, schemas, and file paths", badge: "Search", action: () => elements.globalSearch.focus() },
    { kind: "command", title: "Open Overview", meta: "Show metrics and job history", badge: "View", action: () => setActiveView("overview") },
    { kind: "command", title: "Open Output Files", meta: "Browse generated split folder", badge: "View", action: () => setActiveView("files") },
    { kind: "command", title: "Open ERD", meta: "Show parsed table relationships", badge: "View", action: () => setActiveView("erd") },
    { kind: "command", title: "Open Dependency Graph", meta: "Show dependency edges", badge: "View", action: () => setActiveView("dependency") },
    { kind: "command", title: "Open SQL Preview", meta: "Inspect selected object source", badge: "View", action: () => setActiveView("sql") },
    { kind: "command", title: "Open Restore Planner", meta: "Preview generated restore scripts", badge: "View", action: () => setActiveView("restore") },
    { kind: "command", title: "Switch to Dark Theme", meta: "Database-tool friendly dark mode", badge: "Theme", action: () => applyTheme("dark") },
    { kind: "command", title: "Switch to Light Theme", meta: "Use the light workspace theme", badge: "Theme", action: () => applyTheme("light") },
    { kind: "command", title: "Use System Theme", meta: "Follow OS theme preference", badge: "Theme", action: () => applyTheme("system") },
    { kind: "command", title: "Download ZIP", meta: completed ? "Download split output archive" : "Available after completion", badge: "Job", disabled: !completed, action: () => window.location.assign(elements.downloadLink.href) },
    { kind: "command", title: "Open Manifest", meta: completed ? "Open generated manifest JSON" : "Available after completion", badge: "Job", disabled: !completed, action: () => window.open(elements.manifestLink.href, "_blank", "noopener") },
  ];
}

function renderCommandItem(item, index) {
  const active = index === state.commandIndex ? "active" : "";
  const disabled = item.disabled ? "disabled" : "";
  const icon = item.kind === "object" ? iconText(item.object?.object_type) : item.badge;
  return `
    <button class="command-item ${active} ${disabled}" type="button" data-command-index="${index}" ${item.disabled ? "disabled" : ""}>
      <span class="tree-icon icon-${escapeHtml(item.object?.object_type || "command")}">${escapeHtml(icon)}</span>
      <span>
        <span class="result-title">${escapeHtml(item.title)}</span>
        <span class="result-path">${escapeHtml(item.meta || "")}</span>
      </span>
      <span class="command-kicker">${escapeHtml(item.badge || item.kind)}</span>
    </button>
  `;
}

function executeCommand(item) {
  if (!item || item.disabled) return;
  closeCommandPalette();
  if (item.kind === "object") {
    selectObject(item.object.object_id);
    return;
  }
  item.action?.();
}

function renderJobs() {
  let jobs = [...state.jobs];
  if (state.jobFilter) {
    jobs = jobs.filter((job) => [job.job_id, job.input_name, job.source_path, job.status].some((value) => String(value || "").toLowerCase().includes(state.jobFilter)));
  }
  if (state.jobStatusFilter !== "all") jobs = jobs.filter((job) => job.status === state.jobStatusFilter);
  jobs.sort(sortJobs);
  jobs.sort((a, b) => Number(isPinned(b.job_id)) - Number(isPinned(a.job_id)));
  elements.jobsList.classList.toggle("compact", state.compactJobs);
  elements.jobViewToggle.textContent = state.compactJobs ? "List" : "Compact";
  if (!jobs.length) {
    elements.jobsList.textContent = "No jobs found.";
    return;
  }
  elements.jobsList.innerHTML = jobs.map(renderJobRow).join("");
  elements.jobsList.querySelectorAll("[data-open-job]").forEach((button) => {
    button.addEventListener("click", () => openJob(button.dataset.openJob));
  });
  elements.jobsList.querySelectorAll("[data-pin-job]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePin(button.dataset.pinJob);
    });
  });
}

function renderJobRow(job) {
  const active = job.job_id === state.jobId ? "active" : "";
  const pinned = isPinned(job.job_id) ? "active" : "";
  if (state.compactJobs) {
    return `
      <div class="job-row ${active}">
        <button class="job-pin ${pinned}" data-pin-job="${escapeHtml(job.job_id)}" type="button">P</button>
        <button class="job-open" data-open-job="${escapeHtml(job.job_id)}" type="button"><span class="job-name">${escapeHtml(prettyJobName(job))}</span></button>
        <span class="status-pill ${escapeHtml(job.status)}">${escapeHtml(humanizeStatus(job.status))}</span>
        <span class="job-meta">${escapeHtml(formatBytes(job.file_size_bytes))}</span>
        <span class="job-meta">${escapeHtml(formatDuration(job.duration_seconds))}</span>
        <a class="tool-link ${job.status === "completed" ? "" : "disabled"}" href="${job.status === "completed" ? `/api/jobs/${encodeURIComponent(job.job_id)}/download` : "#"}">ZIP</a>
      </div>
    `;
  }
  return `
    <div class="job-row ${active}">
      <button class="job-pin ${pinned}" data-pin-job="${escapeHtml(job.job_id)}" type="button">P</button>
      <button class="job-open" data-open-job="${escapeHtml(job.job_id)}" type="button">
        <span class="job-name">${escapeHtml(prettyJobName(job))}</span>
        <span class="job-meta">${escapeHtml(formatBytes(job.file_size_bytes))} | ${escapeHtml(formatDate(job.created_at))}</span>
      </button>
      <span class="status-pill ${escapeHtml(job.status)}">${escapeHtml(humanizeStatus(job.status))}</span>
    </div>
  `;
}

async function openJob(jobId) {
  const job = await requestJson(`/api/jobs/${jobId}`);
  renderJob(job);
  if (job.status === "completed") await loadJobArtifacts(jobId);
  await loadEvents(jobId);
}

async function loadJobArtifacts(jobId) {
  renderSkeleton(elements.navigatorWrap, 8);
  renderSkeleton(elements.treeWrap, 9);
  renderSkeleton(elements.erdWrap, 6);
  renderSkeleton(elements.dependencyWrap, 7);
  renderSkeleton(elements.restoreScripts, 5);
  try {
    const [treePayload, visualizationPayload, restorePayload] = await Promise.all([
      requestJson(`/api/jobs/${jobId}/tree`),
      loadVisualizationPayload(jobId),
      loadRestorePlan(jobId),
    ]);
    state.navigator = treePayload.manifest?.navigator || null;
    state.outputTree = treePayload.tree || null;
    state.visualization = visualizationPayload;
    state.restorePlan = restorePayload;
    renderAllViews();
    if (state.globalSearch) queueObjectSearch(state.globalSearch, 0);
  } catch (error) {
    showError(error.message);
  }
}

async function loadVisualizationPayload(jobId) {
  try {
    return await requestJson(`/api/jobs/${jobId}/visualization`);
  } catch {
    const objectsPayload = await requestJson(`/api/jobs/${jobId}/objects`);
    return buildVisualizationFromObjects(objectsPayload.items || []);
  }
}

async function loadRestorePlan(jobId) {
  try {
    return await requestJson(`/api/jobs/${jobId}/restore-plan`);
  } catch {
    return null;
  }
}

async function loadEvents(jobId) {
  try {
    state.events = await requestJson(`/api/jobs/${jobId}/events?limit=200`);
    renderConsole();
  } catch (error) {
    elements.consoleLog.textContent = error.message;
  }
}

function renderAllViews() {
  renderNavigator();
  renderFiles();
  renderErd();
  renderDependencyGraph();
  renderRestorePlanner();
  renderSearchResults();
  renderBreadcrumb();
}

function renderNavigator() {
  if (!state.navigator) return renderPlaceholder(elements.navigatorWrap, "No objects loaded.");
  const filtered = filterTree(state.navigator, state.filterText, "navigator");
  elements.navigatorWrap.classList.remove("empty-state");
  elements.navigatorWrap.innerHTML = filtered ? renderNavigatorNode(filtered, true) : "No matching objects.";
  bindObjectClicks(elements.navigatorWrap);
}

function renderFiles() {
  if (!state.outputTree) return renderPlaceholder(elements.treeWrap, "No output files loaded.");
  const filtered = filterTree(state.outputTree, state.filterText, "file");
  elements.treeWrap.classList.remove("empty-state");
  elements.treeWrap.innerHTML = filtered ? renderFileNode(filtered, true) : "No matching files.";
  bindObjectClicks(elements.treeWrap);
}

function renderErd() {
  const erd = state.visualization?.erd;
  if (!erd?.tables) return renderPlaceholder(elements.erdWrap, "ERD is not ready.");
  const filtered = filterErd(erd, state.filterText);
  if (!filtered.tables.length) {
    elements.erdWrap.innerHTML = "No matching ERD tables.";
    return;
  }
  const layout = buildErdLayout(filtered.tables);
  elements.erdWrap.classList.remove("empty-state");
  elements.erdWrap.innerHTML = `
    ${renderVizStats({ table_count: filtered.tables.length, relationship_count: filtered.relationships.length, object_count: filtered.tables.length, dependency_count: filtered.relationships.length })}
    <div class="erd-stage"><div class="erd-canvas" style="width:${layout.width}px;height:${layout.height}px;">
      <svg class="erd-svg" viewBox="0 0 ${layout.width} ${layout.height}">${filtered.relationships.map((edge) => renderErdRelationship(edge, layout.tableMap)).join("")}</svg>
      ${layout.tables.map(renderErdCard).join("")}
    </div></div>
  `;
}

function renderDependencyGraph() {
  const graph = state.visualization?.dependency_graph;
  if (!graph) return renderPlaceholder(elements.dependencyWrap, "Dependency graph is not ready.");
  const filtered = filterDependencyGraph(graph, state.filterText);
  elements.dependencyWrap.classList.remove("empty-state");
  elements.dependencyWrap.innerHTML = `
    ${renderVizStats({ object_count: filtered.nodes.length, dependency_count: filtered.edges.length })}
    <div class="edge-list">${filtered.edges.slice(0, 180).map((edge) => `<div class="edge-row"><span>${escapeHtml(shortObjectLabel(edge.source))}</span><strong>-></strong><span>${escapeHtml(shortObjectLabel(edge.target))}</span></div>`).join("") || "No dependencies recorded."}</div>
  `;
}

function renderRestorePlanner() {
  const plan = state.restorePlan;
  const complete = state.activeJob?.status === "completed";
  elements.restoreDownloadLink.classList.toggle("disabled", !complete);
  elements.restoreDownloadLink.href = complete && state.jobId ? `/api/jobs/${state.jobId}/restore-download` : "#";
  if (!plan?.scripts) {
    elements.restoreSummary.textContent = "Restore scripts will appear after a completed split.";
    renderPlaceholder(elements.restoreScripts, "Restore planner is not ready.");
    elements.restoreWarnings.innerHTML = "";
    return;
  }

  populateRestoreSchemas(plan.schemas || []);
  const selectedMode = elements.restoreMode.value;
  const selectedSchema = selectedMode === "schema" ? elements.restoreSchema.value || null : null;
  const selectedScript = findRestoreScript(selectedMode, selectedSchema) || plan.scripts[0];
  state.selectedRestoreScript = selectedScript;
  elements.restoreSummary.textContent = `${plan.scripts.length} scripts | ${formatCount((plan.schemas || []).length)} schemas | ${formatCount(plan.warnings?.length || 0)} warnings`;
  elements.restoreScripts.classList.remove("empty-state");
  elements.restoreScripts.innerHTML = plan.scripts.map((script) => renderRestoreScriptCard(script, selectedScript)).join("");
  elements.restoreScripts.querySelectorAll("[data-restore-script]").forEach((button) => {
    button.addEventListener("click", () => selectRestoreScript(button.dataset.restoreScript));
  });
  renderRestoreWarnings(selectedScript?.warnings || plan.warnings || []);
}

function populateRestoreSchemas(schemas) {
  const current = elements.restoreSchema.value;
  const options = ['<option value="">All schemas</option>', ...schemas.map((schema) => `<option value="${escapeHtml(schema)}">${escapeHtml(schema)}</option>`)];
  elements.restoreSchema.innerHTML = options.join("");
  if (schemas.includes(current)) elements.restoreSchema.value = current;
}

function renderRestoreScriptCard(script, selectedScript) {
  const active = script.path === selectedScript?.path ? "active" : "";
  const label = script.schema ? `${script.mode}: ${script.schema}` : script.mode;
  const href = restoreScriptUrl(script, "text");
  return `
    <article class="restore-script-card ${active}">
      <div>
        <span class="restore-script-title">${escapeHtml(script.script_name)}</span>
        <span class="restore-script-meta">${escapeHtml(label)} | ${formatCount(script.object_count)} objects | data ${script.includes_data ? "yes" : "no"}</span>
      </div>
      <div class="restore-actions">
        <button class="tool-button" type="button" data-restore-script="${escapeHtml(script.path)}">Preview</button>
        <a class="tool-link" href="${href}" download="${escapeHtml(script.script_name)}">SQL</a>
      </div>
    </article>
  `;
}

function renderRestoreWarnings(warnings) {
  const items = Array.isArray(warnings) ? warnings : [];
  elements.restoreWarnings.innerHTML = items.length
    ? items.slice(0, 12).map((warning) => `<div class="warning-line">${escapeHtml(warning)}</div>`).join("")
    : "";
}

function selectRestoreScript(path) {
  const script = (state.restorePlan?.scripts || []).find((item) => item.path === path);
  if (!script) return;
  elements.restoreMode.value = script.mode;
  elements.restoreSchema.value = script.schema || "";
  state.selectedRestoreScript = script;
  renderRestorePlanner();
  loadRestoreScript(script.mode, script.schema || null);
}

function previewSelectedRestoreScript() {
  const mode = elements.restoreMode.value;
  const schema = mode === "schema" ? elements.restoreSchema.value || null : null;
  const script = findRestoreScript(mode, schema);
  if (!script) return showError("No restore script found for the selected mode.");
  state.selectedRestoreScript = script;
  renderRestorePlanner();
  loadRestoreScript(script.mode, script.schema || null);
}

async function loadRestoreScript(mode, schema) {
  if (!state.jobId) return;
  try {
    const payload = await requestJson(restoreScriptUrl({ mode, schema }, "json"));
    state.selectedRestoreSql = payload.sql || "";
    elements.restorePreviewMeta.textContent = `${payload.script_name} | ${formatCount(payload.metadata?.object_count)} objects | ${payload.path}`;
    elements.restorePreview.innerHTML = `<code>${highlightSql(state.selectedRestoreSql)}</code>`;
    renderRestoreWarnings(payload.metadata?.warnings || []);
  } catch (error) {
    showError(error.message);
  }
}

function findRestoreScript(mode, schema) {
  const scripts = state.restorePlan?.scripts || [];
  return scripts.find((script) => script.mode === mode && (script.schema || "") === (schema || ""))
    || (mode === "schema" && !schema ? scripts.find((script) => script.script_name === "schema_only.sql") : null);
}

function restoreScriptUrl(script, format) {
  if (!state.jobId) return "#";
  const params = new URLSearchParams({ mode: script.mode || "full", format });
  if (script.schema) params.set("schema", script.schema);
  return `/api/jobs/${encodeURIComponent(state.jobId)}/restore-script?${params.toString()}`;
}

function renderNavigatorNode(node, isRoot = false) {
  const children = (node.children || []).map((child) => renderNavigatorNode(child)).join("");
  const objectAttrs = node.object_id ? `data-object-id="${escapeHtml(node.object_id)}"` : "";
  const clickable = node.object_id ? "clickable" : "";
  const selected = node.object_id && state.selectedObject?.object_id === node.object_id ? "selected" : "";
  return `
    <div class="tree-node ${isRoot ? "root" : ""}">
      <div class="tree-label ${clickable} ${selected}" ${objectAttrs}>
        <span class="tree-icon icon-${escapeHtml(node.icon || node.object_type || node.kind || "object")}">${escapeHtml(iconText(node.icon || node.object_type || node.kind))}</span>
        <strong>${escapeHtml(node.name)}</strong>
        ${node.count !== undefined ? `<span class="tree-count">${escapeHtml(node.count)}</span>` : ""}
      </div>
      ${children}
    </div>
  `;
}

function renderFileNode(node, isRoot = false) {
  const isFile = node.type === "file";
  const objectAttrs = node.object_id ? `data-object-id="${escapeHtml(node.object_id)}"` : "";
  const selected = node.object_id && state.selectedObject?.object_id === node.object_id ? "selected" : "";
  const children = (node.children || []).map((child) => renderFileNode(child)).join("");
  return `
    <div class="tree-node ${isRoot ? "root" : ""}">
      <div class="tree-label ${isFile ? "file-link" : ""} ${selected}" ${objectAttrs}>
        <span class="tree-icon icon-${escapeHtml(node.object_type || node.type)}">${escapeHtml(iconText(node.object_type || node.type))}</span>
        <strong>${escapeHtml(node.name)}</strong>
        ${node.object_type ? `<span class="tree-tag">${escapeHtml(node.object_type)}</span>` : ""}
      </div>
      ${children}
    </div>
  `;
}

function bindObjectClicks(root) {
  root.querySelectorAll("[data-object-id]").forEach((element) => {
    element.addEventListener("click", () => selectObject(element.dataset.objectId));
  });
}

async function selectObject(objectId) {
  if (!state.jobId || !objectId) return;
  try {
    const object = await requestJson(`/api/jobs/${state.jobId}/object?object_id=${encodeURIComponent(objectId)}`);
    state.selectedObject = object;
    renderObjectDetails(object);
    renderBreadcrumb();
    await loadSqlPreview(objectId);
    setActiveView("sql");
    if (!state.focusMode) saveLayout({ rightCollapsed: false });
    renderNavigator();
    renderFiles();
  } catch (error) {
    showError(error.message);
  }
}

async function loadSqlPreview(objectId) {
  try {
    const payload = await requestJson(`/api/jobs/${state.jobId}/source?object_id=${encodeURIComponent(objectId)}`);
    state.selectedSql = payload.sql || "";
    if (state.sourceBlobUrl) URL.revokeObjectURL(state.sourceBlobUrl);
    state.sourceBlobUrl = URL.createObjectURL(new Blob([state.selectedSql], { type: "text/sql" }));
    elements.sourceDownload.href = state.sourceBlobUrl;
    elements.sourceDownload.download = `${safeFilename(state.selectedObject?.name || "object")}.sql`;
    elements.sourceDownload.classList.remove("disabled");
    elements.sourceDownload.removeAttribute("aria-disabled");
    renderSqlMeta(payload.path);
    renderSqlPreview();
  } catch (error) {
    state.selectedSql = `-- ${error.message}`;
    renderSqlMeta(null);
    renderSqlPreview();
  }
}

function renderSqlPreview() {
  const query = elements.sqlSearch.value.trim();
  let html = highlightSql(state.selectedSql || "Select an object to preview SQL.");
  let hitCount = 0;
  if (query) {
    const escaped = escapeRegExp(escapeHtml(query));
    html = html.replace(new RegExp(escaped, "gi"), (match) => {
      hitCount += 1;
      return `<mark class="sql-hit">${match}</mark>`;
    });
  }
  elements.sqlPreview.innerHTML = `<code>${html}</code>`;
  if (query) elements.sqlMeta.textContent = `${hitCount} SQL matches | ${sqlSizeLabel()}`;
  else renderSqlMeta(state.selectedObject?.path || null);
}

async function copySql() {
  if (!state.selectedSql) return;
  await navigator.clipboard.writeText(state.selectedSql);
  const original = elements.copySql.textContent;
  elements.copySql.textContent = "Copied";
  window.setTimeout(() => {
    elements.copySql.textContent = original;
  }, 900);
}

function renderJobDetails(job) {
  elements.details.jobId.textContent = job.job_id || "-";
  elements.details.source.textContent = prettyJobName(job);
  elements.details.fileSize.textContent = formatBytes(job.file_size_bytes);
  elements.details.status.textContent = humanizeStatus(job.status);
  elements.details.created.textContent = formatDate(job.created_at);
  elements.details.started.textContent = formatDate(job.started_at);
  elements.details.finished.textContent = formatDate(job.finished_at);
  elements.details.duration.textContent = formatDuration(job.duration_seconds);
  elements.details.objects.textContent = formatCount(job.object_count || job.objects_processed);
  elements.details.warnings.textContent = formatCount(job.warning_count);
}

function renderObjectDetails(object) {
  elements.details.objectName.textContent = object.name || "-";
  elements.details.objectType.textContent = object.object_type || "-";
  elements.details.objectSchema.textContent = object.schema || "-";
  elements.details.objectPath.textContent = object.path || "-";
  elements.details.objectDependencies.textContent = (object.dependencies || []).join(", ") || "-";
}

function renderBreadcrumb() {
  const parts = ["Workspace"];
  if (state.activeJob) parts.push(prettyJobName(state.activeJob));
  parts.push(viewTitle(state.activeView));
  if (state.selectedObject) {
    if (state.selectedObject.schema) parts.push(state.selectedObject.schema);
    parts.push(state.selectedObject.object_type || "object");
    parts.push(state.selectedObject.name || state.selectedObject.object_id);
  }
  elements.breadcrumbBar.innerHTML = parts.map((part, index) => {
    const label = escapeHtml(part);
    if (index === 0) return `<span>${label}</span>`;
    return `<span class="breadcrumb-separator">/</span><span class="${index === parts.length - 1 ? "breadcrumb-part" : ""}">${label}</span>`;
  }).join("");
}

function renderSqlMeta(path) {
  const object = state.selectedObject;
  if (!object) {
    elements.sqlMeta.textContent = "No source selected";
    return;
  }
  const lines = [object.object_type, object.schema || "_global", path || object.path, sqlSizeLabel()].filter(Boolean);
  elements.sqlMeta.textContent = lines.join(" | ");
}

function sqlSizeLabel() {
  return `${formatCount((state.selectedSql || "").split(/\r?\n/).length)} lines`;
}

function renderProgressMetrics(job) {
  const speed = computeThroughput();
  const remainingBytes = Math.max((job.file_size_bytes || 0) - (job.processed_bytes || 0), 0);
  const eta = speed > 0 && remainingBytes > 0 ? remainingBytes / speed : null;
  elements.metricObjects.textContent = formatCount(job.object_count || job.objects_processed);
  elements.metricProcessed.textContent = `${formatBytes(job.processed_bytes)} / ${formatBytes(job.file_size_bytes)}`;
  elements.metricSpeed.textContent = speed ? `${formatBytes(speed)}/s` : "-";
  elements.metricEta.textContent = eta ? formatDuration(eta) : "-";
  elements.metricMemory.textContent = job.memory_bytes ? formatBytes(job.memory_bytes) : "Unavailable";
  elements.metricEvents.textContent = formatCount(job.events_count);
  elements.consoleStage.textContent = `stage: ${job.stage || "-"}`;
  elements.consoleThroughput.textContent = `speed: ${speed ? `${formatBytes(speed)}/s` : "-"}`;
  elements.consoleEta.textContent = `eta: ${eta ? formatDuration(eta) : "-"}`;
}

function renderConsole() {
  if (!state.events.length) {
    elements.consoleLog.textContent = "No job events yet.";
    return;
  }
  elements.consoleLog.innerHTML = state.events.map((event) => `
    <div class="console-row">
      <span>${escapeHtml(formatDate(event.created_at))}</span>
      <span class="level-${escapeHtml(event.level)}">${escapeHtml(event.level)}</span>
      <span>${escapeHtml(event.stage)}</span>
      <span>${escapeHtml(event.message)}</span>
    </div>
  `).join("");
  elements.consoleLog.scrollTop = elements.consoleLog.scrollHeight;
}

function updateLinks(job) {
  const complete = job.status === "completed";
  elements.downloadLink.classList.toggle("disabled", !complete);
  elements.manifestLink.classList.toggle("disabled", !complete);
  elements.downloadLink.href = complete ? `/api/jobs/${job.job_id}/download` : "#";
  elements.manifestLink.href = complete ? `/api/jobs/${job.job_id}/manifest` : "#";
}

function recordMetricSample(job) {
  const now = Date.now();
  state.metricsSamples.push({ time: now, processed: Number(job.processed_bytes) || 0 });
  state.metricsSamples = state.metricsSamples.filter((sample) => now - sample.time <= 8000);
}

function computeThroughput() {
  if (state.metricsSamples.length < 2) return 0;
  const first = state.metricsSamples[0];
  const last = state.metricsSamples[state.metricsSamples.length - 1];
  const seconds = (last.time - first.time) / 1000;
  if (seconds <= 0) return 0;
  return Math.max((last.processed - first.processed) / seconds, 0);
}

function buildVisualizationFromObjects(objects) {
  const items = Array.isArray(objects) ? objects : [];
  const tables = items.filter((item) => item.object_type === "tables");
  const tableIds = new Set(tables.map((table) => table.object_id));
  const relationships = [];
  const dependencyEdges = [];
  for (const item of items) {
    for (const dependency of item.dependencies || []) {
      dependencyEdges.push({ source: dependency, target: item.object_id, type: "dependency" });
      if (item.object_type === "tables" && tableIds.has(dependency)) {
        relationships.push({ source_table: dependency, target_table: item.object_id, source_columns: [], target_columns: [], type: "foreign_key" });
      }
    }
  }
  return {
    erd: {
      tables: tables.map((item) => ({
        id: item.object_id,
        label: item.name,
        schema: item.schema,
        full_name: item.object_id,
        columns: (item.attributes?.columns || []).map((column) => ({ name: column.name, data_type: column.data_type, primary_key: column.primary_key, foreign_key: column.foreign_key, not_null: column.not_null })),
      })),
      relationships,
    },
    dependency_graph: {
      nodes: items.map((item) => ({ id: item.object_id, label: item.name, schema: item.schema, type: item.object_type })),
      edges: dependencyEdges,
    },
  };
}

function renderVizStats(stats) {
  return `
    <div class="viz-stat-row">
      <div class="viz-stat"><span>Tables</span><strong>${formatCount(stats.table_count)}</strong></div>
      <div class="viz-stat"><span>Relationships</span><strong>${formatCount(stats.relationship_count)}</strong></div>
      <div class="viz-stat"><span>Objects</span><strong>${formatCount(stats.object_count)}</strong></div>
      <div class="viz-stat"><span>Dependencies</span><strong>${formatCount(stats.dependency_count)}</strong></div>
    </div>
  `;
}

function buildErdLayout(tables) {
  const width = 310;
  const gapX = 54;
  const gapY = 44;
  const padding = 24;
  const columns = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(tables.length))));
  const heights = Array.from({ length: columns }, () => padding);
  const placed = [];
  const tableMap = {};
  for (const table of tables) {
    let column = 0;
    for (let i = 1; i < columns; i += 1) if (heights[i] < heights[column]) column = i;
    const rowHeight = 27;
    const headerHeight = 36;
    const height = headerHeight + Math.max(table.columns?.length || 0, 1) * rowHeight + 14;
    const current = { ...table, x: padding + column * (width + gapX), y: heights[column], width, height, rowHeight, headerHeight };
    placed.push(current);
    tableMap[table.id] = current;
    heights[column] += height + gapY;
  }
  return { tables: placed, tableMap, width: padding * 2 + columns * width + Math.max(columns - 1, 0) * gapX, height: Math.max(...heights) + padding };
}

function renderErdCard(table) {
  const rows = (table.columns || []).map((column) => `
    <div class="erd-column-row">
      <span class="erd-column-name">${escapeHtml(column.name)}</span>
      <span class="erd-column-type">${escapeHtml(column.data_type || "")}</span>
    </div>
  `).join("");
  return `
    <section class="erd-card" style="left:${table.x}px;top:${table.y}px;width:${table.width}px;">
      <div class="erd-card-header">${escapeHtml(table.full_name || table.label)}</div>
      ${rows || '<div class="erd-column-row"><span>No parsed columns</span></div>'}
    </section>
  `;
}

function renderErdRelationship(relationship, tableMap) {
  const source = tableMap[relationship.source_table];
  const target = tableMap[relationship.target_table];
  if (!source || !target) return "";
  const startX = source.x + source.width;
  const startY = source.y + source.headerHeight + 14;
  const endX = target.x;
  const endY = target.y + target.headerHeight + 14;
  const midX = startX + (endX - startX) / 2;
  return `<path class="erd-link" d="M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}" />`;
}

function filterTree(node, filterText, mode) {
  if (!node || !filterText) return node;
  const ownMatch = [node.name, node.path, node.object_id, node.object_type, node.schema].some((value) => String(value || "").toLowerCase().includes(filterText));
  const children = (node.children || []).map((child) => filterTree(child, filterText, mode)).filter(Boolean);
  if (ownMatch || children.length) return { ...node, children };
  return null;
}

function filterErd(erd, filterText) {
  if (!filterText) return erd;
  const tables = (erd.tables || []).filter((table) => [table.id, table.label, table.schema, ...(table.columns || []).flatMap((column) => [column.name, column.data_type])].some((value) => String(value || "").toLowerCase().includes(filterText)));
  const ids = new Set(tables.map((table) => table.id));
  return { tables, relationships: (erd.relationships || []).filter((edge) => ids.has(edge.source_table) || ids.has(edge.target_table)) };
}

function filterDependencyGraph(graph, filterText) {
  if (!filterText) return graph;
  const edges = (graph.edges || []).filter((edge) => [edge.source, edge.target].some((value) => String(value || "").toLowerCase().includes(filterText)));
  const nodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const nodes = (graph.nodes || []).filter((node) => nodeIds.has(node.id) || [node.id, node.label, node.schema, node.type].some((value) => String(value || "").toLowerCase().includes(filterText)));
  return { nodes, edges };
}

function renderPlaceholder(element, text) {
  element.classList.add("empty-state");
  element.textContent = text;
}

function renderSkeleton(element, lines = 6) {
  element.classList.remove("empty-state");
  element.innerHTML = `
    <div class="skeleton" aria-label="Loading">
      ${Array.from({ length: lines }, (_, index) => `<div class="skeleton-line" style="width:${Math.max(34, 96 - index * 7)}%"></div>`).join("")}
    </div>
  `;
}

function renderEmptyStates() {
  renderPlaceholder(elements.navigatorWrap, "Run or open a completed job.");
  renderPlaceholder(elements.treeWrap, "Output files will appear here.");
  renderPlaceholder(elements.erdWrap, "ERD will appear here.");
  renderPlaceholder(elements.dependencyWrap, "Dependency graph will appear here.");
  renderPlaceholder(elements.restoreScripts, "Restore scripts will appear here.");
}

function showError(message) {
  elements.message.textContent = message;
  elements.message.classList.add("visible");
}

function clearError() {
  elements.message.textContent = "";
  elements.message.classList.remove("visible");
}

function isPinned(jobId) {
  return state.pins.includes(jobId);
}

function togglePin(jobId) {
  state.pins = isPinned(jobId) ? state.pins.filter((id) => id !== jobId) : [...state.pins, jobId];
  localStorage.setItem(STORAGE.pins, JSON.stringify(state.pins));
  renderJobs();
}

function sortJobs(a, b) {
  if (state.jobSort === "created-asc") return String(a.created_at).localeCompare(String(b.created_at));
  if (state.jobSort === "size-desc") return (b.file_size_bytes || 0) - (a.file_size_bytes || 0);
  if (state.jobSort === "duration-desc") return (b.duration_seconds || 0) - (a.duration_seconds || 0);
  return String(b.created_at).localeCompare(String(a.created_at));
}

function prettyJobName(job) {
  const raw = String(job.input_name || job.source_path || job.job_id || "");
  return raw.split(/[\\/]/).pop() || raw;
}

function formatObjectLabel(object) {
  if (!object) return "-";
  return object.schema ? `${object.schema}.${object.name}` : object.name || object.object_id;
}

function viewTitle(view) {
  const map = {
    overview: "Overview",
    files: "Output Files",
    erd: "ERD",
    dependency: "Dependency Graph",
    sql: "SQL Preview",
    restore: "Restore Planner",
  };
  return map[view] || "Overview";
}

function iconText(kind) {
  const map = { schemas: "SCH", schema: "SCH", tables: "TBL", views: "VIEW", materialized_views: "MV", functions: "FN", triggers: "TRG", indexes: "IDX", sequences: "SEQ", constraints: "FK", enums: "ENUM", types: "TYPE", policies: "RLS", grants: "GRANT", comments: "NOTE", data: "CPY", restore: "RST", manifest: "JSON", file: "SQL", directory: "DIR", command: "CMD" };
  return map[kind] || String(kind || "OBJ").slice(0, 4).toUpperCase();
}

function highlightSql(sql) {
  const escaped = escapeHtml(sql);
  return escaped.replace(/\b(CREATE|TABLE|VIEW|FUNCTION|TRIGGER|ALTER|COPY|SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|PRIMARY|KEY|FOREIGN|REFERENCES|INSERT|UPDATE|DELETE|AS|BEGIN|END|LANGUAGE|CONSTRAINT|INDEX|SCHEMA|POLICY|GRANT|OWNER|SEQUENCE|TYPE|ENUM|EXTENSION|MATERIALIZED)\b/gi, '<span class="sql-keyword">$1</span>');
}

function formatBytes(value) {
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

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatDuration(value) {
  if (value === null || value === undefined) return "-";
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "-";
  if (seconds < 60) return `${seconds.toFixed(1)} sec`;
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} sec`;
}

function formatCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : "-";
}

function humanizeStatus(status) {
  const value = String(status || "idle").toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shortObjectLabel(value) {
  const text = String(value || "");
  return text.length > 72 ? `${text.slice(0, 69)}...` : text;
}

function safeFilename(value) {
  return String(value || "object").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "object";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function loadSessionJson(key, fallback) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

initialize();
