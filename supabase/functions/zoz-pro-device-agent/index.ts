import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL = Deno.env.get("SUPABASE_URL") || "";
function secret(name:string){try{const v=JSON.parse(Deno.env.get(name)||"{}");return typeof v?.default==="string"?v.default:"";}catch{return "";}}
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || secret("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const PUBLIC = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || secret("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
const OWNER_EMAIL = "hazemnaw48@gmail.com";
const CAPABILITIES = new Set(["device.health_check","flow.open","flow.copy_prompt"]);
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, content-type, x-zoz-device-token","access-control-allow-methods":"GET, POST, OPTIONS"}});}
function fail(error:string,status=400){return json({ok:false,error},status);}
function clean(v:unknown,max=1000){return String(v??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").trim().slice(0,max);}
async function digest(s:string){const bytes=new TextEncoder().encode(s);const hash=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function dbHeaders(){return {apikey:SERVICE,authorization:SERVICE.startsWith("sb_secret_")?"":"Bearer "+SERVICE,"content-type":"application/json"};}
async function db(path:string,init:RequestInit={}){if(!URL||!SERVICE)throw new Error("Production database configuration unavailable.");const r=await fetch(URL+"/rest/v1/"+path,{...init,headers:{...dbHeaders(),...((init.headers||{}) as Record<string,string>)},signal:AbortSignal.timeout(15000)});const data=await r.json().catch(()=>null);if(!r.ok)throw new Error("Database request failed ("+r.status+").");return data;}
async function owner(req:Request){const auth=req.headers.get("authorization")||"";if(!/^Bearer\s+\S+$/i.test(auth)||!PUBLIC)return null;try{const r=await fetch(URL+"/auth/v1/user",{headers:{apikey:PUBLIC,authorization:auth},signal:AbortSignal.timeout(10000)});if(!r.ok)return null;const u=await r.json();if(clean(u?.email,254).toLowerCase()!==OWNER_EMAIL||!u?.email_confirmed_at||!/^[0-9a-f-]{36}$/i.test(String(u?.id||"")))return null;return u;}catch{return null;}}
async function device(req:Request){const token=req.headers.get("x-zoz-device-token")||"";if(token.length<40)return null;const hash=await digest(token);const rows=await db("zoz_pro_device_credentials?token_hash=eq."+encodeURIComponent(hash)+"&revoked_at=is.null&select=id,owner_id,device_id&limit=1");const cred=rows?.[0];if(!cred)return null;const devices=await db("zoz_pro_device_registry?id=eq."+encodeURIComponent(cred.device_id)+"&owner_id=eq."+encodeURIComponent(cred.owner_id)+"&device_status=eq.active&select=id,owner_id,device_name,capabilities&limit=1");const dev=devices?.[0];if(!dev)return null;await db("zoz_pro_device_credentials?id=eq."+encodeURIComponent(cred.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({last_used_at:new Date().toISOString()})});return {...cred,device:dev};}
function token(){const b=crypto.getRandomValues(new Uint8Array(48));return btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function log(ownerId:string,deviceId:string|null,jobId:string|null,type:string,details:any={}){await db("zoz_pro_device_job_events",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({owner_id:ownerId,device_id:deviceId,job_id:jobId,event_type:type,details})});}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, content-type, x-zoz-device-token","access-control-allow-methods":"GET, POST, OPTIONS"}});
 if(req.method!=="POST")return fail("Use POST.",405);
 const body=await req.clone().json().catch(()=>({}));const action=clean(body?.action,60);
 try{
  if(action==="pair_exchange"){
   const code=clean(body?.pairing_code,100);if(!/^[a-f0-9]{32}$/i.test(code))return fail("رمز الاقتران غير صالح.",400);
   const codeHash=await digest(code);const now=new Date().toISOString();const challenges=await db("zoz_pro_device_pairing_challenges?code_hash=eq."+encodeURIComponent(codeHash)+"&used_at=is.null&expires_at=gt."+encodeURIComponent(now)+"&select=id,owner_id,expires_at&limit=1");
   const found=challenges?.[0];if(!found)return fail("رمز الاقتران منتهي أو مستخدم.",401);
   const consumed=await db("zoz_pro_device_pairing_challenges?id=eq."+encodeURIComponent(found.id)+"&used_at=is.null&expires_at=gt."+encodeURIComponent(now),{method:"PATCH",headers:{prefer:"return=representation"},body:JSON.stringify({used_at:now})});
   const ch=consumed?.[0];if(!ch)return fail("رمز الاقتران استُخدم بالفعل.",409);
   const deviceName=clean(body?.device_name||"Android device",100);const appVersion=clean(body?.app_version||"0.1.0",30);
   const deviceRows=await db("zoz_pro_device_registry",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({owner_id:ch.owner_id,device_name:deviceName,platform:"android",app_package:"com.zozpro.flowbridge",app_version:appVersion,device_status:"active",capabilities:["device.health_check","flow.open","flow.copy_prompt"]})});
   const dev=deviceRows?.[0];if(!dev)throw new Error("Could not register device.");
   const raw=token();
   const intakeToken="zoz_intake_"+token();
   const sourceRows=await db("zoz_pro_video_intake_sources",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({owner_id:ch.owner_id,channel_id:"UCIael48cvwPG3gKj--c7HKw",source_name:"ZOZ Android — "+deviceName,secret_hash:await digest(intakeToken),is_active:true})});
   const source=sourceRows?.[0];if(!source)throw new Error("Could not provision the private video intake capability.");
   await db("zoz_pro_device_registry?id=eq."+encodeURIComponent(dev.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({intake_source_id:source.id})});
   await db("zoz_pro_device_credentials",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({owner_id:ch.owner_id,device_id:dev.id,token_hash:await digest(raw)})});
   await log(ch.owner_id,dev.id,null,"device_paired",{device_name:deviceName,app_version:appVersion,intake_source_id:source.id});
   return json({ok:true,device_id:dev.id,device_token:raw,intake_token:intakeToken,device_name:deviceName,capabilities:dev.capabilities,paired_at:new Date().toISOString()});
  }
  if(action==="device_health"||action==="heartbeat"||action==="poll_jobs"||action==="complete_job"){
   const d=await device(req);if(!d)return fail("الجهاز غير مقرون أو تم إلغاء صلاحياته.",401);
   const now=new Date().toISOString();
   if(action==="device_health"||action==="heartbeat"){
    await db("zoz_pro_device_registry?id=eq."+encodeURIComponent(d.device_id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({last_seen_at:now,last_heartbeat_at:now,updated_at:now,app_version:clean(body?.app_version||"0.1.0",30)})});
    return json({ok:true,device_id:d.device_id,status:"active",server_time:now,capabilities:d.device.capabilities});
   }
   if(action==="poll_jobs"){
    const expired=await db("zoz_pro_device_jobs?device_id=eq."+encodeURIComponent(d.device_id)+"&owner_id=eq."+encodeURIComponent(d.owner_id)+"&status=eq.running&lease_expires_at=lt."+encodeURIComponent(now)+"&select=id,attempts,max_attempts&limit=10");
    for(const stale of (Array.isArray(expired)?expired:[])){
     const exhausted=Number(stale.attempts||0)>=Number(stale.max_attempts||3);
     const nextStatus=exhausted?"failed":"queued";
     await db("zoz_pro_device_jobs?id=eq."+encodeURIComponent(stale.id)+"&status=eq.running",{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:nextStatus,lease_expires_at:null,error_code:exhausted?"lease_expired_max_attempts":"lease_expired",error_message:"انتهت مهلة تنفيذ المهمة دون تأكيد من الهاتف.",completed_at:exhausted?now:null,updated_at:now})});
     await log(d.owner_id,d.device_id,stale.id,"job_lease_expired",{requeued:!exhausted,attempts:stale.attempts});
    }
    await db("zoz_pro_device_registry?id=eq."+encodeURIComponent(d.device_id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({last_seen_at:now,last_heartbeat_at:now,updated_at:now})});
    const rows=await db("zoz_pro_device_jobs?device_id=eq."+encodeURIComponent(d.device_id)+"&owner_id=eq."+encodeURIComponent(d.owner_id)+"&status=eq.queued&scheduled_at=lte."+encodeURIComponent(now)+"&select=id,capability_id,payload,attempts,max_attempts,created_at&order=priority.asc,created_at.asc&limit=1");
    const job=rows?.[0];if(!job)return json({ok:true,job:null,server_time:now});
    if(!CAPABILITIES.has(job.capability_id)||!(d.device.capabilities||[]).includes(job.capability_id))return json({ok:true,job:null,blocked:"capability_not_granted"});
    const claimed=await db("zoz_pro_device_jobs?id=eq."+encodeURIComponent(job.id)+"&device_id=eq."+encodeURIComponent(d.device_id)+"&status=eq.queued",{method:"PATCH",headers:{prefer:"return=representation"},body:JSON.stringify({status:"running",attempts:Number(job.attempts||0)+1,started_at:now,lease_expires_at:new Date(Date.now()+5*60000).toISOString(),updated_at:now})});
    if(!claimed?.[0])return json({ok:true,job:null});
    await log(d.owner_id,d.device_id,job.id,"job_started",{capability_id:job.capability_id,attempt:job.attempts+1});
    return json({ok:true,job:{id:job.id,capability_id:job.capability_id,payload:job.payload,attempt:job.attempts+1},server_time:now});
   }
   const jobId=clean(body?.job_id,40);if(!/^[0-9a-f-]{36}$/i.test(jobId))return fail("Job ID is invalid.",400);
   const outcome=clean(body?.outcome,20);if(!["succeeded","failed","cancelled"].includes(outcome))return fail("Invalid job outcome.",400);
   const current=await db("zoz_pro_device_jobs?id=eq."+encodeURIComponent(jobId)+"&device_id=eq."+encodeURIComponent(d.device_id)+"&owner_id=eq."+encodeURIComponent(d.owner_id)+"&status=eq.running&select=id,capability_id,attempts,max_attempts&limit=1");
   const j=current?.[0];if(!j)return fail("المهمة غير موجودة أو لم تعد قيد التنفيذ.",404);
   const result=body?.result&&typeof body.result==="object"?body.result:{};
   const safeResult=JSON.parse(JSON.stringify(result).slice(0,12000));
   const retry=outcome==="failed"&&Number(j.attempts)<Number(j.max_attempts);
   const status=retry?"queued":outcome;
   await db("zoz_pro_device_jobs?id=eq."+encodeURIComponent(jobId)+"&status=eq.running",{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status,result:safeResult,error_code:clean(body?.error_code,80)||null,error_message:clean(body?.error_message,500)||null,lease_expires_at:null,completed_at:retry?null:now,updated_at:now})});
   await log(d.owner_id,d.device_id,jobId,"job_"+outcome,{retry,status,result:safeResult,error_code:clean(body?.error_code,80)});
   return json({ok:true,job_id:jobId,status,requeued:retry});
  }
  const u=await owner(req);if(!u)return fail("يلزم تسجيل الدخول بجلسة مالك ZOZ Pro.",401);
  if(action==="pair_code_create"){
   const raw=crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"").slice(0,0);
   await db("zoz_pro_device_pairing_challenges?owner_id=eq."+encodeURIComponent(u.id)+"&used_at=is.null",{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({used_at:new Date().toISOString()})});
   const code=raw.slice(0,32);const expires=new Date(Date.now()+5*60000).toISOString();
   await db("zoz_pro_device_pairing_challenges",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({owner_id:u.id,code_hash:await digest(code),expires_at:expires})});
   return json({ok:true,pairing_code:code,expires_at:expires,valid_for_seconds:300,usage:"Enter this code once in the Android app. It is not a password."});
  }
  if(action==="device_list"){
   const rows=await db("zoz_pro_device_registry?owner_id=eq."+encodeURIComponent(u.id)+"&select=id,device_name,app_version,device_status,capabilities,last_seen_at,last_heartbeat_at,created_at,revoked_at&order=created_at.desc");
   return json({ok:true,devices:rows||[]});
  }
  if(action==="device_revoke"){
   const id=clean(body?.device_id,40);if(!/^[0-9a-f-]{36}$/i.test(id))return fail("Device ID invalid.",400);
   await db("zoz_pro_device_registry?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(u.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({device_status:"revoked",revoked_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
   await db("zoz_pro_device_credentials?device_id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(u.id)+"&revoked_at=is.null",{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({revoked_at:new Date().toISOString()})});
   const sourceRows=await db("zoz_pro_device_registry?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(u.id)+"&select=intake_source_id&limit=1");
   const sourceId=sourceRows?.[0]?.intake_source_id;
   if(sourceId)await db("zoz_pro_video_intake_sources?id=eq."+encodeURIComponent(sourceId)+"&owner_id=eq."+encodeURIComponent(u.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({is_active:false,revoked_at:new Date().toISOString()})});
   await log(u.id,id,null,"device_revoked",{});return json({ok:true,device_id:id,status:"revoked"});
  }
  if(action==="job_enqueue"){
   const cap=clean(body?.capability_id,80);if(!CAPABILITIES.has(cap))return fail("Capability is not allow-listed.",400);
   const deviceId=clean(body?.device_id,40);const dev=await db("zoz_pro_device_registry?id=eq."+encodeURIComponent(deviceId)+"&owner_id=eq."+encodeURIComponent(u.id)+"&device_status=eq.active&select=id,capabilities&limit=1");
   if(!dev?.[0]||!(dev[0].capabilities||[]).includes(cap))return fail("الجهاز غير نشط أو لا يمتلك هذه القدرة.",403);
   const approval=body?.approval_required===true||cap==="media.upload_intake";
   const payload=body?.payload&&typeof body.payload==="object"?body.payload:{};
   if(JSON.stringify(payload).length>12000)return fail("Job payload too large.",413);
   const idem=clean(body?.idempotency_key||crypto.randomUUID(),100);
   const rows=await db("zoz_pro_device_jobs",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({owner_id:u.id,device_id:deviceId,capability_id:cap,payload,status:approval?"awaiting_owner_approval":"queued",approval_required:approval,approval_status:approval?"pending":"not_required",idempotency_key:idem,priority:Math.max(1,Math.min(5,Number(body?.priority||3)))})});
   const job=rows?.[0];if(!job)throw new Error("Could not create device job.");
   await log(u.id,deviceId,job.id,"job_created",{capability_id:cap,approval_required:approval});
   return json({ok:true,job,approval_required:approval});
  }
  if(action==="job_approve"){
   const id=clean(body?.job_id,40);const rows=await db("zoz_pro_device_jobs?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(u.id)+"&status=eq.awaiting_owner_approval&select=id,capability_id,device_id&limit=1");
   const job=rows?.[0];if(!job)return fail("المهمة غير موجودة في انتظار الموافقة.",404);
   await db("zoz_pro_device_jobs?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(u.id)+"&status=eq.awaiting_owner_approval",{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"queued",approval_status:"approved",approval_record:{approved_by:u.id,approved_at:new Date().toISOString(),approved_action:job.capability_id},updated_at:new Date().toISOString()})});
   await log(u.id,job.device_id,id,"owner_approved_job",{capability_id:job.capability_id});
   return json({ok:true,job_id:id,status:"queued",approval_status:"approved"});
  }
  if(action==="job_list"){
   const rows=await db("zoz_pro_device_jobs?owner_id=eq."+encodeURIComponent(u.id)+"&select=id,device_id,capability_id,status,approval_required,approval_status,priority,attempts,result,error_message,created_at,updated_at,completed_at&order=created_at.desc&limit=100");
   return json({ok:true,jobs:rows||[]});
  }
  return fail("Unsupported device agent action.",404);
 }catch(e){return fail(e instanceof Error?e.message:"Device agent error.",502);}
});