import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { classifyInboundMessage, buildSafeReply, isOptOutMessage, isWithinServiceWindow, canAutoSend } from "./policy.mjs";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
const OWNER = (Deno.env.get("ZOZ_OWNER_EMAIL") || "hazemnaw48@gmail.com").toLowerCase();
const VERIFY = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN") || "";
const APP_SECRET = Deno.env.get("META_WHATSAPP_APP_SECRET") || "";
const ACCESS = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "";
const PHONE_ID = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID") || "";
const WABA_ID = Deno.env.get("META_WHATSAPP_WABA_ID") || "";
const GRAPH_VERSION = Deno.env.get("META_GRAPH_API_VERSION") || "";
const WORKSPACE = "zoz_business";

const json = (data: unknown, status=200) => new Response(JSON.stringify(data), {status,headers:{
  "content-type":"application/json; charset=utf-8","cache-control":"no-store",
  "access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, content-type, x-hub-signature-256",
  "access-control-allow-methods":"GET, POST, OPTIONS"
}});
const fail = (error:string,status=400) => json({ok:false,error},status);
const clean = (v:unknown,n=2000) => String(v??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").trim().slice(0,n);
const enc = (v:unknown) => encodeURIComponent(String(v??""));
async function db(path:string, init:RequestInit={}) {
  if(!URL||!SERVICE) throw new Error("supabase_server_not_configured");
  const h:Record<string,string>={apikey:SERVICE,"content-type":"application/json",...((init.headers||{}) as Record<string,string>)};
  if(!SERVICE.startsWith("sb_secret_")) h.authorization="Bearer "+SERVICE;
  const r=await fetch(URL+"/rest/v1/"+path,{...init,headers:h,signal:AbortSignal.timeout(15000)});
  const d=await r.json().catch(()=>null);
  if(!r.ok) throw new Error("database_http_"+r.status);
  return d;
}
async function owner(req:Request) {
  const auth=req.headers.get("authorization")||"";
  if(!/^Bearer\s+\S+$/i.test(auth)||!ANON||!URL)return null;
  try{
    const r=await fetch(URL+"/auth/v1/user",{headers:{apikey:ANON,authorization:auth},signal:AbortSignal.timeout(10000)});
    if(!r.ok)return null;
    const u=await r.json();
    return clean(u?.email,254).toLowerCase()===OWNER&&u?.email_confirmed_at&&/^[0-9a-f-]{36}$/i.test(String(u?.id||""))?u:null;
  }catch{return null;}
}
async function audit(channelId:string|null,actor:string,action:string,status="recorded",details:Record<string,unknown>={}) {
  await db("zoz_whatsapp_audit",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({channel_id:channelId,actor_type:actor,action,status,details})}).catch(()=>null);
}
async function channel() {
  const r=await db("zoz_whatsapp_channels?workspace_key=eq."+WORKSPACE+"&select=*&limit=1");
  return Array.isArray(r)?r[0]||null:null;
}
async function ownerAction(req:Request,body:any) {
  const c=await channel(); if(!c)throw new Error("channel_not_seeded");
  const action=clean(body?.action,60);
  if(action==="bootstrap"){
    const [conversations,templates,outbox,usage,knowledge]=await Promise.all([
      db("zoz_whatsapp_conversations?select=id,status,last_inbound_at,last_outbound_at,service_window_ends_at,last_message_at,last_message_preview,escalated,escalation_reason,contacts:zoz_whatsapp_contacts(id,wa_id,phone_e164,display_name,is_excluded,opted_out,automated_reply_allowed)&order=updated_at.desc&limit=100"),
      db("zoz_whatsapp_templates?select=provider_template_id,template_name,language,category,approval_status,synced_at&order=template_name.asc&limit=300"),
      db("zoz_whatsapp_outbox?select=id,conversation_id,body,status,decision_label,decision_reason,requires_owner_approval,created_at,sent_at&order=created_at.desc&limit=100"),
      db("zoz_whatsapp_monthly_usage?select=month_start,free_service_messages&order=month_start.desc&limit=1"),
      db("zoz_whatsapp_knowledge?select=knowledge_key,title,content,is_approved&order=title.asc")
    ]);
    return {ok:true,channel:c,conversations,templates,outbox,usage:Array.isArray(usage)?usage[0]||null:null,knowledge,
      readiness:{verify_token:Boolean(VERIFY),app_secret:Boolean(APP_SECRET),access_token:Boolean(ACCESS),phone_id:Boolean(PHONE_ID||c.phone_number_id),waba_id:Boolean(WABA_ID||c.waba_id),graph_version:Boolean(GRAPH_VERSION),webhook_verified:Boolean(c.connection_status==="connected")}};
  }
  if(action==="messages"){
    const id=clean(body?.conversation_id,50);if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("invalid_conversation_id");
    const messages=await db("zoz_whatsapp_messages?conversation_id=eq."+enc(id)+"&select=id,direction,message_type,body,delivery_status,provider_timestamp,created_at&order=created_at.asc&limit=200");
    return {ok:true,messages};
  }
  if(action==="draft"){
    const id=clean(body?.conversation_id,50),text=clean(body?.text,3000);
    if(!/^[0-9a-f-]{36}$/i.test(id)||!text)throw new Error("conversation_and_text_required");
    const rows=await db("zoz_whatsapp_conversations?id=eq."+enc(id)+"&select=id,channel_id,contact_id&limit=1");
    const conv=Array.isArray(rows)?rows[0]:null;if(!conv)throw new Error("conversation_not_found");
    const out=await db("zoz_whatsapp_outbox",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({
      channel_id:conv.channel_id,conversation_id:conv.id,contact_id:conv.contact_id,body:text,message_kind:"service_text",
      status:"draft",created_by:"owner",decision_label:"owner_composed",decision_reason:"Owner-created draft",
      requires_owner_approval:true,is_free_window_message:false,idempotency_key:"owner:"+crypto.randomUUID()
    })});
    await audit(c.id,"owner","reply_draft_created","succeeded",{conversation_id:id});
    return {ok:true,outbox:Array.isArray(out)?out[0]:null};
  }
  if(action==="contact_policy"){
    const id=clean(body?.contact_id,50);if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("invalid_contact_id");
    const patch:any={updated_at:new Date().toISOString()};
    for(const k of ["is_excluded","opted_out","automated_reply_allowed","marketing_opt_in"])if(typeof body?.[k]==="boolean")patch[k]=body[k];
    if(patch.opted_out===true){patch.automated_reply_allowed=false;patch.marketing_opt_in=false;}
    await db("zoz_whatsapp_contacts?id=eq."+enc(id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});
    await audit(c.id,"owner","contact_policy_updated","succeeded",{contact_id:id,fields:Object.keys(patch)});
    return {ok:true};
  }
  if(action==="set_mode"){
    const mode=clean(body?.mode,20);
    if(!["off","draft_only","safe_auto"].includes(mode))throw new Error("invalid_mode");
    const cap=Math.max(0,Math.min(900,Number(body?.monthly_cap??900)));
    await db("zoz_whatsapp_channels?id=eq."+enc(c.id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({
      auto_reply_mode:mode,is_enabled:body?.enabled===true,emergency_stop:body?.emergency_stop!==false,
      free_service_monthly_cap:cap,updated_at:new Date().toISOString()
    })});
    await audit(c.id,"owner","channel_mode_updated","succeeded",{mode,enabled:body?.enabled===true,emergency_stop:body?.emergency_stop!==false,monthly_cap:cap});
    return {ok:true,mode};
  }
  if(action==="save_meta_ids"){
    const phone=clean(body?.phone_number_id,80),waba=clean(body?.waba_id,80);
    if(!/^\d{6,30}$/.test(phone)||!/^\d{6,30}$/.test(waba))throw new Error("valid_meta_ids_required");
    await db("zoz_whatsapp_channels?id=eq."+enc(c.id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({
      phone_number_id:phone,waba_id:waba,connection_status:"identifiers_saved",connection_mode:"coexistence_pending",updated_at:new Date().toISOString()
    })});
    await audit(c.id,"owner","meta_ids_saved","succeeded",{phone_number_id:phone,waba_id:waba});
    return {ok:true};
  }
  if(action==="sync_templates")return await syncTemplates(c);
  if(action==="approve_send")return await approveSend(c,clean(body?.outbox_id,50));
  if(action==="close"){
    const id=clean(body?.conversation_id,50);if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("invalid_conversation_id");
    await db("zoz_whatsapp_conversations?id=eq."+enc(id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"closed",updated_at:new Date().toISOString()})});
    return {ok:true};
  }
  throw new Error("unsupported_action");
}
async function reserveQuota(c:any) {
  const result=await db("rpc/zoz_whatsapp_reserve_free_quota",{method:"POST",body:JSON.stringify({p_channel_id:c.id,p_limit:Math.min(900,Number(c.free_service_monthly_cap||0))})});
  return result===true;
}
async function releaseQuota(c:any) {
  await db("rpc/zoz_whatsapp_release_free_quota",{method:"POST",body:JSON.stringify({p_channel_id:c.id})}).catch(()=>null);
}
async function sendText(c:any,conv:any,contact:any,body:string,actor:string,outboxId:string|null=null) {
  if(!c.is_enabled||c.emergency_stop)throw new Error("channel_paused_or_emergency_stop");
  if(!ACCESS||!PHONE_ID||!GRAPH_VERSION)throw new Error("meta_cloud_api_not_configured");
  if(contact.opted_out||contact.is_excluded||!contact.automated_reply_allowed)throw new Error("contact_not_eligible");
  if(!isWithinServiceWindow(conv.last_inbound_at))throw new Error("service_window_closed");
  const reserved=await reserveQuota(c);if(!reserved)throw new Error("free_monthly_cap_reached");
  try{
    const r=await fetch("https://graph.facebook.com/"+encodeURIComponent(GRAPH_VERSION)+"/"+encodeURIComponent(PHONE_ID)+"/messages",{
      method:"POST",headers:{authorization:"Bearer "+ACCESS,"content-type":"application/json"},
      body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to:contact.wa_id,type:"text",text:{preview_url:false,body:clean(body,3000)}}),
      signal:AbortSignal.timeout(15000)
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data?.messages?.[0]?.id)throw new Error("meta_send_http_"+r.status);
    const providerId=clean(data.messages[0].id,180),now=new Date().toISOString();
    await db("zoz_whatsapp_messages",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({
      channel_id:c.id,conversation_id:conv.id,contact_id:contact.id,provider_message_id:providerId,direction:"outbound",
      message_type:"text",body:clean(body,3000),delivery_status:"sent",provider_timestamp:now,metadata:{source:"zoz_whatsapp_agent",outbox_id:outboxId}
    })});
    if(outboxId)await db("zoz_whatsapp_outbox?id=eq."+enc(outboxId),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"sent",provider_message_id:providerId,sent_at:now,last_error_code:null})});
    await db("zoz_whatsapp_conversations?id=eq."+enc(conv.id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({last_outbound_at:now,last_message_at:now,last_message_preview:clean(body,350),updated_at:now})});
    await audit(c.id,actor,"service_text_sent","succeeded",{provider_message_id:providerId,outbox_id:outboxId});
    return {ok:true,provider_message_id:providerId};
  }catch(e){
    await releaseQuota(c);
    if(outboxId)await db("zoz_whatsapp_outbox?id=eq."+enc(outboxId),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"failed",last_error_code:clean(e instanceof Error?e.message:"send_failed",120)})}).catch(()=>null);
    throw e;
  }
}
async function approveSend(c:any,id:string) {
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("invalid_outbox_id");
  const rows=await db("zoz_whatsapp_outbox?id=eq."+enc(id)+"&status=eq.draft&select=*&limit=1");
  const row=Array.isArray(rows)?rows[0]:null;if(!row)throw new Error("draft_not_found");
  const [cv,co]=await Promise.all([
    db("zoz_whatsapp_conversations?id=eq."+enc(row.conversation_id)+"&select=*&limit=1"),
    db("zoz_whatsapp_contacts?id=eq."+enc(row.contact_id)+"&select=*&limit=1")
  ]);
  const conv=Array.isArray(cv)?cv[0]:null,contact=Array.isArray(co)?co[0]:null;
  if(!conv||!contact)throw new Error("conversation_or_contact_missing");
  return await sendText(c,conv,contact,row.body,"owner",row.id);
}
async function syncTemplates(c:any) {
  const waba=clean(c.waba_id||WABA_ID,80);
  if(!waba||!ACCESS||!GRAPH_VERSION)throw new Error("meta_template_read_not_configured");
  let next="https://graph.facebook.com/"+encodeURIComponent(GRAPH_VERSION)+"/"+enc(waba)+"/message_templates?fields=id,name,status,category,language,components&limit=100";
  let count=0;
  while(next&&count<500){
    const r=await fetch(next,{headers:{authorization:"Bearer "+ACCESS},signal:AbortSignal.timeout(15000)});
    const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error("meta_template_sync_http_"+r.status);
    for(const t of Array.isArray(data?.data)?data.data:[]){
      await db("zoz_whatsapp_templates?on_conflict=channel_id,provider_template_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({
        channel_id:c.id,provider_template_id:String(t.id),template_name:clean(t.name,120),language:clean(t.language,20),
        category:clean(t.category,30),approval_status:clean(t.status,30),components:Array.isArray(t.components)?t.components:[],synced_at:new Date().toISOString()
      })});count++;
    }
    next=clean(data?.paging?.next,2000);
  }
  await db("zoz_whatsapp_channels?id=eq."+enc(c.id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({last_template_sync_at:new Date().toISOString()})});
  await audit(c.id,"owner","templates_synced","succeeded",{count});
  return {ok:true,synced:count};
}
function bytesHex(b:Uint8Array){return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");}
async function validSignature(body:string,signature:string) {
  if(!APP_SECRET||!/^sha256=[a-f0-9]{64}$/i.test(signature))return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(APP_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)));
  const expected="sha256="+bytesHex(digest).toLowerCase(),actual=signature.toLowerCase();
  if(expected.length!==actual.length)return false;let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^actual.charCodeAt(i);return diff===0;
}
async function hash(value:string){return bytesHex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))));}
function msgBody(m:any){return clean(m?.text?.body||m?.interactive?.button_reply?.title||m?.interactive?.list_reply?.title||m?.button?.text||"",4000);}
function ts(v:any){const n=Number(v);return Number.isFinite(n)&&n>0?new Date(n*1000).toISOString():new Date().toISOString();}
async function inbound(c:any,m:any,profiles:any[]) {
  const wa=clean(m?.from,40).replace(/[^\d]/g,""),providerId=clean(m?.id,180),text=msgBody(m),at=ts(m?.timestamp);
  if(!wa||!providerId)return {saved:false};
  const profile=profiles.find((x:any)=>String(x?.wa_id||"")===wa)?.profile?.name||null;
  const contacts=await db("zoz_whatsapp_contacts?on_conflict=channel_id,wa_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({channel_id:c.id,wa_id:wa,phone_e164:"+"+wa,display_name:profile?clean(profile,120):null})});
  const contact=Array.isArray(contacts)?contacts[0]:null;if(!contact)throw new Error("contact_upsert_failed");
  const convs=await db("zoz_whatsapp_conversations?on_conflict=channel_id,contact_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({
    channel_id:c.id,contact_id:contact.id,status:"open",last_inbound_at:at,service_window_ends_at:new Date(Date.parse(at)+86400000).toISOString(),
    last_message_at:at,last_message_preview:text||"["+clean(m?.type,30)+"]"
  })});
  const conv=Array.isArray(convs)?convs[0]:null;if(!conv)throw new Error("conversation_upsert_failed");
  const saved=await db("zoz_whatsapp_messages?on_conflict=provider_message_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify({
    channel_id:c.id,conversation_id:conv.id,contact_id:contact.id,provider_message_id:providerId,direction:"inbound",
    message_type:clean(m?.type||"unknown",30),body:text||null,media_id:clean(m?.[String(m?.type||"")]?.id,180)||null,
    delivery_status:"received",provider_timestamp:at,metadata:{has_media:Boolean(m?.[String(m?.type||"")]?.id)}
  })});
  if(!Array.isArray(saved)||!saved[0])return {saved:false,duplicate:true};
  await db("zoz_whatsapp_contacts?id=eq."+enc(contact.id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({last_inbound_at:at,updated_at:new Date().toISOString()})});
  const decision=classifyInboundMessage(text);
  if(isOptOutMessage(text)){
    await db("zoz_whatsapp_contacts?id=eq."+enc(contact.id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({opted_out:true,automated_reply_allowed:false,marketing_opt_in:false})});
    await audit(c.id,"system","contact_opted_out","succeeded",{contact:wa});
    return {saved:true,opted_out:true};
  }
  const reply=buildSafeReply(decision.label);
  const idem="inbound:"+providerId+":policy-v1";
  const drafts=await db("zoz_whatsapp_outbox?on_conflict=idempotency_key",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify({
    channel_id:c.id,conversation_id:conv.id,contact_id:contact.id,source_message_id:saved[0].id,
    message_kind:"service_text",body:reply,status:"draft",created_by:"agent",decision_label:decision.label,
    decision_reason:decision.reason,requires_owner_approval:!decision.safeToAuto,is_free_window_message:isWithinServiceWindow(at),idempotency_key:idem
  })});
  if(decision.escalate)await db("zoz_whatsapp_conversations?id=eq."+enc(conv.id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({escalated:true,escalation_reason:decision.reason})});
  let autoSent=false;
  const allowed=canAutoSend({enabled:c.is_enabled,emergencyStop:c.emergency_stop,mode:c.auto_reply_mode,safeToAuto:decision.safeToAuto,
    optedOut:contact.opted_out,excluded:contact.is_excluded,automatedReplyAllowed:contact.automated_reply_allowed,
    serviceWindowOpen:isWithinServiceWindow(at),freeQuotaAvailable:true});
  if(allowed&&Array.isArray(drafts)&&drafts[0]){
    try{await sendText(c,conv,contact,reply,"agent",drafts[0].id);autoSent=true;}catch(e){await audit(c.id,"agent","auto_reply_blocked","blocked",{reason:clean(e instanceof Error?e.message:"send_failed",120)});}
  }
  return {saved:true,draft_created:Array.isArray(drafts)&&drafts.length>0,decision:decision.label,auto_sent:autoSent};
}
async function webhook(req:Request,raw:string) {
  if(!await validSignature(raw,req.headers.get("x-hub-signature-256")||""))return fail("invalid_meta_signature",401);
  let payload:any;try{payload=JSON.parse(raw);}catch{return fail("invalid_json",400);}
  if(payload?.object!=="whatsapp_business_account")return fail("invalid_webhook_object",400);
  let inserted=0,duplicates=0,ignored=0;
  for(const entry of Array.isArray(payload.entry)?payload.entry:[]){
    for(const change of Array.isArray(entry?.changes)?entry.changes:[]){
      if(change?.field!=="messages"){ignored++;continue;}
      const value=change?.value||{},phone=clean(value?.metadata?.phone_number_id,80);
      const rows=phone?await db("zoz_whatsapp_channels?phone_number_id=eq."+enc(phone)+"&select=*&limit=1"):[];
      const c=Array.isArray(rows)?rows[0]:null;
      if(!c){ignored++;continue;}
      const eventKey=await hash(String(entry?.id||"")+":"+phone+":"+JSON.stringify(value?.messages||[])+":"+JSON.stringify(value?.statuses||[]));
      const events=await db("zoz_whatsapp_webhook_events?on_conflict=provider_event_key",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify({
        channel_id:c.id,provider_event_key:eventKey,event_type:"messages",phone_number_id:phone,payload_hash:await hash(raw)
      })});
      if(!Array.isArray(events)||!events.length){duplicates++;continue;}
      for(const m of Array.isArray(value.messages)?value.messages:[]){
        const result=await inbound(c,m,Array.isArray(value.contacts)?value.contacts:[]);
        if(result.saved)inserted++;else duplicates++;
      }
      for(const s of Array.isArray(value.statuses)?value.statuses:[]){
        const id=clean(s?.id,180),status=clean(s?.status,30);
        await db("zoz_whatsapp_messages?provider_message_id=eq."+enc(id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({delivery_status:status,metadata:{status_updated_at:ts(s?.timestamp)}})}).catch(()=>null);
      }
      await db("zoz_whatsapp_channels?id=eq."+enc(c.id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({last_webhook_at:new Date().toISOString(),last_error_code:null})});
      await db("zoz_whatsapp_webhook_events?provider_event_key=eq."+enc(eventKey),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({processing_status:"processed",processed_at:new Date().toISOString()})});
    }
  }
  return json({ok:true,inserted,duplicates,ignored});
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return json({ok:true});
  const u=new URL(req.url);
  if(req.method==="GET"&&u.searchParams.get("health")==="1")return json({ok:true,service:"zoz-whatsapp-control",server_ready:Boolean(URL&&SERVICE),owner_auth_ready:Boolean(ANON&&OWNER),meta_webhook_ready:Boolean(VERIFY&&APP_SECRET),meta_send_ready:Boolean(ACCESS&&PHONE_ID&&GRAPH_VERSION),default_mode:"draft_only",emergency_stop_default:true});
  if(req.method==="GET"&&u.searchParams.has("hub.mode")){
    if(u.searchParams.get("hub.mode")==="subscribe"&&VERIFY&&u.searchParams.get("hub.verify_token")===VERIFY&&u.searchParams.get("hub.challenge"))return new Response(u.searchParams.get("hub.challenge"),{headers:{"content-type":"text/plain"}});
    return fail("webhook_verification_failed",403);
  }
  if(req.method!=="POST")return fail("method_not_allowed",405);
  const raw=await req.clone().text().catch(()=>"");
  if(req.headers.has("x-hub-signature-256")||raw.includes('"object":"whatsapp_business_account"')){
    if(!APP_SECRET)return fail("meta_app_secret_missing",503);
    try{return await webhook(req,raw);}catch(e){await audit(null,"provider","webhook_failed","failed",{code:clean(e instanceof Error?e.message:"unknown",120)});return fail("webhook_processing_failed",500);}
  }
  const user=await owner(req);if(!user)return fail("owner_auth_required",401);
  try{return json(await ownerAction(req,JSON.parse(raw||"{}")));}catch(e){return fail(clean(e instanceof Error?e.message:"action_failed",200),400);}
});
