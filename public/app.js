let state = null;
let publisherReady = false;
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
  publisherReady = publisherStatus?.canSubmit === true;
  const publicationButton = $("#request-publication-approval");
  if (publicationButton) publicationButton.disabled = !publisherReady;
  const label = {
    ready: "جاهز", online: "متصل", offline: "غير متصل", not_connected: "غير مربوط",
    not_configured: "غير مُعد", not_integrated: "غير مدمج", not_verified: "لم يُختبر",
    configured_unverified: "إعداد موجود — غير مُتحقق", disabled_by_default: "معطل افتراضيًا",
    disabled_no_media_center: "موقوف — لا يوجد مركز معتمد", manual_export_import: "توليد خارجي واستيراد يدوي",
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
  $("#factory-next-steps").textContent = publisherReady
    ? "إعداد النشر لا يعني أنه تم اختباره؛ يلزم اختبار فعلي وموافقة المالك قبل الإرسال."
    : "النشر والتصدير الخارجي موقوفان حتى اعتماد مركز مستقل والتحقق من مسار الملف النهائي. يمكن فتح أدوات التوليد المستقلة واستيراد ملفاتها.";
  renderPublicationQueue();
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
    (item.status === "approved" && publisherReady ? '<button data-submit-publication="' + escapeHtml(item.id) + '">إرسال إلى يوتيوب الآن</button>' : '') +
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


function mediaAssetLabel(asset) {
  const sourceLabels = { "floot-production-center": "Floot Production Center", qwen: "Qwen", taaft: "TAAFT Video Generator", "digen-ai": "Digen AI", "zoz-ai-export": "ZOZ AI — ملف مُصدّر يدويًا", openart: "OpenArt", runway: "Runway", other: "مصدر آخر" };
  return `<article class="list-item">
    <div class="section-heading"><div class="list-title">${escapeHtml(asset.title || asset.originalFilename)}</div><span class="status">${escapeHtml(asset.status)}</span></div>
    <div class="meta">${escapeHtml(asset.originalFilename)} · ${escapeHtml(asset.contentType || "unknown type")} · ${escapeHtml(asset.sizeBytes ? Math.round(asset.sizeBytes / 1024 / 1024 * 10) / 10 + " MB" : "size pending")}</div>
    <div class="meta">Source: ${escapeHtml(sourceLabels[asset.sourceSystem] ?? asset.sourceSystem)} · ID: ${escapeHtml(asset.assetId)}</div>
    ${asset.status === "ready_for_import" ? `<button data-media-download="${escapeHtml(asset.assetId)}" type="button">إنشاء رابط تنزيل مؤقت</button>` : ""}
  </article>`;
}

async function refreshMediaAssets() {
  const list = $("#media-assets-list");
  if (!list) return;
  list.innerHTML = '<div class="meta">جارٍ تحميل فهرس الوسائط…</div>';
  try {
    const result = await fetchJson("/api/content-factory/media/assets?limit=50");
    list.innerHTML = result.assets.length ? result.assets.map(mediaAssetLabel).join("") : '<div class="meta">لا توجد ملفات مستلمة بعد.</div>';
    document.querySelectorAll("[data-media-download]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await fetchJson("/api/content-factory/media/assets/" + encodeURIComponent(button.dataset.mediaDownload) + "/download-url");
        const link = document.createElement("a");
        link.href = result.url;
        link.download = result.filename;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.click();
        alert("تم إنشاء رابط تنزيل مؤقت ينتهي في " + result.expiresAt + ". لم يتم إرسال الملف إلى أي مركز تلقائيًا.");
      } catch (error) { alert(error.message); }
      finally { button.disabled = false; }
    }));
  } catch (error) {
    list.innerHTML = '<div class="meta">تعذر قراءة الفهرس: ' + escapeHtml(error.message) + '</div>';
  }
}

async function uploadMediaAsset() {
  const input = $("#media-file");
  const status = $("#media-upload-status");
  const button = $("#media-upload-button");
  const file = input?.files?.[0];
  if (!file) { status.textContent = "اختر ملفًا أولًا."; return; }
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
  const maxBytes = extension === ".mp4" || extension === ".mov" || extension === ".webm" ? 250 * 1024 * 1024 : 25 * 1024 * 1024;
  if (file.size <= 0 || file.size > maxBytes) {
    status.textContent = "حجم الملف غير مسموح. الفيديو: حتى 250 MB؛ بقية الملفات: حتى 25 MB.";
    return;
  }
  button.disabled = true;
  status.textContent = "جارٍ إنشاء رابط رفع مؤقت…";
  try {
    const ticket = await fetchJson("/api/content-factory/media/upload-ticket", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        originalFilename: file.name,
        sourceSystem: $("#media-source").value,
        jobId: $("#media-job-id").value.trim(),
        title: file.name,
      }),
    });
    status.textContent = "جارٍ رفع الملف مباشرة إلى التخزين الخاص…";
    const upload = await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: { "content-type": ticket.contentType },
      body: file,
    });
    if (!upload.ok) throw new Error("فشل الرفع إلى التخزين الخاص (HTTP " + upload.status + ").");
    status.textContent = "جارٍ التحقق من الملف وتسجيل بياناته…";
    const verified = await fetchJson(ticket.completeEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    status.textContent = "تم استقبال الملف والتحقق من نوعه وحجمه. الحالة: " + verified.status + ". لم يتم توليده أو نشره تلقائيًا.";
    input.value = "";
    await refreshMediaAssets();
    await refreshContentFactory();
  } catch (error) {
    status.textContent = error.message || "تعذر رفع الملف.";
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
      $("#control-help").textContent = "Cloud tasks: system:health-check, system:project-summary, or text-only Gemini work. For writing or analysis, start with gemini:assist: followed by your task. External actions, arbitrary code and sensitive actions are not executed.";
      $("#control-instruction").placeholder = "gemini:assist: اكتب سكربت فيديو أطفال عن القمر";
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

// Bind owner-token setup before any authenticated API request. Otherwise an
// initial 401 aborts this module before the Save button can be wired up.
const tokenInput = document.querySelector("#control-token");
const saveTokenButton = document.querySelector("#save-control-token");
if (tokenInput) tokenInput.value = CONTROL_TOKEN;

if (saveTokenButton) saveTokenButton.addEventListener("click", () => {
  const value = tokenInput?.value.trim() ?? "";
  if (!value) {
    alert("Enter the ZOZ Pro owner control token first.");
    return;
  }
  localStorage.setItem("zoz_control_token", value);
  location.reload();
});

function showControlSetupRequired() {
  const hasSavedToken = Boolean(CONTROL_TOKEN);
  const healthBadge = $("#health-badge");
  const executorBadge = $("#executor-badge");
  const settingsPanel = $("#settings-panel");
  if (healthBadge) healthBadge.textContent = hasSavedToken ? "Control unavailable" : "Owner token required";
  if (executorBadge) executorBadge.textContent = "Control locked";
  if (settingsPanel) {
    settingsPanel.textContent = hasSavedToken
      ? "تعذّر تحميل حالة النظام بالرمز المحفوظ. تأكد من تسجيل الدخول إلى Vercel، ثم أدخل رمز ZOZ Pro owner control الصحيح. لا تُنفَّذ الأوامر حتى تنجح المصادقة."
      : "لا يوجد رمز مالك محفوظ على هذا المتصفح. أدخل رمز التحكم الخاص بـ ZOZ Pro المطابق لمتغير ZOZ_CONTROL_TOKEN، ثم اضغط Save on this device. لا تستخدم GEMINI_API_KEY هنا.";
  }
  showView("settings");
}

let controlStateLoaded = false;
if (CONTROL_TOKEN) {
  try {
    await loadState();
    controlStateLoaded = true;
  } catch {
    // Keep the settings/token form usable when the token is missing or rejected,
    // or when Vercel SSO redirects the first API request.
  }
}
await checkHealth();
if (!controlStateLoaded) showControlSetupRequired();

setInterval(async () => {
  if (CONTROL_TOKEN) {
    try { await loadState(); } catch {}
  }
  try { await checkHealth(); } catch {}
  if (!state) showControlSetupRequired();
}, 5000);
const createContactButton = document.querySelector("#create-contact");
if (createContactButton) createContactButton.addEventListener("click", () => createContact().catch((e) => alert(e.message)));
const createOpportunityButton = document.querySelector("#create-opportunity");
if (createOpportunityButton) createOpportunityButton.addEventListener("click", () => createOpportunity().catch((e) => alert(e.message)));
const createIntelligenceButton = document.querySelector("#create-intelligence");
if (createIntelligenceButton) createIntelligenceButton.addEventListener("click", () => createIntelligence().catch((e) => alert(e.message)));
const createTaskButton = document.querySelector("#create-task");
if (createTaskButton) createTaskButton.addEventListener("click", () => createTask().catch((e) => alert(e.message)));

const requestPublicationButton = document.querySelector("#request-publication-approval");
if (requestPublicationButton) requestPublicationButton.addEventListener("click", requestPublicationApproval);
const mediaUploadButton = document.querySelector("#media-upload-button");
if (mediaUploadButton) mediaUploadButton.addEventListener("click", () => uploadMediaAsset());
const mediaRefreshButton = document.querySelector("#media-refresh-button");
if (mediaRefreshButton) mediaRefreshButton.addEventListener("click", () => refreshMediaAssets());
const refreshFactoryButton = document.querySelector("#refresh-content-factory");
if (refreshFactoryButton) refreshFactoryButton.addEventListener("click", refreshContentFactory);
const openCodexButton = document.querySelector("#open-codex-control");
if (openCodexButton) openCodexButton.addEventListener("click", () => showView("control"));
const openApprovalsButton = document.querySelector("#open-approvals");
if (openApprovalsButton) openApprovalsButton.addEventListener("click", () => showView("approvals"));
