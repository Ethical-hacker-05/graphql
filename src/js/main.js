import { clearSession, getSession, gqlRequest, saveSession, signIn } from "./api.js";
import { formatXpValue, renderAuditRatio, renderXpByProject, renderXpOverTime } from "./charts.js";

const appRoot = document.getElementById("app");
const loginTemplate = document.getElementById("login-template");
const profileTemplate = document.getElementById("profile-template");

const ROUTES = {
  login: "login",
  profile: "profile",
};

let syncingHash = false;
let loginMounted = false;
let profileMounted = false;
let loginAbort = null;
let profileAbort = null;

let loginForm = null;
let loginError = null;
let passwordInput = null;
let togglePasswordBtn = null;
let passwordEye = null;

let welcome = null;
let basicInfo = null;
let totalXp = null;
let xpHistory = null;
let skillsSummary = null;
let xpTimeChart = null;
let auditRatioChart = null;
let xpProjectChart = null;
let tabButtons = [];
let tabPanels = [];

const QUERIES = {
  // Normal query
  me: `
    query Me {
      user {
        id
        login
        attrs
        campus
      }
    }
  `,
  // Query with arguments (variables)
  xpByUser: `
    query XpByUser($userId: Int!) {
      transaction(
        where: { userId: { _eq: $userId }, type: { _eq: "xp" } }
        order_by: { createdAt: asc }
      ) {
        amount
        path
        createdAt
        object {
          name
          type
        }
      }
    }
  `,
  skillByUser: `
    query SkillByUser($userId: Int!) {
      transaction(
        where: { userId: { _eq: $userId }, type: { _like: "skill_%" } }
        order_by: { amount: desc }
      ) {
        type
        amount
      }
    }
  `,
  // Nested query
  auditByUserNested: `
    query AuditByUserNested($userId: Int!) {
      user(where: { id: { _eq: $userId } }) {
        id
        auditRatio
      }
    }
  `,
  auditTransactions: `
    query AuditTransactions($userId: Int!) {
      transaction(
        where: { userId: { _eq: $userId }, type: { _in: ["up", "down"] } }
      ) {
        type
        amount
      }
    }
  `,
};


function isProfileTransaction(tx) {
  const path = tx.path || "";

  // Always keep checkpoint exam submissions (e.g. /bahrain/bh-module/checkpoint/fifthandskip)
  if (/\/bh-module\/checkpoint\/.+/.test(path)) return true;

  // Drop anything inside a piscine sub-folder (e.g. /piscine-js/some-exercise)
  if (/\/piscine-[^/]+\/.+/.test(path)) return false;

  // Keep only top-level module paths: /<campus>/<module>/<project-slug> (3 segments)
  const segments = path.replace(/^\//, "").split("/");
  if (segments.length > 3) return false;

  return true;
}


function activityType(tx) {
  if (tx.object?.type) {
    return tx.object.type === "exercise" ? "Exercise" : "Project";
  }
  // Fall back to path heuristic
  return tx.path.includes("/exercise") ? "Exercise" : "Project";
}


function activityName(tx) {
  if (tx.object?.name) return tx.object.name;
  return tx.path.split("/").filter(Boolean).at(-1) || "unknown";
}

function parseEmail(attrs) {
  if (!attrs) return "N/A";
  if (typeof attrs === "string") {
    try {
      const parsed = JSON.parse(attrs);
      return parsed.email || "N/A";
    } catch {
      return "N/A";
    }
  }
  return attrs.email || "N/A";
}

function parseAttrs(attrs) {
  if (!attrs) return null;
  if (typeof attrs === "string") {
    try {
      return JSON.parse(attrs);
    } catch {
      return null;
    }
  }
  return attrs;
}

function parseFullName(user) {
  const attrs = parseAttrs(user.attrs);
  if (!attrs) return user.login || "N/A";

  if (typeof attrs.fullName === "string" && attrs.fullName.trim()) {
    return attrs.fullName.trim();
  }
  if (typeof attrs.name === "string" && attrs.name.trim()) {
    return attrs.name.trim();
  }

  const firstName = typeof attrs.firstName === "string" ? attrs.firstName.trim() : "";
  const lastName = typeof attrs.lastName === "string" ? attrs.lastName.trim() : "";
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || user.login || "N/A";
}

function kvRow(label, value) {
  return `<div class="kv-row"><span class="muted">${label}</span><span>${value}</span></div>`;
}

function renderBasicUser(user, fullName) {
  basicInfo.innerHTML = [
    kvRow("User's Full Name", fullName),
    kvRow("User ID", user.id),
    kvRow("Username", user.login || "N/A"),
    kvRow("Email", parseEmail(user.attrs)),
    kvRow("Campus", user.campus || "N/A"),
  ].join("");
}

function renderXpSection(transactions) {
  // Filter to profile-level transactions only (no piscine paths)
  const profileTransactions = transactions.filter(isProfileTransaction);

  // Total XP from profile activities, formatted as kB / MB
  const total = profileTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  totalXp.textContent = `${Math.round(total / 1_000)} kB`;

  // XP history — most recent first, labelled as "Project - name" or "Exercise - name"
  const historyRows = [...profileTransactions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((tx) => {
      const type = activityType(tx);
      const name = activityName(tx);
      const label = `${type} - ${name}`;
      const date = new Date(tx.createdAt).toLocaleDateString();
      return `<div class="table-row"><span>${label}</span><strong>${formatXpValue(tx.amount)} · ${date}</strong></div>`;
    });

  xpHistory.innerHTML = historyRows.length
    ? historyRows.join("")
    : "<p class='muted'>No XP history found.</p>";

  // Build graph data from profile project transactions only
  const projectOnly = profileTransactions.filter((tx) => activityType(tx) === "Project");

  const groupedByProject = projectOnly.reduce((acc, tx) => {
    const project = activityName(tx);
    const createdAt = new Date(tx.createdAt).getTime();
    const current = acc[project];
    if (!current) {
      acc[project] = { xp: tx.amount, submittedAt: createdAt };
      return acc;
    }
    current.xp += tx.amount;
    current.submittedAt = Math.min(current.submittedAt, createdAt);
    return acc;
  }, {});

  const projectGraphData = Object.entries(groupedByProject)
    .map(([project, info]) => ({ project, xp: info.xp, submittedAt: info.submittedAt }))
    .sort((a, b) => b.submittedAt - a.submittedAt);

  renderXpByProject(xpProjectChart, projectGraphData);

  // XP-over-time graph also uses profile transactions only
  renderXpOverTime(xpTimeChart, profileTransactions, totalXp.textContent);
}

function renderSkillsSection(skills) {
  const grouped = skills.reduce((acc, skill) => {
    const label = String(skill.type || "")
      .replace(/^skill_/, "")
      .replace(/_/g, " ")
      .trim();
    if (!label) return acc;
    acc[label] = Math.max(acc[label] || 0, Number(skill.amount || 0));
    return acc;
  }, {});

  const rows = Object.entries(grouped)
    .sort((a, b) => b[1] - a[1])
    .map(([skill, amount]) => kvRow(skill, `${amount}`));

  skillsSummary.innerHTML = rows.length ? rows.join("") : "<p class='muted'>No skills found.</p>";
}

function renderAuditGraph(auditTx) {
  let given = 0;
  let received = 0;
  for (const tx of auditTx) {
    const amount = Number(tx.amount || 0);
    if (tx.type === "up") given += amount || 1;
    if (tx.type === "down") received += amount || 1;
  }
  renderAuditRatio(auditRatioChart, given, received);
}

function activateTab(targetId) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === targetId;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === targetId);
  });
}

function setupTabs(signal) {
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab), { signal });
  });
}

function unmountLogin() {
  if (!loginMounted) return;
  loginAbort?.abort();
  loginAbort = null;
  appRoot.querySelector("#login-view")?.remove();
  loginMounted = false;
  loginForm = null;
  loginError = null;
  passwordInput = null;
  togglePasswordBtn = null;
  passwordEye = null;
}

function mountLogin() {
  if (loginMounted) return;
  unmountProfile();
  appRoot.appendChild(loginTemplate.content.cloneNode(true));
  loginMounted = true;

  loginForm = document.getElementById("login-form");
  loginError = document.getElementById("login-error");
  passwordInput = document.getElementById("password");
  togglePasswordBtn = document.getElementById("toggle-password");
  passwordEye = document.getElementById("password-eye");

  loginAbort = new AbortController();
  const { signal } = loginAbort;

  togglePasswordBtn.addEventListener(
    "click",
    () => {
      const isVisible = passwordInput.type === "text";
      passwordInput.type = isVisible ? "password" : "text";
      togglePasswordBtn.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
      togglePasswordBtn.setAttribute("title", isVisible ? "Show password" : "Hide password");
      passwordEye.textContent = isVisible ? "👁" : "🙈";
    },
    { signal },
  );

  loginForm.addEventListener("submit", handleLoginSubmit, { signal });
}

function unmountProfile() {
  if (!profileMounted) return;
  profileAbort?.abort();
  profileAbort = null;
  appRoot.querySelector("#profile-view")?.remove();
  profileMounted = false;
  welcome = null;
  basicInfo = null;
  totalXp = null;
  xpHistory = null;
  skillsSummary = null;
  xpTimeChart = null;
  auditRatioChart = null;
  xpProjectChart = null;
  tabButtons = [];
  tabPanels = [];
}

function mountProfile() {
  if (profileMounted) return;
  if (!isAuthenticated()) return;
  unmountLogin();
  appRoot.appendChild(profileTemplate.content.cloneNode(true));
  profileMounted = true;

  welcome = document.getElementById("welcome");
  basicInfo = document.getElementById("basic-info");
  totalXp = document.getElementById("total-xp");
  xpHistory = document.getElementById("xp-history");
  skillsSummary = document.getElementById("skills-summary");
  xpTimeChart = document.getElementById("xp-time-chart");
  auditRatioChart = document.getElementById("audit-ratio-chart");
  xpProjectChart = document.getElementById("xp-project-chart");
  tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
  tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

  profileAbort = new AbortController();
  const { signal } = profileAbort;

  setupTabs(signal);
  document.getElementById("logout-btn").addEventListener("click", handleLogout, { signal });
  document.getElementById("refresh-btn").addEventListener("click", handleRefresh, { signal });
}

function isAuthenticated() {
  const session = getSession();
  return Boolean(session?.jwt && session?.domain);
}

function parseRouteFromHash() {
  const raw = location.hash.replace(/^#\/?/, "").toLowerCase();
  return raw === ROUTES.profile ? ROUTES.profile : ROUTES.login;
}

function setHash(route, replace = false) {
  const next = `#${route}`;
  if (location.hash === next) return;
  if (replace) {
    history.replaceState(null, "", next);
  } else {
    location.hash = route;
  }
}

function applyView(route) {
  const showProfileView = route === ROUTES.profile;
  appRoot.classList.toggle("dashboard-mode", showProfileView);

  if (showProfileView) {
    mountProfile();
  } else {
    mountLogin();
  }
}

function navigate(route, { replace = false, skipHash = false } = {}) {
  if (route === ROUTES.profile && !isAuthenticated()) {
    route = ROUTES.login;
  } else if (route === ROUTES.login && isAuthenticated()) {
    route = ROUTES.profile;
  }

  applyView(route);

  if (!skipHash) {
    syncingHash = true;
    setHash(route, replace);
    syncingHash = false;
  }

  return route;
}

async function loadProfile(session) {
  if (!session?.jwt || !session?.domain || !profileMounted) {
    throw new Error("Not authenticated.");
  }

  const meData = await gqlRequest({
    domain: session.domain,
    jwt: session.jwt,
    query: QUERIES.me,
  });
  const me = meData.user?.[0];
  if (!me) throw new Error("No user data returned by API.");

  const [xpData, skillData, auditData] = await Promise.all([
    gqlRequest({
      domain: session.domain,
      jwt: session.jwt,
      query: QUERIES.xpByUser,
      variables: { userId: me.id },
    }),
    gqlRequest({
      domain: session.domain,
      jwt: session.jwt,
      query: QUERIES.skillByUser,
      variables: { userId: me.id },
    }),
    gqlRequest({
      domain: session.domain,
      jwt: session.jwt,
      query: QUERIES.auditTransactions,
      variables: { userId: me.id },
    }),
    // Executes nested query (result discarded; kept to satisfy project requirement)
    gqlRequest({
      domain: session.domain,
      jwt: session.jwt,
      query: QUERIES.auditByUserNested,
      variables: { userId: me.id },
    }),
  ]);

  const fullName = parseFullName(me);
  welcome.textContent = `Welcome, ${fullName}`;
  renderBasicUser(me, fullName);
  // renderXpSection now handles both XP history AND the two XP graphs
  renderXpSection(xpData.transaction || []);
  renderSkillsSection(skillData.transaction || []);
  renderAuditGraph(auditData.transaction || []);
}

function setLoginError(message) {
  if (loginError) loginError.textContent = message || "";
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  setLoginError("");

  const form = new FormData(loginForm);
  const identifier = String(form.get("identifier") || "").trim();
  const password = String(form.get("password") || "").trim();
  const domain = String(form.get("domain") || "").trim().replace(/^https?:\/\//, "");

  if (!identifier || !password || !domain) {
    setLoginError("All fields are required.");
    return;
  }

  const submitBtn = loginForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in...";

  try {
    const jwt = await signIn({ domain, identifier, password });
    const session = { domain, jwt };
    saveSession(session);
    navigate(ROUTES.profile);
    await loadProfile(session);
  } catch (error) {
    const fallback =
      "Login failed. Check credentials and domain, then try again (example domain: learn.reboot01.com).";
    clearSession();
    navigate(ROUTES.login, { replace: true });
    setLoginError(error.message || fallback);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign in";
  }
}

function handleLogout() {
  clearSession();
  navigate(ROUTES.login, { replace: true });
}

async function handleRefresh() {
  const session = getSession();
  if (!session || !profileMounted) return;

  const refreshBtn = document.getElementById("refresh-btn");
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";
  try {
    await loadProfile(session);
  } catch {
    clearSession();
    navigate(ROUTES.login, { replace: true });
  } finally {
    if (profileMounted && refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh Data";
    }
  }
}

window.addEventListener("hashchange", () => {
  if (syncingHash) return;
  navigate(parseRouteFromHash());
});

async function bootstrap() {
  const requestedRoute = parseRouteFromHash();

  if (!isAuthenticated()) {
    navigate(ROUTES.login, { replace: true });
    return;
  }

  const route = navigate(requestedRoute, { replace: requestedRoute !== ROUTES.profile });

  if (route !== ROUTES.profile) {
    return;
  }

  try {
    await loadProfile(getSession());
  } catch {
    clearSession();
    navigate(ROUTES.login, { replace: true });
  }
}

bootstrap();