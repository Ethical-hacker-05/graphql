import { clearSession, getSession, gqlRequest, saveSession, signIn } from "./api.js";
import { renderAuditRatio, renderXpByProject, renderXpOverTime } from "./charts.js";

const loginView = document.getElementById("login-view");
const profileView = document.getElementById("profile-view");
const appRoot = document.getElementById("app");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const refreshBtn = document.getElementById("refresh-btn");
const passwordInput = document.getElementById("password");
const showPasswordCheckbox = document.getElementById("show-password");

const welcome = document.getElementById("welcome");
const basicInfo = document.getElementById("basic-info");
const totalXp = document.getElementById("total-xp");
const xpHistory = document.getElementById("xp-history");
const skillsSummary = document.getElementById("skills-summary");
const xpTimeChart = document.getElementById("xp-time-chart");
const auditRatioChart = document.getElementById("audit-ratio-chart");
const xpProjectChart = document.getElementById("xp-project-chart");
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

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
  // Keep nested query usage for project requirements
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

function formatXp(value) {
  return `${Number(value || 0).toLocaleString()} XP`;
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
  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  totalXp.textContent = formatXp(total);

  const projectOnlyTransactions = transactions.filter((tx) => {
    if (tx.object?.type) return tx.object.type === "project";
    return !tx.path.includes("/exercise/");
  });

  const groupedByProject = projectOnlyTransactions.reduce((acc, tx) => {
    const project =
      tx.object?.name || tx.path.split("/").filter(Boolean).at(-1) || "unknown-project";
    acc[project] = (acc[project] || 0) + tx.amount;
    return acc;
  }, {});

  const historyRows = [...transactions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((tx) => {
      const date = new Date(tx.createdAt).toLocaleDateString();
      return `<div class="table-row"><span>${tx.path}</span><strong>${formatXp(tx.amount)} · ${date}</strong></div>`;
    });

  xpHistory.innerHTML = historyRows.length
    ? historyRows.join("")
    : "<p class='muted'>No XP history found.</p>";

  const projectGraphData = Object.entries(groupedByProject)
    .sort((a, b) => b[1] - a[1])
    .map(([project, xp]) => ({ project, xp }));
  renderXpByProject(xpProjectChart, projectGraphData);
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

function setupTabs() {
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });
}

async function loadProfile(session) {
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
    // Executes nested query type for requirement coverage
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
  renderXpSection(xpData.transaction || []);
  renderSkillsSection(skillData.transaction || []);
  renderAuditGraph(auditData.transaction || []);
  renderXpOverTime(xpTimeChart, xpData.transaction || []);
}

function showLogin() {
  appRoot.classList.remove("dashboard-mode");
  loginView.classList.remove("hidden");
  profileView.classList.add("hidden");
}

function showProfile() {
  appRoot.classList.add("dashboard-mode");
  loginView.classList.add("hidden");
  profileView.classList.remove("hidden");
}

function setLoginError(message) {
  loginError.textContent = message || "";
}

showPasswordCheckbox.addEventListener("change", () => {
  passwordInput.type = showPasswordCheckbox.checked ? "text" : "password";
});

setupTabs();

loginForm.addEventListener("submit", async (event) => {
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
    await loadProfile(session);
    showProfile();
  } catch (error) {
    const fallback =
      "Login failed. Check credentials and domain, then try again (example domain: learn.reboot01.com).";
    setLoginError(error.message || fallback);
    clearSession();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign in";
  }
});

logoutBtn.addEventListener("click", () => {
  clearSession();
  showLogin();
});

refreshBtn.addEventListener("click", async () => {
  const session = getSession();
  if (!session) return;

  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";
  try {
    await loadProfile(session);
  } catch {
    clearSession();
    showLogin();
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh Data";
  }
});

async function bootstrap() {
  const session = getSession();
  if (!session) {
    showLogin();
    return;
  }

  try {
    await loadProfile(session);
    showProfile();
  } catch {
    clearSession();
    showLogin();
  }
}

bootstrap();
