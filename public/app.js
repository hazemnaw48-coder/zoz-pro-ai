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



function renderContacts() {
  const contacts = state.contacts ?? [];
  $("#contacts-list").innerHTML = contacts.length ? contacts.map((c) => `
    <article class="list-item"><div class="section-heading"><div><div class="list-title">${escapeHtml(c.name)}</div><div class="meta">${escapeHtml(c.company || "No company")} · ${escapeHtml(c.role || "Contact")}</div></div><span class="score-pill">${escapeHtml(c.status)}</span></div>
    <div class="meta">Next: ${escapeHtml(c.nextAction || "Follow up")}</div>
    <div class="opp-actions">${["lead","qualified","active","customer","inactive","lost"].map(s => `<button data-contact-status="${escapeHtml(c.id)}" data-status="${s}" ${c.status===s?"disabled":""}>${s}</button>`).join("")}</div></article>`).join("") : '<div class="panel muted-text">No contacts yet.</div>';
  document.querySelectorAll("[data-contact-status]").forEach((b) => b.addEventListener("click", async () => {
    await fetchJson(`/api/contacts/${encodeURIComponent(b.dataset.contactStatus)}/status`, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status:b.dataset.status})});
    await loadState();
  }));
}
async function createContact() {
  const name=$("#contact-name").value.trim(); if(!name) return;
  await fetchJson("/api/contacts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    name,company:$("#contact-company").value.trim(),role:$("#contact-role").value.trim(),nextAction:$("#contact-next").value.trim()
  })});
  ["contact-name","contact-company","contact-role","contact-next"].forEach(id=>$("#"+id).value=""); await loadState();
}

function renderOpportunities() {
  const opportunities = state.opportunities ?? [];
  $("#opportunities-list").innerHTML = opportunities.length ? opportunities.map((o) => `
    <article class="list-item"><div class="section-heading"><div><div class="list-title">${escapeHtml(o.title)}</div><div class="meta">${escapeHtml(o.source || "Manual")} · ${escapeHtml(o.category || "General")}</div></div><span class="score-pill">${escapeHtml(o.score)}/100</span></div>
    <div class="meta">Fit ${o.fit} · Value ${o.value} · Urgency ${o.urgency} · Confidence ${o.confidence}</div>
    <div class="meta">Next: ${escapeHtml(o.nextAction || "Qualify")}</div>
    <div class="opp-actions">${["new","qualified","watching","won","lost"].map(s => `<button data-opp-status="${escapeHtml(o.id)}" data-status="${s}" ${o.status===s?"disabled":""}>${s}</button>`).join("")}</div></article>`).join("") : '<div class="panel muted-text">No opportunities yet.</div>';
  document.querySelectorAll("[data-opp-status]").forEach((b) => b.addEventListener("click", async () => {
    await fetchJson(`/api/opportunities/${encodeURIComponent(b.dataset.oppStatus)}/status`, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status:b.dataset.status})});
    await loadState();
  }));
}
function renderIntelligence() {
  const items = state.intelligence ?? [];
  $("#intelligence-list").innerHTML = items.length ? items.map((s) => `
    <article class="list-item"><div class="list-title">${escapeHtml(s.type)} · score ${escapeHtml(s.score)}/100</div><div class="meta">${escapeHtml(s.signal)}</div><div class="meta">Source: ${escapeHtml(s.source || "Manual")} · Confidence: ${s.confidence} · Relevance: ${s.relevance}</div></article>`).join("") : '<div class="panel muted-text">No intelligence signals yet.</div>';
}
async function createOpportunity() {
  const title=$("#opp-title").value.trim(); if(!title) return;
  await fetchJson("/api/opportunities",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    title,source:$("#opp-source").value.trim(),nextAction:$("#opp-next").value.trim(),
    fit:Number($("#opp-fit").value),value:Number($("#opp-value").value),urgency:Number($("#opp-urgency").value),confidence:Number($("#opp-confidence").value)
  })});
  ["opp-title","opp-source","opp-next"].forEach(id=>$("#"+id).value=""); await loadState();
}
async function createIntelligence() {
  const signal=$("#intel-signal").value.trim(); if(!signal) return;
  await fetchJson("/api/intelligence",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    signal,source:$("#intel-source").value.trim(),type:"market",confidence:Number($("#intel-confidence").value),relevance:Number($("#intel-relevance").value)
  })});
  ["intel-signal","intel-source"].forEach(id=>$("#"+id).value=""); await loadState();
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
       <div class="meta">Agent: ${escapeHtml(task.assignedAgent)} · Branch: ${escapeHtml(task.branch)}</div>
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
      body: JSON.stringify({ title, assignedAgent: "codex" }),
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


function renderContentFactory(status) {
  const label = {
    ready: "جاهز",
    online: "متصل",
    offline: "غير متصل",
    not_connected: "غير مربوط",
    not_configured: "غير مُعد",
    not_integrated: "غير مدمج",
    not_verified: "لم يُختبر",
    configured_unverified: "إعداد موجود — غير مُتحقق",
    disabled_pending_approval: "معطل — ينتظر الموافقة",
    incomplete: "غير مكتمل",
    ready_for_review: "جاهز للمراجعة",
  };
  $("#factory-overall").textContent = label[status.overallStatus] ?? status.overallStatus;
  $("#factory-phase").textContent = status.phase;
  $("#factory-checked-at").textContent = `آخر فحص: ${new Date(status.checkedAt).toLocaleString()}`;
  $("#factory-safety").textContent = status.safety.publishingEnabled
    ? "تحذير: النشر مفعّل."
    : "النشر التلقائي متوقف؛ فحص الحالة لا يرسل طلبات خارجية ولا يكشف الأسرار.";
  $("#factory-connectors").innerHTML = status.connectors.map((item) => `
    <article class="list-item">
      <div class="section-heading"><div class="list-title">${escapeHtml(item.name)}</div><span class="status">${escapeHtml(label[item.status] ?? item.status)}</span></div>
      <div class="meta">${escapeHtml(item.detail)}</div>
      <div class="meta">التحقق الحي: ${item.verified ? "تم" : "لم يتم"}</div>
    </article>`).join("");
  $("#factory-next-steps").textContent = status.nextSteps[0] ?? "لا توجد خطوات إضافية.";
}

async function refreshContentFactory() {
  const button = $("#refresh-content-factory");
  button.disabled = true;
  try {
    const status = await fetchJson("/api/content-factory/status");
    renderContentFactory(status);
  } catch (error) {
    $("#factory-overall").textContent = "تعذر جلب الحالة";
    $("#factory-safety").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function showView(name) {
  const target = document.querySelector(`[data-view="${name}"]`);
  const nav = document.querySelector(`[data-nav="${name}"]`);
  if (!target || !nav) return;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item === nav));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view === target));
  history.replaceState(null, "", `#${name}`);
  if (name === "content-factory") refreshContentFactory();
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
  renderDashboard(); renderProjects(); renderTasks(); renderControl(); renderApprovals(); renderActivity(); renderAgents(); renderSettings(); renderOpportunities(); renderIntelligence(); renderContacts(); bindControlActions();
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
  button.addEventListener("click", () => showView(button.dataset.nav));
});
if (location.hash) showView(decodeURIComponent(location.hash.slice(1)));

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
await loadState();
await checkHealth();
setInterval(async () => { try { await loadState(); await checkHealth(); } catch {} }, 5000);

const tokenInput = document.querySelector("#control-token");
const saveTokenButton = document.querySelector("#save-control-token");
if (tokenInput) tokenInput.value = CONTROL_TOKEN;
const createContactButton = document.querySelector("#create-contact");
if (createContactButton) createContactButton.addEventListener("click", () => createContact().catch((e) => alert(e.message)));
const createOpportunityButton = document.querySelector("#create-opportunity");
if (createOpportunityButton) createOpportunityButton.addEventListener("click", () => createOpportunity().catch((e) => alert(e.message)));
const createIntelligenceButton = document.querySelector("#create-intelligence");
if (createIntelligenceButton) createIntelligenceButton.addEventListener("click", () => createIntelligence().catch((e) => alert(e.message)));
const createTaskButton = document.querySelector("#create-task");
if (createTaskButton) createTaskButton.addEventListener("click", () => createTask().catch((e) => alert(e.message)));

if (saveTokenButton) saveTokenButton.addEventListener("click", () => {
  const value = tokenInput.value.trim();
  if (!value) return;
  localStorage.setItem("zoz_control_token", value);
  location.reload();
});

const refreshFactoryButton = document.querySelector("#refresh-content-factory");
if (refreshFactoryButton) refreshFactoryButton.addEventListener("click", refreshContentFactory);
const openCodexButton = document.querySelector("#open-codex-control");
if (openCodexButton) openCodexButton.addEventListener("click", () => showView("control"));
const openApprovalsButton = document.querySelector("#open-approvals");
if (openApprovalsButton) openApprovalsButton.addEventListener("click", () => showView("approvals"));
