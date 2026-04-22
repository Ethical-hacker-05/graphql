import { clearSession, getSession, gqlRequest, saveSession, signIn } from "./api.js";
import { renderPassFail, renderXpByProject, renderXpOverTime } from "./charts.js";

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
const passFailChart = document.getElementById("pass-fail-chart");
const xpProjectChart = document.getElementById("xp-project-chart");

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
  // Nested query
  resultNested: `
    query ResultsNested {
      result(order_by: { createdAt: desc }, limit: 120) {
        grade
        createdAt
        object {
          id
          name
          type
        }
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

function kvRow(label, value) {
  return `<div class="kv-row"><span class="muted">${label}</span><span>${value}</span></div>`;
}

function renderBasicUser(user) {
  basicInfo.innerHTML = [
    kvRow("User ID", user.id),
    kvRow("Login", user.login || "N/A"),
    kvRow("Email", parseEmail(user.attrs)),
    kvRow("Campus", user.campus || "N/A"),
  ].join("");
}

function renderXpSection(transactions) {
  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  totalXp.textContent = formatXp(total);

  const groupedByProject = transactions.reduce((acc, tx) => {
    const parts = tx.path.split("/").filter(Boolean);
    const project = parts.at(-1) || "unknown-project";
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
    .slice(0, 8)
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

function renderResultStatsForGraph(results) {
  const pass = results.filter((r) => Number(r.grade) >= 1).length;
  const fail = results.filter((r) => Number(r.grade) < 1).length;
  renderPassFail(passFailChart, pass, fail);
}

async function loadProfile(session) {
  const meData = await gqlRequest({
    domain: session.domain,
    jwt: session.jwt,
    query: QUERIES.me,
  });
  const me = meData.user?.[0];
  if (!me) throw new Error("No user data returned by API.");

  const [resultsData, xpData, skillData] = await Promise.all([
    gqlRequest({
      domain: session.domain,
      jwt: session.jwt,
      query: QUERIES.resultNested,
    }),
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
  ]);

  welcome.textContent = `Welcome, ${me.login}`;
  renderBasicUser(me);
  renderXpSection(xpData.transaction || []);
  renderSkillsSection(skillData.transaction || []);
  renderResultStatsForGraph(resultsData.result || []);
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
