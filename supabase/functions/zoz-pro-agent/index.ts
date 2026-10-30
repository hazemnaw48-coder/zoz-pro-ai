import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
function defaultKey(name: string): string {
  try {
    const value = JSON.parse(Deno.env.get(name) || "{}");
    return typeof value?.default === "string" ? value.default : "";
  } catch { return ""; }
}
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  defaultKey("SUPABASE_SECRET_KEYS") ||
  Deno.env.get("SUPABASE_SECRET_KEY") || "";
const PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
  defaultKey("SUPABASE_PUBLISHABLE_KEYS") ||
  Deno.env.get("SUPABASE_ANON_KEY") || "";
const OWNER_EMAIL = Deno.env.get("ZOZ_OWNER_EMAIL") || "";
const TARGET_CHANNEL_ID = "UCIael48cvwPG3gKj--c7HKw";
const SELF = SUPABASE_URL + "/functions/v1/zoz-pro-youtube-analytics";
const GEMINI_KEYS = [
  Deno.env.get("GEMINI_API_KEY") || "",
  Deno.env.get("GEMINI_API_KEY_ZOZ_NOW") || "",
  Deno.env.get("GEMINI_API_KEY_ZOZ_MANAGER") || "",
  Deno.env.get("GEMINI_API_KEY_ZOZ_HAZEM") || ""
].filter(Boolean);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
      "access-control-allow-methods": "GET, POST, OPTIONS"
    }
  });
}
function fail(message: string, status = 400) { return json({ ok: false, error: message }, status); }
function clean(value: unknown, max = 1000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}
function headers() {
  const value: Record<string, string> = { apikey: SERVICE_KEY, "content-type": "application/json" };
  if (!SERVICE_KEY.startsWith("sb_secret_")) value.authorization = "Bearer " + SERVICE_KEY;
  return value;
}
async function db(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase server configuration unavailable.");
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: { ...headers(), ...((init.headers || {}) as Record<string, string>) },
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Database request failed (" + response.status + ").");
  return data;
}
async function loadAgentMemory(userId: string) {
  const rows = await db("zoz_pro_agent_memory?owner_id=eq." + encodeURIComponent(userId) +
    "&memory_key=eq.primary_checkpoint&status=eq.active&select=id,content,updated_at,notion_sync_status&order=updated_at.desc&limit=1");
  return Array.isArray(rows) ? rows[0] || null : null;
}
function notionText(value: unknown) {
  const str = clean(value, 12000);
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += 1800) chunks.push(str.slice(i, i + 1800));
  return chunks.slice(0, 100).map(content => ({ type: "text", text: { content } }));
}
async function notionApi(path: string, method: string, token: string, body?: unknown) {
  const response = await fetch("https://api.notion.com/v1/" + path.replace(/^\/+/, ""), {
    method,
    headers: {
      authorization: "Bearer " + token,
      "notion-version": "2026-03-11",
      "content-type": "application/json"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = clean(data?.code || "notion_api_error", 80);
    const detail = clean(data?.message || data?.error || "", 220);
    throw new Error("Notion API " + response.status + " (" + code + "): " + (detail || "No API message returned."));
  }
  return data;
}
function notionCheckpointProperties(content: any) {
  const status = content.last_run_status === "succeeded" ? "Verified" :
    content.last_run_status === "partial" ? "Partial" :
    content.last_run_status === "failed" ? "Blocked" : "Planning";
  const finished = new Date(String(content.last_run_finished_at || new Date().toISOString()));
  const day = Number.isFinite(finished.getTime()) ? finished.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const bm = content.book_monitoring || {};
  const failures = Array.isArray(content.failures) ? content.failures : [];
  const work = [
    "تشغيل الوكيل: " + clean(content.last_run_status, 40),
    "القنوات التي فُحصت: " + Number(content.channels_checked || 0) + "؛ الناجح: " + Number(content.channels_succeeded || 0),
    "إنشاء مسودة: " + (content.content_draft_created ? "نعم، للمراجعة فقط" : "لا"),
    "فحص الكتب: " + Number(bm.books_seen || 0) + " كتاب؛ تقارير محفوظة: " + Number(bm.performance_snapshots || 0) + "؛ تحتاج تقريرًا: " + Number(bm.needs_report_count || 0),
    "الاتصال المباشر بـ KDP: " + clean(bm.direct_kdp_connection || "not_configured", 40),
    "إخفاقات الدورة: " + failures.length,
    "معرّف التشغيل: " + clean(content.last_run_id, 80)
  ].join("\n");
  const blockers = [
    Number(bm.needs_report_count || 0) > 0 ? "هناك كتب تحتاج إلى تقارير مبيعات/عوائد أحدث." : "",
    bm.direct_kdp_connection === "not_configured" ? "اتصال KDP المباشر غير مهيأ؛ لا تُعامل الأرقام كبيانات حية." : "",
    content.notion_sync_status === "failed" ? "تعذر تحديث سجل Notion في آخر تشغيل؛ راجع سجل المزامنة داخل Supabase." : "",
    failures.length ? "راجع تفاصيل الأخطاء في سجل التشغيل داخل Supabase." : ""
  ].filter(Boolean).join("\n") || "لا توجد عوائق مسجلة في هذه الدورة.";
  const instructions = "استرجع نقطة الاستئناف السابقة في بداية كل دورة. حافظ على فصل الإنتاج عن المعاينة. لا تعِد تفويض Google OAuth ولا تُنشئ مشروعًا بديلًا. لا نشر عام، أو تغيير خصوصية، أو حذف، أو إنفاق دون موافقة المالك.";
  const preserve = "Production Supabase: oxyzxbkwhafzaztraowc. Repo: hazemnaw48-coder/zoz-pro-ai. لا تخلط مشروع المعاينة vjnwojrqduoxhetutxrs مع الإنتاج. لا تفترض أن المبيعات أو العوائد صفرًا ما لم يؤكد التقرير ذلك.";
  const next = clean(content.next_resume_hint || "افحص أحدث تشغيل ثم استكمل العوائق المفتوحة.", 1800);
  return {
    "Session": { title: [{ type: "text", text: { content: "ZOZ Pro agent checkpoint — " + day } }] },
    "Topic": { rich_text: notionText("نقطة الاستئناف الدائمة ومتابعة الوكيل الخلفي") },
    "Outcome Status": { select: { name: status } },
    "Systems / Projects": { multi_select: [{ name: "ZOZ Pro / Floot" }, { name: "YouTube" }, { name: "Notion" }] },
    "Session Date": { date: { start: day } },
    "Decisions and Instructions": { rich_text: notionText(instructions) },
    "Work Completed": { rich_text: notionText(work) },
    "Evidence and Links": { rich_text: notionText("Supabase run: " + clean(content.last_run_id, 80) + "\nCentre: https://hazemnaw48-coder.github.io/zoz-pro-ai/channel-control.html?mode=full") },
    "Open Tasks / Blockers": { rich_text: notionText(blockers) },
    "Next Action": { rich_text: notionText(next) },
    "Do Not Repeat / Preserve": { rich_text: notionText(preserve) }
  };
}
async function syncCheckpointToNotion(content: any, existing: any) {
  const token = Deno.env.get("NOTION_API_KEY") || "";
  if (!token) return { status: "not_configured", page_id: existing?.notion_page_id || null, error: "NOTION_API_KEY secret is missing from Supabase Edge Function secrets." };
  const configuredDataSourceId = clean(Deno.env.get("NOTION_ARCHIVE_DATA_SOURCE_ID") || "93d9d04a-dd49-4fb9-8d84-61324cf4cf24", 80).replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(configuredDataSourceId)) return { status: "failed", page_id: existing?.notion_page_id || null, error: "NOTION_ARCHIVE_DATA_SOURCE_ID is invalid." };
  const properties = notionCheckpointProperties(content);
  try {
    let page: any;
    if (existing?.notion_page_id) {
      page = await notionApi("pages/" + encodeURIComponent(String(existing.notion_page_id)), "PATCH", token, { properties });
    } else {
      // Retrieve the database container first; the connector collection URI is not the REST database ID.
      const database = await notionApi("databases/c788c7aa-907a-4baa-9b23-6928998fed4d", "GET", token);
      const sources = Array.isArray(database?.data_sources) ? database.data_sources : [];
      const dataSourceId = clean(sources[0]?.id, 80).replace(/-/g, "");
      if (!/^[0-9a-f]{32}$/i.test(dataSourceId)) throw new Error("Notion database was reached but returned no data source ID.");
      await notionApi("data_sources/" + encodeURIComponent(dataSourceId), "GET", token);
      page = await notionApi("pages", "POST", token, { parent: { type: "data_source_id", data_source_id: dataSourceId }, properties });
    }
    const pageId = clean(page?.id, 80);
    if (!pageId) throw new Error("Notion response did not return a page id.");
    const verify = await notionApi("pages/" + encodeURIComponent(pageId), "GET", token);
    if (clean(verify?.id, 80) !== pageId || !verify?.properties?.Session) throw new Error("Notion page read-back verification failed.");
    return { status: "synced", page_id: pageId, page_url: clean(verify?.url, 500), verified_at: new Date().toISOString() };
  } catch (error) {
    return { status: "failed", page_id: existing?.notion_page_id || null, error: clean(error instanceof Error ? error.message : "Notion sync failed.", 250) };
  }
}
async function saveAgentMemory(userId: string, runId: string, content: any) {
  const existing = await loadAgentMemory(userId);
  const notion = await syncCheckpointToNotion(content, existing);
  content.notion_sync_status = notion.status;
  content.notion_page_id = notion.page_id || existing?.notion_page_id || null;
  const payload: any = {
    owner_id: userId, memory_key: "primary_checkpoint", project: "ZOZ Pro",
    title: "نقطة الاستئناف الرئيسية لوكيل ZOZ Pro",
    content, status: "active", notion_sync_status: notion.status,
    notion_page_id: notion.page_id || existing?.notion_page_id || null,
    updated_at: new Date().toISOString()
  };
  if (notion.status === "synced") payload.notion_last_synced_at = notion.verified_at;
  if (existing?.id) {
    await db("zoz_pro_agent_memory?id=eq." + encodeURIComponent(String(existing.id)), {
      method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(payload)
    });
  } else {
    await db("zoz_pro_agent_memory", {
      method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(payload)
    });
  }
  await db("zoz_pro_agent_memory_events", {
    method: "POST", headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      owner_id: userId, memory_key: "primary_checkpoint",
      event_type: notion.status === "synced" ? "worker_checkpoint_synced_to_notion" : "worker_checkpoint_saved",
      run_id: runId || null,
      payload: { status: content.last_run_status, channels_checked: content.channels_checked,
        channels_succeeded: content.channels_succeeded, next_resume_hint: content.next_resume_hint,
        notion_sync_status: notion.status, notion_page_id: notion.page_id || null, notion_error: notion.error || null }
    })
  });
  return { saved: true, notion_sync_status: notion.status, notion_page_id: notion.page_id || null,
    notion_page_url: (notion as any).page_url || null, notion_error: notion.error || null };
}

async function owner(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization) || !PUBLISHABLE_KEY || !SUPABASE_URL) return null;
  try {
    const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: PUBLISHABLE_KEY, authorization },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    if (clean(user?.email, 254).toLowerCase() !== OWNER_EMAIL ||
        !user?.email_confirmed_at ||
        !/^[0-9a-f-]{36}$/i.test(String(user?.id || ""))) return null;
    return user;
  } catch { return null; }
}
function safeUrlId(value: unknown) {
  const id = String(value || "");
  return /^UC[A-Za-z0-9_-]{22}$/.test(id) ? id : "";
}
async function getChannel(userId: string, channelId: string) {
  if (!safeUrlId(channelId)) throw new Error("معرّف القناة غير صالح.");
  const rows = await db(
    "zoz_pro_managed_channels?owner_id=eq." + encodeURIComponent(userId) +
    "&channel_id=eq." + encodeURIComponent(channelId) +
    "&is_active=eq.true&select=channel_id,display_name,channel_title,niche,target_audience,connection_status,last_synced_at&limit=1"
  );
  if (!Array.isArray(rows) || !rows[0]) throw new Error("القناة غير مسجلة أو غير نشطة لحساب المالك.");
  return rows[0];
}
function parseDate(value: unknown) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : null;
}
function simplifyVideo(v: any) {
  return {
    video_id: clean(v?.video_id || v?.id, 40),
    title: clean(v?.title || v?.video_title, 180),
    published_at: clean(v?.published_at, 40),
    privacy_status: clean(v?.privacy_status, 20),
    views: Number(v?.views ?? v?.metrics?.views ?? 0),
    likes: Number(v?.likes ?? v?.metrics?.likes ?? 0),
    comments: Number(v?.comments ?? v?.metrics?.comments ?? 0)
  };
}
async function inspectData(userId: string, channel: any) {
  const cid = String(channel.channel_id);
  const [liveRows, snapshots, recommendations, calendar, scripts, assets, automations] = await Promise.all([
    db("zoz_pro_managed_channel_live_status?owner_id=eq." + encodeURIComponent(userId) +
      "&channel_id=eq." + encodeURIComponent(cid) +
      "&select=channel_title,channel_statistics,recent_videos,source,captured_at,last_attempt_at,last_error&order=captured_at.desc&limit=1"),
    db("zoz_pro_managed_channel_snapshots?owner_id=eq." + encodeURIComponent(userId) +
      "&channel_id=eq." + encodeURIComponent(cid) +
      "&select=id,start_date,end_date,snapshot_day,created_at,metrics,daily_metrics,traffic_sources_daily,video_count,analytics_video_count,source&order=created_at.desc&limit=2"),
    db("zoz_pro_managed_channel_recommendations?owner_id=eq." + encodeURIComponent(userId) +
      "&channel_id=eq." + encodeURIComponent(cid) +
      "&select=id,title,body,recommendation_type,status,evidence,updated_at&order=updated_at.desc&limit=12"),
    db("zoz_pro_managed_channel_content_calendar?owner_id=eq." + encodeURIComponent(userId) +
      "&channel_id=eq." + encodeURIComponent(cid) +
      "&select=id,planned_date,sequence_no,format,content_pillar,working_title,hook,status,owner_note,updated_at&order=planned_date.asc,sequence_no.asc&limit=30"),
    db("zoz_pro_content_scripts?owner_id=eq." + encodeURIComponent(userId) +
      "&channel_id=eq." + encodeURIComponent(cid) +
      "&select=id,topic,title,status,created_at,generation_method,production_package&order=created_at.desc&limit=12"),
    db("zoz_pro_video_intake_assets?owner_id=eq." + encodeURIComponent(userId) +
      "&channel_id=eq." + encodeURIComponent(cid) +
      "&select=id,title,original_filename,status,total_bytes,uploaded_bytes,youtube_video_id,youtube_processing_status,last_error,created_at,updated_at,published_at,archived_at&order=created_at.desc&limit=20"),
    db("zoz_pro_automation_runs?channel_id=eq." + encodeURIComponent(cid) +
      "&details->>owner_id=eq." + encodeURIComponent(userId) +
      "&select=workflow,status,started_at,finished_at,details&order=started_at.desc&limit=8")
  ]);
  const live = Array.isArray(liveRows) ? liveRows[0] || null : null;
  const latest = Array.isArray(snapshots) ? snapshots[0] || null : null;
  const previous = Array.isArray(snapshots) ? snapshots[1] || null : null;
  const videos = (Array.isArray(live?.recent_videos) ? live.recent_videos : [])
    .map(simplifyVideo).filter((v: any) => v.title || v.video_id);
  const topVideo = videos.slice().sort((a: any, b: any) => b.views - a.views)[0] || null;
  const now = Date.now();
  const captured = parseDate(live?.captured_at);
  const ageMinutes = captured === null ? null : Math.max(0, Math.round((now - captured) / 60000));
  const future = (Array.isArray(calendar) ? calendar : []).filter((x: any) =>
    String(x.planned_date || "") >= new Date().toISOString().slice(0, 10) &&
    !["published", "cancelled", "dismissed"].includes(String(x.status || "").toLowerCase()));
  const activeAssets = (Array.isArray(assets) ? assets : []).filter((a: any) =>
    !["published", "archived", "rejected"].includes(String(a.status || "").toLowerCase()));
  const failedAssets = activeAssets.filter((a: any) => String(a.status || "").toLowerCase() === "failed");
  const pendingReview = activeAssets.filter((a: any) => ["ready_for_review", "approved", "ready_to_publish"].includes(String(a.status || "").toLowerCase()));
  const stats = live?.channel_statistics || {};
  const recentRuns = (Array.isArray(automations) ? automations : []).map((a: any) => ({
    workflow: clean(a.workflow, 80), status: clean(a.status, 40), started_at: a.started_at,
    finished_at: a.finished_at, summary: clean(a.details?.summary || a.details?.message || "", 220)
  }));
  return {
    channel: {
      channel_id: cid,
      display_name: clean(channel.display_name || live?.channel_title, 150),
      channel_title: clean(live?.channel_title || channel.channel_title, 150),
      niche: clean(channel.niche, 220),
      connection_status: clean(channel.connection_status, 40),
      last_synced_at: channel.last_synced_at || null
    },
    live_status: {
      source: clean(live?.source, 60),
      captured_at: live?.captured_at || null,
      age_minutes: ageMinutes,
      stale: ageMinutes === null || ageMinutes > 360,
      last_error: clean(live?.last_error, 250) || null,
      channel_statistics: {
        lifetime_views: Number(stats.viewCount || 0),
        total_videos: Number(stats.videoCount || 0),
        subscribers: stats.hiddenSubscriberCount ? null : Number(stats.subscriberCount || 0)
      },
      recent_video_count: videos.length,
      top_recent_video: topVideo,
      recent_videos: videos.slice(0, 10)
    },
    analytics: latest ? {
      snapshot_id: latest.id,
      source: clean(latest.source, 60),
      period: { start_date: latest.start_date, end_date: latest.end_date },
      captured_at: latest.created_at,
      metrics: latest.metrics || {},
      prior_snapshot: previous ? {
        period: { start_date: previous.start_date, end_date: previous.end_date },
        captured_at: previous.created_at,
        metrics: previous.metrics || {}
      } : null
    } : null,
    content: {
      pending_recommendations: (Array.isArray(recommendations) ? recommendations : []).filter((x: any) => ["draft", "pending", "needs_review"].includes(String(x.status || "").toLowerCase())).length,
      recommendations: (Array.isArray(recommendations) ? recommendations : []).slice(0, 8).map((x: any) => ({
        id: x.id, title: clean(x.title, 200), type: clean(x.recommendation_type, 60),
        status: clean(x.status, 40), body: clean(x.body, 360), updated_at: x.updated_at
      })),
      upcoming_calendar_count: future.length,
      upcoming_calendar: future.slice(0, 8).map((x: any) => ({
        id: x.id, date: x.planned_date, title: clean(x.working_title, 180),
        status: clean(x.status, 40), pillar: clean(x.content_pillar, 100)
      })),
      recent_script_count: Array.isArray(scripts) ? scripts.length : 0,
      recent_scripts: (Array.isArray(scripts) ? scripts : []).slice(0, 8).map((x: any) => ({
        id: x.id, topic: clean(x.topic, 180), title: clean(x.title, 180),
        status: clean(x.status, 40), generation_method: clean(x.generation_method, 50), created_at: x.created_at
      }))
    },
    video_intake: {
      active_count: activeAssets.length,
      needs_owner_review: pendingReview.length,
      failed_count: failedAssets.length,
      items: activeAssets.slice(0, 10).map((a: any) => ({
        id: a.id, title: clean(a.title || a.original_filename, 180),
        status: clean(a.status, 40), bytes: Number(a.total_bytes || 0),
        uploaded_bytes: Number(a.uploaded_bytes || 0), youtube_video_id: clean(a.youtube_video_id, 30) || null,
        youtube_processing_status: clean(a.youtube_processing_status, 60) || null,
        last_error: clean(a.last_error, 180) || null, updated_at: a.updated_at
      }))
    },
    recent_automation_runs: recentRuns
  };
}
function heuristicAnalysis(state: any) {
  const actions: string[] = [];
  if (!state.live_status || state.live_status.stale) actions.push("حدّث بيانات القناة المباشرة قبل اتخاذ قرار جديد.");
  if (state.live_status?.last_error) actions.push("افحص آخر خطأ في مزامنة القناة قبل الاعتماد على المؤشرات.");
  if (state.video_intake.failed_count > 0) actions.push("راجع ملفات الفيديو الفاشلة وأسبابها قبل رفع ملفات جديدة.");
  if (state.video_intake.needs_owner_review > 0) actions.push("راجع قائمة استقبال الفيديوهات؛ توجد ملفات تنتظر قرار المالك أو النشر.");
  if (state.content.upcoming_calendar_count === 0) actions.push("افتح تقويم القناة وأنشئ خطة أسبوعية جديدة إن كانت الخطة الحالية منتهية.");
  if (state.content.pending_recommendations > 0) actions.push("راجع التوصيات المحفوظة واعتمد ما يناسب استراتيجية القناة.");
  if (state.live_status?.top_recent_video?.title) actions.push("اختبر فكرة تكميلية واحدة مستندة إلى الفيديو الأعلى مشاهدات في القائمة الحديثة، دون إعادة نسخ الفيديو نفسه.");
  if (!actions.length) actions.push("تابع المؤشرات الحديثة، واختر مسودة واحدة فقط للانتقال إلى مراجعة إنتاج الفيديو.");
  return {
    diagnosis: state.live_status?.stale ? "بيانات القناة المباشرة قديمة أو غير متاحة." : "تم تحميل بيانات القناة وأقسام المحتوى والاستقبال.",
    strengths: [
      state.live_status?.recent_video_count ? "توجد بيانات لفيديوهات حديثة يمكن المقارنة بينها." : "بيانات الفيديوهات الحديثة محدودة؛ يلزم تحديث المزامنة.",
      state.content.recent_script_count ? "توجد مسودات محفوظة يمكن استكمالها بدل إنشاء نسخة مكررة." : "يمكن إنشاء أول مسودة من بيانات القناة."
    ],
    risks: [
      ...(state.video_intake.failed_count ? ["يوجد " + state.video_intake.failed_count + " ملف استقبال بحالة فشل."] : []),
      ...(state.video_intake.needs_owner_review ? ["يوجد " + state.video_intake.needs_owner_review + " ملف يحتاج قرار المالك."] : []),
      ...(state.live_status?.stale ? ["قد لا تعكس المؤشرات الحالية آخر حالة للقناة."] : [])
    ],
    next_actions: actions.slice(0, 6),
    top_video: state.live_status?.top_recent_video || null,
    model_note: "تم استخدام التحليل القاعدي لأن نموذج الذكاء الاصطناعي غير متاح أو لم يرجع JSON صالحًا."
  };
}
async function modelAnalysis(state: any, memoryContext: any = null) {
  const fallback = heuristicAnalysis(state);
  const unique = [...new Set(GEMINI_KEYS)];
  if (!unique.length) return { analysis: fallback, model: "rule-based-fallback" };
  const prompt = [
    "أنت وكيل تشغيل وتحليل لقنوات ZOZ Pro. حلل البيانات الواردة فقط ولا تخترع أرقامًا أو أسبابًا مؤكدة.",
    "أعد JSON صالحًا فقط بالمفاتيح: diagnosis (string), strengths (string array), risks (string array), next_actions (string array), top_video_insight (string), confidence_notes (string array).",
    "اكتب بالعربية. أعط 3 إلى 5 خطوات تشغيلية محددة للأقسام الموجودة في البيانات. فرّق بين المشاهدات الكلية ومشاهدات الفترة. لا تنشر ولا تغير خصوصية أي فيديو. لا تطلب مفاتيح أو كلمات مرور. إذا كانت البيانات ناقصة فقل ذلك.",
    JSON.stringify({
      channel: state.channel, live_status: state.live_status, analytics: state.analytics,
      content: state.content, video_intake: state.video_intake,
      durable_memory_context: memoryContext ? { last_run_id: memoryContext.last_run_id, last_run_status: memoryContext.last_run_status, next_resume_hint: memoryContext.next_resume_hint, channels_checked: memoryContext.channels_checked, channels_failed: memoryContext.channels_failed, failures: Array.isArray(memoryContext.failures) ? memoryContext.failures.slice(0, 8) : [] } : null
    })
  ].join("\n");
  for (const key of unique) {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" + encodeURIComponent(key), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.25, maxOutputTokens: 1400 }
        }),
        signal: AbortSignal.timeout(20000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) continue;
      const text = String(data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("\n") || "");
      const start = text.indexOf("{"), end = text.lastIndexOf("}");
      if (start < 0 || end <= start) continue;
      const parsed = JSON.parse(text.slice(start, end + 1));
      const result = {
        diagnosis: clean(parsed.diagnosis, 900) || fallback.diagnosis,
        strengths: (Array.isArray(parsed.strengths) ? parsed.strengths : fallback.strengths).map((x: any) => clean(x, 300)).filter(Boolean).slice(0, 6),
        risks: (Array.isArray(parsed.risks) ? parsed.risks : fallback.risks).map((x: any) => clean(x, 300)).filter(Boolean).slice(0, 6),
        next_actions: (Array.isArray(parsed.next_actions) ? parsed.next_actions : fallback.next_actions).map((x: any) => clean(x, 350)).filter(Boolean).slice(0, 6),
        top_video_insight: clean(parsed.top_video_insight, 500),
        confidence_notes: (Array.isArray(parsed.confidence_notes) ? parsed.confidence_notes : []).map((x: any) => clean(x, 250)).filter(Boolean).slice(0, 5),
        model_note: "Gemini returned analysis of the saved production data; no external action was performed."
      };
      return { analysis: result, model: "gemini-3.5-flash-lite" };
    } catch { continue; }
  }
  return { analysis: fallback, model: "rule-based-fallback" };
}
async function saveRun(userId: string, channelId: string, workflow: string, startedAt: string, status: string, details: any) {
  try {
    const scrubbed = JSON.parse(JSON.stringify(details || {}));
    await db("zoz_pro_automation_runs", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        workflow, channel_id: channelId, status,
        started_at: startedAt, finished_at: new Date().toISOString(),
        details: { actor: "owner_ui", owner_id: userId, ...scrubbed }
      })
    });
  } catch { /* audit-write failure must not hide the primary result */ }
}


/**
 * Refresh actual YouTube channel data through the already-authorized production
 * analytics function before the agent reasons over its stored production state.
 * Uses the owner's existing browser session; it does not re-consent, publish,
 * edit metadata, or change video privacy.
 */
async function syncChannelLive(req: Request, user: any, channelId: string) {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization || !PUBLISHABLE_KEY) {
    return { ok: false, error: "لم تتوفر جلسة المالك لتنفيذ مزامنة مباشرة؛ سيعرض الوكيل آخر بيانات محفوظة مع توضيح ذلك." };
  }
  const endDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const startDate = new Date(Date.parse(endDate + "T00:00:00Z") - 27 * 86400000).toISOString().slice(0, 10);
  try {
    const response = await fetch(SELF + "?action=managed_channel_sync", {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE_KEY,
        authorization,
        "content-type": "application/json"
      },
      body: JSON.stringify({ channel_id: channelId, start_date: startDate, end_date: endDate }),
      signal: AbortSignal.timeout(60000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      return {
        ok: false,
        status: response.status,
        error: clean(data?.error || "تعذرت مزامنة بيانات YouTube المباشرة.", 350)
      };
    }
    return {
      ok: true,
      synced_at: data.synced_at || new Date().toISOString(),
      snapshot_id: data.snapshot_id || null,
      period: data.period || { start_date: startDate, end_date: endDate },
      metrics: data.metrics || {},
      video_count: Array.isArray(data.videos) ? data.videos.length : 0,
      message: clean(data.message || "تم تحديث تحليلات القناة من YouTube وحفظها في قاعدة الإنتاج.", 300)
    };
  } catch (error) {
    return {
      ok: false,
      error: clean(error instanceof Error ? error.message : "تعذرت مزامنة YouTube.", 350)
    };
  }
}

async function evaluateLatestVideo(req: Request, user: any, body: any) {
  const channelId = safeUrlId(body?.channel_id || TARGET_CHANNEL_ID);
  if (!channelId) return fail("اختر قناة مسجلة في مركز الإنتاج.", 400);
  if (channelId !== TARGET_CHANNEL_ID) return fail("اختبار الأداء متاح حاليًا لقناة Hazem Ahmed المحددة فقط.", 403);
  const channel = await getChannel(user.id, channelId);
  const startedAt = new Date().toISOString();
  try {
    const liveSync = await syncChannelLive(req, user, channelId);
    const state = await inspectData(user.id, channel);
    const allVideos = Array.isArray(state?.live_status?.recent_videos) ? state.live_status.recent_videos : [];
    const publicVideos = allVideos.filter((v: any) =>
      String(v?.privacy_status || "").toLowerCase() === "public" &&
      clean(v?.video_id, 40) && parseDate(v?.published_at) !== null
    ).sort((a: any, b: any) => (parseDate(b.published_at) || 0) - (parseDate(a.published_at) || 0));
    const latest = publicVideos[0];
    if (!latest) return fail("لم أجد فيديو عامًا حديثًا يمكن اختباره. حدّث مزامنة القناة أولًا.", 409);

    const observedAt = new Date().toISOString();
    const publishedMs = parseDate(latest.published_at) as number;
    const ageHours = Math.max(0.1, (Date.now() - publishedMs) / 3600000);
    const views = Math.max(0, Number(latest.views) || 0);
    const likes = Math.max(0, Number(latest.likes) || 0);
    const comments = Math.max(0, Number(latest.comments) || 0);
    const likeRate = views > 0 ? likes / views * 100 : null;

    const snapshotRows = await db(
      "zoz_pro_managed_channel_video_snapshots?owner_id=eq." + encodeURIComponent(user.id) +
      "&channel_id=eq." + encodeURIComponent(channelId) +
      "&video_id=eq." + encodeURIComponent(String(latest.video_id)) +
      "&select=metrics,created_at&order=created_at.desc&limit=10"
    );
    const points = (Array.isArray(snapshotRows) ? snapshotRows : [])
      .filter((x: any) => x?.metrics && Number.isFinite(Number(x.metrics.views)) && parseDate(x.created_at) !== null)
      .sort((a: any, b: any) => (parseDate(b.created_at) || 0) - (parseDate(a.created_at) || 0));
    const latestPoint = points[0] || null;
    const previousPoint = points.length > 1 ? points[1] : null;
    const intervalHours = latestPoint && previousPoint
      ? Math.max(0, ((parseDate(latestPoint.created_at) || 0) - (parseDate(previousPoint.created_at) || 0)) / 3600000)
      : null;
    const viewDelta = latestPoint && previousPoint
      ? Number(latestPoint.metrics.views || 0) - Number(previousPoint.metrics.views || 0)
      : null;
    const likeDelta = latestPoint && previousPoint && latestPoint.metrics.likes != null && previousPoint.metrics.likes != null
      ? Number(latestPoint.metrics.likes || 0) - Number(previousPoint.metrics.likes || 0)
      : null;

    const related = publicVideos.filter((v: any) => {
      if (String(v.video_id) === String(latest.video_id)) return false;
      const p = parseDate(v.published_at);
      const title = String(v.title || "");
      return p !== null && p < publishedMs && Date.now() - p <= 45 * 86400000 &&
        /فن|رسم|العين|جسم|الملك|نب آمون|عمارنة|ألوان/.test(title);
    }).slice(0, 5).map((v: any) => {
      const p = parseDate(v.published_at) as number;
      const hours = Math.max(1, (Date.now() - p) / 3600000);
      const vViews = Math.max(0, Number(v.views) || 0);
      const vLikes = Math.max(0, Number(v.likes) || 0);
      return {
        video_id: clean(v.video_id, 40), title: clean(v.title, 180), published_at: v.published_at,
        age_hours: Math.round(hours * 10) / 10, views: vViews, likes: vLikes,
        views_per_hour_since_publication: Math.round(vViews / hours * 100) / 100,
        like_rate_percent: vViews > 0 ? Math.round(vLikes / vViews * 10000) / 100 : null
      };
    });
    const rates = related.map((v: any) => Number(v.views_per_hour_since_publication)).filter((x: number) => Number.isFinite(x));
    const averageRate = rates.length ? rates.reduce((a: number, b: number) => a + b, 0) / rates.length : null;
    const currentRate = Math.round(views / ageHours * 100) / 100;
    const rateRatio = averageRate && averageRate > 0 ? currentRate / averageRate : null;

    const analyticsRows = await db(
      "zoz_pro_youtube_video_analytics_snapshots?video_id=eq." + encodeURIComponent(String(latest.video_id)) +
      "&select=metrics,created_at&order=created_at.desc&limit=1"
    ).catch(() => []);
    const analyticMetrics = Array.isArray(analyticsRows) && analyticsRows[0]?.metrics && typeof analyticsRows[0].metrics === "object"
      ? analyticsRows[0].metrics : null;
    const retentionAvailable = Boolean(analyticMetrics && Object.keys(analyticMetrics).some((k: string) =>
      /averageViewDuration|averageViewPercentage|estimatedMinutesWatched|impressions|impressionsClickThroughRate|engagedViews|swipe/i.test(k)
    ));
    const earlyPositive = ageHours <= 72 && views >= 500 && (rateRatio === null || rateRatio >= 1.5);
    const verdict = earlyPositive ? "إشارة أولية إيجابية؛ النجاح النهائي لم يُحسم بعد" : "بيانات أولية؛ يلزم انتظار نافذة قياس أطول";
    const nextActions = [
      "لا تغيّر العنوان أو الصورة المصغرة أو خصوصية الفيديو خلال نافذة الاختبار، إلا إذا ظهر خطأ واضح.",
      "أعد القياس عند 48 و72 ساعة ثم بعد 7 أيام، وقارن سرعة المشاهدات ومعدل الإعجاب مع فيديوهات منشورة في أعمار متقاربة.",
      "اختبر حلقة متابعة واحدة بأسلوب السؤال البصري عن الفن المصري القديم، بموضوع جديد غير مكرر في التقويم والمسودات.",
      retentionAvailable
        ? "أدرج متوسط مدة المشاهدة والاحتفاظ والإكمال في التقييم القادم."
        : "مقاييس الاحتفاظ والإكمال غير متاحة للفيديو في لقطة YouTube Analytics الحالية؛ لا تستنتج الاحتفاظ من عدد المشاهدات وحده."
    ];
    const ageRounded = Math.round(ageHours * 10) / 10;
    const evidence = {
      test_type: "early_video_performance", observed_at: observedAt, channel_id: channelId,
      live_sync_ok: liveSync.ok, live_sync_error: liveSync.ok ? null : liveSync.error,
      video_id: clean(latest.video_id, 40), title: clean(latest.title, 180),
      published_at: latest.published_at, age_hours: ageRounded, views, likes, comments,
      like_rate_percent: likeRate === null ? null : Math.round(likeRate * 100) / 100,
      views_per_hour_since_publication: currentRate,
      latest_snapshot: latestPoint ? { captured_at: latestPoint.created_at, views: Number(latestPoint.metrics.views || 0), likes: latestPoint.metrics.likes == null ? null : Number(latestPoint.metrics.likes || 0) } : null,
      previous_snapshot: previousPoint ? { captured_at: previousPoint.created_at, views: Number(previousPoint.metrics.views || 0), likes: previousPoint.metrics.likes == null ? null : Number(previousPoint.metrics.likes || 0) } : null,
      snapshot_interval_hours: intervalHours === null ? null : Math.round(intervalHours * 100) / 100,
      snapshot_view_delta: viewDelta, snapshot_like_delta: likeDelta,
      comparable_public_art_videos: related,
      comparable_average_views_per_hour: averageRate === null ? null : Math.round(averageRate * 100) / 100,
      views_per_hour_ratio_vs_comparables: rateRatio === null ? null : Math.round(rateRatio * 100) / 100,
      retention_metrics_available: retentionAvailable,
      retention_analytics_updated_at: Array.isArray(analyticsRows) && analyticsRows[0] ? analyticsRows[0].created_at : null,
      verdict, confidence: ageHours < 48 || !retentionAvailable ? "early_limited_data" : "provisional",
      next_actions: nextActions
    };
    const bodyText = [
      verdict + ".",
      "الفيديو: " + clean(latest.title, 180) + "؛ عمره عند القياس " + ageRounded + " ساعة.",
      "المشاهدات: " + views.toLocaleString("en-US") + "؛ الإعجابات: " + likes.toLocaleString("en-US") +
        "؛ معدل الإعجاب من المشاهدات: " + (likeRate === null ? "غير متاح" : (Math.round(likeRate * 100) / 100) + "%") + ".",
      "سرعة المشاهدات الحسابية منذ النشر: " + currentRate + " مشاهدة/ساعة، وهي إشارة تقريبية وليست توقعًا.",
      viewDelta !== null ? "التغير بين آخر نقطتي رصد: " + viewDelta + " مشاهدة خلال " + (Math.round((intervalHours || 0) * 100) / 100) + " ساعة." : "لا توجد نقطتا رصد كافيتان لحساب التغير بين لقطتين.",
      related.length ? "تتضمن الأدلة مقارنة سياقية بفيديوهات عامة سابقة عن الفن المصري؛ أعمار الفيديوهات مختلفة وليست تجربة مضبوطة." : "لا توجد مجموعة مقارنة كافية من الفيديوهات العامة الحديثة.",
      retentionAvailable ? "توجد مقاييس تحليل خاصة بالفيديو." : "مقاييس الاحتفاظ والإكمال غير متاحة في لقطة التحليلات الحالية.",
      "الخطوة التالية: " + nextActions.join(" ")
    ].join("\n");
    const key = "video_test_" + String(latest.video_id).replace(/[^A-Za-z0-9_-]/g, "") + "_" + observedAt.slice(0, 10);
    const payload = {
      owner_id: user.id, channel_id: channelId, recommendation_key: key,
      recommendation_type: "measurement",
      title: "اختبار أداء الفيديو: " + clean(latest.title, 150),
      body: bodyText, evidence, updated_at: observedAt
    };
    const old = await db(
      "zoz_pro_managed_channel_recommendations?owner_id=eq." + encodeURIComponent(user.id) +
      "&channel_id=eq." + encodeURIComponent(channelId) +
      "&recommendation_key=eq." + encodeURIComponent(key) + "&select=id,status&limit=1"
    );
    let saved: any = null;
    if (Array.isArray(old) && old[0]?.id) {
      const rows = await db("zoz_pro_managed_channel_recommendations?id=eq." + encodeURIComponent(old[0].id), {
        method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(payload)
      });
      saved = Array.isArray(rows) ? rows[0] : null;
    } else {
      const rows = await db("zoz_pro_managed_channel_recommendations", {
        method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ ...payload, status: "draft" })
      });
      saved = Array.isArray(rows) ? rows[0] : null;
    }
    if (!saved?.id) throw new Error("لم تؤكد قاعدة البيانات حفظ تقرير اختبار الفيديو.");
    await saveRun(user.id, channelId, "zoz_pro_agent_video_performance_test", startedAt, "succeeded", {
      summary: verdict, recommendation_id: saved.id, video_id: latest.video_id,
      views, likes, age_hours: ageRounded, like_rate_percent: evidence.like_rate_percent,
      snapshot_view_delta: viewDelta, retention_metrics_available: retentionAvailable
    });
    return json({
      ok: true, action: "evaluate_latest_video", channel_id: channelId,
      channel_name: clean(channel.display_name, 150), test: evidence,
      recommendation_id: saved.id, recommendation_status: saved.status || "draft",
      next_actions: nextActions, publication_enabled: false
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر اختبار أداء الفيديو.";
    await saveRun(user.id, channelId, "zoz_pro_agent_video_performance_test", startedAt, "failed", { error: clean(message, 350) });
    return fail(message, 502);
  }
}

async function analyze(req: Request, user: any, body: any) {
  const channelId = safeUrlId(body?.channel_id || TARGET_CHANNEL_ID);
  if (!channelId) return fail("اختر قناة مسجلة في مركز الإنتاج.", 400);
  const channel = await getChannel(user.id, channelId);
  const startedAt = new Date().toISOString();
  try {
    // Always try a fresh read from YouTube before the analysis. A failed sync
    // is disclosed and the agent can still analyze the last saved snapshot.
    const liveSync = await syncChannelLive(req, user, channelId);
    const state = await inspectData(user.id, channel);
    const computed = await modelAnalysis(state);
    if (!liveSync.ok) {
      computed.analysis.risks = [
        ...(Array.isArray(computed.analysis.risks) ? computed.analysis.risks : []),
        "تعذرت المزامنة المباشرة في هذه الجولة؛ اعتبر الأرقام المعروضة آخر بيانات محفوظة وليست تأكيدًا للحالة اللحظية."
      ].slice(0, 6);
      computed.analysis.next_actions = [
        "تحقق من تفويض YouTube لهذه القناة ورسالة المزامنة، ثم أعد التحليل بعد نجاح الاتصال.",
        ...(Array.isArray(computed.analysis.next_actions) ? computed.analysis.next_actions : [])
      ].slice(0, 6);
    }
    const result = {
      ok: true,
      action: "analyze",
      channel_id: channelId,
      channel_name: state.channel.display_name,
      run_at: new Date().toISOString(),
      live_sync: liveSync,
      analysis: computed.analysis,
      model: computed.model,
      data: state,
      integrations: {
        production_database: true,
        youtube_live_sync: Boolean(liveSync.ok),
        content_calendar_read: true,
        saved_drafts_read: true,
        video_intake_queue_read: true,
        automation_history_read: true,
        youtube_write_actions_performed: false,
        automatic_publication: false
      },
      publishing_enabled: false,
      video_generation_enabled: false
    };
    await saveRun(user.id, channelId, "zoz_pro_agent_analysis", startedAt, "succeeded", {
      model: computed.model,
      summary: clean(computed.analysis.diagnosis, 500),
      next_actions: computed.analysis.next_actions,
      asset_review_count: state.video_intake.needs_owner_review,
      active_asset_count: state.video_intake.active_count,
      pending_recommendations: state.content.pending_recommendations,
      live_captured_at: state.live_status?.captured_at || null,
      live_sync_ok: liveSync.ok,
      live_sync_error: liveSync.ok ? null : liveSync.error,
      snapshot_id: liveSync.snapshot_id || null
    });
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحليل القناة.";
    await saveRun(user.id, channelId, "zoz_pro_agent_analysis", startedAt, "failed", { error: clean(message, 350) });
    return fail(message, 502);
  }
}

/**
 * One-click, owner-authenticated management cycle for the current channel.
 * Reads live YouTube metrics, checks existing processing uploads, analyzes
 * current production data, and writes a durable owner-review work item.
 * It never publishes, edits privacy/metadata, or uploads a new video.
 */
async function runManagementCycle(req: Request, user: any, body: any) {
  const channelId = safeUrlId(body?.channel_id || TARGET_CHANNEL_ID);
  if (!channelId) return fail("اختر قناة مسجلة في مركز الإنتاج.", 400);
  const channel = await getChannel(user.id, channelId);
  const startedAt = new Date().toISOString();
  try {
    const liveSync = await syncChannelLive(req, user, channelId);
    const beforeChecks = await inspectData(user.id, channel);
    const candidates = (Array.isArray(beforeChecks.video_intake?.items) ? beforeChecks.video_intake.items : [])
      .filter((item: any) => String(item.status || "").toLowerCase() === "processing" && /^[0-9a-f-]{36}$/i.test(String(item.id || "")))
      .slice(0, 4);
    const processingChecks: any[] = [];
    const authorization = req.headers.get("authorization") || "";
    for (const item of candidates) {
      try {
        const response = await fetch(SELF + "?action=intake_check_processing", {
          method: "POST",
          headers: { apikey: PUBLISHABLE_KEY, authorization, "content-type": "application/json" },
          body: JSON.stringify({ asset_id: item.id }),
          signal: AbortSignal.timeout(25000)
        });
        const data = await response.json().catch(() => ({}));
        processingChecks.push({
          asset_id: item.id,
          title: clean(item.title, 180),
          ok: response.ok && data?.ok !== false,
          status: clean(data?.status || item.status, 40),
          processing_status: clean(data?.processing_status || item.youtube_processing_status, 60),
          youtube_video_id: clean(data?.youtube_video_id || item.youtube_video_id, 30) || null,
          error: response.ok && data?.ok !== false ? null : clean(data?.error || ("HTTP " + response.status), 300)
        });
      } catch (error) {
        processingChecks.push({
          asset_id: item.id,
          title: clean(item.title, 180),
          ok: false,
          status: clean(item.status, 40),
          processing_status: clean(item.youtube_processing_status, 60),
          youtube_video_id: clean(item.youtube_video_id, 30) || null,
          error: clean(error instanceof Error ? error.message : "تعذر فحص معالجة الفيديو.", 300)
        });
      }
    }

    const state = await inspectData(user.id, channel);
    const computed = await modelAnalysis(state);
    const nextActions: string[] = [];
    if (!liveSync.ok) {
      nextActions.push("إصلاح أو مراجعة مزامنة YouTube المباشرة: " + clean(liveSync.error, 220) + "؛ لا تعتمد على الأرقام القديمة باعتبارها لحظية.");
    }
    for (const check of processingChecks) {
      if (!check.ok) {
        nextActions.push("تعذر تحديث معالجة الفيديو «" + check.title + "»: " + clean(check.error, 180) + "؛ أعد الفحص من بطاقة الفيديو.");
      } else if (check.status === "ready_to_publish") {
        nextActions.push("الفيديو «" + check.title + "» أصبح جاهزًا للمراجعة النهائية؛ راجع المشاهدة والبيانات ثم أكد النشر بنفسك من مركز الرفع.");
      } else if (check.status === "failed") {
        nextActions.push("الفيديو «" + check.title + "» فشل أثناء المعالجة؛ راجع سبب الفشل قبل إعادة رفعه.");
      } else {
        nextActions.push("الفيديو «" + check.title + "» ما زال قيد معالجة YouTube؛ لا تعِد رفعه الآن.");
      }
    }
    for (const action of (Array.isArray(computed.analysis?.next_actions) ? computed.analysis.next_actions : [])) {
      const cleaned = clean(action, 350);
      if (cleaned && !nextActions.includes(cleaned)) nextActions.push(cleaned);
    }
    if (!nextActions.length) nextActions.push("تم تحديث البيانات ومراجعة طابور الفيديوهات؛ تابع الأداء عند توفر نافذة قياس كافية.");
    const limitedActions = nextActions.slice(0, 8);
    const today = new Date().toISOString().slice(0, 10);
    const objective = [
      "دورة إدارة لقناة " + clean(channel.display_name || channel.channel_title, 140) + " بتاريخ " + today + ".",
      "تمت محاولة مزامنة YouTube المباشرة، وفُحصت حالات معالجة الفيديوهات الجارية المتاحة، ثم قرأ الوكيل التقويم والمسودات والتوصيات وطابور استقبال الفيديوهات.",
      "هذا عنصر متابعة تشغيلي؛ لا يتضمن نشرًا عامًا أو تغييرًا لخصوصية أي فيديو."
    ].join(" ");

    const spec = {
      run_at: new Date().toISOString(),
      channel_id: channelId,
      live_sync: {
        ok: liveSync.ok,
        synced_at: liveSync.synced_at || null,
        period: liveSync.period || null,
        metrics: liveSync.metrics || null,
        snapshot_id: liveSync.snapshot_id || null,
        error: liveSync.ok ? null : clean(liveSync.error, 350)
      },
      channel_live_state: state.live_status?.channel_statistics || {},
      analytics: state.analytics ? {
        period: state.analytics.period,
        captured_at: state.analytics.captured_at,
        metrics: state.analytics.metrics
      } : null,
      video_intake: state.video_intake,
      processing_checks: processingChecks,
      analysis_model: computed.model,
      diagnosis: clean(computed.analysis?.diagnosis, 900),
      strengths: Array.isArray(computed.analysis?.strengths) ? computed.analysis.strengths.slice(0, 6) : [],
      risks: Array.isArray(computed.analysis?.risks) ? computed.analysis.risks.slice(0, 6) : []
    };

    const openItems = await db(
      "zoz_pro_agent_work_items?owner_id=eq." + encodeURIComponent(user.id) +
      "&source_channel_id=eq." + encodeURIComponent(channelId) +
      "&kind=eq.automation&status=in.(awaiting_owner_approval,approved,in_progress,blocked)" +
      "&select=id,title,status,created_at&order=created_at.desc&limit=1"
    );
    const existing = Array.isArray(openItems) ? openItems[0] : null;
    const workPayload = {
      owner_id: user.id,
      kind: "automation",
      title: "متابعة إدارة القناة — " + clean(channel.display_name || channel.channel_title, 120) + " — " + today,
      objective: objective.slice(0, 3900),
      priority: liveSync.ok ? 2 : 1,
      agent_decision: liveSync.ok
        ? "حدّث الوكيل بيانات القناة، وفحص حالات المعالجة الجارية، وحفظ خطة متابعة للمراجعة. لا يوجد نشر أو تعديل عام تلقائي."
        : "تعذرت المزامنة المباشرة في هذه الجولة؛ سجل الوكيل هذا القيد وأبقى بيانات YouTube دون أي تغيير.",
      expected_outcome: "خطة متابعة قابلة للتنفيذ مع أدلة حديثة، مع بقاء النشر والتغييرات المؤثرة تحت موافقة المالك.",
      spec,
      next_actions: limitedActions,
      approval_required: true,
      source_channel_id: channelId,
      created_by: "zoz-pro-agent",
      updated_at: new Date().toISOString()
    };
    let workItem: any = null;
    let workItemCreated = false;
    if (existing?.id) {
      const rows = await db("zoz_pro_agent_work_items?id=eq." + encodeURIComponent(existing.id), {
        method: "PATCH",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({
          ...workPayload,
          title: existing.title || workPayload.title
        })
      });
      workItem = Array.isArray(rows) ? rows[0] : null;
    } else {
      const rows = await db("zoz_pro_agent_work_items", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({
          ...workPayload,
          status: "awaiting_owner_approval"
        })
      });
      workItem = Array.isArray(rows) ? rows[0] : null;
      workItemCreated = Boolean(workItem?.id);
    }
    if (!workItem?.id) throw new Error("اكتملت خطوات القراءة، لكن تعذر حفظ مهمة المتابعة في طابور الوكيل.");

    const status = liveSync.ok && processingChecks.every((x: any) => x.ok) ? "succeeded" : "partial";
    await saveRun(user.id, channelId, "zoz_pro_agent_management_cycle", startedAt, status, {
      work_item_id: workItem.id,
      work_item_created: workItemCreated,
      live_sync_ok: liveSync.ok,
      live_sync_error: liveSync.ok ? null : clean(liveSync.error, 350),
      processing_checks: processingChecks,
      analysis_model: computed.model,
      next_action_count: limitedActions.length,
      automatic_publication: false
    });

    return json({
      ok: true,
      action: "run_management_cycle",
      channel_id: channelId,
      channel_name: clean(channel.display_name || channel.channel_title, 140),
      completed_at: new Date().toISOString(),
      live_sync: liveSync,
      analysis: computed.analysis,
      analysis_model: computed.model,
      processing_checks: processingChecks,
      system_state: {
        active_video_intake: state.video_intake.active_count,
        items_needing_owner_review: state.video_intake.needs_owner_review,
        failed_video_items: state.video_intake.failed_count,
        pending_content_recommendations: state.content.pending_recommendations,
        upcoming_calendar_items: state.content.upcoming_calendar_count,
        saved_scripts: state.content.recent_script_count
      },
      work_item: {
        id: workItem.id,
        title: workItem.title,
        status: workItem.status,
        created: workItemCreated,
        approval_required: workItem.approval_required,
        next_actions: limitedActions
      },
      controls: {
        publication_performed: false,
        video_metadata_changed: false,
        privacy_changed: false,
        video_upload_performed: false,
        owner_approval_required_for_consequential_actions: true
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إكمال دورة الإدارة.";
    await saveRun(user.id, channelId, "zoz_pro_agent_management_cycle", startedAt, "failed", { error: clean(message, 400) });
    return fail(message, 502);
  }
}

async function createDraft(req: Request, user: any, body: any) {
  const channelId = safeUrlId(body?.channel_id);
  if (!channelId) return fail("اختر قناة مسجلة في مركز الإنتاج.", 400);
  const channel = await getChannel(user.id, channelId);
  const topic = clean(body?.topic, 240);
  if (topic.length < 8) return fail("اكتب موضوعًا محددًا لا يقل عن 8 أحرف.", 400);
  if (channelId === "UC-FimUUFXRd0MOSoikzczcQ") {
    return fail("القناة المسجلة بهذا المعرّف تظهر في YouTube باسم «فكره كيدز»؛ أوقفنا إنشاء المسودات عليها حتى لا نخلط محتوى الأطفال مع القناة السياسية أو مصر القديمة. استخدم قناة Hazem Ahmed أو فكره حاليًا.", 409);
  }
  const authorization = req.headers.get("authorization") || "";
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(SELF + "?action=studio_generate", {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, authorization, "content-type": "application/json" },
      body: JSON.stringify({
        channel_id: channelId, topic,
        mode: String(body?.mode || "short") === "long" ? "long" : "short",
        duration_seconds: Math.max(20, Math.min(180, Number(body?.duration_seconds) || 45))
      }),
      signal: AbortSignal.timeout(40000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false || !data?.script) {
      const message = clean(data?.error || "تعذر حفظ مسودة المحتوى في مركز الإنتاج.", 500);
      await saveRun(user.id, channelId, "zoz_pro_agent_create_draft", startedAt, "failed", { topic, error: message });
      return fail(message, response.status >= 400 && response.status < 600 ? response.status : 502);
    }
    await saveRun(user.id, channelId, "zoz_pro_agent_create_draft", startedAt, "succeeded", {
      topic, script_id: data.script.id || null, script_title: clean(data.script.title || topic, 180),
      generation_method: clean(data.script.generation_method || data.method || data.script_engine || "unknown", 80),
      note: "Saved as a draft for owner review; no upload or publication."
    });
    return json({
      ok: true, action: "create_draft", channel_id: channelId, channel_name: channel.display_name,
      topic, script: data.script, method: data.method || data.script_engine || data.script.generation_method || "unknown",
      note: "تم حفظ المسودة في قاعدة الإنتاج للمراجعة. لم يتم إنشاء فيديو أو رفعه أو نشره."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إنشاء مسودة المحتوى.";
    await saveRun(user.id, channelId, "zoz_pro_agent_create_draft", startedAt, "failed", { topic, error: clean(message, 400) });
    return fail(message, 502);
  }
}

async function dispatchFlowPrompt(user:any,body:any) {
  const deviceId=clean(body?.device_id,40);
  const prompt=clean(body?.prompt,12000);
  if(!/^[0-9a-f-]{36}$/i.test(deviceId))return fail("اختر هاتفًا مقرونًا صالحًا.",400);
  if(prompt.length<8)return fail("مطالبة المشهد قصيرة أو فارغة.",400);
  const devices=await db("zoz_pro_device_registry?id=eq."+encodeURIComponent(deviceId)+
    "&owner_id=eq."+encodeURIComponent(user.id)+"&device_status=eq.active&select=id,device_name,capabilities&limit=1");
  const device=devices?.[0];
  if(!device||!(Array.isArray(device.capabilities)&&device.capabilities.includes("flow.copy_prompt")))return fail("الهاتف غير نشط أو لا يملك قدرة تمرير مطالبات Flow.",403);
  const idempotencyKey=clean(body?.idempotency_key||("agent-flow-"+crypto.randomUUID()),100);
  const rows=await db("zoz_pro_device_jobs",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({
    owner_id:user.id,device_id:deviceId,capability_id:"flow.copy_prompt",
    payload:{prompt,source:"zoz-pro-agent",channel_id:TARGET_CHANNEL_ID},
    status:"queued",approval_required:false,approval_status:"not_required",
    idempotency_key:idempotencyKey,priority:2
  })});
  const job=rows?.[0];
  if(!job)throw new Error("تعذر إنشاء مهمة الهاتف.");
  await db("zoz_pro_device_job_events",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({
    owner_id:user.id,device_id:deviceId,job_id:job.id,event_type:"agent_dispatched_flow_prompt",
    details:{source:"zoz-pro-agent",channel_id:TARGET_CHANNEL_ID,prompt_length:prompt.length}
  })});
  return json({ok:true,action:"dispatch_flow_prompt",job_id:job.id,device_id:deviceId,device_name:device.device_name,status:"queued",note:"أُرسلت المطالبة إلى طابور الهاتف. ينسخها التطبيق إلى الحافظة ويطلب فتح Flow بلمسة ظاهرة؛ لا يبدأ التوليد تلقائيًا."});
}

async function dispatchLatestDraftPrompt(userId:string,channelId:string) {
  if(channelId!==TARGET_CHANNEL_ID)return {status:"skipped_non_primary_channel"};
  const recentSince=new Date(Date.now()-7*24*3600000).toISOString();
  const scripts=await db("zoz_pro_content_scripts?owner_id=eq."+encodeURIComponent(userId)+
    "&channel_id=eq."+encodeURIComponent(channelId)+
    "&created_at=gte."+encodeURIComponent(recentSince)+
    "&select=id,title,production_package,shot_plan,narration,created_at&order=created_at.desc&limit=1");
  const script=scripts?.[0];
  if(!script)return {status:"skipped_no_recent_script"};
  const devices=await db("zoz_pro_device_registry?owner_id=eq."+encodeURIComponent(userId)+
    "&device_status=eq.active&select=id,device_name,capabilities,last_heartbeat_at&order=last_heartbeat_at.desc.nullslast&limit=10");
  const device=(Array.isArray(devices)?devices:[]).find((x:any)=>Array.isArray(x.capabilities)&&x.capabilities.includes("flow.copy_prompt"));
  if(!device)return {status:"waiting_for_paired_android_device"};
  const pkg=script.production_package&&typeof script.production_package==="object"?script.production_package:{};
  const shots=Array.isArray(pkg.shot_plan)?pkg.shot_plan:(Array.isArray(script.shot_plan)?script.shot_plan:[]);
  const narration=Array.isArray(pkg.narration)?pkg.narration:(Array.isArray(script.narration)?script.narration:[]);
  const sceneCount=Math.max(1,Math.min(6,shots.length||narration.length||1));
  const title=clean(script.title||pkg.title||"موضوع الحلقة",180);
  const jobs:any[]=[];
  for(let index=0;index<sceneCount;index++){
    const shotRaw=shots[index]??"المشهد "+(index+1)+" المرتبط بموضوع الحلقة";
    const shot=typeof shotRaw==="string"?clean(shotRaw,500):clean(shotRaw?.visual||shotRaw?.description||shotRaw?.scene||JSON.stringify(shotRaw),500);
    const narrationRaw=narration[index];
    const narrationText=typeof narrationRaw==="string"?clean(narrationRaw,600):clean(narrationRaw?.text||narrationRaw?.narration||"",600);
    const prompt=[
      "Create ONE 8-second vertical 9:16 cinematic video clip for a YouTube Short.",
      "This is scene "+(index+1)+" of a coherent multi-clip episode. Subject: "+title+".",
      "Shot direction: "+shot+".",
      narrationText?"Narrative context: "+narrationText+".":"",
      "Use historically grounded ancient Egyptian material culture, architecture, clothing, tools and landscape. Realistic cinematic reconstruction, coherent motion, natural light, detailed textures, documentary visual quality.",
      "No visible text, captions, subtitles, labels, logos, watermarks, or added music. Preserve a clean visual-only clip. Avoid modern objects and anachronisms."
    ].filter(Boolean).join("\n");
    const idem="auto-flow-"+String(script.id)+"-"+String(device.id)+"-scene-"+(index+1);
    try{
      const rows=await db("zoz_pro_device_jobs",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({
        owner_id:userId,device_id:device.id,capability_id:"flow.copy_prompt",
        payload:{prompt,source:"zoz-pro-agent-autonomous-worker",script_id:script.id,script_title:title,scene_index:index+1,scene_count:sceneCount},
        status:"queued",approval_required:false,approval_status:"not_required",
        idempotency_key:idem,priority:2
      })});
      const job=rows?.[0];
      if(job){
        await db("zoz_pro_device_job_events",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({
          owner_id:userId,device_id:device.id,job_id:job.id,event_type:"autonomous_flow_prompt_dispatched",
          details:{script_id:script.id,channel_id:channelId,scene_index:index+1,scene_count:sceneCount}
        })});
        jobs.push({job_id:job.id,scene_index:index+1,status:"queued"});
      }
    }catch(_){
      const existing=await db("zoz_pro_device_jobs?owner_id=eq."+encodeURIComponent(userId)+"&idempotency_key=eq."+encodeURIComponent(idem)+"&select=id,status&limit=1");
      if(existing?.[0])jobs.push({job_id:existing[0].id,scene_index:index+1,status:"already_exists",job_status:existing[0].status});
    }
  }
  return {status:jobs.length?"queued":"already_dispatched",jobs_queued:jobs.filter((x:any)=>x.status==="queued").length,scene_count:sceneCount,device_id:device.id,device_name:device.device_name,script_id:script.id,jobs,note:"Scene prompts are queued to the phone. The owner still generates each clip visibly in Google Flow; no quota or UI restrictions are bypassed."};
}

async function scheduledOwner(req: Request) {
  const token = req.headers.get("x-zoz-autopilot-token") || "";
  if (!token) return null;
  try {
    const valid = await db("rpc/zoz_check_autopilot_secret", {
      method: "POST", body: JSON.stringify({ p_token: token })
    });
    if (valid !== true) return null;
    const ownerId = await db("rpc/zoz_internal_owner_id");
    if (typeof ownerId !== "string" || !/^[0-9a-f-]{36}$/i.test(ownerId)) return null;
    return { id: ownerId, email: OWNER_EMAIL, email_confirmed_at: "internal-scheduled" };
  } catch { return null; }
}

async function callAnalyticsTool(token: string, action: string, payload: Record<string, unknown> = {}) {
  if (!token) throw new Error("الجدولة الداخلية غير مصادق عليها.");
  const response = await fetch(SELF + "?action=" + encodeURIComponent(action), {
    method: "POST",
    headers: { "content-type": "application/json", "x-zoz-autopilot-token": token },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(clean(data?.error || (action + " HTTP " + response.status), 350));
  }
  return data;
}

function utcDay(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

async function executeApprovedAgentTasks(user: any, token: string) {
  const rows = await db(
    "zoz_pro_agent_work_items?owner_id=eq." + encodeURIComponent(user.id) +
    "&status=eq.approved&select=id,kind,title,spec,source_channel_id,priority&order=priority.asc,created_at.asc&limit=5"
  );
  const results: any[] = [];
  for (const item of (Array.isArray(rows) ? rows : [])) {
    const spec = item?.spec && typeof item.spec === "object" ? item.spec : {};
    const operation = clean(spec.operation || spec.tool_action, 80).toLowerCase();
    if (!operation) continue; // keep manually approved but not machine-specified tasks untouched
    // Compare-and-set claim: concurrent background runs cannot execute the same row twice.
    const claimed = await db("zoz_pro_agent_work_items?id=eq." + encodeURIComponent(item.id) + "&status=eq.approved", {
      method: "PATCH", headers: { prefer: "return=representation" },
      body: JSON.stringify({ status: "in_progress", updated_at: new Date().toISOString(), owner_note: null })
    });
    if (!Array.isArray(claimed) || !claimed[0]) {
      results.push({ id: item.id, operation, status: "skipped", reason: "task_already_claimed" });
      continue;
    }
    const channelId = safeUrlId(item.source_channel_id || spec.channel_id);
    const assetId = clean(spec.asset_id, 40);
    const topic = clean(spec.topic || spec.working_title, 240);
    try {
      let output: any;
      if (operation === "books_monitor") {
        output = await monitorBooks(user.id);
        if (!output?.ok) throw new Error(clean(output?.error || "تعذر تحليل الكتب وأمازون.", 300));
      } else if (operation === "sync_channel") {
        if (!channelId) throw new Error("المهمة تحتاج channel_id صالحًا.");
        const endDate = utcDay(-1);
        const startDate = utcDay(-28);
        output = await callAnalyticsTool(token, "managed_channel_sync", {
          channel_id: channelId, start_date: startDate, end_date: endDate
        });
      } else if (operation === "generate_calendar") {
        if (!channelId) throw new Error("المهمة تحتاج channel_id صالحًا.");
        output = await callAnalyticsTool(token, "managed_channel_calendar_generate", { channel_id: channelId });
      } else if (operation === "create_draft") {
        if (!channelId || topic.length < 8) throw new Error("المهمة تحتاج قناة مسجلة وموضوعًا لا يقل عن 8 أحرف.");
        output = await callAnalyticsTool(token, "studio_generate", {
          channel_id: channelId, topic,
          ...( /^[0-9a-f-]{36}$/i.test(String(spec.calendar_id || "")) ? { calendar_id: String(spec.calendar_id) } : {}),
          mode: String(spec.mode || "short") === "long" ? "long" : "short",
          duration_seconds: Math.max(20, Math.min(180, Number(spec.duration_seconds) || 45))
        });
      } else if (operation === "check_video_processing") {
        if (!/^[0-9a-f-]{36}$/i.test(assetId)) throw new Error("المهمة تحتاج asset_id صالحًا.");
        output = await callAnalyticsTool(token, "intake_check_processing", { asset_id: assetId });
      } else if (operation === "inspect_intake") {
        if (!channelId) throw new Error("المهمة تحتاج channel_id صالحًا.");
        output = await callAnalyticsTool(token, "intake_list", { channel_id: channelId });
      } else if (operation === "approve_video_for_private_upload") {
        if (!/^[0-9a-f-]{36}$/i.test(assetId)) throw new Error("المهمة تحتاج asset_id صالحًا.");
        const before = await db("zoz_pro_video_intake_assets?owner_id=eq." + encodeURIComponent(user.id) +
          "&id=eq." + encodeURIComponent(assetId) +
          "&select=id,status,title,made_for_kids,contains_synthetic_media&limit=1");
        const target = Array.isArray(before) ? before[0] : null;
        if (!target || target.status !== "ready_for_review") throw new Error("لا يمكن اعتماد الرفع إلا لفيديو في حالة ready_for_review.");
        output = await callAnalyticsTool(token, "intake_review", { asset_id: assetId, decision: "approve", note: "اعتماد صريح عبر مهمة وافق عليها مالك ZOZ Pro؛ الرفع إلى YouTube سيكون خاصًا فقط." });
      } else if (operation === "upload_private_video") {
        if (!/^[0-9a-f-]{36}$/i.test(assetId)) throw new Error("المهمة تحتاج asset_id صالحًا.");
        output = await advanceApprovedYouTubeUpload(token, user.id, assetId);
        if (!output?.ok) throw new Error(clean(output?.error || "تعذر تقدم الرفع الخاص.", 300));
      } else if (operation === "books_monitor") {
        output = await monitorBooks(user.id);
        if (!output?.ok) throw new Error(clean(output?.error || "تعذر تحليل الكتب وأمازون.", 300));
      } else if (operation === "system_diagnostics") {
        // System-wide, read-only checks across every production subsystem currently backed by tables.
        const ownerFilter = "owner_id=eq." + encodeURIComponent(user.id);
        const [diagChannels, diagAssets, diagScripts, diagTasks, diagRuns, diagResearch, diagTokens, diagEvents, diagState, diagBooks, diagBookSnapshots, diagBookAlerts] = await Promise.all([
          db("zoz_pro_managed_channels?" + ownerFilter + "&is_active=eq.true&select=channel_id,display_name,connection_status"),
          db("zoz_pro_video_intake_assets?" + ownerFilter + "&select=id,status,channel_id&order=updated_at.desc&limit=250"),
          db("zoz_pro_content_scripts?" + ownerFilter + "&select=id,status,channel_id&order=created_at.desc&limit=250"),
          db("zoz_pro_agent_work_items?" + ownerFilter + "&select=id,status,kind,approval_required,updated_at&order=updated_at.desc&limit=250"),
          db("zoz_pro_automation_runs?select=id,workflow,status,started_at,finished_at&order=started_at.desc&limit=50"),
          db("zoz_pro_vidiq_research_runs?" + ownerFilter + "&select=id,status,created_at&order=created_at.desc&limit=50"),
          db("zoz_pro_managed_channel_credentials?" + ownerFilter + "&select=channel_id,status,token_expires_at,updated_at"),
          db("zoz_pro_video_intake_events?" + ownerFilter + "&select=id,event_type,to_status,created_at&order=created_at.desc&limit=100"),
          db("zoz_pro_state?select=version,updated_at&limit=1"),
          db("zoz_pro_books?" + ownerFilter + "&select=id,title,format,kdp_status,price_amount,price_currency,status_source,last_verified_at,next_review_at,updated_at&order=updated_at.desc&limit=200"),
          db("zoz_pro_book_snapshots?" + ownerFilter + "&select=id,book_id,observed_at,period_start,period_end,units_sold,royalties_amount,royalties_currency,pages_read,orders_count,source&order=observed_at.desc&limit=500"),
          db("zoz_pro_book_agent_events?" + ownerFilter + "&status=eq.open&select=id,event_type,severity,title,created_at&order=created_at.desc&limit=100")
        ]);
        const taskRows = Array.isArray(diagTasks) ? diagTasks : [];
        const runRows = Array.isArray(diagRuns) ? diagRuns : [];
        const researchRows = Array.isArray(diagResearch) ? diagResearch : [];
        const nowMs = Date.now();
        output = {
          ok: true,
          diagnostic_scope: "system-wide-read-only",
          active_channels: Array.isArray(diagChannels) ? diagChannels.length : 0,
          channel_connections: Array.isArray(diagChannels) ? diagChannels.map((x: any) => ({ channel_id: x.channel_id, display_name: clean(x.display_name, 100), status: clean(x.connection_status, 40) })) : [],
          intake_assets_by_status: (Array.isArray(diagAssets) ? diagAssets : []).reduce((acc: any, x: any) => { const k = clean(x.status, 50) || "unknown"; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
          scripts_seen: Array.isArray(diagScripts) ? diagScripts.length : 0,
          task_queue: {
            total_seen: taskRows.length,
            by_status: taskRows.reduce((acc: any, x: any) => { const k = clean(x.status, 50) || "unknown"; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
            approval_required_open: taskRows.filter((x: any) => x.approval_required === true && ["draft","awaiting_owner_approval","approved","in_progress"].includes(String(x.status))).length
          },
          automation: {
            recent_runs_seen: runRows.length,
            latest_runs: runRows.slice(0, 8).map((x: any) => ({ workflow: clean(x.workflow, 100), status: clean(x.status, 30), started_at: x.started_at, finished_at: x.finished_at })),
            latest_agent_run_at: runRows.find((x: any) => String(x.workflow) === "zoz_pro_agent_autonomous_worker")?.started_at || null
          },
          integrations: {
            channel_credentials: (Array.isArray(diagTokens) ? diagTokens : []).map((x: any) => ({
              channel_id: x.channel_id, status: clean(x.status, 30),
              expires_in_minutes: Number.isFinite(Date.parse(String(x.token_expires_at || ""))) ? Math.round((Date.parse(String(x.token_expires_at)) - nowMs) / 60000) : null
            })),
            vidiq_research_runs: researchRows.length,
            latest_vidiq_status: researchRows[0]?.status || null
          },
          digital_product_department: { status: "not_connected_in_production_schema", reason: "No dedicated KDP or digital-product operations table/connector was found in this production project; no external account actions were attempted." },
          media_pipeline: {
            intake_events_seen: Array.isArray(diagEvents) ? diagEvents.length : 0,
            latest_intake_event_at: Array.isArray(diagEvents) && diagEvents[0] ? diagEvents[0].created_at : null
          },
          durable_state: Array.isArray(diagState) && diagState[0] ? { version: Number(diagState[0].version), updated_at: diagState[0].updated_at } : null,
          books_and_amazon: {
            books_seen: Array.isArray(diagBooks) ? diagBooks.length : 0,
            by_status: (Array.isArray(diagBooks) ? diagBooks : []).reduce((acc: any, x: any) => { const k = clean(x.kdp_status, 30) || "unknown"; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
            performance_snapshots: Array.isArray(diagBookSnapshots) ? diagBookSnapshots.length : 0,
            latest_report_at: Array.isArray(diagBookSnapshots) && diagBookSnapshots[0] ? diagBookSnapshots[0].observed_at : null,
            open_alerts: Array.isArray(diagBookAlerts) ? diagBookAlerts.length : 0,
            direct_kdp_connection: "not_configured",
            data_note: "Sales and royalty metrics are reported only when imported or entered from a verified KDP report."
          }
        };
      } else {
        await db("zoz_pro_agent_work_items?id=eq." + encodeURIComponent(item.id), {
          method: "PATCH", headers: { prefer: "return=minimal" },
          body: JSON.stringify({
            status: "blocked",
            owner_note: "الإجراء الآلي غير مدرج في قائمة الأدوات المسموح بها: " + operation,
            updated_at: new Date().toISOString()
          })
        });
        results.push({ id: item.id, operation, status: "blocked", reason: "unsupported_allowlisted_operation" });
        continue;
      }
      const summary = operation === "create_draft"
        ? "أنشأ الوكيل مسودة محتوى داخل مركز الإنتاج للمراجعة؛ لم ينشرها."
        : operation === "generate_calendar"
          ? "حدّث الوكيل تقويم المحتوى؛ لم ينشر محتوى."
          : operation === "sync_channel"
            ? "حدّث الوكيل بيانات القناة المحفوظة."
            : operation === "inspect_intake"
              ? "قرأ الوكيل قائمة استقبال الفيديوهات دون رفع أو نشر."
              : operation === "upload_private_video"
                ? "استكمل الوكيل جزءًا من رفع فيديو معتمد إلى YouTube بوضع خاص؛ لا نشر عام."
                : operation === "approve_video_for_private_upload"
                  ? "اعتمد الوكيل الفيديو المحدد بعد موافقة المالك على مهمة الاعتماد؛ سيبدأ الرفع بوضع خاص."
                  : operation === "system_diagnostics"
                  ? "نفّذ الوكيل فحصًا تشغيليًا لأقسام النظام وحالاتها."
                  : operation === "books_monitor"
                    ? "راجع الوكيل كتالوج الكتب وتقارير الأداء وسجّل التنبيهات دون افتراض مبيعات."
                    : "فحص الوكيل معالجة الفيديو وحدّث حالة الاستقبال.";
      await db("zoz_pro_agent_work_items?id=eq." + encodeURIComponent(item.id), {
        method: "PATCH", headers: { prefer: "return=minimal" },
        body: JSON.stringify({
          status: "completed", completed_at: new Date().toISOString(),
          agent_decision: summary, owner_note: JSON.stringify(summarizeToolOutput(operation, output)).slice(0, 3500),
          spec: { ...spec, last_execution: { status: "completed", operation, executed_at: new Date().toISOString(), output: summarizeToolOutput(operation, output) } },
          updated_at: new Date().toISOString()
        })
      });
      results.push({ id: item.id, operation, status: "completed", summary,
        result_status: clean(output?.status || output?.processing_status || output?.method || "succeeded", 60) });
    } catch (error) {
      const message = clean(error instanceof Error ? error.message : "تعذر تنفيذ المهمة.", 350);
      await db("zoz_pro_agent_work_items?id=eq." + encodeURIComponent(item.id), {
        method: "PATCH", headers: { prefer: "return=minimal" },
        body: JSON.stringify({
          status: "blocked", owner_note: message,
          spec: { ...spec, last_execution: { status: "blocked", operation, executed_at: new Date().toISOString(), error: message } },
          updated_at: new Date().toISOString()
        })
      }).catch(() => null);
      results.push({ id: item.id, operation, status: "blocked", error: message });
    }
  }
  return results;
}


function opFromTask(item: any) {
  const spec = item?.spec && typeof item.spec === "object" ? item.spec : {};
  return clean(spec.operation || spec.tool_action, 80).toLowerCase();
}
function taskFingerprint(operation: string, channelId: string, spec: any) {
  const asset = clean(spec?.asset_id, 40);
  if (asset) return operation + "|" + channelId + "|asset:" + asset;
  if (operation === "create_draft") return operation + "|" + channelId + "|topic:" + clean(spec?.topic || spec?.working_title, 240).toLocaleLowerCase("ar");
  return operation + "|" + channelId;
}
function summarizeToolOutput(operation: string, output: any) {
  const summary: any = { ok: output?.ok !== false };
  const strings = ["status", "processing_status", "upload_status", "privacy_status", "method", "script_engine", "youtube_video_id", "url", "message"];
  for (const key of strings) if (output?.[key] != null) summary[key] = clean(output[key], key === "url" ? 300 : 160);
  if (output?.script?.id) summary.script_id = clean(output.script.id, 50);
  if (output?.script?.title) summary.script_title = clean(output.script.title, 180);
  if (output?.channel_title) summary.channel_title = clean(output.channel_title, 150);
  if (output?.channel_id) summary.channel_id = clean(output.channel_id, 40);
  if (Array.isArray(output?.calendar)) summary.calendar_items = output.calendar.length;
  if (Array.isArray(output?.assets)) {
    summary.assets_count = output.assets.length;
    summary.assets_by_status = output.assets.reduce((acc: any, x: any) => {
      const key = clean(x?.status, 50) || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }
  if (output?.active_channels != null) summary.active_channels = Number(output.active_channels);
  if (output?.scripts_seen != null) summary.scripts_seen = Number(output.scripts_seen);
  if (output?.intake_assets_by_status) summary.intake_assets_by_status = output.intake_assets_by_status;
  if (output?.diagnostic_scope) summary.diagnostic_scope = clean(output.diagnostic_scope, 80);
  for (const key of ["books_and_amazon","books_seen","by_status","performance_snapshots","latest_report_at","open_alerts","direct_kdp_connection","data_note","books","alerts","needs_report_count","latest_report","total_units_in_saved_snapshots","total_royalties_in_saved_snapshots","section","checked_at","task_queue","automation","integrations","digital_product_department","media_pipeline","durable_state"]) {
    if (output?.[key] != null) summary[key] = output[key];
  }
  if (output?.uploaded_bytes != null) summary.uploaded_bytes = Number(output.uploaded_bytes);
  if (output?.total_bytes != null) summary.total_bytes = Number(output.total_bytes);
  if (output?.chunks_uploaded_this_run != null) summary.chunks_uploaded_this_run = Number(output.chunks_uploaded_this_run);
  if (output?.reason) summary.reason = clean(output.reason, 180);
  if (output?.skipped === true) summary.skipped = true;
  return JSON.parse(JSON.stringify(summary));
}

/**
 * Build a fresh task queue from real production state. The planner may only
 * choose tools from an explicit allow-list; all task arguments are grounded
 * in existing channels, calendars, scripts, and intake rows.
 */
async function planAutonomousTasks(user: any, memoryContext: any = null) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const today = nowIso.slice(0, 10);
  const ownerId = String(user.id);
  const result: any = { ok: true, planner_version: "zoz-tool-planner-v2-memory-aware", method: "policy_fallback", considered: 0, queued: [], skipped: [], memory_context_loaded: Boolean(memoryContext?.last_run_id || memoryContext?.last_run_finished_at) };
  try {
    // Recover old claims for inspection. Do not blindly repeat a task whose
    // prior side effect is unknown; mark it blocked for safe, explicit retry.
    const staleCutoff = new Date(now - 45 * 60000).toISOString();
    const staleRows = await db(
      "zoz_pro_agent_work_items?owner_id=eq." + encodeURIComponent(ownerId) +
      "&status=eq.in_progress&updated_at=lt." + encodeURIComponent(staleCutoff) +
      "&select=id,title,spec&order=updated_at.asc&limit=10"
    );
    for (const stale of (Array.isArray(staleRows) ? staleRows : [])) {
      const spec = stale?.spec && typeof stale.spec === "object" ? stale.spec : {};
      await db("zoz_pro_agent_work_items?id=eq." + encodeURIComponent(stale.id) + "&status=eq.in_progress", {
        method: "PATCH", headers: { prefer: "return=minimal" },
        body: JSON.stringify({
          status: "blocked",
          owner_note: "توقفت المهمة داخل العامل أكثر من 45 دقيقة. لم تُعَد تلقائيًا لأن نتيجة أثرها السابق غير مؤكدة؛ راجع سجل التنفيذ قبل إعادة المحاولة.",
          spec: { ...spec, last_execution: { status: "blocked", reason: "stale_worker_claim", detected_at: nowIso } },
          updated_at: nowIso
        })
      }).catch(() => null);
    }

    const channelsRows = await db(
      "zoz_pro_managed_channels?owner_id=eq." + encodeURIComponent(ownerId) +
      "&is_active=eq.true&select=channel_id,display_name,channel_title,niche,connection_status&order=display_name.asc"
    );
    const channels = (Array.isArray(channelsRows) ? channelsRows : []).filter((x: any) => safeUrlId(x.channel_id))
      .sort((a: any, b: any) => Number(String(b.channel_id) === TARGET_CHANNEL_ID) - Number(String(a.channel_id) === TARGET_CHANNEL_ID))
      .slice(0, 10);
    const taskRows = await db(
      "zoz_pro_agent_work_items?owner_id=eq." + encodeURIComponent(ownerId) +
      "&select=id,kind,status,source_channel_id,spec,created_at,updated_at,approval_required&order=created_at.desc&limit=250"
    );
    const pastTasks = Array.isArray(taskRows) ? taskRows : [];
    const candidates: any[] = [];
    let draftCandidateCount = 0;

    for (const ch of channels) {
      const cid = String(ch.channel_id);
      const unverifiedKids = cid === "UC-FimUUFXRd0MOSoikzczcQ" ||
        String(ch.niche || "").includes("قيد التحقق");
      const [liveRows, intakeRows, recentScriptRows] = await Promise.all([
        db("zoz_pro_managed_channel_live_status?owner_id=eq." + encodeURIComponent(ownerId) +
          "&channel_id=eq." + encodeURIComponent(cid) +
          "&select=captured_at,last_error&limit=1"),
        db("zoz_pro_video_intake_assets?owner_id=eq." + encodeURIComponent(ownerId) +
          "&channel_id=eq." + encodeURIComponent(cid) +
          "&select=id,title,original_filename,status,updated_at&order=updated_at.asc&limit=100"),
        db("zoz_pro_content_scripts?owner_id=eq." + encodeURIComponent(ownerId) +
          "&channel_id=eq." + encodeURIComponent(cid) +
          "&created_at=gte." + encodeURIComponent(new Date(now - 20 * 3600000).toISOString()) +
          "&select=id,title,created_at&order=created_at.desc&limit=1")
      ]);
      const live = Array.isArray(liveRows) ? liveRows[0] : null;
      const capturedAt = Date.parse(String(live?.captured_at || ""));
      const staleMinutes = Number.isFinite(capturedAt) ? Math.max(0, (now - capturedAt) / 60000) : Infinity;
      const addCandidate = (item: any) => candidates.push({
        ...item,
        channel_id: cid,
        channel_name: clean(ch.display_name || ch.channel_title || cid, 140),
        id: taskFingerprint(item.operation, cid, item.spec || {})
      });

      if (staleMinutes > 90 && String(ch.connection_status || "") === "connected") {
        addCandidate({
          operation: "sync_channel", kind: "automation", priority: 1,
          title: "تحديث بيانات القناة تلقائيًا — " + clean(ch.display_name || cid, 120),
          objective: "تحديث بيانات YouTube والتحليلات المحفوظة لأن آخر لقطة أقدم من 90 دقيقة أو غير موجودة.",
          expected_outcome: "بيانات حديثة محفوظة في مساحة القناة الصحيحة.",
          reason: "live_data_stale",
          spec: { operation: "sync_channel", channel_id: cid }
        });
      }

      const assets = Array.isArray(intakeRows) ? intakeRows : [];
      for (const asset of assets.filter((x: any) =>
        ["processing", "ready_to_publish"].includes(String(x.status || "")) &&
        /^[0-9a-f-]{36}$/i.test(String(x.id || "")) &&
        (!Number.isFinite(Date.parse(String(x.updated_at || ""))) || now - Date.parse(String(x.updated_at || "")) > 12 * 60000)
      ).slice(0, 1)) {
        addCandidate({
          operation: "check_video_processing", kind: "automation", priority: 2,
          asset_id: String(asset.id),
          title: "التحقق من معالجة فيديو — " + clean(asset.title || asset.original_filename || asset.id, 120),
          objective: "مطابقة حالة الفيديو الجاري أو الجاهز مع YouTube وتحديث سجل الاستقبال فقط.",
          expected_outcome: "حالة معالجة متطابقة مع YouTube دون نشر أو تغيير خصوصية.",
          reason: "processing_state_needs_reconciliation",
          spec: { operation: "check_video_processing", channel_id: cid, asset_id: String(asset.id) }
        });
      }

      const needsReview = assets.some((x: any) => ["ready_for_review", "failed"].includes(String(x.status || "")));
      if (needsReview) {
        addCandidate({
          operation: "inspect_intake", kind: "automation", priority: 5,
          title: "فحص طابور الفيديوهات — " + clean(ch.display_name || cid, 120),
          objective: "قراءة حالات المراجعة والفشل وتسجيل ملخص تشغيل دون الموافقة أو النشر أو الحذف.",
          expected_outcome: "تقرير محدث عن ملفات الانتظار والفشل.",
          reason: "intake_has_review_or_failure",
          spec: { operation: "inspect_intake", channel_id: cid }
        });
      }

      if (unverifiedKids) {
        result.skipped.push({ channel_id: cid, reason: "channel_niche_unverified; no calendar or content task was generated" });
        continue;
      }

      const legacy = cid === TARGET_CHANNEL_ID;
      const calendarPath = legacy ? "zoz_pro_content_calendar" : "zoz_pro_managed_channel_content_calendar";
      const calendars = await db(
        calendarPath + "?owner_id=eq." + encodeURIComponent(ownerId) +
        "&channel_id=eq." + encodeURIComponent(cid) +
        "&status=eq.draft&planned_date=gte." + encodeURIComponent(today) +
        "&select=id,planned_date,sequence_no,working_title,format&order=planned_date.asc,sequence_no.asc&limit=10"
      );
      const upcoming = (Array.isArray(calendars) ? calendars : []).filter((x: any) => clean(x.working_title, 240).length >= 8);
      if (!upcoming.length) {
        addCandidate({
          operation: "generate_calendar", kind: "automation", priority: 3,
          title: "إكمال تقويم المحتوى — " + clean(ch.display_name || cid, 120),
          objective: "إنشاء خطة أسبوعية داخل تقويم القناة عند عدم وجود عناصر مسودة مستقبلية.",
          expected_outcome: "تقويم عمل محفوظ للقناة دون إنشاء فيديو أو نشره.",
          reason: "no_upcoming_draft_calendar_items",
          spec: { operation: "generate_calendar", channel_id: cid }
        });
        continue;
      }

      const recentScripts = Array.isArray(recentScriptRows) ? recentScriptRows : [];
      if (!recentScripts.length && draftCandidateCount < 1) {
        const candidate = upcoming[0];
        draftCandidateCount++;
        addCandidate({
          operation: "create_draft", kind: "content_project", priority: 4,
          title: "إنشاء مسودة من التقويم — " + clean(candidate.working_title, 130),
          objective: "إنتاج نص ومسودة metadata من أول موضوع قادم في تقويم القناة وحفظها للمراجعة.",
          expected_outcome: "مسودة مكتملة محفوظة داخل مركز الإنتاج، غير منشورة.",
          reason: "no_recent_script_and_calendar_topic_available",
          spec: {
            operation: "create_draft", channel_id: cid,
            topic: clean(candidate.working_title, 240),
            calendar_id: /^[0-9a-f-]{36}$/i.test(String(candidate.id || "")) ? String(candidate.id) : null,
            mode: String(candidate.format || "short") === "long" ? "long" : "short",
            duration_seconds: String(candidate.format || "short") === "long" ? 120 : 45
          }
        });
      }
    }

    const bookCandidate = {
      operation: "books_monitor", kind: "system_improvement", priority: 3,
      channel_id: TARGET_CHANNEL_ID, channel_name: "الكتب وAmazon KDP",
      title: "متابعة الكتب وأمازون — تقرير الأداء وحالة البيانات",
      objective: "مراجعة كتالوج الكتب وآخر تقارير المبيعات والعوائد، وإنشاء تنبيهات عند غياب البيانات دون اختلاق أرقام.",
      expected_outcome: "تقرير محفوظ في سجل المهمة وتنبيهات للكتب التي تحتاج تحديثًا.",
      reason: "scheduled_book_business_monitoring", spec: { operation: "books_monitor", channel_id: TARGET_CHANNEL_ID }
    };
    bookCandidate.id = taskFingerprint(bookCandidate.operation, TARGET_CHANNEL_ID, bookCandidate.spec);
    candidates.push(bookCandidate);

    const diagCandidate = {
      operation: "system_diagnostics", kind: "system_improvement", priority: 6,
      channel_id: TARGET_CHANNEL_ID, channel_name: "ZOZ Pro",
      title: "تشخيص تشغيلي دوري لنظام ZOZ Pro",
      objective: "فحص القنوات وملفات الاستقبال والمسودات وحالة التشغيل في قواعد الإنتاج.",
      expected_outcome: "ملخص تشغيلي قابل للتدقيق محفوظ مع مهمة التشخيص.",
      reason: "scheduled_operational_diagnostics",
      spec: { operation: "system_diagnostics", channel_id: TARGET_CHANNEL_ID }
    };
    diagCandidate.id = taskFingerprint(diagCandidate.operation, TARGET_CHANNEL_ID, diagCandidate.spec);
    candidates.push(diagCandidate);

    // Suppress work that is already active or was completed recently.
    const cooldownMs: Record<string, number> = {
      sync_channel: 120 * 60000,
      generate_calendar: 24 * 3600000,
      create_draft: 20 * 3600000,
      check_video_processing: 15 * 60000,
      inspect_intake: 30 * 60000,
      system_diagnostics: 6 * 3600000,
      books_monitor: 24 * 3600000,
      upload_private_video: 15 * 60000
    };
    const activeStatuses = new Set(["draft", "awaiting_owner_approval", "approved", "in_progress"]);
    const eligible: any[] = [];
    for (const candidate of candidates) {
      const fp = candidate.id;
      const prior = pastTasks.filter((row: any) => {
        const op = opFromTask(row);
        const channel = String(row.source_channel_id || row.spec?.channel_id || "");
        return op === candidate.operation && channel === String(candidate.channel_id || "") &&
          taskFingerprint(op, channel, row.spec || {}) === fp;
      });
      const active = prior.find((row: any) => activeStatuses.has(String(row.status || "")));
      if (active) {
        result.skipped.push({ id: fp, reason: "matching_task_already_active", task_id: active.id, status: active.status });
        continue;
      }
      const cooldown = cooldownMs[candidate.operation] || 30 * 60000;
      const recentlyDone = prior.find((row: any) => {
        if (!["completed", "blocked", "rejected"].includes(String(row.status || ""))) return false;
        const at = Date.parse(String(row.updated_at || row.created_at || ""));
        return Number.isFinite(at) && now - at < cooldown;
      });
      if (recentlyDone) {
        result.skipped.push({ id: fp, reason: "cooldown", task_id: recentlyDone.id, status: recentlyDone.status });
        continue;
      }
      eligible.push(candidate);
    }
    result.considered = eligible.length;
    if (!eligible.length) {
      result.method = "policy_no_work_due";
      return result;
    }

    eligible.sort((a: any, b: any) => Number(a.priority) - Number(b.priority) ||
      Number(String(b.channel_id) === TARGET_CHANNEL_ID) - Number(String(a.channel_id) === TARGET_CHANNEL_ID));
    let selected = eligible.slice(0, 5);
    let plannerRationale = "تم اختيار المهام وفق أولوية صحة الاتصال ومعالجة الفيديو ثم التقويم والمسودات والتشخيص.";
    let plannerModelUsed = false;
    try {
      const history = await db(
        "zoz_pro_automation_runs?workflow=eq.zoz_pro_agent_autonomous_worker&select=started_at,details&order=started_at.desc&limit=12"
      );
      const modelRecentlyUsed = (Array.isArray(history) ? history : []).some((x: any) =>
        x?.details?.tool_planner_model_used === true &&
        Number.isFinite(Date.parse(String(x.started_at || ""))) &&
        Date.now() - Date.parse(String(x.started_at || "")) < 6 * 3600000
      );
      if (!modelRecentlyUsed && GEMINI_KEYS.length) {
        const allowed = eligible.slice(0, 12).map((x: any) => ({
          id: x.id, operation: x.operation, channel_id: x.channel_id,
          channel: x.channel_name, title: x.title, priority: x.priority,
          reason: x.reason, topic: x.spec?.topic || null
        }));
        const prompt = [
          "أنت مخطط أدوات آلي لنظام ZOZ Pro. هذه البيانات مرشحة من قواعد النظام الحقيقية.",
          "اختر حتى 5 مهام مناسبة فقط من القائمة المعطاة. لا تخترع IDs أو عمليات أو معاملات.",
          "رتب حسب ما يساعد استمرار النظام والإنتاج. لا تطلب نشرًا عامًا أو تغيير خصوصية أو تعديل metadata أو حذفًا.",
          "أعد JSON فقط بالشكل: {\"selected_task_ids\":[\"id\"],\"rationale\":\"سبب مختصر بالعربية\"}.",
          JSON.stringify({ allowed_operations: ["sync_channel","check_video_processing","generate_calendar","create_draft","inspect_intake","system_diagnostics","books_monitor"], durable_memory_context: memoryContext ? { last_run_id: memoryContext.last_run_id, last_run_status: memoryContext.last_run_status, next_resume_hint: memoryContext.next_resume_hint, channels_checked: memoryContext.channels_checked, channels_failed: memoryContext.channels_failed, failures: Array.isArray(memoryContext.failures) ? memoryContext.failures.slice(0, 8) : [] } : null, candidates: allowed })
        ].join("\n");
        for (const key of [...new Set(GEMINI_KEYS)]) {
          try {
            const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" + encodeURIComponent(key), {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 700 }
              }),
              signal: AbortSignal.timeout(12000)
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) continue;
            const rawText = String(data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("\n") || "");
            const open = rawText.indexOf("{"), close = rawText.lastIndexOf("}");
            if (open < 0 || close <= open) continue;
            const plan = JSON.parse(rawText.slice(open, close + 1));
            const allowedIds = new Set(allowed.map((x: any) => x.id));
            const ids = Array.isArray(plan.selected_task_ids) ? [...new Set(plan.selected_task_ids.filter((x: any) => typeof x === "string" && allowedIds.has(x)))] : [];
            if (ids.length) {
              selected = ids.slice(0, 5).map((id: string) => eligible.find((x: any) => x.id === id)).filter(Boolean);
              plannerRationale = clean(plan.rationale, 450) || plannerRationale;
              plannerModelUsed = true;
              result.method = "gemini-3.5-flash-lite+policy-validation";
              break;
            }
          } catch { /* deterministic safe fallback is intentional */ }
        }
      }
    } catch { /* deterministic safe fallback is intentional */ }
    if (!plannerModelUsed) result.method = "policy_fallback";
    result.rationale = plannerRationale;
    result.model_used = plannerModelUsed;

    for (const candidate of selected) {
      try {
        const spec = { ...candidate.spec, planner_version: "zoz-tool-planner-v1", plan_reason: candidate.reason, planned_at: nowIso };
        const inserted = await db("zoz_pro_agent_work_items", {
          method: "POST", headers: { prefer: "return=representation" },
          body: JSON.stringify({
            owner_id: ownerId,
            kind: candidate.kind,
            title: clean(candidate.title, 180),
            objective: clean(candidate.objective, 4000),
            status: "approved",
            priority: Math.max(1, Math.min(5, Number(candidate.priority) || 3)),
            agent_decision: "اختار الوكيل هذه المهمة من حالة النظام الفعلية وفق سياسة التشغيل الآمن؛ تم اعتماد التنفيذ الآلي للإجراء الداخلي المحدد فقط.",
            expected_outcome: clean(candidate.expected_outcome, 1000),
            spec,
            next_actions: [],
            approval_required: false,
            source_channel_id: safeUrlId(candidate.channel_id) || TARGET_CHANNEL_ID,
            created_by: "zoz-pro-agent"
          })
        });
        if (!Array.isArray(inserted) || !inserted[0]?.id) throw new Error("لم تؤكد قاعدة البيانات حفظ المهمة.");
        result.queued.push({
          id: inserted[0].id, operation: candidate.operation,
          channel_id: candidate.channel_id, title: candidate.title, priority: candidate.priority
        });
      } catch (error) {
        result.skipped.push({
          id: candidate.id, reason: clean(error instanceof Error ? error.message : "تعذر حفظ المهمة.", 250)
        });
      }
    }
  } catch (error) {
    result.ok = false;
    result.error = clean(error instanceof Error ? error.message : "تعذر إعداد خطة المهام.", 300);
  }
  return result;
}

async function advanceApprovedYouTubeUpload(token: string, ownerId: string, requestedAssetId = "") {
  const base = "zoz_pro_video_intake_assets?owner_id=eq." + encodeURIComponent(ownerId) +
    "&status=in.(approved,uploading_to_youtube)&select=id,owner_id,channel_id,title,status,chunk_size,chunk_count,total_bytes,uploaded_bytes,youtube_video_id,updated_at";
  const query = requestedAssetId
    ? base + "&id=eq." + encodeURIComponent(requestedAssetId) + "&limit=1"
    : base + "&order=updated_at.asc&limit=1";
  const rows = await db(query);
  let asset = Array.isArray(rows) ? rows[0] : null;
  if (!asset) return { ok: true, skipped: true, reason: requestedAssetId ? "asset_not_approved_or_not_uploading" : "no_approved_private_upload" };
  const assetId = String(asset.id);
  if (String(asset.status) === "approved") {
    await callAnalyticsTool(token, "intake_start_youtube", { asset_id: assetId });
    const refreshed = await db("zoz_pro_video_intake_assets?owner_id=eq." + encodeURIComponent(ownerId) +
      "&id=eq." + encodeURIComponent(assetId) +
      "&select=id,owner_id,channel_id,title,status,chunk_size,chunk_count,total_bytes,uploaded_bytes,youtube_video_id,updated_at&limit=1");
    asset = Array.isArray(refreshed) ? refreshed[0] : null;
    if (!asset || String(asset.status) !== "uploading_to_youtube") throw new Error("تم بدء جلسة YouTube لكن تعذر تأكيد حالة الرفع.");
  }
  const chunks: any[] = [];
  const chunkSize = Math.max(1, Number(asset.chunk_size) || 8388608);
  const totalBytes = Math.max(0, Number(asset.total_bytes) || 0);
  for (let n = 0; n < 2; n++) {
    if (String(asset.status) !== "uploading_to_youtube" || Number(asset.uploaded_bytes || 0) >= totalBytes) break;
    const partIndex = Math.floor(Number(asset.uploaded_bytes || 0) / chunkSize);
    if (!Number.isInteger(partIndex) || partIndex < 0 || partIndex >= Number(asset.chunk_count || 0)) {
      throw new Error("فهرس جزء الرفع لا يطابق بيانات الملف؛ أوقف الوكيل الرفع لحماية سلامة الملف.");
    }
    const response = await callAnalyticsTool(token, "intake_youtube_part", {
      asset_id: assetId, part_index: partIndex
    });
    chunks.push({
      part_index: partIndex,
      uploaded_bytes: Number(response.uploaded_bytes || asset.uploaded_bytes || 0),
      complete: Boolean(response.complete),
      status: clean(response.status || "uploading_to_youtube", 50)
    });
    if (response.complete || response.status === "processing") {
      asset = { ...asset, status: "processing", uploaded_bytes: totalBytes, youtube_video_id: response.youtube_video_id || asset.youtube_video_id };
      break;
    }
    const fresh = await db("zoz_pro_video_intake_assets?owner_id=eq." + encodeURIComponent(ownerId) +
      "&id=eq." + encodeURIComponent(assetId) +
      "&select=id,owner_id,channel_id,title,status,chunk_size,chunk_count,total_bytes,uploaded_bytes,youtube_video_id,updated_at&limit=1");
    asset = Array.isArray(fresh) ? fresh[0] : null;
    if (!asset) throw new Error("اختفى سجل الملف أثناء الرفع؛ توقف التنفيذ.");
  }
  return {
    ok: true, asset_id: assetId, title: clean(asset.title, 180),
    channel_id: asset.channel_id, status: clean(asset.status, 50),
    youtube_video_id: clean(asset.youtube_video_id, 20) || null,
    uploaded_bytes: Number(asset.uploaded_bytes || 0),
    total_bytes: totalBytes, chunks_uploaded_this_run: chunks.length,
    chunks, privacy_policy: "private_until_owner_confirms_publication"
  };
}

/**
 * Scheduled, allow-listed ZOZ Pro operator. It uses current production services
 * as tools, stores an audit record, and never publishes, changes privacy/metadata,
 * deletes temporary files, or performs arbitrary SQL/code supplied by a task.
 */
async function autonomousRun(req: Request, user: any, body: any) {
  const token = req.headers.get("x-zoz-autopilot-token") || "";
  if (!token) return fail("الطلب الآلي يحتاج تفويض الجدولة الداخلي.", 401);
  const startedAt = new Date().toISOString();
  let runId = "";
  let loadedMemory: any = null;
  try { loadedMemory = await loadAgentMemory(user.id); } catch (_) { loadedMemory = null; }
  try {
    const runRows = await db("zoz_pro_automation_runs", {
      method: "POST", headers: { prefer: "return=representation" },
      body: JSON.stringify({
        workflow: "zoz_pro_agent_autonomous_worker", channel_id: TARGET_CHANNEL_ID, status: "running",
        started_at: startedAt,
        details: { actor: "zoz-pro-agent", execution_mode: body?.scheduled ? "scheduled" : "internal_test",
          owner_id: user.id, tool_policy: "allow-listed, no public publishing" }
      })
    });
    runId = String(runRows?.[0]?.id || "");

    // Keep a durable resume pointer and monitor the local KDP inventory on every server-side scheduled cycle.
    // This does not connect to Amazon; it inspects records and reports already stored in production.
    let backgroundBooksMonitor: any = { ok: false, reason: "not_run" };
    let backgroundBooksMonitorError = "";
    let previousCheckpoint: any = null;
    try {
      const bookState = await monitorBooks(user.id);
      backgroundBooksMonitor = {
        ok: true,
        checked_at: bookState.checked_at,
        books_seen: bookState.books_seen,
        performance_snapshots: bookState.performance_snapshots,
        needs_report_count: bookState.needs_report_count,
        latest_report_at: bookState.latest_report_at,
        direct_kdp_connection: bookState.direct_kdp_connection,
        alert_count: Array.isArray(bookState.alerts) ? bookState.alerts.length : 0,
        data_note: bookState.data_note
      };
    } catch (error) {
      backgroundBooksMonitorError = clean(error instanceof Error ? error.message : "تعذر فحص سجل الكتب.", 250);
      backgroundBooksMonitor = { ok: false, error: backgroundBooksMonitorError };
    }
    try {
      const priorRows = await db(
        "zoz_pro_automation_runs?workflow=eq.zoz_pro_agent_autonomous_worker&id=neq." + encodeURIComponent(runId) +
        "&details->>owner_id=eq." + encodeURIComponent(user.id) +
        "&status=in.(succeeded,partial,failed)&select=id,status,started_at,finished_at,details&order=started_at.desc&limit=1"
      );
      const prior = Array.isArray(priorRows) ? priorRows[0] : null;
      if (prior) {
        previousCheckpoint = {
          run_id: prior.id,
          status: prior.status,
          started_at: prior.started_at,
          finished_at: prior.finished_at,
          channels_checked: prior.details?.channels_checked ?? null,
          channels_succeeded: prior.details?.channels_succeeded ?? null,
          content_draft_created: prior.details?.content_draft_created ?? null,
          book_monitoring: prior.details?.book_monitoring ?? null,
          next_resume_hint: "Continue from this persisted run record; inspect failures/blockers before repeating work."
        };
      }
    } catch (_) {
      previousCheckpoint = { available: false, reason: "previous_run_lookup_failed" };
    }

    // Create grounded, low-risk tasks from live production state, then execute them using the tool allow-list.
    const toolPlan = await planAutonomousTasks(user, loadedMemory?.content || null);
    const approvedTasks = await executeApprovedAgentTasks(user, token);
    let privateUploadProgress: any = { ok: true, skipped: true, reason: "not_attempted" };
    try {
      privateUploadProgress = await advanceApprovedYouTubeUpload(token, user.id);
    } catch (error) {
      privateUploadProgress = { ok: false, error: clean(error instanceof Error ? error.message : "تعذر تقدم الرفع الخاص.", 300) };
    }
    const channelRows = await db(
      "zoz_pro_managed_channels?owner_id=eq." + encodeURIComponent(user.id) +
      "&is_active=eq.true&select=channel_id,display_name,channel_title,niche,connection_status,last_synced_at&order=display_name.asc"
    );
    const channels = (Array.isArray(channelRows) ? channelRows : []).slice().sort(
      (a: any, b: any) => Number(String(b.channel_id) === TARGET_CHANNEL_ID) - Number(String(a.channel_id) === TARGET_CHANNEL_ID)
    );
    const results: any[] = [];
    const failures: any[] = [];
    if (backgroundBooksMonitorError) failures.push({ tool: "monitorBooks", error: backgroundBooksMonitorError });
    if (!toolPlan?.ok) failures.push({ tool: "planAutonomousTasks", error: clean(toolPlan?.error, 300) });
    let contentDraftCreated = approvedTasks.some((x: any) => x.operation === "create_draft" && x.status === "completed");

    for (const ch of channels.slice(0, 10)) {
      const channelId = safeUrlId(ch.channel_id);
      if (!channelId) continue;
      const result: any = { channel_id: channelId, channel: clean(ch.display_name || ch.channel_title, 140), tools: [] };
      try {
        const liveRows = await db(
          "zoz_pro_managed_channel_live_status?owner_id=eq." + encodeURIComponent(user.id) +
          "&channel_id=eq." + encodeURIComponent(channelId) +
          "&select=captured_at,last_attempt_at,last_error&limit=1"
        );
        const live = Array.isArray(liveRows) ? liveRows[0] : null;
        const liveMs = Date.parse(String(live?.captured_at || ""));
        const liveAgeMinutes = Number.isFinite(liveMs) ? Math.max(0, Math.round((Date.now() - liveMs) / 60000)) : null;
        result.live_age_minutes = liveAgeMinutes;
        if (liveAgeMinutes === null || liveAgeMinutes > 90) {
          try {
            const endDate = utcDay(-1);
            const startDate = utcDay(-28);
            const synced = await callAnalyticsTool(token, "managed_channel_sync", {
              channel_id: channelId, start_date: startDate, end_date: endDate
            });
            result.tools.push({ tool: "managed_channel_sync", status: "executed", video_count: Number(synced.video_count || 0) });
          } catch (error) {
            const message = clean(error instanceof Error ? error.message : "تعذرت مزامنة القناة.", 300);
            result.tools.push({ tool: "managed_channel_sync", status: "failed", error: message });
            failures.push({ channel_id: channelId, tool: "managed_channel_sync", error: message });
          }
        } else {
          result.tools.push({ tool: "managed_channel_sync", status: "skipped_fresh_data" });
        }

        // Reconcile in-progress uploads, but never publish or archive them automatically.
        const processingRows = await db(
          "zoz_pro_video_intake_assets?owner_id=eq." + encodeURIComponent(user.id) +
          "&channel_id=eq." + encodeURIComponent(channelId) +
          "&status=in.(processing,ready_to_publish)&select=id,title,original_filename&order=updated_at.asc&limit=2"
        );
        for (const asset of (Array.isArray(processingRows) ? processingRows : [])) {
          try {
            const checked = await callAnalyticsTool(token, "intake_check_processing", { asset_id: asset.id });
            result.tools.push({
              tool: "intake_check_processing", asset_id: asset.id, status: "executed",
              resulting_status: clean(checked.status || checked.processing_status || "checked", 50)
            });
          } catch (error) {
            const message = clean(error instanceof Error ? error.message : "تعذر فحص الفيديو.", 300);
            result.tools.push({ tool: "intake_check_processing", asset_id: asset.id, status: "failed", error: message });
            failures.push({ channel_id: channelId, asset_id: asset.id, error: message });
          }
        }

        const isKidsUnverified = channelId === "UC-FimUUFXRd0MOSoikzczcQ" ||
          String(ch.niche || "").includes("قيد التحقق");
        result.content_policy = isKidsUnverified ? "hold_unverified_channel" : "drafts_only";
        if (!isKidsUnverified) {
          const recentSince = new Date(Date.now() - 20 * 3600000).toISOString();
          const recentScripts = await db(
            "zoz_pro_content_scripts?owner_id=eq." + encodeURIComponent(user.id) +
            "&channel_id=eq." + encodeURIComponent(channelId) +
            "&created_at=gte." + encodeURIComponent(recentSince) +
            "&select=id,title,created_at&order=created_at.desc&limit=1"
          );
          const hasRecentScript = Array.isArray(recentScripts) && recentScripts.length > 0;
          result.recent_script_exists = hasRecentScript;
          if (!hasRecentScript && !contentDraftCreated) {
            const today = utcDay();
            const legacyCalendar = channelId === TARGET_CHANNEL_ID;
            let calendarRows: any[] = [];
            if (legacyCalendar) {
              const legacyRows = await db(
                "zoz_pro_content_calendar?owner_id=eq." + encodeURIComponent(user.id) +
                "&channel_id=eq." + encodeURIComponent(channelId) +
                "&status=eq.draft&planned_date=gte." + encodeURIComponent(today) +
                "&select=id,planned_date,working_title&order=planned_date.asc,sequence_no.asc&limit=1"
              );
              calendarRows = Array.isArray(legacyRows) ? legacyRows : [];
            }
            if (!calendarRows.length) {
              const managedRows = await db(
                "zoz_pro_managed_channel_content_calendar?owner_id=eq." + encodeURIComponent(user.id) +
                "&channel_id=eq." + encodeURIComponent(channelId) +
                "&status=eq.draft&planned_date=gte." + encodeURIComponent(today) +
                "&select=id,planned_date,working_title&order=planned_date.asc,sequence_no.asc&limit=1"
              );
              calendarRows = Array.isArray(managedRows) ? managedRows : [];
            }
            if (!calendarRows.length) {
              try {
                await callAnalyticsTool(token, "managed_channel_calendar_generate", { channel_id: channelId });
                result.tools.push({ tool: "managed_channel_calendar_generate", status: "executed" });
                const managedRows = await db(
                  "zoz_pro_managed_channel_content_calendar?owner_id=eq." + encodeURIComponent(user.id) +
                  "&channel_id=eq." + encodeURIComponent(channelId) +
                  "&status=eq.draft&planned_date=gte." + encodeURIComponent(today) +
                  "&select=id,planned_date,working_title&order=planned_date.asc,sequence_no.asc&limit=1"
                );
                calendarRows = Array.isArray(managedRows) ? managedRows : [];
              } catch (error) {
                const message = clean(error instanceof Error ? error.message : "تعذر إنشاء تقويم محتوى.", 300);
                result.tools.push({ tool: "managed_channel_calendar_generate", status: "failed", error: message });
                failures.push({ channel_id: channelId, tool: "managed_channel_calendar_generate", error: message });
              }
            }
            const candidate = calendarRows[0];
            if (candidate && clean(candidate.working_title, 240).length >= 8 && !contentDraftCreated) {
              try {
                const made = await callAnalyticsTool(token, "studio_generate", {
                  channel_id: channelId,
                  topic: clean(candidate.working_title, 240),
                  ...(legacyCalendar && candidate.id ? { calendar_id: candidate.id } : {}),
                  mode: "short", duration_seconds: 45
                });
                if (made?.script || made?.ok) {
                  contentDraftCreated = true;
                  result.draft = {
                    status: "created_for_review",
                    title: clean(made.script?.title || candidate.working_title, 180),
                    method: clean(made.script_engine || made.method || made.script?.generation_method || "unknown", 80)
                  };
                  result.tools.push({ tool: "studio_generate", status: "executed", output: "draft_saved_not_published" });
                } else {
                  result.draft = { status: "failed", error: "لم يرجع مولّد المحتوى مسودة قابلة للحفظ." };
                }
              } catch (error) {
                const message = clean(error instanceof Error ? error.message : "تعذر إنشاء المسودة.", 300);
                result.draft = { status: "failed", error: message };
                failures.push({ channel_id: channelId, tool: "studio_generate", error: message });
              }
            } else if (!candidate) {
              result.draft = { status: "skipped_no_calendar_item" };
            } else {
              result.draft = { status: hasRecentScript ? "skipped_recent_script" : "skipped_draft_limit" };
            }
          } else {
            result.draft = { status: hasRecentScript ? "skipped_recent_script" : "skipped_draft_limit" };
          }
        } else {
          result.draft = { status: "held_until_channel_niche_verified" };
        }
        result.ok = true;
      } catch (error) {
        const message = clean(error instanceof Error ? error.message : "تعذر تنفيذ دورة أدوات القناة.", 350);
        result.ok = false;
        result.error = message;
        failures.push({ channel_id: channelId, error: message });
      }
      results.push(result);
    }

    let androidDeviceDispatch:any={status:"skipped_no_recent_script_or_paired_device"};
    try {
      androidDeviceDispatch=await dispatchLatestDraftPrompt(user.id,TARGET_CHANNEL_ID);
    } catch(deviceError) {
      androidDeviceDispatch={status:"failed",error:clean(deviceError instanceof Error?deviceError.message:"تعذر إرسال مطالبة المشهد للهاتف.",250)};
      failures.push({tool:"android.flow_prompt_dispatch",error:androidDeviceDispatch.error});
    }

    // Use the language model for strategic analysis at most once every six hours.
    let aiAnalysis: any = { used: false, reason: "throttled_or_not_due" };
    try {
      const recentWorkerRuns = await db(
        "zoz_pro_automation_runs?workflow=eq.zoz_pro_agent_autonomous_worker&status=eq.succeeded" +
        "&select=started_at,details&order=started_at.desc&limit=8"
      );
      const recentAiRun = (Array.isArray(recentWorkerRuns) ? recentWorkerRuns : []).find((x: any) =>
        x?.details?.ai_analysis_done === true &&
        Date.parse(String(x.started_at || "")) > Date.now() - 6 * 3600000
      );
      if (!recentAiRun) {
        const mainChannel = await getChannel(user.id, TARGET_CHANNEL_ID);
        const state = await inspectData(user.id, mainChannel);
        const computed = await modelAnalysis(state, loadedMemory?.content || null);
        aiAnalysis = {
          used: true, model: computed.model,
          diagnosis: clean(computed.analysis?.diagnosis, 800),
          next_actions: (Array.isArray(computed.analysis?.next_actions) ? computed.analysis.next_actions : []).map((x: any) => clean(x, 300)).filter(Boolean).slice(0, 6),
          confidence_notes: (Array.isArray(computed.analysis?.confidence_notes) ? computed.analysis.confidence_notes : []).map((x: any) => clean(x, 220)).filter(Boolean).slice(0, 4)
        };
      }
    } catch (error) {
      aiAnalysis = { used: false, error: clean(error instanceof Error ? error.message : "تعذر التحليل الذكي.", 250) };
      failures.push({ tool: "modelAnalysis", error: aiAnalysis.error });
    }

    const allFailures = [
      ...failures,
      ...(privateUploadProgress?.ok === false ? [{ tool: "private_upload_progress", error: privateUploadProgress.error }] : []),
      ...approvedTasks.filter((x: any) => x.status === "blocked").map((x: any) => ({ task_id: x.id, tool: x.operation, error: x.error || x.reason || "task_blocked" }))
    ];
    const details = {
      actor: "zoz-pro-agent",
      owner_id: user.id,
      scheduled: Boolean(body?.scheduled),
      channels_checked: results.length,
      channels_succeeded: results.filter((x: any) => x.ok).length,
      channels_failed: results.filter((x: any) => !x.ok).length,
      content_draft_created: contentDraftCreated,
      tool_plan: toolPlan,
      tool_planner_model_used: Boolean(toolPlan?.model_used),
      previous_checkpoint: previousCheckpoint,
      durable_memory_used_for_planning: Boolean(loadedMemory?.content),
      prior_durable_memory: loadedMemory ? { updated_at: loadedMemory.updated_at, notion_sync_status: loadedMemory.notion_sync_status, content: loadedMemory.content } : null,
      book_monitoring: backgroundBooksMonitor,
      approved_tasks_seen: approvedTasks.length,
      approved_tasks: approvedTasks,
      private_upload_progress: privateUploadProgress,
      android_device_dispatch: androidDeviceDispatch,
      channels: results,
      failures: allFailures,
      ai_analysis_done: Boolean(aiAnalysis.used),
      ai_analysis: aiAnalysis,
      safety: {
        public_publish: false, privacy_changes: false, metadata_edits: false,
        temporary_file_deletion: false, kids_channel_content_generation: false,
        task_execution: "owner-approved and allow-listed operations only"
      }
    };
    const finalStatus = allFailures.length ? ((results.some((x: any) => x.ok) || approvedTasks.some((x: any) => x.status === "completed") || privateUploadProgress?.ok) ? "partial" : "failed") : "succeeded";
    if (runId) {
      await db("zoz_pro_automation_runs?id=eq." + encodeURIComponent(runId), {
        method: "PATCH", headers: { prefer: "return=minimal" },
        body: JSON.stringify({ status: finalStatus, finished_at: new Date().toISOString(), details })
      });
    }
    let durableMemory: any = { saved: false, error: "not_attempted" };
    try {
      durableMemory = await saveAgentMemory(user.id, runId, {
        last_run_id: runId, last_run_status: finalStatus, last_run_started_at: startedAt,
        last_run_finished_at: new Date().toISOString(), channels_checked: results.length,
        channels_succeeded: results.filter((x: any) => x.ok).length,
        channels_failed: results.filter((x: any) => !x.ok).length,
        content_draft_created: contentDraftCreated, previous_checkpoint: previousCheckpoint,
        book_monitoring: backgroundBooksMonitor, failures: allFailures,
        next_resume_hint: "Load this primary_checkpoint and inspect latest automation run before planning new work.",
        notion_sync_status: "not_configured"
      });
    } catch (error) {
      durableMemory = { saved: false, error: clean(error instanceof Error ? error.message : "memory_save_failed", 240) };
    }
    details.durable_memory = durableMemory;
    try {
      if (runId) await db("zoz_pro_automation_runs?id=eq." + encodeURIComponent(runId), {
        method: "PATCH", headers: { prefer: "return=minimal" },
        body: JSON.stringify({ details })
      });
    } catch (_) { /* durable memory record remains authoritative if run-detail patch fails */ }
    return json({
      ok: finalStatus !== "failed",
      action: "autonomous_run",
      workflow: "zoz_pro_agent_autonomous_worker",
      completed_at: new Date().toISOString(),
      status: finalStatus,
      channels_checked: results.length,
      channels_succeeded: results.filter((x: any) => x.ok).length,
      tools_executed: results.reduce((n: number, x: any) => n + (Array.isArray(x.tools) ? x.tools.filter((t: any) => t.status === "executed").length : 0), 0),
      content_draft_created: contentDraftCreated,
      tool_plan: toolPlan,
      durable_memory_used_for_planning: Boolean(loadedMemory?.content),
      previous_checkpoint: previousCheckpoint,
      durable_memory_used_for_planning: Boolean(loadedMemory?.content),
      book_monitoring: backgroundBooksMonitor,
      durable_memory: durableMemory,
      approved_tasks: approvedTasks,
      private_upload_progress: privateUploadProgress,
      ai_analysis: aiAnalysis,
      channels: results,
      failures: allFailures,
      safety: details.safety
    });
  } catch (error) {
    const message = clean(error instanceof Error ? error.message : "تعذر إكمال التشغيل الذاتي.", 400);
    if (runId) await db("zoz_pro_automation_runs?id=eq." + encodeURIComponent(runId), {
      method: "PATCH", headers: { prefer: "return=minimal" },
      body: JSON.stringify({ status: "failed", finished_at: new Date().toISOString(), details: { error: message, actor: "zoz-pro-agent" } })
    }).catch(() => null);
    return fail(message, 502);
  }
}


async function monitorBooks(userId: string) {
 const f="owner_id=eq."+encodeURIComponent(userId);
 const [br,sr,er]=await Promise.all([
  db("zoz_pro_books?"+f+"&select=id,title,subtitle,author,format,marketplace,asin,kdp_status,price_amount,price_currency,product_url,status_source,last_verified_at,next_review_at,updated_at,notes&order=updated_at.desc&limit=200"),
  db("zoz_pro_book_snapshots?"+f+"&select=id,book_id,observed_at,period_start,period_end,units_sold,pages_read,orders_count,royalties_amount,royalties_currency,refunds_count,ad_spend_amount,source,notes&order=observed_at.desc&limit=500"),
  db("zoz_pro_book_agent_events?"+f+"&status=eq.open&select=id,book_id,event_type,severity,title,detail,created_at&order=created_at.desc&limit=200")
 ]);
 const books=Array.isArray(br)?br:[], snaps=Array.isArray(sr)?sr:[], events=Array.isArray(er)?er:[];
 const latest=new Map<string,any>(); for(const s of snaps){const id=String(s.book_id||"");if(id&&!latest.has(id))latest.set(id,s);}
 const now=Date.now(), alerts:any[]=[], resolvedEventIds=new Set<string>();
 for(const b of books){
  const s=latest.get(String(b.id)), age=s&&Number.isFinite(Date.parse(String(s.observed_at||"")))?Math.floor((now-Date.parse(String(s.observed_at)))/86400000):null;
  const oldMissing=events.filter((e:any)=>String(e.book_id||"")===String(b.id)&&e.event_type==="sales_report_missing");
  if(s&&age!==null&&age<30){
   for(const e of oldMissing){
    const changed=await db("zoz_pro_book_agent_events?id=eq."+encodeURIComponent(String(e.id))+"&owner_id=eq."+encodeURIComponent(userId)+"&status=eq.open",{method:"PATCH",headers:{prefer:"return=representation"},body:JSON.stringify({status:"resolved",resolved_at:new Date().toISOString(),detail:"تم تسجيل تقرير KDP للفترة "+String(s.period_start||"غير محددة")+" إلى "+String(s.period_end||"غير محددة")+"؛ لا يعود تنبيه غياب التقرير مطلوبًا لهذه اللقطة."})});
    if(Array.isArray(changed)&&changed.length)resolvedEventIds.add(String(e.id));
   }
  } else if(!oldMissing.length){
   const title="تقرير مبيعات/عوائد KDP غير مسجل — "+clean(b.title,120);
   const detail=!s?"لا توجد لقطة مبيعات أو عوائد محفوظة لهذا الكتاب. أدخل بيانات تقرير KDP موثوق قبل تحليل الأداء.":"آخر لقطة بيانات أقدم من 30 يومًا؛ حدّثها بتقرير KDP جديد.";
   await db("zoz_pro_book_agent_events",{method:"POST",headers:{prefer:"return:minimal"},body:JSON.stringify({owner_id:userId,book_id:b.id,event_type:"sales_report_missing",severity:"warning",source:"zoz-pro-agent",title,detail,evidence:{last_report_at:s?.observed_at||null,age_days:age,status_source:b.status_source},status:"open",approval_required:false})});
   alerts.push({book_id:b.id,event_type:"sales_report_missing",severity:"warning",title,detail});
  }
  const verified=Date.parse(String(b.last_verified_at||""));
  if(b.status_source==="owner_record"&&(!Number.isFinite(verified)||now-verified>30*86400000))alerts.push({book_id:b.id,event_type:"status_needs_verification",severity:"watch",title:"حالة النشر تحتاج تحققًا مباشرًا — "+clean(b.title,100),detail:"الحالة الحالية من سجل سابق وليست قراءة حية من KDP."});
 }
 const remainingEvents=events.filter((e:any)=>!resolvedEventIds.has(String(e.id)));
 const byStatus=books.reduce((a:any,b:any)=>{const k=clean(b.kdp_status,30)||"unknown";a[k]=(a[k]||0)+1;return a;},{});
 const latestReport=snaps[0]||null;
 const latestPerBook=books.map((b:any)=>latest.get(String(b.id))).filter(Boolean);
 const royaltyRows=latestPerBook.filter((s:any)=>s.royalties_amount!==null&&s.royalties_amount!==undefined&&Number.isFinite(Number(s.royalties_amount)));
 const latestUnits=latestPerBook.reduce((n:number,s:any)=>n+(Number.isFinite(Number(s.units_sold))?Number(s.units_sold):0),0);
 const latestRoyalties=royaltyRows.reduce((n:number,s:any)=>n+Number(s.royalties_amount),0);
 const needsReport=books.filter((b:any)=>{const s=latest.get(String(b.id));const age=s&&Number.isFinite(Date.parse(String(s.observed_at||"")))?Math.floor((now-Date.parse(String(s.observed_at)))/86400000):null;return !s||age===null||age>=30;}).length;
 return {ok:true,section:"books_and_amazon",checked_at:new Date().toISOString(),books_seen:books.length,by_status:byStatus,books:books.map((book:any)=>({...book,latest_report:latest.get(String(book.id))||null})),performance_snapshots:snaps.length,latest_report:latestReport,latest_report_at:latestReport?.observed_at||null,total_units_in_saved_snapshots:latestUnits,total_royalties_in_saved_snapshots:royaltyRows.length?Number(latestRoyalties.toFixed(2)):null,royalty_records_with_amount:royaltyRows.length,latest_per_book_snapshot_count:latestPerBook.length,needs_report_count:needsReport,alerts:[...alerts,...remainingEvents].slice(0,100),direct_kdp_connection:"not_configured",data_note:"لا توجد قراءة مباشرة من KDP. الأرقام تعكس أحدث لقطة محفوظة لكل كتاب؛ العائدات لا تظهر كصفر إلا إذا سجل التقرير صراحةً صفرًا. استخدم تقرير KDP رسميًا أو إدخال المالك؛ لا تُخمن المبيعات أو العوائد."};
}
async function recordBookSnapshot(userId:string,body:any){
 const bookId=clean(body?.book_id,40);if(!/^[0-9a-f-]{36}$/i.test(bookId))throw new Error("اختر كتابًا صالحًا.");
 const owned=await db("zoz_pro_books?id=eq."+encodeURIComponent(bookId)+"&owner_id=eq."+encodeURIComponent(userId)+"&select=id,title&limit=1");
 if(!Array.isArray(owned)||!owned[0])throw new Error("الكتاب غير موجود ضمن سجل مالك ZOZ Pro.");
 const num=(v:any,integer=false)=>{if(v===""||v===null||v===undefined)return null;const n=Number(v);if(!Number.isFinite(n)||(integer&&(!Number.isInteger(n)||n<0)))throw new Error("تحتوي بيانات التقرير على رقم غير صالح.");return n;};
 const start=body?.period_start?String(body.period_start).slice(0,10):null,end=body?.period_end?String(body.period_end).slice(0,10):null;
 if(start&&!/^\\d{4}-\\d{2}-\\d{2}$/.test(start))throw new Error("تاريخ بداية التقرير غير صالح.");
 if(end&&!/^\\d{4}-\\d{2}-\\d{2}$/.test(end))throw new Error("تاريخ نهاية التقرير غير صالح.");
 const units=num(body?.units_sold,true),royalties=num(body?.royalties_amount),pages=num(body?.pages_read,true);
 if(units===null&&royalties===null&&pages===null)throw new Error("أدخل المبيعات أو العوائد أو صفحات القراءة من تقرير موثوق.");
 const reportSource=body?.source==="kdp_report_import"?"kdp_report_import":"owner_entry";
 const fingerprint=reportSource==="kdp_report_import"?clean(body?.file_fingerprint,100):"";
 if(reportSource==="kdp_report_import"&&!fingerprint)throw new Error("بصمة ملف التقرير مطلوبة لمنع الاستيراد المكرر.");
 if(fingerprint){
  const prior=await db("zoz_pro_book_snapshots?owner_id=eq."+encodeURIComponent(userId)+"&book_id=eq."+encodeURIComponent(bookId)+"&source=eq.kdp_report_import&raw_metrics->>file_fingerprint=eq."+encodeURIComponent(fingerprint)+"&select=id&limit=1");
  if(Array.isArray(prior)&&prior[0])return {ok:true,duplicate:true,book_id:bookId,book_title:owned[0].title,snapshot_id:prior[0].id,source:"kdp_report_import",message:"سبق استيراد هذا التقرير لهذا الكتاب؛ لم تتم إضافة صف مكرر."};
 }
 const inserted=await db("zoz_pro_book_snapshots",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({owner_id:userId,book_id:bookId,source:reportSource,period_start:start,period_end:end,units_sold:units,royalties_amount:royalties,royalties_currency:clean(body?.royalties_currency||"USD",8).toUpperCase(),pages_read:pages,orders_count:num(body?.orders_count,true),refunds_count:num(body?.refunds_count,true),ad_spend_amount:num(body?.ad_spend_amount),ad_spend_currency:clean(body?.ad_spend_currency||"USD",8).toUpperCase(),list_price:num(body?.list_price),marketplace:clean(body?.marketplace||"Amazon.com",60),notes:clean(body?.notes,1000),raw_metrics:{entered_by_owner:reportSource!=="kdp_report_import",file_fingerprint:fingerprint||null,source_note:reportSource==="kdp_report_import"?"Imported from a file supplied by owner; authenticity and report scope are not independently verified.":"Entered from owner-provided KDP report; not independently verified."}})});
 await db("zoz_pro_book_agent_events",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({owner_id:userId,book_id:bookId,event_type:"report_recorded",severity:"info",source:"owner",title:"تم تسجيل بيانات تقرير — "+clean(owned[0].title,120),detail:body?.source==="kdp_report_import"?"تم استيراد صف من ملف تقرير قدّمه المالك؛ لم يتم الاتصال المباشر بحساب KDP ولم تُتحقق أصالة الملف تلقائيًا.":"حُفظت البيانات التي أدخلها المالك؛ لم يتم الاتصال المباشر بحساب KDP.",evidence:{snapshot_id:inserted?.[0]?.id||null,period_start:start,period_end:end,source:reportSource},status:"resolved",approval_required:false,resolved_at:new Date().toISOString()})});
 return {ok:true,book_id:bookId,book_title:owned[0].title,snapshot_id:inserted?.[0]?.id||null,source:"owner_entry"};
}


async function updateBookRecord(userId:string,body:any){
 const bookId=clean(body?.book_id,40);
 if(!/^[0-9a-f-]{36}$/i.test(bookId))throw new Error("اختر كتابًا صالحًا.");
 const owned=await db("zoz_pro_books?id=eq."+encodeURIComponent(bookId)+"&owner_id=eq."+encodeURIComponent(userId)+"&select=id,title,author,format,kdp_status,marketplace,asin,price_amount,price_currency,product_url&limit=1");
 if(!Array.isArray(owned)||!owned[0])throw new Error("الكتاب غير موجود ضمن سجل مالك ZOZ Pro.");
 const current=owned[0];
 const formats=["ebook","paperback","hardcover","journal","other","unknown"];
 const statuses=["draft","in_review","published","blocked","unpublished","unknown"];
 const format=clean(body?.format||current.format,30).toLowerCase();
 const status=clean(body?.kdp_status||current.kdp_status,30).toLowerCase();
 if(!formats.includes(format))throw new Error("صيغة الكتاب غير مسموحة.");
 if(!statuses.includes(status))throw new Error("حالة الكتاب غير مسموحة.");
 const priceRaw=body?.price_amount;
 let price:number|null=current.price_amount===null||current.price_amount===undefined?null:Number(current.price_amount);
 if(priceRaw!==""&&priceRaw!==null&&priceRaw!==undefined){price=Number(priceRaw);if(!Number.isFinite(price)||price<0||price>100000)throw new Error("سعر الكتاب غير صالح.");}
 const currency=clean(body?.price_currency||current.price_currency||"USD",3).toUpperCase();
 if(!/^[A-Z]{3}$/.test(currency))throw new Error("رمز العملة غير صالح.");
 const asinRaw=clean(body?.asin,20).toUpperCase();
 const asin=asinRaw||null;
 if(asin&&!/^[A-Z0-9]{10}$/.test(asin))throw new Error("رقم ASIN يجب أن يتكون من 10 أحرف أو أرقام.");
 const productRaw=clean(body?.product_url===undefined?current.product_url:body?.product_url,500);
 let productUrl:string|null=null;
 if(productRaw){
  let parsed:URL;try{parsed=new URL(productRaw);}catch{throw new Error("رابط صفحة المنتج غير صالح.");}
  if(parsed.protocol!=="https:"||! /^(www\.)?amazon\.(com|co\.uk|ca|de|fr|it|es|co\.jp|in|com\.au|com\.mx|com\.br|nl|se|pl|sg|ae|sa|eg)$/i.test(parsed.hostname))throw new Error("استخدم رابطًا آمنًا من نطاق أمازون الرسمي.");
  productUrl=parsed.toString();
 }
 const author=clean(body?.author||current.author,160);
 if(!author)throw new Error("اسم المؤلف مطلوب.");
 const updated=await db("zoz_pro_books?id=eq."+encodeURIComponent(bookId)+"&owner_id=eq."+encodeURIComponent(userId)+"&select=id,title,author,format,marketplace,asin,kdp_status,price_amount,price_currency,product_url,status_source,last_verified_at,updated_at",{method:"PATCH",headers:{prefer:"return=representation"},body:JSON.stringify({author,format,marketplace:clean(body?.marketplace||current.marketplace||"Amazon.com",60),asin,kdp_status:status,price_amount:price,price_currency:currency,product_url:productUrl,updated_at:new Date().toISOString()})});
 if(!Array.isArray(updated)||!updated[0])throw new Error("لم يؤكدَ النظام حفظ تعديل سجل الكتاب.");
 await db("zoz_pro_book_agent_events",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({owner_id:userId,book_id:bookId,event_type:"book_metadata_updated",severity:"info",source:"owner",title:"تم تحديث سجل بيانات — "+clean(updated[0].title,120),detail:"تم تحديث بيانات السجل الداخلي في ZOZ Pro من قبل المالك. لم يتم تغيير أي إعداد داخل حساب KDP نفسه.",evidence:{fields:["author","format","marketplace","asin","kdp_status","price_amount","price_currency","product_url"],source:"owner_control_panel"},status:"resolved",approval_required:false,resolved_at:new Date().toISOString()})});
 return {ok:true,book:updated[0],note:"تم تحديث سجل ZOZ Pro فقط؛ لم يتم تعديل صفحة الكتاب أو سعره داخل Amazon KDP."};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (!SUPABASE_URL || !SERVICE_KEY) return fail("Supabase server configuration unavailable.", 503);
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("health") === "1") {
    return json({
      ok: true, service: "zoz-pro-agent", environment: "production",
      owner_auth_enabled: Boolean(PUBLISHABLE_KEY && OWNER_EMAIL),
      model_key_count: [...new Set(GEMINI_KEYS)].length,
      actions: ["analyze", "evaluate_latest_video", "create_draft", "run_management_cycle", "autonomous_run", "books_monitor", "record_book_snapshot", "update_book_record", "dispatch_flow_prompt"], automatic_worker_enabled: true, automatic_worker_schedule: "every 15 minutes via Supabase Cron", available_tools: ["managed_channel_sync","managed_channel_calendar_generate","studio_generate","intake_check_processing","intake_list","intake_review(approve only via owner-approved task)","intake_start_youtube","intake_youtube_part","system_diagnostics","books_monitor","record_book_snapshot","update_book_record","android.flow_prompt_dispatch","android.device_status"], tool_planner_enabled: true, automatic_queue_enabled: true, automatic_execution: "scheduled, allow-listed tools", automatic_publication: false, books_and_amazon_monitoring: true, direct_kdp_connection: false, durable_memory_enabled: true, notion_worker_sync: Boolean(Deno.env.get("NOTION_API_KEY")), notion_data_source_id_configured: Boolean(Deno.env.get("NOTION_ARCHIVE_DATA_SOURCE_ID") || "93d9d04a-dd49-4fb9-8d84-61324cf4cf24")
    });
  }
  if (req.method !== "POST") return fail("Method not supported.", 405);
  const body = await req.clone().json().catch(() => ({}));
  const action = clean(body?.action, 50);
  if (action === "autonomous_run") {
    const scheduledUser = await scheduledOwner(req);
    if (!scheduledUser) return fail("الطلب الآلي غير مصادق عليه.", 401);
    return await autonomousRun(req, scheduledUser, body);
  }
  const user = await owner(req);
  if (!user) return fail("يلزم تسجيل الدخول بحساب مالك ZOZ Pro المؤكد في مشروع الإنتاج.", 401);
  try {
    if (action === "analyze") return await analyze(req, user, body);
    if (action === "evaluate_latest_video") return await evaluateLatestVideo(req, user, body);
    if (action === "create_draft") return await createDraft(req, user, body);
    if (action === "run_management_cycle") return await runManagementCycle(req, user, body);
    if (action === "books_monitor") return json(await monitorBooks(user.id));
    if (action === "record_book_snapshot") return json(await recordBookSnapshot(user.id, body));
    if (action === "update_book_record") return json(await updateBookRecord(user.id, body));
    if (action === "dispatch_flow_prompt") return await dispatchFlowPrompt(user, body);
    return fail("إجراء غير مدعوم. استخدم analyze أو evaluate_latest_video أو create_draft أو run_management_cycle أو books_monitor أو record_book_snapshot أو update_book_record أو dispatch_flow_prompt.", 400);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "تعذر تنفيذ الوكيل.", 502);
  }
});