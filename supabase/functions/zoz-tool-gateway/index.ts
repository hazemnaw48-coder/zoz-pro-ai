import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const OWNER_EMAIL = "hazemnaw48@gmail.com";
const json = (data: unknown, status=200) => new Response(JSON.stringify(data), {status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, content-type","access-control-allow-methods":"POST, OPTIONS"}});
async function db(path:string, init:RequestInit={}) {
  const r=await fetch(URL+"/rest/v1/"+path,{...init,headers:{apikey:SERVICE,authorization:"Bearer "+SERVICE,"content-type":"application/json",...(init.headers||{})}});
  const t=await r.text(); if(!r.ok) throw new Error("Database request failed ("+r.status+"): "+t.slice(0,300));
  return t?JSON.parse(t):null;
}
async function who(req:Request) {
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return null;
  const r=await fetch(URL+"/auth/v1/user",{headers:{apikey:req.headers.get("apikey")||ANON,authorization:auth}});
  if(!r.ok)return null; const u=await r.json(); return /^[0-9a-f-]{36}$/i.test(String(u.id||""))?u:null;
}
async function call(slug:string, action:string, body:any, auth:string, apikey:string) {
  const r=await fetch(URL+"/functions/v1/"+slug+"?action="+encodeURIComponent(action),{
    method:"POST",headers:{authorization:auth,apikey:apikey||ANON,"content-type":"application/json"},
    body:JSON.stringify(body||{}),signal:AbortSignal.timeout(110000)
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok||data.ok===false) throw new Error(String(data.error||slug+" returned HTTP "+r.status).slice(0,500));
  return data;
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return json({ok:true});
  if(req.method!=="POST")return json({ok:false,error:"POST required"},405);
  const user=await who(req); if(!user)return json({ok:false,error:"تسجيل دخول المالك مطلوب."},401);
  if(!URL||!SERVICE)return json({ok:false,error:"إعدادات Supabase الخلفية غير مكتملة."},503);
  const body=await req.json().catch(()=>({}));
  const action=String(body.action||"status");
  const auth=req.headers.get("authorization")||"";
  const apikey=req.headers.get("apikey")||ANON;
  const requestId=crypto.randomUUID();
  let toolKey="supabase", capability=action, status="succeeded";
  try {
    let result:any;
    if(action==="status") {
      const [tools,connections]=await Promise.all([
        db("zoz_pro_tool_catalog?is_visible=eq.true&select=id,tool_key,name,provider,category,integration_status,pricing_model,capabilities,notes&order=category.asc,name.asc"),
        db("zoz_pro_tool_connections?owner_id=eq."+encodeURIComponent(user.id)+"&select=tool_id,connection_status,capabilities_enabled,last_checked_at,last_error")
      ]);
      result={ok:true,tools:(tools||[]).map((t:any)=>({...t,connection:(connections||[]).find((x:any)=>x.tool_id===t.id)||null})),request_id:requestId};
    } else if(action==="channel_sync") {
      const channelId=String(body.channel_id||"");
      if(!/^UC[A-Za-z0-9_-]{22}$/.test(channelId))return json({ok:false,error:"معرف قناة غير صالح."},400);
      toolKey="youtube"; capability="youtube.analytics.sync";
      result=await call("zoz-pro-youtube-analytics","managed_channel_sync",{channel_id:channelId},auth,apikey);
    } else if(action==="tiktok_sync") {
      const slot=String(body.slot_key||"");
      if(!["tiktok_1","tiktok_2"].includes(slot))return json({ok:false,error:"حساب TikTok غير صالح."},400);
      toolKey="tiktok"; capability="tiktok.display_api.analytics";
      result=await call("zoz-pro-tiktok","",{action:"analytics",slot_key:slot},auth,apikey);
    } else if(action==="tiktok_ads_save_credentials") {
      if(String(user.email||"").toLowerCase()!==OWNER_EMAIL)return json({ok:false,error:"مالك ZOZ Pro فقط يمكنه ضبط بيانات TikTok Ads."},403);
      toolKey="tiktok_marketing_api"; capability="tiktok_ads.developer_credentials.save";
      result=await call("zoz-tiktok-ads","",{action:"save_app_credentials",app_id:body.app_id,app_secret:body.app_secret,authorization_url:body.authorization_url},auth,apikey);
    } else if(action==="tiktok_ads_connect_start") {
      if(String(user.email||"").toLowerCase()!==OWNER_EMAIL)return json({ok:false,error:"مالك ZOZ Pro فقط يمكنه بدء تفويض TikTok Ads."},403);
      toolKey="tiktok_marketing_api"; capability="tiktok_ads.oauth.start";
      result=await call("zoz-tiktok-ads","",{action:"connect_start"},auth,apikey);
    } else if(action==="tiktok_ads_status") {
      if(String(user.email||"").toLowerCase()!==OWNER_EMAIL)return json({ok:false,error:"مالك ZOZ Pro فقط يمكنه قراءة حسابات TikTok Ads."},403);
      toolKey="tiktok_marketing_api"; capability="tiktok_ads.advertiser.status.read";
      result=await call("zoz-tiktok-ads","",{action:"status"},auth,apikey);
    } else if(action==="tiktok_ads_sync") {
      if(String(user.email||"").toLowerCase()!==OWNER_EMAIL)return json({ok:false,error:"مالك ZOZ Pro فقط يمكنه مزامنة TikTok Ads."},403);
      toolKey="tiktok_marketing_api"; capability="tiktok_ads.campaigns.read";
      result=await call("zoz-tiktok-ads","",{action:"sync",advertiser_id:body.advertiser_id},auth,apikey);
    } else if(action==="tiktok_ads_report") {
      if(String(user.email||"").toLowerCase()!==OWNER_EMAIL)return json({ok:false,error:"مالك ZOZ Pro فقط يمكنه قراءة تقارير TikTok Ads."},403);
      toolKey="tiktok_marketing_api"; capability="tiktok_ads.integrated_report.read";
      result=await call("zoz-tiktok-ads","",{action:"report",advertiser_id:body.advertiser_id,start_date:body.start_date,end_date:body.end_date},auth,apikey);
    } else if(action==="production_cycle") {
      toolKey="zoz-pro-agent"; capability="production.owner_management_cycle";
      const channelRows=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(user.id)+"&is_active=eq.true&select=channel_id,display_name,channel_title,niche,connection_status&order=display_name.asc");
      const channels=(Array.isArray(channelRows)?channelRows:[])
        .filter((ch:any)=>/^UC[A-Za-z0-9_-]{22}$/.test(String(ch.channel_id||""))
          &&String(ch.channel_id)!=="UC-FimUUFXRd0MOSoikzczcQ"
          &&!/(وجهة القناة قيد التحقق|destination under verification|under verification)/i.test(String(ch.niche||"")))
        .sort((a:any,b:any)=>Number(String(b.channel_id)==="UCIael48cvwPG3gKj--c7HKw")-Number(String(a.channel_id)==="UCIael48cvwPG3gKj--c7HKw"))
        .slice(0,10);
      if(!channels.length) throw new Error("لا توجد قنوات موثقة صالحة لتشغيل دورة الإدارة.");
      const channelResults:any[]=[];
      for(const ch of channels){
        try{
          const output=await call("zoz-pro-agent","run_management_cycle",{action:"run_management_cycle",channel_id:String(ch.channel_id)},auth,apikey);
          channelResults.push({ok:true,channel_id:String(ch.channel_id),channel_name:String(ch.display_name||ch.channel_title||ch.channel_id),result:output});
        }catch(e){
          channelResults.push({ok:false,channel_id:String(ch.channel_id),channel_name:String(ch.display_name||ch.channel_title||ch.channel_id),error:String(e instanceof Error?e.message:"تعذر تشغيل دورة القناة.").slice(0,400)});
        }
      }
      const succeeded=channelResults.filter((x:any)=>x.ok).length;
      const failed=channelResults.length-succeeded;
      status=failed===0?"succeeded":succeeded>0?"partial":"failed";
      result={ok:succeeded>0,action:"production_cycle",execution_mode:"owner_authenticated_management",
        channels_checked:channelResults.length,channels_succeeded:succeeded,channels_failed:failed,
        channels:channelResults,
        safety:{unverified_channels_skipped:true,content_saved_for_review:true,automatic_publication:false,public_privacy_changes:false,external_paid_credits_used:false}};
      if(!succeeded) throw new Error("تعذر إكمال دورة الإدارة لأي قناة: "+channelResults.map((x:any)=>x.channel_name+": "+x.error).join(" | ").slice(0,700));
    } else if(action==="intake_list") {
      toolKey="zoz-pro-agent"; capability="production.intake.read";
      result=await call("zoz-pro-agent","intake_list",{},auth,apikey);
    } else {
      return json({ok:false,error:"هذه العملية غير موجودة في قائمة السماح."},403);
    }
    await db("zoz_pro_tool_gateway_audit",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({
      owner_id:user.id,tool_key:toolKey,capability,status,request_id:requestId,
      details:{action,channel_id:body.channel_id||null,slot_key:body.slot_key||null}
    })});
    return json({ok:true,action,request_id:requestId,result});
  } catch(e) {
    const message=e instanceof Error?e.message:"Gateway execution failed.";
    await db("zoz_pro_tool_gateway_audit",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({
      owner_id:user.id,tool_key:toolKey,capability,status:"failed",request_id:requestId,details:{action,error:message.slice(0,400)}
    })}).catch(()=>null);
    return json({ok:false,action,request_id:requestId,error:message},502);
  }
});