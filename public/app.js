let state = null;
const CONTROL_TOKEN = localStorage.getItem("zoz_control_token") ?? "";

const $ = (selector) => document.querySelector(selector);

async function fetchJson(url, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (CONTROL_TOKEN) headers.set("Authorization", `Bearer ${CONTROL_TOKEN}`);
  const response = await fetch(url, { ...options, headers });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function card(label, value) {
  return `<div class="card"><div class="card-label">${escapeHtml(label)}</div><div class="card-value">${escapeHtml(value)}</div></div>`;
}

function renderControl() {
  const commands = state.controlCommands ?? [];
  $("#control-list").innerHTML = commands.length
    ? commands.map((c) => `<article class="list-item">
        <div class="section-heading"><div class="list-title">${escapeHtml(c.id)}</div><span class="status">${escapeHtml(c.status)}</span></div>
        <div class="meta">${escapeHtml(c.instruction)}</div>
        <div class="meta">Codex state: ${escapeHtml(c.claimedAt ? "claimed" : "waiting")} · ${escapeHtml(c.result ?? c.error ?? "")}</div>
      </article>`).join("")
    : '<div class="panel muted-text">No commands yet.</div>';
}

async function cancelCommand(id) {
  await fetchJson(`/api/control/commands/${encodeURIComponent(id)}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actor: "Owner" }) });
  await loadState();
}

async function sendCommand() {
  const instruction = $("#control-instruction").value.trim();
  const actionType = $("#control-risk").value || null;
  if (!instruction) return;
  const button = $("#send-command");
  button.disabled = true;
  try {
    await fetchJson("/api/control/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction, actionType, requestedBy: "Owner" }),
    });
    $("#control-instruction").value = "";
    await loadState();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}

function renderWorkAreas() {
  const areas = state.workAreas ?? [];
  const tasks = state.tasks ?? [];
  $("#work-areas-list").innerHTML = areas.map((area) => {
    const areaTasks = tasks.filter((task) => task.workAreaId === area.id);
    const active = areaTasks.filter((task) => !["completed", "failed"].includes(task.status)).length;
    return "<article class=\"work-card\"><div class=\"section-heading\"><div><div class=\"list-title\">" + escapeHtml(area.name) + "</div><div class=\"meta\">" + escapeHtml(area.description) + "</div></div><span class=\"badge\">" + areaTasks.length + " tasks</span></div><div class=\"work-stats\"><span>Active: " + active + "</span><span>Total: " + areaTasks.length + "</span></div></article>";
  }).join("");
  const select = $("#task-work-area");
  if (select) {
    select.innerHTML = areas.map((area) => "<option value=\"" + escapeHtml(area.id) + "\">" + escapeHtml(area.name) + "</option>").join("");
    if (state.project.currentWorkArea) select.value = state.project.currentWorkArea;
  }
}
function renderManager(manager) {
  const badge = $("#manager-status");
  badge.textContent = manager.status;
  $("#manager-summary").innerHTML = [
    card("Tasks", manager.counts.tasks),
    card("Active", manager.counts.activeTasks),
    card("Approvals", manager.counts.pendingApprovals),
    card("Queued Commands", manager.counts.queuedCommands),
    card("Codex", manager.executor.status),
    card("Deployment", manager.deployment),
  ].join("");
  $("#manager-alerts").innerHTML = manager.alerts.length
    ? manager.alerts.map((alert) => '<div class="panel"><div class="list-title">Manager Alert</div><div class="meta">' + escapeHtml(alert) + '</div></div>').join("")
    : '<div class="panel muted-text">No manager alerts.</div>';
  $("#manager-areas").innerHTML = manager.workAreas.map((area) =>
    '<article class="work-card"><div class="list-title">' + escapeHtml(area.name) + '</div><div class="meta">Active: ' + area.activeTasks + ' · Completed: ' + area.completedTasks + ' · Failed: ' + area.failedTasks + '</div></article>'
  ).join("");
}
function renderDashboard() {
  const project = state.project;
  $("#project-status").innerHTML = [
    card("Repository", project.repository),
    card("Current Branch", project.currentBranch),
    card("Last Verified Commit", project.lastVerifiedCommit),
    card("Last Agent", project.lastAgent),
    card("Tests Passed", project.testsPassed.length ? project.testsPassed.join(", ") : "None recorded"),
    card("Tests Failed", project.testsFailed.length ? project.testsFailed.join(", ") : "None"),
    card("Blocked", project.blockedReason ?? "No"),
    card("Deployment", project.deploymentStatus),
  ].join("");
  const task = state.tasks.find((item) => item.id === project.currentTask) ?? state.tasks[0];
  $("#current-task-status").textContent = task?.status ?? "unknown";
  $("#current-task").innerHTML = task
    ? `<div class="list-title">${escapeHtml(task.id)} — ${escapeHtml(task.title)}</div>
       <div class="meta">Work area: ${escapeHtml((state.workAreas?.find((area) => area.id === task.workAreaId)?.name) ?? task.workAreaId ?? "Unassigned")}</div><div class="meta">Agent: ${escapeHtml(task.assignedAgent)} · Branch: ${escapeHtml(task.branch)}</div>
       <div class="meta">Required checks: ${escapeHtml(task.requiredChecks.join(", "))}</div>`
    : "<div class='muted-text'>No current task.</div>";
  $("#next-action").textContent = project.nextAllowedAction;
  $("#deployment-badge").textContent = project.deploymentStatus.replaceAll("_", " ");
}

function renderProjects() {
  $("#projects-list").innerHTML = `
    <div class="list-title">${escapeHtml(state.project.name)}</div>
    <div class="meta">Repository: ${escapeHtml(state.project.repository)}</div>
    <div class="meta">Integration branch: ${escapeHtml(state.project.integrationBranch)}</div>
    <div class="meta">Mode: ${state.settings.localMode ? "Local-first" : "Remote"}</div>`;
}

async function createTask() {
  const title = $("#task-title").value.trim();
  if (!title) return;
  const button = $("#create-task");
  button.disabled = true;
  try {
    await fetchJson("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, workAreaId: $("#task-work-area").value || "operations", assignedAgent: "codex" }),
    });
    $("#task-title").value = "";
    await loadState();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}

function renderTasks() {
  $("#tasks-list").innerHTML = state.tasks.map((task) => `
    <article class="list-item">
      <div class="section-heading"><div><div class="list-title">${escapeHtml(task.id)} — ${escapeHtml(task.title)}</div>
      <div class="meta">Agent: ${escapeHtml(task.assignedAgent)} · Branch: ${escapeHtml(task.branch)}</div></div>
      <span class="status">${escapeHtml(task.status)}</span></div>
      <div class="meta">Checks: ${escapeHtml(task.requiredChecks.join(", "))}</div>
      <div class="meta">Result: ${escapeHtml(task.result ?? "Pending")}</div>
    </article>`).join("");
}

async function approve(id, decision) {
  await fetchJson(`/api/approvals/${encodeURIComponent(id)}/${decision}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ decidedBy: "Owner" }),
  });
  await loadState();
}

function renderApprovals() {
  if (!state.approvals.length) {
    $("#approvals-list").innerHTML = '<div class="panel muted-text">No approval requests.</div>';
    return;
  }
  $("#approvals-list").innerHTML = state.approvals.map((approval) => `
    <article class="list-item"><div class="list-title">${escapeHtml(approval.actionType)}</div>
    <div class="meta">Task: ${escapeHtml(approval.taskId)} · Status: ${escapeHtml(approval.status)}</div>
    <div class="meta">Requested by: ${escapeHtml(approval.requestedBy)}</div>
    ${approval.status === "pending" ? `<div class="approval-actions">
      <button data-approve="${escapeHtml(approval.id)}">Approve</button><button data-reject="${escapeHtml(approval.id)}">Reject</button>
    </div>` : ""}</article>`).join("");
  document.querySelectorAll("[data-approve]").forEach((b) => b.addEventListener("click", () => approve(b.dataset.approve, "approve")));
  document.querySelectorAll("[data-reject]").forEach((b) => b.addEventListener("click", () => approve(b.dataset.reject, "reject")));
}

function renderActivity() {
  $("#activity-list").innerHTML = state.activity.map((entry) => `
    <article class="list-item"><div class="list-title">${escapeHtml(entry.type)}</div>
    <div class="meta">${escapeHtml(entry.timestamp)} · ${escapeHtml(entry.actor)}</div>
    <div class="meta">${escapeHtml(entry.message)}</div></article>`).join("");
}

function renderAgents() {
  $("#agents-list").innerHTML = state.agents.map((agent) => `
    <article class="list-item"><div class="list-title">${escapeHtml(agent.name)}</div>
    <div class="meta">${escapeHtml(agent.role)}</div><div class="meta">Write access: ${escapeHtml(agent.writeAccess)}</div></article>`).join("");
}

function renderSettings() {
  $("#settings-panel").innerHTML = `
    <div class="list-title">Safety controls</div>
    <div class="meta">Auto Deploy: ${state.settings.autoDeploy ? "Enabled" : "Disabled"}</div>
    <div class="meta">Concurrent coding agents: ${escapeHtml(state.settings.concurrentCodingAgents)}</div>
    <div class="meta">Local mode: ${state.settings.localMode ? "Enabled" : "Disabled"}</div>
    <div class="meta">Approval risk types: ${escapeHtml(state.settings.approvalRequiredForRiskTypes.join(", "))}</div>
    <div class="meta">Deployment status: ${escapeHtml(state.project.deploymentStatus)}</div>`;
}

function bindControlActions() {
  document.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => cancelCommand(b.dataset.cancel).catch((e) => alert(e.message))));
}

async function loadState() {
  state = await fetchJson("/api/state");
  renderDashboard();
  try { renderManager(await fetchJson("/api/manager")); } catch {} renderWorkAreas(); renderProjects(); renderTasks(); renderControl(); renderApprovals(); renderActivity(); renderAgents(); renderSettings(); bindControlActions();
}

async function checkHealth() {
  try {
    const health = await fetchJson("/api/health");
    $("#health-badge").textContent = health.status === "ok" ? "Healthy" : "Unknown";
    $("#control-health").textContent = health.controlPlane === "ready" ? "Control ready" : "Control unavailable";
    const ex = state?.executor;
    $("#executor-badge").textContent = ex?.status === "online" ? `Codex online · ${ex.hostname ?? "worker"}` : "Codex offline";
  } catch {
    $("#health-badge").textContent = "Offline";
    $("#control-health").textContent = "Offline";
  }
}

document.querySelectorAll("[data-nav]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`[data-view="${button.dataset.nav}"]`).classList.add("active");
    history.replaceState(null, "", `#${button.dataset.nav}`);
  });
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
await loadState();
await checkHealth();
setInterval(async () => { try { await loadState(); await checkHealth(); } catch {} }, 5000);

const tokenInput = document.querySelector("#control-token");
const saveTokenButton = document.querySelector("#save-control-token");
if (tokenInput) tokenInput.value = CONTROL_TOKEN;
const createTaskButton = document.querySelector("#create-task");
if (createTaskButton) createTaskButton.addEventListener("click", () => createTask().catch((e) => alert(e.message)));

if (saveTokenButton) saveTokenButton.addEventListener("click", () => {
  const value = tokenInput.value.trim();
  if (!value) return;
  localStorage.setItem("zoz_control_token", value);
  location.reload();
});
