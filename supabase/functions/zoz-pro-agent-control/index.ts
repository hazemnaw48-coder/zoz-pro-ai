import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL_VALUE = Deno.env.get("SUPABASE_URL") || "";
const OWNER_EMAIL = Deno.env.get("ZOZ_OWNER_EMAIL") || "";
function defaultKey(name: string): string {
  try { const v = JSON.parse(Deno.env.get(name) || "{}"); return typeof v?.default === "string" ? v.default : ""; }
  catch { return ""; }
}
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || defaultKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const PUBLIC_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || defaultKey("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
const GEMINI_KEYS = ["GEMINI_API_KEY","GEMINI_API_KEY_ZOZ_NOW","GEMINI_API_KEY_ZOZ_MANAGER","GEMINI_API_KEY_ZOZ_HAZEM"].filter(k => Boolean(Deno.env.get(k)));
const tools = [
  {id:"youtube.channel_sync",adapter:"zoz-pro-agent:sync_channel",risk:"internal_write",approval:false,automatic:true,enabled:true,scope:["youtube.analytics.read","zoz_pro.snapshots.write"],description:"مزامنة تحليلات القناة وحفظ لقطة داخلية."},
  {id:"youtube.processing_check",adapter:"zoz-pro-agent:check_video_processing",risk:"external_read_internal_write",approval:false,automatic:true,enabled:true,scope:["youtube.processing.read","zoz_pro.intake.write"],description:"مراجعة معالجة الفيديو وتحديث سجل الاستقبال."},
  {id:"youtube.intake_inspect",adapter:"zoz-pro-agent:inspect_intake",risk:"read_only",approval:false,automatic:true,enabled:true,scope:["zoz_pro.intake.read"],description:"فحص قائمة الفيديوهات المستقبلة."},
  {id:"content.calendar_generate",adapter:"zoz-pro-agent:generate_calendar",risk:"internal_write",approval:false,automatic:true,enabled:true,scope:["zoz_pro.calendar.write"],description:"إنشاء تقويم محتوى داخلي."},
  {id:"content.draft_create",adapter:"zoz-pro-agent:create_draft",risk:"internal_write",approval:false,automatic:true,enabled:true,scope:["zoz_pro.scripts.write"],description:"إنشاء مسودة للمراجعة دون نشر."},
  {id:"system.diagnostics",adapter:"zoz-pro-agent:system_diagnostics",risk:"read_only",approval:false,automatic:true,enabled:true,scope:["zoz_pro.system.read"],description:"تشخيص قراءة فقط لأقسام النظام."},
  {id:"books.monitor",adapter:"zoz-pro-agent:books_monitor",risk:"read_only",approval:false,automatic:true,enabled:true,scope:["zoz_pro.books.read"],description:"مراقبة بيانات الكتب والتقارير المدخلة، دون اتصال مباشر بـ KDP."},
  {id:"youtube.private_upload",adapter:"zoz-pro-agent:approve_video_for_private_upload + upload_private_video",risk:"external_upload",approval:true,automatic:false,enabled:true,scope:["youtube.video.upload.private"],description:"رفع خاص فقط بعد موافقة صريحة محفوظة من المالك."},
  {id:"android.device_status",adapter:"zoz-pro-agent-control:android_device_status",risk:"read_only",approval:false,automatic:true,enabled:true,scope:["android.device.read"],description:"قراءة حالة أجهزة Android المقرونة وآخر اتصال وطابور المهام."},
  {id:"apps.factory_portfolio",adapter:"zoz-pro-agent-control:app_factory_overview",risk:"read_only",approval:false,automatic:true,enabled:true,scope:["android.apps.read"],description:"قراءة محفظة التطبيقات وإصدارات APK وسجلات البناء الفعلية."},
  {id:"android.flow_prompt_dispatch",adapter:"zoz-pro-agent:dispatch_flow_prompt",risk:"internal_write",approval:false,automatic:true,enabled:true,scope:["android.device.dispatch_flow_prompt"],description:"إرسال مطالبة مشهد إلى هاتف المالك لنسخها وفتح Flow بلمسة ظاهرة."},
  {id:"youtube.public_publish",adapter:"zoz-pro-agent:publish_public_video",risk:"high_impact_external",approval:true,automatic:true,enabled:true,scope:["youtube.video.publish.public"],description:"ينشر فيديو تمت مراجعته فقط بعد موافقة مالك صريحة محفوظة في مهمة مستقلة."},
  {id:"youtube.privacy_edit",adapter:null,risk:"high_impact_external",approval:true,automatic:false,enabled:false,scope:["youtube.video.privacy.write"],description:"تغيير الخصوصية معطّل."},
  {id:"youtube.metadata_edit",adapter:null,risk:"high_impact_external",approval:true,automatic:false,enabled:false,scope:["youtube.video.metadata.write"],description:"تعديل بيانات الفيديو معطّل."},
  {id:"storage.delete",adapter:null,risk:"destructive",approval:true,automatic:false,enabled:false,scope:["storage.objects.delete"],description:"حذف الملفات معطّل."},
  {id:"amazon.kdp",adapter:null,risk:"external_account",approval:true,automatic:false,enabled:false,scope:["kdp.account.read"],description:"الاتصال المباشر بـ KDP غير مهيأ."},
  {id:"canva.design",adapter:null,risk:"external_connector",approval:false,automatic:false,enabled:false,scope:["canva.design"],description:"Canva غير موصول كأداة خادم لهذا الوكيل."},
  {id:"make.automation",adapter:null,risk:"external_connector",approval:false,automatic:false,enabled:false,scope:["make.scenario.run"],description:"Make غير موصول كأداة خادم لهذا الوكيل."},
  {id:"runway.media",adapter:null,risk:"external_connector",approval:true,automatic:false,enabled:false,scope:["runway.media.generate"],description:"Runway غير موصول كأداة خادم لهذا الوكيل."}
];
const headers = () => ({apikey:SERVICE_KEY,authorization:SERVICE_KEY.startsWith("sb_secret_") ? "" : "Bearer "+SERVICE_KEY,"content-type":"application/json"});
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, content-type","access-control-allow-methods":"GET, POST, OPTIONS"}});}
async function db(path:string){const h:any=headers();if(!h.authorization)delete h.authorization;const r=await fetch(SUPABASE_URL_VALUE+"/rest/v1/"+path,{headers:h,signal:AbortSignal.timeout(12000)});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error("Database request failed ("+r.status+").");return d;}
async function authenticate(req:Request){
 const auth=req.headers.get("authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(auth)||!PUBLIC_KEY) return null;
 const r=await fetch(SUPABASE_URL_VALUE+"/auth/v1/user",{headers:{apikey:PUBLIC_KEY,authorization:auth},signal:AbortSignal.timeout(10000)});
 if(!r.ok)return null;const u=await r.json().catch(()=>null);
 if(String(u?.email||"").toLowerCase()!==OWNER_EMAIL||!u?.email_confirmed_at||!/^[0-9a-f-]{36}$/i.test(String(u?.id||"")))return null;
 return u;
}
async function overview(ownerId:string,preflight=false){
 const f="owner_id=eq."+encodeURIComponent(ownerId);
 const [channels,credentials,assets,scripts,tasks,runs,books,memory,devices,deviceJobs,appProjects,appBuilds]=await Promise.all([
  db("zoz_pro_managed_channels?"+f+"&is_active=eq.true&select=channel_id,display_name,channel_title,niche,connection_status,last_synced_at"),
  db("zoz_pro_managed_channel_credentials?"+f+"&select=channel_id,status,token_expires_at,updated_at"),
  db("zoz_pro_video_intake_assets?"+f+"&select=id,status,channel_id,updated_at&order=updated_at.desc&limit=250"),
  db("zoz_pro_content_scripts?"+f+"&select=id,status,channel_id&order=created_at.desc&limit=250"),
  db("zoz_pro_agent_work_items?"+f+"&select=id,title,kind,status,priority,approval_required,created_at,updated_at&order=updated_at.desc&limit=250"),
  db("zoz_pro_automation_runs?workflow=eq.zoz_pro_agent_autonomous_worker&details->>owner_id=eq." + encodeURIComponent(ownerId) + "&select=id,status,started_at,finished_at,details&order=started_at.desc&limit=8"),
  db("zoz_pro_books?"+f+"&select=id,title,kdp_status,format,updated_at&order=updated_at.desc&limit=100"),
  db("zoz_pro_agent_memory?"+f+"&memory_key=eq.primary_checkpoint&status=eq.active&select=content,updated_at,notion_sync_status,notion_page_id&order=updated_at.desc&limit=1"),
  db("zoz_pro_device_registry?"+f+"&select=id,device_name,device_status,app_version,last_heartbeat_at,capabilities&order=created_at.desc&limit=50"),
  db("zoz_pro_device_jobs?"+f+"&select=id,device_id,capability_id,status,created_at,updated_at,completed_at&order=created_at.desc&limit=100"),
  db("zoz_pro_android_app_projects?"+f+"&select=id,project_key,display_name,package_name,purpose,repository,branch,lifecycle_status,current_version,updated_at&order=updated_at.desc&limit=100"),
  db("zoz_pro_android_app_builds?"+f+"&select=id,project_id,version_name,version_code,branch,commit_sha,workflow_run_id,workflow_run_url,build_status,artifact_name,artifact_id,artifact_sha256,created_at,completed_at&order=created_at.desc&limit=100")
 ]);
 const count=(rows:any[],key:string)=>rows.reduce((a:any,x:any)=>{const k=String(x?.[key]||"unknown");a[k]=(a[k]||0)+1;return a;},{});
 const cr=Array.isArray(credentials)?credentials:[], ch=Array.isArray(channels)?channels:[], ar=Array.isArray(assets)?assets:[], tr=Array.isArray(tasks)?tasks:[], br=Array.isArray(books)?books:[], mr=Array.isArray(memory)?memory[0]||null:null, rr=Array.isArray(runs)?runs:[], dr=Array.isArray(devices)?devices:[], dj=Array.isArray(deviceJobs)?deviceJobs:[], ap=Array.isArray(appProjects)?appProjects:[], ab=Array.isArray(appBuilds)?appBuilds:[], latest=rr[0]||null, details=latest?.details||{};
 const checks=[
  {id:"production_database",status:"passed",detail:"تمت قراءة جداول الإنتاج بنجاح."},
  {id:"owner_scope",status:"passed",detail:"القراءات مقيدة بمعرّف مالك الجلسة."},
  {id:"youtube",status:cr.length?"credentials_present":"missing_channel_credentials",detail:"راجع حالة كل قناة وتاريخ صلاحية بياناتها."},
  {id:"gemini",status:GEMINI_KEYS.length?"server_key_present":"missing",detail:"لا تُعرض أي قيمة مفتاح."},
  {id:"notion_memory",status:mr?.notion_sync_status||"not_verified",detail:"حالة آخر نقطة ذاكرة محفوظة."},
  {id:"amazon_kdp",status:"not_connected",detail:"المتابعة من التقارير المسجلة فقط."},
  {id:"other_tools",status:"not_wired",detail:"Canva وMake وRunway ليست موصلات خادم لهذا الوكيل."}
 ];
 return {
  ok:true,mode:preflight?"preflight":"overview",environment:"production",project_ref:"oxyzxbkwhafzaztraowc",
  agent:{name:"zoz-pro-agent",capability_registry_version:"1.0.0",automatic_publication:false,policy:"least_privilege_allowlist"},
  scheduler:{schedule:"*/15 * * * *",latest_run:latest?{id:latest.id,status:latest.status,started_at:latest.started_at,finished_at:latest.finished_at,channels_checked:details.channels_checked??null,channels_succeeded:details.channels_succeeded??null,channels_failed:details.channels_failed??null}:null},
  channels:{active:ch.length,rows:ch.map((x:any)=>({channel_id:x.channel_id,name:x.display_name||x.channel_title,niche:x.niche,connection_status:x.connection_status,last_synced_at:x.last_synced_at}))},
  media:{intake_items:ar.length,by_status:count(ar,"status"),scripts_seen:Array.isArray(scripts)?scripts.length:0},
  work_queue:{total:tr.length,by_status:count(tr,"status"),awaiting_owner_approval:tr.filter((x:any)=>x.status==="awaiting_owner_approval").length,approved:tr.filter((x:any)=>x.status==="approved").length,blocked:tr.filter((x:any)=>x.status==="blocked").length},
  books:{tracked:br.length,by_status:count(br,"kdp_status"),direct_kdp_connection:false},
  memory:{present:Boolean(mr?.content),updated_at:mr?.updated_at||null,notion_sync_status:mr?.notion_sync_status||"unknown",notion_page_saved:Boolean(mr?.notion_page_id)},
  android_devices:{total:dr.length,active:dr.filter((x:any)=>x.device_status==="active").length,rows:dr.map((x:any)=>({id:x.id,name:x.device_name,status:x.device_status,app_version:x.app_version,last_heartbeat_at:x.last_heartbeat_at,capabilities:x.capabilities}))},
  android_device_jobs:{total:dj.length,by_status:count(dj,"status"),recent:dj.slice(0,15)},
  android_app_factory:{projects:ap.map((x:any)=>({id:x.id,project_key:x.project_key,name:x.display_name,package_name:x.package_name,purpose:x.purpose,repository:x.repository,branch:x.branch,status:x.lifecycle_status,version:x.current_version,updated_at:x.updated_at})),builds:ab.map((x:any)=>({id:x.id,project_id:x.project_id,version:x.version_name,version_code:x.version_code,branch:x.branch,commit_sha:x.commit_sha,workflow_run_id:x.workflow_run_id,workflow_run_url:x.workflow_run_url,status:x.build_status,artifact_name:x.artifact_name,artifact_id:x.artifact_id,sha256:x.artifact_sha256,created_at:x.created_at,completed_at:x.completed_at})),project_count:ap.length,build_count:ab.length,build_status_counts:count(ab,"build_status"),latest_build:ab[0]?{version:ab[0].version_name,status:ab[0].build_status,workflow_run_url:ab[0].workflow_run_url,artifact_id:ab[0].artifact_id,sha256:ab[0].artifact_sha256,completed_at:ab[0].completed_at}:null},
  connectors:{youtube:{credential_status:count(cr,"status")},gemini:{configured:GEMINI_KEYS.length>0,key_count:GEMINI_KEYS.length},notion:{configured:Boolean(Deno.env.get("NOTION_API_KEY")),last_sync:mr?.notion_sync_status||"unknown"},kdp:{connected:false},canva_make_runway:{connected:false}},
  tool_registry:{version:"1.0.0",total:tools.length,enabled:tools.filter(x=>x.enabled).length,tools},
  ...(preflight?{preflight:checks,ready_for_safe_internal_operations:!checks.some(x=>["missing","missing_channel_credentials"].includes(x.status))}: {})
 };
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return json({ok:true});
 if(!SUPABASE_URL_VALUE||!SERVICE_KEY)return json({ok:false,error:"Production server configuration unavailable."},503);
 const u=new URL(req.url);
 if(req.method==="GET"&&u.searchParams.get("health")==="1")return json({ok:true,service:"zoz-pro-agent-control",environment:"production",jwt_verification:true,owner_auth_required:true});
 if(req.method!=="POST")return json({ok:false,error:"Method not supported."},405);
 const user=await authenticate(req);if(!user)return json({ok:false,error:"يلزم تسجيل الدخول بحساب مالك ZOZ Pro المؤكد."},401);
 try{
  const body=await req.json().catch(()=>({}));const action=String(body?.action||"");
  if(action==="tool_catalog")return json({ok:true,version:"1.0.0",tools,policy:{automatic_internal_operations:true,owner_approval_required_for_private_upload:true,public_publication:false,privacy_edits:false,metadata_edits:false,file_deletion:false,spending:false}});
  if(action==="operator_overview")return json(await overview(user.id,false));
  if(action==="app_factory_overview"){const d=await overview(user.id,false);return json({ok:true,environment:d.environment,android_app_factory:d.android_app_factory,android_devices:d.android_devices,android_device_jobs:d.android_device_jobs});}
  if(action==="operator_preflight")return json(await overview(user.id,true));
  if(action==="android_device_status"){
   const [devices,jobs]=await Promise.all([
    db("zoz_pro_device_registry?owner_id=eq."+encodeURIComponent(user.id)+"&select=id,device_name,device_status,app_version,last_heartbeat_at,capabilities&order=created_at.desc&limit=50"),
    db("zoz_pro_device_jobs?owner_id=eq."+encodeURIComponent(user.id)+"&select=id,device_id,capability_id,status,approval_status,created_at,updated_at,completed_at&order=created_at.desc&limit=100")
   ]);
   return json({ok:true,devices:devices||[],jobs:jobs||[]});
  }
  if(action==="run_safe_cycle"){
   const channelId=String(body?.channel_id||"");
   if(!/^[A-Za-z0-9_-]{6,80}$/.test(channelId))return json({ok:false,error:"معرّف القناة غير صالح."},400);
   const auth=req.headers.get("authorization")||"";
   const r=await fetch(SUPABASE_URL_VALUE+"/functions/v1/zoz-pro-agent",{
    method:"POST",
    headers:{apikey:PUBLIC_KEY,authorization:auth,"content-type":"application/json"},
    body:JSON.stringify({action:"run_management_cycle",channel_id:channelId}),
    signal:AbortSignal.timeout(65000)
   });
   const data=await r.json().catch(()=>({}));
   if(!r.ok||data?.ok===false)return json({ok:false,error:data?.error||("تعذر تشغيل دورة الإدارة ("+r.status+")."),details:data},r.status||502);
   return json({ok:true,action:"run_safe_cycle",result:data,policy:{public_publication:false,privacy_changes:false,destructive_actions:false}});
  }
  return json({ok:false,error:"إجراء غير مدعوم."},400);
 }catch(e){return json({ok:false,error:e instanceof Error?e.message:"تعذر قراءة حالة الوكيل."},502);}
});
