import { clearSession, getSession, gqlRequest, saveSession, signIn } from "./api.js";
import { renderPassFail, renderXpByProject, renderXpOverTime } from "./charts.js";

const loginView = document.getElementById("login-view");
const profileView = document.getElementById("profile-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

const welcome = document.getElementById("welcome");
const basicInfo = document.getElementById("basic-info");
const totalXp = document.getElementById("total-xp");
const xpByProject = document.getElementById("xp-by-project");
const resultsSummary = document.getElementById("results-summary");
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

  const grouped = transactions.reduce((acc, tx) => {
    const parts = tx.path.split("/").filter(Boolean);
    const project = parts.at(-1) || "unknown-project";
    acc[project] = (acc[project] || 0) + tx.amount;
    return acc;
  }, {});

  const rows = Object.entries(grouped)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([project, xp]) => {
      return `<div class="table-row"><span>${project}</span><strong>${formatXp(xp)}</strong></div>`;
    });

  xpByProject.innerHTML = rows.length ? rows.join("") : "<p class='muted'>No project XP data.</p>";
  const projectGraphData = Object.entries(grouped)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([project, xp]) => ({ project, xp }));
  renderXpByProject(xpProjectChart, projectGraphData);
}

function renderResultsSection(results) {
  const pass = results.filter((r) => Number(r.grade) >= 1).length;
  const fail = results.filter((r) => Number(r.grade) < 1).length;
  const avg = results.length
    ? (results.reduce((sum, r) => sum + Number(r.grade || 0), 0) / results.length).toFixed(2)
    : "0.00";

  resultsSummary.innerHTML = [
    kvRow("Total results", results.length),
    kvRow("Passed", pass),
    kvRow("Failed", fail),
    kvRow("Average grade", avg),
  ].join("");

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

  const [resultsData, xpData] = await Promise.all([
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
  ]);

  welcome.textContent = `Welcome, ${me.login}`;
  renderBasicUser(me);
  renderXpSection(xpData.transaction || []);
  renderResultsSection(resultsData.result || []);
  renderXpOverTime(xpTimeChart, xpData.transaction || []);
}

function showLogin() {
  loginView.classList.remove("hidden");
  profileView.classList.add("hidden");
}

function showProfile() {
  loginView.classList.add("hidden");
  profileView.classList.remove("hidden");
}

function setLoginError(message) {
  loginError.textContent = message || "";
}

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
