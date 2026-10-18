let state = null;
const CONTROL_TOKEN = localStorage.getItem("zoz_control_token") ?? "";

const $ = (selector) => document.querySelector(selector);

async function fetchJson(url, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (CONTROL_TOKEN) headers.set("Authorization", `Bearer ${CONTROL_TOKEN}`);
  const response = await fetch(url, { ...options, headers });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? body.error ?? "Request failed");
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
  const worker = state.executor ?? {};
  const heartbeat = worker.lastSeen ? new Date(worker.lastSeen).toLocaleString() : "not yet recorded";
  if ($("#control-health")) {
    $("#control-health").textContent = worker.mode === "vercel_queue"
      ? `Cloud worker: ${worker.status ?? "unknown"} · last heartbeat: ${heartbeat}`
      : "Local Codex executor status is shown below.";
  }
  $("#control-list").innerHTML = commands.length
    ? commands.map((c) => `<article class="list-item">
        <div class="section-heading"><div class="list-title">${escapeHtml(c.id)}</div><span class="status">${escapeHtml(c.status)}</span></div>
        <div class="meta">${escapeHtml(c.instruction)}</div>
        <div class="meta">Worker state: ${escapeHtml(c.claimedAt ? "claimed" : "waiting")} · ${escapeHtml(c.result ?? c.error ?? c.executionNote ?? "")}</div>
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
      ${task.status === "planned" ? `<div class="opp-actions"><button type="button" data-assign-task="${escapeHtml(task.id)}">Assign to Codex</button></div>` : ""}
    </article>`).join("");

  document.querySelectorAll("[data-assign-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await fetchJson(`/api/tasks/${encodeURIComponent(button.dataset.assignTask)}/assign`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ agent: "codex", actor: "Owner" }),
        });
        await loadState();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    });
  });
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


function renderContentFactory(status, publisherStatus) {
  const label = {
    ready: "جاهز", online: "متصل", offline: "غير متصل", not_connected: "غير مربوط",
    not_configured: "غير مُعد", not_integrated: "غير مدمج", not_verified: "لم يُختبر",
    configured_unverified: "إعداد موجود — غير مُتحقق", disabled_by_default: "معطل افتراضيًا",
    disabled_pending_approval: "معطل — ينتظر الموافقة", incomplete: "غير مكتمل",
    ready_for_review: "جاهز للمراجعة"
  };
  $("#factory-overall").textContent = label[status.overallStatus] ?? status.overallStatus;
  $("#factory-phase").textContent = status.phase;
  $("#factory-checked-at").textContent = "آخر فحص: " + new Date(status.checkedAt).toLocaleString();
  $("#factory-safety").textContent = status.safety.publishingEnabled
    ? "تحذير: النشر مفعّل."
    : "النشر لا يعمل تلقائيًا؛ يلزم إعداد الخادم وموافقة المالك قبل الإرسال.";
  const connectors = [...status.connectors];
  if (publisherStatus) {
    connectors.push({
      name: "Upload-Post → YouTube",
      status: publisherStatus.status,
      detail: publisherStatus.detail + (publisherStatus.profileName ? " | Profile: " + publisherStatus.profileName : ""),
      verified: publisherStatus.verified
    });
  }
  $("#factory-connectors").innerHTML = connectors.map((item) =>
    '<article class="list-item"><div class="section-heading"><div class="list-title">' +
    escapeHtml(item.name) + '</div><span class="status">' +
    escapeHtml(label[item.status] ?? item.status) + '</span></div><div class="meta">' +
    escapeHtml(item.detail) + '</div><div class="meta">التحقق الحي: ' +
    (item.verified ? "تم" : "لم يتم") + '</div></article>'
  ).join("");
  renderProductionCenters(status.productionCenters ?? []);
  renderContentToolLibrary(status.toolLibrary ?? []);
  $("#factory-next-steps").textContent = (publisherStatus && !publisherStatus.configured)
    ? "إعداد موصل الاستوديو وUpload-Post في أسرار الخادم، ثم التحقق من رابط الفيديو قبل طلب الموافقة."
    : (status.nextSteps[0] ?? "لا توجد خطوات إضافية.");
  renderPublicationQueue();
}

function renderProductionCenters(centers) {
  const container = $("#production-centers");
  const count = $("#production-centers-count");
  if (!container || !count) return;
  count.textContent = centers.length + " مراكز محفوظة";
  if (!centers.length) {
    container.innerHTML = '<div class="list-item muted-text">تعذر تحميل سجل مراكز الإنتاج.</div>';
    return;
  }
  container.innerHTML = centers.map((center) => {
    const links = (center.links ?? []).map((link) =>
      '<a class="tool-library-link" href="' + escapeHtml(link.url) + '" target="_blank" rel="noopener noreferrer">' +
      escapeHtml(link.label) + '</a>'
    ).join("");
    const flags = [
      center.ownerReportedConnected ? "ورد أنه مستخدم/مربوط من المالك" : "",
      center.connectionVerified ? "تم التحقق من حالة محددة" : "الربط الكامل غير متحقق",
      center.generationVerified ? "توليد فعلي مثبت" : "لا يوجد توليد فعلي مثبت من هذا المركز عبر ZOZ Pro",
    ].filter(Boolean).join(" · ");
    return '<article class="list-item tool-library-item">' +
      '<div class="section-heading"><div><div class="list-title">' + escapeHtml(center.name) + '</div>' +
      '<div class="meta">' + escapeHtml(center.type) + '</div></div><span class="status">' +
      escapeHtml(center.statusLabel ?? center.status) + '</span></div>' +
      '<div class="meta"><strong>الدور:</strong> ' + escapeHtml(center.projectRole) + '</div>' +
      '<div class="meta"><strong>طريقة الاستفادة:</strong> ' + escapeHtml(center.availableUse) + '</div>' +
      '<div class="meta tool-library-note"><strong>الحصة/الحد:</strong> ' + escapeHtml(center.quota) + '</div>' +
      '<div class="meta tool-library-note"><strong>الخطوة التالية:</strong> ' + escapeHtml(center.nextStep) + '</div>' +
      '<p class="meta tool-library-note">' + escapeHtml(center.verification) + '</p>' +
      '<div class="meta tool-library-verification">' + escapeHtml(flags) + '</div>' +
      (links ? '<div class="tool-library-links">' + links + '</div>' : '') +
      '</article>';
  }).join("");
}

function renderContentToolLibrary(tools) {
  const container = $("#content-tool-library");
  const count = $("#content-tool-library-count");
  if (!container || !count) return;
  count.textContent = tools.length + " أداة مسجلة";
  if (!tools.length) {
    container.innerHTML = '<div class="list-item muted-text">تعذر تحميل المكتبة من حالة مركز المحتوى.</div>';
    return;
  }
  container.innerHTML = tools.map((item) => {
    const links = (item.links ?? []).map((link) =>
      '<a class="tool-library-link" href="' + escapeHtml(link.url) + '" target="_blank" rel="noopener noreferrer">' +
      escapeHtml(link.label) + '</a>'
    ).join("");
    const flags = [
      item.ownerReportedConnected ? "المالك أفاد بالربط" : "",
      item.connectionVerified ? "اتصال/موصل متحقق في نطاقه" : "الاتصال المباشر داخل ZOZ Pro غير متحقق",
      item.generationVerified ? "نجاح توليد فعلي مثبت" : "لا يوجد توليد فعلي مثبت داخل ZOZ Pro",
    ].filter(Boolean).join(" · ");
    return '<article class="list-item tool-library-item" data-tool-category="' + escapeHtml(item.category) + '">' +
      '<div class="section-heading"><div><div class="list-title">' + escapeHtml(item.name) + '</div>' +
      '<div class="meta">' + escapeHtml(item.category) + '</div></div><span class="status">' +
      escapeHtml(item.statusLabel ?? item.status) + '</span></div>' +
      '<div class="meta">' + escapeHtml(item.capabilities) + '</div>' +
      '<p class="meta tool-library-note">' + escapeHtml(item.note) + '</p>' +
      '<div class="meta tool-library-verification">' + escapeHtml(flags) + '</div>' +
      (links ? '<div class="tool-library-links">' + links + '</div>' : '') +
      '</article>';
  }).join("");
}

function renderPublicationQueue() {
  const queue = $("#publication-queue");
  if (!queue) return;
  const publications = state?.publications ?? [];
  queue.innerHTML = publications.length ? publications.map((item) =>
    '<article class="list-item"><div class="section-heading"><div class="list-title">' +
    escapeHtml(item.title) + '</div><span class="status">' + escapeHtml(labelPublicationStatus(item.status)) +
    '</span></div><div class="meta">ID: ' + escapeHtml(item.id) + ' · Task: ' + escapeHtml(item.taskId) +
    ' · Job: ' + escapeHtml(item.jobId) + '</div><div class="meta">' + escapeHtml(item.lastError ?? "") +
    '</div>' + (item.postUrl ? '<div><a href="' + escapeHtml(item.postUrl) + '" target="_blank" rel="noopener noreferrer">فتح فيديو يوتيوب</a></div>' : '') +
    '<div class="control-row">' +
    (item.status === "approved" ? '<button data-submit-publication="' + escapeHtml(item.id) + '">إرسال إلى يوتيوب الآن</button>' : '') +
    (["queued","processing","completed_unverified"].includes(item.status) ? '<button data-check-publication="' + escapeHtml(item.id) + '">فحص حالة النشر</button>' : '') +
    '</div></article>'
  ).join("") : '<div class="panel muted-text">لا توجد طلبات نشر بعد.</div>';

  document.querySelectorAll("[data-submit-publication]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("سيتم إرسال الفيديو إلى يوتيوب باستخدام حساب النشر المتصل. هل توافق على الإرسال الآن؟")) return;
    button.disabled = true;
    try {
      const result = await fetchJson("/api/content-factory/publications/" + encodeURIComponent(button.dataset.submitPublication) + "/submit", {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}"
      });
      alert(result.provider?.message ?? "تم تسجيل نتيجة طلب الرفع؛ تحقق من الحالة قبل اعتبار الفيديو منشورًا.");
      await loadState();
      await refreshContentFactory();
    } catch (error) {
      alert(error.message);
      await loadState();
      await refreshContentFactory();
    } finally {
      button.disabled = false;
    }
  }));

  document.querySelectorAll("[data-check-publication]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const result = await fetchJson("/api/content-factory/publications/" + encodeURIComponent(button.dataset.checkPublication));
      if (result.provider?.message) alert(result.provider.message);
      await loadState();
      await refreshContentFactory();
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
    }
  }));
}

function labelPublicationStatus(status) {
  const labels = {
    awaiting_approval: "ينتظر الموافقة", approved: "موافق عليه", rejected: "مرفوض",
    queued: "في طابور الرفع", processing: "قيد المعالجة", published: "تم النشر",
    failed: "فشل", needs_reconciliation: "يحتاج إلى مطابقة الحالة",
    completed_unverified: "اكتمل دون رابط مؤكد"
  };
  return labels[status] ?? status;
}

async function requestPublicationApproval() {
  const button = $("#request-publication-approval");
  const status = $("#publication-form-status");
  const taskId = $("#publication-task-id").value.trim();
  const jobId = $("#publication-job-id").value.trim();
  const title = $("#publication-title").value.trim();
  const description = $("#publication-description").value.trim();
  const hashtags = $("#publication-hashtags").value.split(",").map((item) => item.trim()).filter(Boolean);
  const privacyStatus = $("#publication-privacy").value;
  if (!taskId || !jobId || !title || !description) {
    status.textContent = "أكمل المهمة ومعرّف الرندر والعنوان والوصف.";
    return;
  }
  button.disabled = true;
  status.textContent = "جارٍ حفظ طلب النشر وطلب الموافقة…";
  try {
    const result = await fetchJson("/api/content-factory/publications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId, jobId, title, description, hashtags, privacyStatus })
    });
    status.textContent = "تم حفظ الطلب " + result.publication.id + "؛ ينتظر موافقة المالك. لم يتم إرسال الفيديو.";
    await loadState();
    await refreshContentFactory();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function refreshContentFactory() {
  const button = $("#refresh-content-factory");
  if (button) button.disabled = true;
  try {
    const results = await Promise.all([
      fetchJson("/api/content-factory/status"),
      fetchJson("/api/content-factory/publisher/status")
    ]);
    renderContentFactory(results[0], results[1]);
  } catch (error) {
    $("#factory-overall").textContent = "تعذر جلب الحالة";
    $("#factory-safety").textContent = error.message;
  } finally {
    if (button) button.disabled = false;
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
  if (name === "digital-products") renderDigitalProducts();
}

const DIGITAL_PRODUCT_STATUS_LABELS={idea:"فكرة",validation:"التحقق من الطلب",outline:"مخطط المنتج",production:"قيد الإنتاج",review:"مراجعة الجودة",ready:"جاهز بعد التحقق",launched:"تم الإطلاق",paused:"متوقف مؤقتًا"};
const DIGITAL_PRODUCT_VALIDATION_FIELDS=[
 ["interviewsCompleted","مقابلات مكتملة",15],["recentPainCount","واجهوا المشكلة مؤخرًا",8],
 ["workaroundCount","لديهم حل يدوي أو أثر واضح",5],["prototypeVolunteers","متطوعون للنموذج الأولي",3],
 ["substitutesReviewed","بدائل منافسة تمت مراجعتها",8],["gapReports","ذكروا الفجوة نفسها",5],
 ["gapExplainers","شرحوا أثر الفجوة",3],["prototypeTesters","مختبرو النموذج (المستهدف 5–8)",5],
 ["workflowCompletions","أكملوا مسار الاستخدام",4],["repeatUsers","استخدموه أكثر من مرة",3],
 ["gapUsefulCount","أكدوا فائدة الفرق",3],["qualifiedVisits","زيارات مؤهلة",100],
 ["qualifiedResponses","استجابات مؤهلة (8%+)",8],["followUpConversations","محادثات متابعة",5],
 ["priceInterestCount","اهتمام مبرر بالسعر",3]
];
function getDigitalProductValidationGates(v={}){
 const interviews=(Number(v.interviewsCompleted)||0)>=15&&(Number(v.recentPainCount)||0)>=8&&(Number(v.workaroundCount)||0)>=5&&(Number(v.prototypeVolunteers)||0)>=3;
 const competitor=(Number(v.substitutesReviewed)||0)>=8&&(Number(v.gapReports)||0)>=5&&(Number(v.gapExplainers)||0)>=3;
 const prototype=(Number(v.prototypeTesters)||0)>=5&&(Number(v.workflowCompletions)||0)>=4&&(Number(v.repeatUsers)||0)>=3&&(Number(v.gapUsefulCount)||0)>=3;
 const visits=Number(v.qualifiedVisits)||0,responses=Number(v.qualifiedResponses)||0;
 const intent=visits>=100&&(visits>0?responses/visits:0)>=0.08&&(Number(v.followUpConversations)||0)>=5&&(Number(v.priceInterestCount)||0)>=3;
 return [{key:"interviews",label:"المقابلات",passed:interviews},{key:"competitor",label:"فجوة المنافسين",passed:competitor},{key:"prototype",label:"اختبار النموذج",passed:prototype},{key:"intent",label:"اهتمام الشراء دون دفع",passed:intent}];
}
function renderDigitalProductValidationEditor(p){
 const v=p.validation||{};
 const fields=DIGITAL_PRODUCT_VALIDATION_FIELDS.map(field=>'<label class="validation-field">'+escapeHtml(field[1])+' <span class="meta">هدف '+field[2]+'</span><input type="number" min="0" max="1000000" step="1" data-validation-product="'+escapeHtml(p.id)+'" data-validation-field="'+field[0]+'" value="'+escapeHtml(v[field[0]]??0)+'"></label>').join("");
 return '<details class="validation-editor"><summary>تحديث دليل التحقق وأعداد المستخدمين</summary><p class="meta">أدخل أعدادًا إجمالية مجهولة الهوية فقط. لا تسجل أي نتيجة إلا إذا كان لديك دليل حقيقي عليها.</p><div class="validation-grid">'+fields+'</div><label>ملاحظات دليل مجهول الهوية</label><textarea rows="2" maxlength="4000" data-validation-notes-product="'+escapeHtml(p.id)+'">'+escapeHtml(v.evidenceNotes||"")+'</textarea><button type="button" data-save-digital-product-validation="'+escapeHtml(p.id)+'">حفظ تقدم التحقق</button><p class="meta" data-validation-status="'+escapeHtml(p.id)+'"></p></details>';
}
function renderDigitalProducts(){
 const products=state?.digitalProducts??[],list=$("#digital-products-list"),count=$("#digital-product-count");if(!list||!count)return;
 count.textContent=products.length+" منتجات";
 list.innerHTML=products.length?products.map(p=>{
   const v=p.validation||{},gates=getDigitalProductValidationGates(v),allPassed=gates.every(g=>g.passed);
   const gateBadges=gates.map(g=>'<span class="badge '+(g.passed?'gate-passed':'gate-pending')+'">'+escapeHtml(g.label)+': '+(g.passed?'اجتاز':'غير مكتمل')+'</span>').join(" ");
   const price=p.price==null?"لم يحدد":p.price+" "+p.currency;
   return '<article class="list-item"><div class="section-heading"><div><div class="list-title">'+escapeHtml(p.name)+'</div><div class="meta">'+escapeHtml(p.audience)+' · '+escapeHtml(p.format)+'</div></div><span class="status">'+escapeHtml(DIGITAL_PRODUCT_STATUS_LABELS[p.status]??p.status)+'</span></div><div class="meta"><strong>المشكلة:</strong> '+escapeHtml(p.problem)+'</div>'+(p.promise?'<div class="meta"><strong>النتيجة:</strong> '+escapeHtml(p.promise)+'</div>':"")+'<div class="meta"><strong>السعر المبدئي:</strong> '+escapeHtml(price)+' · <strong>التسليم:</strong> '+escapeHtml(p.deliveryPlan||"لم يحدد")+'</div>'+(p.validationNotes?'<div class="meta"><strong>خطة التحقق:</strong> '+escapeHtml(p.validationNotes)+'</div>':"")+(p.outline?'<div class="meta"><strong>المخطط:</strong> '+escapeHtml(p.outline)+'</div>':"")+'<div class="gate-list">'+gateBadges+'</div><div class="meta">'+(allPassed?'اكتملت بوابات التحقق وفق الأرقام المسجلة؛ تبقى موافقة المالك على أي إطلاق مدفوع.':'لا يجوز اعتبار المنتج جاهزًا للبيع حتى تكتمل البوابات وتتوفر الأدلة.')+'</div><div class="meta">المعرّف: '+escapeHtml(p.id)+' · آخر تحديث: '+escapeHtml(p.updatedAt)+'</div>'+renderDigitalProductValidationEditor(p)+'<label>تحديث المرحلة</label><div class="control-row"><select data-digital-product-status-select="'+escapeHtml(p.id)+'">'+Object.entries(DIGITAL_PRODUCT_STATUS_LABELS).map(([key,label])=>'<option value="'+key+'" '+(p.status===key?"selected":"")+'>'+escapeHtml(label)+'</option>').join("")+'</select><button data-save-digital-product-status="'+escapeHtml(p.id)+'">حفظ المرحلة</button></div></article>';
 }).join(""):'<div class="list-item muted-text">لا توجد أفكار محفوظة بعد. حمّل فرضية المنتج الحالية أو سجّل فكرة، ثم اختبر الطلب قبل اعتمادها.</div>';
 document.querySelectorAll("[data-save-digital-product-status]").forEach(button=>button.addEventListener("click",async()=>{button.disabled=true;try{const id=button.dataset.saveDigitalProductStatus,select=[...document.querySelectorAll("[data-digital-product-status-select]")].find(el=>el.dataset.digitalProductStatusSelect===id);await fetchJson("/api/digital-products/"+encodeURIComponent(id)+"/status",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status:select.value})});await loadState();}catch(error){alert(error.message);}finally{button.disabled=false;}}));
 document.querySelectorAll("[data-save-digital-product-validation]").forEach(button=>button.addEventListener("click",()=>saveDigitalProductValidation(button.dataset.saveDigitalProductValidation,button)));
}
async function saveDigitalProductValidation(id,button){
 const status=document.querySelector('[data-validation-status="'+id+'"]');
 button.disabled=true;if(status)status.textContent="جارٍ حفظ تقدم التحقق…";
 try{
   const body={};
   DIGITAL_PRODUCT_VALIDATION_FIELDS.forEach(field=>{const input=document.querySelector('[data-validation-product="'+id+'"][data-validation-field="'+field[0]+'"]');body[field[0]]=input?Number(input.value||0):0;});
   const notes=document.querySelector('[data-validation-notes-product="'+id+'"]');body.evidenceNotes=notes?notes.value.trim():"";
   const result=await fetchJson("/api/digital-products/"+encodeURIComponent(id)+"/validation",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
   if(status)status.textContent=result.gates?.allPassed?"تم حفظ الأرقام؛ اجتازت جميع البوابات المعلنة.":"تم حفظ الأرقام؛ بعض البوابات لا تزال مفتوحة.";
   await loadState();
 }catch(error){if(status)status.textContent=error.message;}finally{button.disabled=false;}
}
function loadLeadingDigitalProductHypothesis(){
 const set=(id,value)=>{const el=$("#"+id);if(el)el.value=value;};
 set("digital-product-name","Creator Rights & Revenue Kit — UGC Usage & Payment Control Workbook");
 set("digital-product-audience","English-speaking UGC creators with at least 2–3 paid brand collaborations who manage their own usage terms, invoices and follow-ups.");
 set("digital-product-problem","Creators may struggle to connect written content-usage terms, licence review dates, evidence of public use and invoice follow-up in one clear next-action workflow. This is a hypothesis, not yet validated.");
 set("digital-product-promise","Organize each asset's written usage scope, review date, public observation notes, invoice status and next action in a no-subscription workbook.");
 set("digital-product-format","toolkit");set("digital-product-price","");set("digital-product-currency","USD");
 set("digital-product-validation","LEADING HYPOTHESIS — NOT VALIDATED. Target 15 qualified interviews, review at least 8 substitutes, then test a free workbook with 5–8 volunteers. No paid launch until the evidence gates pass.");
 set("digital-product-outline","Workbook tabs: Start Here; Asset Register; Usage Observation Log; Invoice Tracker; Quote Builder; Next Actions; Message Templates. Companion quick-start guide and neutral editable communication templates.");
 set("digital-product-delivery","Downloadable Excel/Google Sheets workbook + quick-start guide + editable message templates. No SaaS subscription, store or payments in this validation stage.");
 const status=$("#digital-product-form-status");if(status)status.textContent="تم تحميل الفرضية الحالية في النموذج فقط. راجع الحقول واضغط حفظ الفكرة عندما تكون جاهزًا؛ لم يُحفظ أي سجل بعد.";
}
async function createDigitalProduct(){
 const status=$("#digital-product-form-status"),button=$("#create-digital-product"),name=$("#digital-product-name").value.trim(),audience=$("#digital-product-audience").value.trim(),problem=$("#digital-product-problem").value.trim();
 if(!name||!audience||!problem){status.textContent="أدخل اسم المنتج والعميل المستهدف والمشكلة التي يحلها.";return;}
 const rawPrice=$("#digital-product-price").value.trim();button.disabled=true;status.textContent="جارٍ حفظ الفكرة…";
 try{const product=await fetchJson("/api/digital-products",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,audience,problem,promise:$("#digital-product-promise").value.trim(),format:$("#digital-product-format").value,price:rawPrice===""?null:Number(rawPrice),currency:$("#digital-product-currency").value,validationNotes:$("#digital-product-validation").value.trim(),outline:$("#digital-product-outline").value.trim(),deliveryPlan:$("#digital-product-delivery").value.trim()})});
 ["digital-product-name","digital-product-audience","digital-product-problem","digital-product-promise","digital-product-price","digital-product-validation","digital-product-outline","digital-product-delivery"].forEach(id=>$("#"+id).value="");status.textContent="تم حفظ الفكرة "+product.id+"؛ لم يتم تسعيرها نهائيًا أو نشرها أو بيعها.";await loadState();
 }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
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
  renderDashboard(); renderProjects(); renderTasks(); renderControl(); renderApprovals(); renderActivity(); renderAgents(); renderSettings(); renderOpportunities(); renderIntelligence(); renderContacts(); renderDigitalProducts(); bindControlActions();
}

async function checkHealth() {
  try {
    const health = await fetchJson("/api/health");
    $("#health-badge").textContent = health.status === "ok" ? "Healthy" : "Unknown";
    const ex = state?.executor;
    if (health.executionRuntime === "vercel-queue") {
      const seen = ex?.lastSeen ? new Date(ex.lastSeen).toLocaleString() : "not yet recorded";
      const cloudSeen = ex?.mode === "vercel_queue";
      $("#executor-badge").textContent = cloudSeen
        ? `Cloud worker ${ex.status ?? "unknown"}`
        : "Cloud worker not yet seen";
      $("#control-health").textContent = cloudSeen
        ? `Vercel Queue worker: ${ex.status ?? "unknown"} · last heartbeat: ${seen}`
        : "Vercel Queue configured; awaiting the first worker heartbeat.";
      $("#control-help").textContent = "Cloud tasks: system:health-check or system:project-summary. These are read-only; external actions and arbitrary commands are not executed by this worker.";
      $("#control-instruction").placeholder = "system:health-check  |  system:project-summary";
    } else {
      $("#executor-badge").textContent = ex?.status === "online"
        ? `Codex online · ${ex.hostname ?? "worker"}`
        : "Codex offline";
      $("#control-health").textContent = health.controlPlane === "ready" ? "Control ready" : "Control unavailable";
      $("#control-help").textContent = "الأوامر الخطرة لا تصبح قابلة للتنفيذ إلا بعد موافقة المالك.";
      $("#control-instruction").placeholder = "اكتب المهمة التي تريد من Codex تنفيذها…";
    }
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

const loadLeadingHypothesisButton = document.querySelector("#load-leading-digital-product-hypothesis");
if (loadLeadingHypothesisButton) loadLeadingHypothesisButton.addEventListener("click", loadLeadingDigitalProductHypothesis);
const createDigitalProductButton = document.querySelector("#create-digital-product");
if (createDigitalProductButton) createDigitalProductButton.addEventListener("click", () => createDigitalProduct().catch((e) => alert(e.message)));

const requestPublicationButton = document.querySelector("#request-publication-approval");
if (requestPublicationButton) requestPublicationButton.addEventListener("click", requestPublicationApproval);
const refreshFactoryButton = document.querySelector("#refresh-content-factory");
if (refreshFactoryButton) refreshFactoryButton.addEventListener("click", refreshContentFactory);
const openCodexButton = document.querySelector("#open-codex-control");
if (openCodexButton) openCodexButton.addEventListener("click", () => showView("control"));
const openApprovalsButton = document.querySelector("#open-approvals");
if (openApprovalsButton) openApprovalsButton.addEventListener("click", () => showView("approvals"));
