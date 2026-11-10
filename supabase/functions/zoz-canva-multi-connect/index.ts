import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const OWNER="3361f235-cf85-4678-b7ab-87068f06c207";
const REDIRECT="https://oxyzxbkwhafzaztraowc.supabase.co/functions/v1/zoz-canva-multi-connect";
const ALLOWED=["zoz_hazem","hazem_now","zoz_manager"];
const LABELS:any={zoz_hazem:"ZOZ Hazem",hazem_now:"Hazem Now",zoz_manager:"ZOZ Manager"};
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, content-type","access-control-allow-methods":"GET, POST, OPTIONS"};
const reply=(d:any,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...cors}});
const b64url=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const random=(n=48)=>b64url(crypto.getRandomValues(new Uint8Array(n)));
const sha=async(s:string)=>b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))));
async function rpc(name:string,args:any){const r=await fetch(SUPABASE_URL+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:SERVICE,authorization:"Bearer "+SERVICE,"content-type":"application/json"},body:JSON.stringify(args)});const t=await r.text();if(!r.ok)throw new Error("Database RPC "+name+" failed ("+r.status+"): "+t.slice(0,180));return t?JSON.parse(t):null;}
async function owner(req:Request){const a=req.headers.get("authorization")||"";if(!a.startsWith("Bearer "))return null;const r=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{apikey:ANON,authorization:a}});if(!r.ok)return null;const u=await r.json();return u.id===OWNER&&String(u.email||"").toLowerCase()==="hazemnaw48@gmail.com"?u:null;}
function safeAccount(v:any){const k=String(v||"");return ALLOWED.includes(k)?k:null;}
function html(title:string,body:string){return new Response("<!doctype html><html lang=ar dir=rtl><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>ZOZ Pro Canva</title><body style='font:18px system-ui;background:#0b1220;color:#e5edf7;padding:24px'><h2>"+title+"</h2><p>"+body+"</p><a style='color:#7dd3fc' href='https://hazemnaw48-coder.github.io/zoz-pro-ai/canva-connect.html'>العودة إلى لوحة ربط الحسابات</a></body></html>",{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  if(req.method==="POST"){
   if(!await owner(req))return reply({ok:false,error:"Owner authentication required"},401);
   const body=await req.json().catch(()=>({}));
   const account=safeAccount(body.account_key);
   if(!account)return reply({ok:false,error:"Choose one of the three configured Canva account slots."},400);
   const c=await rpc("zoz_canva_get_account_client_credentials",{p_owner_id:OWNER,p_account_key:account});
   if(!c?.client_id||!c?.client_secret)return reply({ok:false,error:"Canva Developer Client ID/Secret are not configured. Save credentials for this account or the shared app first."},409);
   const verifier=random(48),state=random(32),challenge=await sha(verifier);
   await rpc("zoz_canva_store_account_oauth_state",{p_owner_id:OWNER,p_account_key:account,p_state_hash:await sha(state),p_code_verifier:verifier,p_redirect_uri:REDIRECT,p_expires_at:new Date(Date.now()+10*60*1000).toISOString()});
   const scopes="design:meta:read design:content:write asset:write profile:read";
   const u=new URLSearchParams({code_challenge:challenge,code_challenge_method:"s256",scope:scopes,response_type:"code",client_id:c.client_id,state,redirect_uri:REDIRECT});
   return reply({ok:true,authorization_url:"https://www.canva.com/api/oauth/authorize?"+u.toString(),account_key:account,account_label:LABELS[account],scopes});
  }
  if(req.method==="GET"){
   const q=new URL(req.url).searchParams,code=q.get("code"),state=q.get("state"),error=q.get("error");
   if(error)return html("لم يكتمل تفويض Canva","الحساب: "+String(q.get("state")||"").slice(0,12)+" · "+String(error).replace(/[<>&"]/g,""));
   if(!code||!state)return reply({ok:false,error:"Missing OAuth code or state"},400);
   const st=await rpc("zoz_canva_consume_account_oauth_state",{p_state_hash:await sha(state)});
   const row=Array.isArray(st)?st[0]:st,account=safeAccount(row?.account_key);
   if(!row?.owner_id||row.owner_id!==OWNER||!account||row.redirect_uri!==REDIRECT)return reply({ok:false,error:"Invalid, expired, or already used OAuth state"},400);
   const c=await rpc("zoz_canva_get_account_client_credentials",{p_owner_id:OWNER,p_account_key:account});
   if(!c?.client_id||!c?.client_secret)return reply({ok:false,error:"Canva application credentials missing for this account"},409);
   const basic=btoa(c.client_id+":"+c.client_secret);
   const body=new URLSearchParams({grant_type:"authorization_code",code,code_verifier:row.code_verifier,redirect_uri:REDIRECT});
   const tr=await fetch("https://api.canva.com/rest/v1/oauth/token",{method:"POST",headers:{authorization:"Basic "+basic,"content-type":"application/x-www-form-urlencoded",accept:"application/json"},body});
   const td=await tr.json().catch(()=>({}));
   if(!tr.ok||!td.access_token||!td.refresh_token)return reply({ok:false,error:"Canva token exchange failed: "+String(td.message||td.code||tr.status)},502);
   const tokenBundle={access_token:td.access_token,refresh_token:td.refresh_token,expires_at:new Date(Date.now()+Number(td.expires_in||14400)*1000).toISOString(),scope:td.scope||"design:meta:read design:content:write asset:write profile:read",account_key:account,updated_at:new Date().toISOString()};
   await rpc("zoz_canva_store_account_oauth_tokens",{p_owner_id:OWNER,p_account_key:account,p_secret:JSON.stringify(tokenBundle)});
   return html("تم حفظ تفويض Canva بنجاح","تم ربط حساب "+LABELS[account]+" وتخزين رموزه بصورة مستقلة. ارجع إلى لوحة الربط واختبر الحساب.");
  }
  return reply({ok:false,error:"GET callback or authenticated POST required"},405);
 }catch(e){return reply({ok:false,error:String(e instanceof Error?e.message:e).slice(0,300)},500);}
});