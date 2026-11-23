import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://hazemnaw48-coder.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ ok: false, error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token === authHeader) return reply({ ok: false, error: "Sign in required" }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !anon || !service) return reply({ ok: false, error: "Factory server configuration is incomplete" }, 503);

  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await userClient.auth.getUser(token);
  const user = data?.user;
  if (error || !user || (user.email ?? "").toLowerCase() !== "hazemnaw48@gmail.com" || !user.email_confirmed_at) {
    return reply({ ok: false, error: "Only the confirmed ZOZ owner can register app projects" }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ ok: false, error: "Invalid JSON body" }, 400); }

  const name = clean(body.display_name, 100);
  const platform = clean(body.platform, 20);
  const purpose = clean(body.purpose, 1200);
  const audience = clean(body.audience, 500);
  const features = clean(body.features, 4000);
  const design = clean(body.design, 1000);
  const integrations = clean(body.integrations, 1200);
  const dataNotes = clean(body.data_notes, 1200);
  const packageName = clean(body.package_name, 180);
  if (name.length < 3 || purpose.length < 20) return reply({ ok: false, error: "اكتب اسم التطبيق ووصف المشكلة والهدف بتفصيل كافٍ." }, 422);
  if (!["android", "web", "android_web", "ios", "cross_platform", "desktop"].includes(platform)) return reply({ ok: false, error: "نوع المنصة غير مدعوم في هذا المسار." }, 422);
  if (packageName && !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,5}$/.test(packageName)) return reply({ ok: false, error: "معرّف الحزمة Android غير صالح." }, 422);

  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 34) || "app";
  const projectKey = `request-${slug}-${Date.now().toString(36)}`;
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: project, error: insertError } = await admin.from("zoz_pro_android_app_projects").insert({
    owner_id: user.id,
    project_key: projectKey,
    display_name: name,
    package_name: packageName || null,
    purpose,
    repository: "hazemnaw48-coder/zoz-pro-ai",
    branch: "main",
    lifecycle_status: "specified",
    current_version: null,
    metadata: {
      request_type: "owner_app_factory_request",
      platform,
      audience,
      requested_features: features,
      visual_direction: design,
      integrations,
      data_security_notes: dataNotes,
      created_by: "android-app-factory",
      delivery_status: "requirements_registered_not_built",
      acceptance_gates: ["requirements_review", "architecture", "security", "implementation", "automated_tests", "device_acceptance", "owner_release_approval"]
    }
  }).select("id,project_key,display_name,lifecycle_status,created_at").single();

  if (insertError || !project) return reply({ ok: false, error: "تعذر تسجيل طلب التطبيق.", detail: insertError?.message ?? null }, 500);

  // Register every accepted factory product in the central ZOZ managed-app control plane.
  const appKey = project.project_key.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 80);
  const normalizedPlatform = platform === "android_web" || platform === "cross_platform" ? "multi" :
    (["android", "web", "ios", "desktop"].includes(platform) ? platform : "multi");
  const { data: managedApp, error: managedAppError } = await admin
    .from("zoz_pro_managed_apps")
    .upsert({
      owner_id: user.id,
      app_key: appKey,
      display_name: name,
      platform: normalizedPlatform,
      package_name: packageName || null,
      adapter_key: "factory-generated-v1",
      lifecycle_status: "development",
      control_enabled: true,
      autonomy_mode: "guarded",
      metadata: {
        source_project_id: project.id,
        project_key: project.project_key,
        customer_app: true,
        control_plane: "zoz-pro",
        runtime_vendor_credit_dependency: false,
        factory_acceptance_required: true
      }
    }, { onConflict: "owner_id,app_key" })
    .select("id,app_key,lifecycle_status")
    .single();
  if (managedAppError || !managedApp) {
    await admin.from("zoz_pro_android_app_projects").update({
      metadata: {
        request_type: "owner_app_factory_request", platform, audience, requested_features: features,
        visual_direction: design, integrations, data_security_notes: dataNotes,
        created_by: "android-app-factory", delivery_status: "managed_control_registration_failed",
        managed_control_error: managedAppError?.message ?? "No managed app row returned"
      },
      updated_at: new Date().toISOString()
    }).eq("id", project.id);
    return reply({ ok: false, project, error: "تم تسجيل المشروع لكن تعذر تسجيله في مركز تحكم ZOZ؛ أوقف المصنع الإكمال حتى إصلاح الربط.", detail: managedAppError?.message ?? null }, 503);
  }

  const defaultCapabilities = [
    { capability_key: "app.health.read", display_name: "قراءة صحة التطبيق", description: "حالة الخدمة والاتصال والإصدار دون بيانات عملاء", risk_level: "read_only", approval_required: false, constraints_json: { data_scope: "platform_metadata" } },
    { capability_key: "app.release.read", display_name: "قراءة حالة الإصدارات", description: "حالة البناء والنشر والإصدار", risk_level: "read_only", approval_required: false, constraints_json: { data_scope: "release_metadata" } },
    { capability_key: "app.metrics.aggregate.read", display_name: "قراءة المؤشرات المجمعة", description: "مؤشرات تشغيل مجمعة لا تكشف سجلات العملاء", risk_level: "read_only", approval_required: false, constraints_json: { data_scope: "aggregate_only", exclude_personal_data: true } },
    { capability_key: "app.support.issue.create", display_name: "تسجيل بلاغ دعم", description: "تسجيل بلاغ تقني داخلي", risk_level: "internal_write", approval_required: false, constraints_json: { data_scope: "support_metadata" } }
  ];
  const { error: capabilityError } = await admin.from("zoz_pro_managed_app_capabilities").upsert(
    defaultCapabilities.map(cap => ({
      owner_id: user.id, app_id: managedApp.id, ...cap, enabled: true,
      input_schema: {}
    })),
    { onConflict: "app_id,capability_key" }
  );
  if (capabilityError) {
    await admin.from("zoz_pro_android_app_projects").update({
      metadata: { delivery_status: "managed_capability_registration_failed", managed_app_id: managedApp.id, managed_control_error: capabilityError.message },
      updated_at: new Date().toISOString()
    }).eq("id", project.id);
    return reply({ ok: false, project, managed_app: managedApp, error: "تم تسجيل التطبيق لكن تعذر تسجيل قدراته الإدارية.", detail: capabilityError.message }, 503);
  }

  const { data: department, error: departmentError } = await admin
    .from("zoz_pro_company_departments").select("id").eq("department_key", "app_factory").single();
  const { data: agent, error: agentError } = await admin
    .from("zoz_pro_company_agents").select("id").eq("agent_key", "app_factory_engineer").eq("status", "active").single();
  if (departmentError || agentError || !department || !agent) {
    await admin.from("zoz_pro_android_app_projects").update({
      metadata: {
        request_type: "owner_app_factory_request", platform, audience, requested_features: features,
        visual_direction: design, integrations, data_security_notes: dataNotes,
        created_by: "android-app-factory", delivery_status: "registered_but_task_enqueue_failed",
        task_enqueue_error: "Application Factory department or agent is not active"
      }
    }).eq("id", project.id);
    return reply({ ok: false, project, error: "تم حفظ المشروع لكن تعذر إدخاله إلى طابور التنفيذ؛ راجع إعدادات قسم المصنع." }, 503);
  }

  const taskObjective = [
    "أنت مدير مصنع التطبيقات في ZOZ Pro. حوّل طلب العميل الداخلي إلى حزمة مواصفات وتنفيذ قابلة للقياس.",
    "اسم التطبيق: " + name,
    "المنصة: " + platform,
    "الجمهور: " + audience,
    "المشكلة والهدف: " + purpose,
    "الوظائف المطلوبة: " + features,
    "الرؤية البصرية: " + design,
    "التكاملات: " + integrations,
    "البيانات والخصوصية: " + dataNotes,
    "معرّف المشروع: " + project.project_key,
    "أنتج: تعريف المشكلة، المستخدمين، قصص الاستخدام، خريطة الشاشات، نموذج البيانات، معمارية النظام، RLS/الأمان، التكاملات، معايير القبول، خطة التنفيذ المرحلية، مصفوفة الاختبار، اختبار Android فعلي، خطة النشر، وتكلفة التشغيل على الأدوات المجانية فقط.",
    "أنشئ handoffs محددة إلى software وoperations وsales_marketing مع مخرجات قابلة للتحقق. لا تدّعِ أن الكود كُتب أو APK بُني أو نُشر أو ثُبّت أو أن عميلًا تواصلنا معه أو تحققت إيرادات دون دليل.",
    "لا تراسل عملاء، لا تنشر، لا تنفق، ولا تقبل التزامات أو تغيّر صلاحيات أو بيانات إنتاج. لا تكرر مشروعًا أو مخرجًا موجودًا."
  ].join("\\n\\n");
  const { data: task, error: taskError } = await admin.from("zoz_pro_company_tasks").insert({
    owner_id: user.id, department_id: department.id, assigned_agent_id: agent.id,
    title: "إعداد مواصفات وخطة تنفيذ تطبيق: " + name,
    objective: taskObjective,
    input: {
      task_type: "app_factory_intake", project_id: project.id, project_key: project.project_key,
      platform, audience, features, design, integrations, data_notes,
      owner_authorized_internal_work: true, external_actions_authorized: false,
      acceptance_gates: ["requirements_review","architecture","security","implementation","automated_tests","device_acceptance","owner_release_approval"]
    },
    expected_output: "مواصفات تطبيق كاملة، معمارية، خطة تنفيذ، معايير قبول، ومهام متخصصة مسندة للأقسام.",
    status: "queued", priority: 2, cost_limit: 0, approval_required: false
  }).select("id,title,status,assigned_agent_id").single();

  if (taskError || !task) {
    await admin.from("zoz_pro_android_app_projects").update({
      metadata: {
        request_type: "owner_app_factory_request", platform, audience, requested_features: features,
        visual_direction: design, integrations, data_security_notes: dataNotes,
        created_by: "android-app-factory", delivery_status: "registered_but_task_enqueue_failed",
        task_enqueue_error: taskError?.message ?? "Task was not returned"
      }
    }).eq("id", project.id);
    return reply({ ok: false, project, error: "تم حفظ المشروع لكن تعذر إنشاء مهمة التنفيذ.", detail: taskError?.message ?? null }, 500);
  }

  await admin.from("zoz_pro_android_app_projects").update({
    metadata: {
      request_type: "owner_app_factory_request", platform, audience, requested_features: features,
      visual_direction: design, integrations, data_security_notes: dataNotes,
      created_by: "android-app-factory", delivery_status: "specification_task_queued",
      company_task_id: task.id, acceptance_gates: ["requirements_review","architecture","security","implementation","automated_tests","device_acceptance","owner_release_approval"]
    },
    updated_at: new Date().toISOString()
  }).eq("id", project.id);

  return reply({
    ok: true, project, task,
    message: "تم تسجيل التطبيق وإنشاء مهمة تلقائية في طابور مصنع التطبيقات. يبدأ الوكيل بإعداد المواصفات والخطة؛ البناء الفعلي يمر ببوابات التطوير والاختبار والقبول."
  }, 201);
});
