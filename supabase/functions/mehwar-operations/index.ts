import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}
function clean(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function fail(code: string, status = 400, message?: string) {
  return reply({ ok: false, error: code, ...(message ? { message } : {}) }, status);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getMembership(db: ReturnType<typeof createClient>, userId: string, companyId: string) {
  if (!UUID.test(companyId)) return null;
  const { data, error } = await db.from("mehwar_memberships")
    .select("company_id,user_id,role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
async function requireCompany(db: ReturnType<typeof createClient>, userId: string, companyId: string, manager = false) {
  const membership = await getMembership(db, userId, companyId);
  if (!membership) throw Object.assign(new Error("company_access_denied"), { status: 403 });
  if (manager && !["owner", "admin", "manager"].includes(membership.role)) {
    throw Object.assign(new Error("manager_permission_required"), { status: 403 });
  }
  return membership;
}
function result(data: unknown, extra: Record<string, unknown> = {}) {
  return reply({ ok: true, data, ...extra });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("method_not_allowed", 405);

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token || token === authorization) return fail("authentication_required", 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  if (!url || !key) return fail("server_not_configured", 503);

  const db = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await db.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user?.id || !user.email_confirmed_at) return fail("invalid_or_unconfirmed_session", 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (!body || Array.isArray(body) || typeof body !== "object") return fail("invalid_json_body", 400);
  } catch {
    return fail("invalid_json_body", 400);
  }

  const action = clean(body.action, 80);
  const companyId = clean(body.company_id, 80);

  try {
    switch (action) {
      case "bootstrap": {
        const [profile, memberships, services] = await Promise.all([
          db.from("mehwar_profiles").select("user_id,full_name,phone,job_title").eq("user_id", user.id).maybeSingle(),
          db.from("mehwar_memberships").select("company_id,role,created_at,company:mehwar_companies(id,name,slug,status,sector,size_band,country_code,currency_code,timezone)").eq("user_id", user.id).order("created_at", { ascending: true }),
          db.from("mehwar_services").select("id,code,name_ar,description_ar").eq("active", true).order("name_ar"),
        ]);
        for (const x of [profile, memberships, services]) if (x.error) throw x.error;
        return result({
          user: { id: user.id, email: user.email },
          profile: profile.data,
          memberships: memberships.data ?? [],
          services: services.data ?? [],
        });
      }

      case "create_company": {
        const name = clean(body.name, 160);
        const slug = clean(body.slug, 63).toLowerCase();
        if (name.length < 2 || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) return fail("invalid_company_name_or_slug", 422);
        const { data, error } = await db.rpc("mehwar_create_company", { p_name: name, p_slug: slug });
        if (error) throw error;
        return result({ company_id: data, created: true }, {},);
      }

      case "list_services": {
        const { data, error } = await db.from("mehwar_services")
          .select("id,code,name_ar,description_ar")
          .eq("active", true).order("name_ar");
        if (error) throw error;
        return result(data ?? []);
      }

      case "dashboard": {
        await requireCompany(db, user.id, companyId);
        const [requests, tasks, openRequests, activeTasks, recentRequests, recentTasks, usage] = await Promise.all([
          db.from("mehwar_requests").select("id", { count: "exact", head: true }).eq("company_id", companyId),
          db.from("mehwar_tasks").select("id", { count: "exact", head: true }).eq("company_id", companyId),
          db.from("mehwar_requests").select("id", { count: "exact", head: true }).eq("company_id", companyId).not("status", "in", '("completed","rejected","cancelled")'),
          db.from("mehwar_tasks").select("id", { count: "exact", head: true }).eq("company_id", companyId).not("status", "eq", "done"),
          db.from("mehwar_requests").select("id,title,status,priority,created_at,due_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(6),
          db.from("mehwar_tasks").select("id,title,status,due_at,request_id").eq("company_id", companyId).order("created_at", { ascending: false }).limit(6),
          db.rpc("mehwar_get_usage", { p_company_id: companyId }),
        ]);
        for (const x of [requests,tasks,openRequests,activeTasks,recentRequests,recentTasks,usage]) if (x.error) throw x.error;
        return result({
          metrics: {
            total_requests: requests.count ?? 0,
            total_tasks: tasks.count ?? 0,
            open_requests: openRequests.count ?? 0,
            unfinished_tasks: activeTasks.count ?? 0,
          },
          recent_requests: recentRequests.data ?? [],
          recent_tasks: recentTasks.data ?? [],
          usage: usage.data ?? [],
        });
      }

      case "list_requests": {
        await requireCompany(db, user.id, companyId);
        const limit = Math.max(1, Math.min(100, Number(body.limit) || 50));
        let query = db.from("mehwar_requests")
          .select("id,service_id,created_by,title,description,status,priority,due_at,created_at,updated_at,service:mehwar_services(id,code,name_ar)")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }).limit(limit);
        const status = clean(body.status, 30);
        if (status) query = query.eq("status", status);
        const { data, error } = await query;
        if (error) throw error;
        return result(data ?? []);
      }

      case "get_request": {
        const requestId = clean(body.request_id, 80);
        if (!UUID.test(requestId)) return fail("invalid_request_id", 422);
        await requireCompany(db, user.id, companyId);
        const [request, tasks, deliverables, files] = await Promise.all([
          db.from("mehwar_requests").select("*").eq("company_id", companyId).eq("id", requestId).maybeSingle(),
          db.from("mehwar_tasks").select("id,title,description,status,assigned_to,due_at,created_at").eq("company_id", companyId).eq("request_id", requestId).order("created_at"),
          db.from("mehwar_deliverables").select("id,title,storage_path,uploaded_by,approved_at,created_at").eq("company_id", companyId).eq("request_id", requestId).order("created_at", { ascending: false }),
          db.from("mehwar_request_files").select("id,file_name,content_type,file_size,uploaded_by,storage_path,created_at").eq("company_id", companyId).eq("request_id", requestId).order("created_at", { ascending: false }),
        ]);
        for (const x of [request,tasks,deliverables,files]) if (x.error) throw x.error;
        if (!request.data) return fail("request_not_found", 404);
        return result({ request: request.data, tasks: tasks.data ?? [], deliverables: deliverables.data ?? [], files: files.data ?? [] });
      }

      case "create_request": {
        await requireCompany(db, user.id, companyId);
        const title = clean(body.title, 200);
        const description = clean(body.description, 8000);
        const serviceId = body.service_id == null || body.service_id === "" ? null : clean(body.service_id, 80);
        const priority = clean(body.priority, 20) || "normal";
        const allowed = ["low", "normal", "high", "urgent"];
        if (title.length < 3 || !allowed.includes(priority)) return fail("invalid_request_fields", 422);
        if (serviceId && !UUID.test(serviceId)) return fail("invalid_service_id", 422);
        const { data, error } = await db.from("mehwar_requests").insert({
          company_id: companyId, service_id: serviceId, created_by: user.id,
          title, description: description || null, status: "submitted", priority,
          due_at: clean(body.due_at, 80) || null,
        }).select("id,company_id,service_id,title,description,status,priority,due_at,created_at").single();
        if (error) throw error;
        return result(data, { created: true });
      }

      case "update_request_status": {
        await requireCompany(db, user.id, companyId, true);
        const requestId = clean(body.request_id, 80);
        const status = clean(body.status, 30);
        const allowed = ["review", "in_progress", "waiting_customer", "completed", "rejected", "cancelled"];
        if (!UUID.test(requestId) || !allowed.includes(status)) return fail("invalid_request_status_update", 422);
        const { data, error } = await db.from("mehwar_requests").update({ status, updated_at: new Date().toISOString() })
          .eq("company_id", companyId).eq("id", requestId)
          .select("id,title,status,updated_at").maybeSingle();
        if (error) throw error;
        if (!data) return fail("request_not_found_or_not_allowed", 404);
        return result(data, { updated: true });
      }

      case "list_tasks": {
        await requireCompany(db, user.id, companyId);
        const limit = Math.max(1, Math.min(100, Number(body.limit) || 100));
        const { data, error } = await db.from("mehwar_tasks")
          .select("id,request_id,title,description,assigned_to,status,due_at,created_at,updated_at")
          .eq("company_id", companyId).order("created_at", { ascending: false }).limit(limit);
        if (error) throw error;
        return result(data ?? []);
      }

      case "create_task": {
        await requireCompany(db, user.id, companyId, true);
        const title = clean(body.title, 200);
        const requestId = body.request_id ? clean(body.request_id, 80) : null;
        const assignedTo = body.assigned_to ? clean(body.assigned_to, 80) : null;
        if (title.length < 2 || (requestId && !UUID.test(requestId)) || (assignedTo && !UUID.test(assignedTo))) return fail("invalid_task_fields", 422);
        const { data, error } = await db.from("mehwar_tasks").insert({
          company_id: companyId, request_id: requestId, title,
          description: clean(body.description, 8000) || null,
          assigned_to: assignedTo, status: "todo",
          due_at: clean(body.due_at, 80) || null,
        }).select("id,request_id,title,description,assigned_to,status,due_at,created_at").single();
        if (error) throw error;
        return result(data, { created: true });
      }

      case "update_task_status": {
        await requireCompany(db, user.id, companyId, true);
        const taskId = clean(body.task_id, 80);
        const status = clean(body.status, 20);
        if (!UUID.test(taskId) || !["todo","in_progress","blocked","review","done"].includes(status)) return fail("invalid_task_status_update", 422);
        const { data, error } = await db.from("mehwar_tasks").update({ status, updated_at: new Date().toISOString() })
          .eq("company_id", companyId).eq("id", taskId)
          .select("id,title,status,updated_at").maybeSingle();
        if (error) throw error;
        if (!data) return fail("task_not_found_or_not_allowed", 404);
        return result(data, { updated: true });
      }

      case "list_deliverables": {
        await requireCompany(db, user.id, companyId);
        const { data, error } = await db.from("mehwar_deliverables")
          .select("id,request_id,title,storage_path,uploaded_by,approved_at,created_at")
          .eq("company_id", companyId).order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        return result(data ?? [], { download_links_enabled: false, note: "Private Storage bucket and signed-link access must be verified before file downloads are enabled." });
      }

      case "list_notifications": {
        await requireCompany(db, user.id, companyId);
        const { data, error } = await db.from("mehwar_notifications")
          .select("id,title,body,read_at,created_at")
          .eq("company_id", companyId).eq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        return result(data ?? []);
      }

      case "mark_notification_read": {
        await requireCompany(db, user.id, companyId);
        const notificationId = clean(body.notification_id, 80);
        if (!UUID.test(notificationId)) return fail("invalid_notification_id", 422);
        const { data, error } = await db.from("mehwar_notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", notificationId).eq("company_id", companyId).eq("user_id", user.id)
          .select("id,read_at").maybeSingle();
        if (error) throw error;
        if (!data) return fail("notification_not_found", 404);
        return result(data, { updated: true });
      }

      case "list_support_tickets": {
        await requireCompany(db, user.id, companyId);
        const { data, error } = await db.from("mehwar_support_tickets")
          .select("id,created_by,subject,message,status,created_at,updated_at")
          .eq("company_id", companyId).order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        return result(data ?? []);
      }

      case "create_support_ticket": {
        await requireCompany(db, user.id, companyId);
        const subject = clean(body.subject, 200);
        const message = clean(body.message, 8000);
        if (subject.length < 4 || message.length < 8) return fail("invalid_support_ticket", 422);
        const { data, error } = await db.from("mehwar_support_tickets").insert({
          company_id: companyId, created_by: user.id, subject, message, status: "open",
        }).select("id,subject,message,status,created_at").single();
        if (error) throw error;
        return result(data, { created: true });
      }

      case "update_support_ticket_status": {
        await requireCompany(db, user.id, companyId, true);
        const ticketId = clean(body.ticket_id, 80);
        const status = clean(body.status, 20);
        if (!UUID.test(ticketId) || !["in_progress","answered","closed","open"].includes(status)) return fail("invalid_ticket_status_update", 422);
        const { data, error } = await db.from("mehwar_support_tickets").update({ status, updated_at: new Date().toISOString() })
          .eq("id", ticketId).eq("company_id", companyId)
          .select("id,subject,status,updated_at").maybeSingle();
        if (error) throw error;
        if (!data) return fail("ticket_not_found_or_not_allowed", 404);
        return result(data, { updated: true });
      }

      case "get_usage": {
        await requireCompany(db, user.id, companyId);
        const { data, error } = await db.rpc("mehwar_get_usage", { p_company_id: companyId });
        if (error) throw error;
        return result(data ?? []);
      }

      case "update_profile": {
        const fullName = clean(body.full_name, 160);
        const phone = clean(body.phone, 40);
        const jobTitle = clean(body.job_title, 120);
        if (fullName.length < 2) return fail("invalid_profile_name", 422);
        const { data, error } = await db.from("mehwar_profiles").upsert({
          user_id: user.id, full_name: fullName, phone: phone || null,
          job_title: jobTitle || null, updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" }).select("user_id,full_name,phone,job_title,updated_at").single();
        if (error) throw error;
        return result(data, { updated: true });
      }

      case "update_company": {
        await requireCompany(db, user.id, companyId, true);
        const name = clean(body.name, 160);
        const sector = clean(body.sector, 160);
        const sizeBand = clean(body.size_band, 40);
        if (name.length < 2) return fail("invalid_company_name", 422);
        const { data, error } = await db.from("mehwar_companies").update({
          name, sector: sector || null, size_band: sizeBand || null,
          updated_at: new Date().toISOString(),
        }).eq("id", companyId).select("id,name,sector,size_band,updated_at").maybeSingle();
        if (error) throw error;
        if (!data) return fail("company_not_found_or_not_allowed", 404);
        return result(data, { updated: true });
      }

      default:
        return fail("unsupported_action", 404);
    }
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 400;
    const message = error instanceof Error ? error.message : "operation_failed";
    const safe = new Set([
      "company_access_denied", "manager_permission_required",
      "Invalid company name", "Invalid company slug", "Authentication required",
      "This person is already a company member",
    ]);
    return fail(safe.has(message) ? message.toLowerCase().replaceAll(" ", "_") : "operation_failed", status);
  }
});
