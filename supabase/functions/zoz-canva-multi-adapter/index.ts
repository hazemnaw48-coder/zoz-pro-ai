import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const URL=Deno.env.get("SUPABASE_URL")||"",SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",ANON=Deno.env.get("SUPABASE_ANON_KEY")||"",OWNER="3361f235-cf85-4678-b7ab-87068f06c207";
const ACCOUNTS=["zoz_hazem","hazem_now","zoz_manager"];
const LABELS:any={zoz_hazem:"ZOZ Hazem",hazem_now:"Hazem Now",zoz_manager:"ZOZ Manager"};
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, content-type","access-control-allow-methods":"POST, OPTIONS"};
const json=(d:any,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...cors}});
async function who(req:Request){const a=req.headers.get("authorization")||"";if(!a.startsWith("Bearer "))return null;const r=await fetch(URL+"/auth/v1/user",{headers:{apikey:ANON,authorization:a}});if(!r.ok)return null;const u=await r.json();return u.id===OWNER&&String(u.email||"").toLowerCase()==="hazemnaw48@gmail.com"?u:null;}
async function rpc(name:string,args:any){const r=await fetch(URL+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:SERVICE,authorization:"Bearer "+SERVICE,"content-type":"application/json"},body:JSON.stringify(args)});const t=await r.text();if(!r.ok)throw new Error("Canva secure storage RPC failed ("+r.status+")");return t?JSON.parse(t):null;}
async function credentials(k:string){return await rpc("zoz_canva_get_account_client_credentials",{p_owner_id:OWNER,p_account_key:k});}
async function getTokens(k:string){return await rpc("zoz_canva_get_account_oauth_tokens",{p_owner_id:OWNER,p_account_key:k});}
async function storeTokens(k:string,t:any){return await rpc("zoz_canva_store_account_oauth_tokens",{p_owner_id:OWNER,p_account_key:k,p_secret:JSON.stringify(t)});}
async function refresh(k:string,t:any,c:any){const r=await fetch("https://api.canva.com/rest/v1/oauth/token",{method:"POST",headers:{authorization:"Basic "+btoa(c.client_id+":"+c.client_secret),"content-type":"application/x-www-form-urlencoded",accept:"application/json"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:t.refresh_token})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token||!d.refresh_token)throw new Error("Canva token refresh failed ("+r.status+"): "+String(d.message||d.code||"failed"));const next={...t,access_token:d.access_token,refresh_token:d.refresh_token,expires_at:new Date(Date.now()+Number(d.expires_in||14400)*1000).toISOString(),scope:d.scope||t.scope,updated_at:new Date().toISOString()};await storeTokens(k,next);return next;}
async function canva(t:any,path:string,init:RequestInit={}){const r=await fetch("https://api.canva.com/rest/v1/"+path,{...init,headers:{authorization:"Bearer "+t.access_token,accept:"application/json",...(init.headers||{})},signal:AbortSignal.timeout(25000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error("Canva API HTTP "+r.status+": "+String(d.message||d.code||"request_failed").slice(0,180));return d;}
async function pollAsset(t:any,id:string){let data:any=null;for(let i=0;i<8;i++){data=await canva(t,"asset-uploads/"+encodeURIComponent(id));if(data.job?.status==="success")return data;if(data.job?.status==="failed")throw new Error("Canva asset upload failed");await new Promise(r=>setTimeout(r,1800));}throw new Error("Canva asset upload is still processing; retry later.");}

function validUuid(value:string){return /^[0-9a-f-]{36}$/i.test(value);}
function sha256(bytes:Uint8Array){
 return crypto.subtle.digest("SHA-256",bytes).then(hash=>[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join(""));
}
async function readCreative(id:string){
 if(!validUuid(id))throw new Error("معرّف التصميم غير صالح.");
 const rows=await db("zoz_pro_ad_creatives?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(OWNER)+"&select=id,title,design_json,asset_path,status&limit=1");
 const row=rows?.[0];if(!row)throw new Error("التصميم غير موجود أو لا يخص حساب المالك.");
 return row;
}
async function writeCreativeImageJob(creative:any,generated:any){
 const next={...(creative.design_json&&typeof creative.design_json==="object"?creative.design_json:{}),generated_image:generated};
 const rows=await db("zoz_pro_ad_creatives?id=eq."+encodeURIComponent(creative.id)+"&owner_id=eq."+encodeURIComponent(OWNER),{
  method:"PATCH",headers:{prefer:"return=representation"},
  body:JSON.stringify({design_json:next,updated_at:new Date().toISOString()})
 });
 if(!rows?.[0])throw new Error("تعذر حفظ حالة توليد الصورة في التصميم.");
 return rows[0];
}
async function getImageCapabilities(t:any){
 const data=await canva(t,"users/me/capabilities");
 const caps=Array.isArray(data.capabilities)?data.capabilities:[];
 return {capabilities:caps,image_generation:caps.includes("image_generation")};
}
async function storeGeneratedImage(t:any,k:string,creative:any,job:any){
 const downloadUrl=String(job?.result?.image?.url||"");
 if(!downloadUrl.startsWith("https://"))throw new Error("Canva لم يرجع رابط صورة نهائيًا صالحًا.");
 const imageResponse=await fetch(downloadUrl,{signal:AbortSignal.timeout(60000)});
 if(!imageResponse.ok)throw new Error("تعذر تنزيل الصورة المولدة من Canva (HTTP "+imageResponse.status+").");
 const mime=(imageResponse.headers.get("content-type")||"image/png").split(";")[0].toLowerCase();
 if(!["image/png","image/jpeg","image/webp"].includes(mime))throw new Error("صيغة الصورة المولدة غير مدعومة: "+mime);
 const bytes=new Uint8Array(await imageResponse.arrayBuffer());
 if(!bytes.length||bytes.length>25*1024*1024)throw new Error("حجم الصورة المولدة غير صالح أو أكبر من 25 ميجابايت.");
 const digest=await sha256(bytes);
 const ext=mime==="image/jpeg"?"jpg":mime==="image/webp"?"webp":"png";
 const path=OWNER+"/"+creative.id+"/generated-"+String(job.id).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,70)+"."+ext;
 const upload=await fetch(URL+"/storage/v1/object/zoz-pro-ad-studio/"+path.split("/").map(encodeURIComponent).join("/"),{
  method:"POST",
  headers:{apikey:SERVICE,authorization:"Bearer "+SERVICE,"content-type":mime,"x-upsert":"false","cache-control":"3600"},
  body:bytes,
  signal:AbortSignal.timeout(60000)
 });
 if(!upload.ok){
  const msg=await upload.text().catch(()=>"");
  throw new Error("تعذر حفظ الصورة في مساحة ZOZ الخاصة (HTTP "+upload.status+"): "+msg.slice(0,180));
 }
 const generated={...(creative.design_json?.generated_image||{}),provider:"canva",account_key:k,account_label:LABELS[k],job_id:job.id,status:"ready",storage_path:path,mime_type:mime,file_size:bytes.length,sha256:digest,width:Number(job.result?.image?.width||0),height:Number(job.result?.image?.height||0),canva_asset_id:job.result?.image?.asset?.id||null,downloaded_at:new Date().toISOString()};
 const next={...(creative.design_json&&typeof creative.design_json==="object"?creative.design_json:{}),generated_image:generated};
 const updated=await db("zoz_pro_ad_creatives?id=eq."+encodeURIComponent(creative.id)+"&owner_id=eq."+encodeURIComponent(OWNER),{
  method:"PATCH",headers:{prefer:"return=representation"},
  body:JSON.stringify({design_json:next,asset_path:path,updated_at:new Date().toISOString()})
 });
 if(!updated?.[0])throw new Error("تم رفع الصورة لكن تعذر ربطها بسجل التصميم.");
 return generated;
}
async function resolveCanvaAccount(accountKey:string){
 const k=ACCOUNTS.includes(accountKey)?accountKey:null;
 if(!k)throw new Error("account_key must be one of the three configured Canva accounts.");
 let t=await getTokens(k);
 if(!t?.refresh_token)throw new Error("OAuth غير مربوط لحساب "+LABELS[k]+". افتح إدارة حسابات Canva أولاً.");
 const c=await credentials(k);
 if(!c?.client_id||!c?.client_secret)throw new Error("بيانات تطبيق Canva غير محفوظة لحساب "+LABELS[k]+".");
 if(!t.access_token||!t.expires_at||Date.parse(t.expires_at)<Date.now()+60000)t=await refresh(k,t,c);
 return {key:k,token:t};
}

async function publishCreative(t:any,input:any,k:string){
 const title=String(input.title||"ZOZ Pro Ad").trim().slice(0,120),width=Number(input.width),height=Number(input.height),format=String(input.format||"png").toLowerCase();
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<40||height<40||width*height>25000000)throw new Error("Invalid Canva design dimensions.");
 if(format!=="png")throw new Error("Only PNG creative assets are supported.");
 const b64=String(input.image_base64||"");if(!b64||b64.length>14*1024*1024)throw new Error("PNG creative is missing or exceeds safe upload size.");
 const binary=atob(b64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 const meta=btoa(unescape(encodeURIComponent(title.slice(0,50))));
 const upload=await canva(t,"asset-uploads",{method:"POST",headers:{"content-type":"application/octet-stream","Asset-Upload-Metadata":JSON.stringify({name_base64:meta})},body:bytes});
 let asset=upload.asset;if(upload.job?.status==="in_progress"){const finished=await pollAsset(t,String(upload.job.id));asset=finished.asset;}
 if(upload.job?.status==="failed"||!asset?.id)throw new Error("Canva did not return a completed image asset.");
 const created=await canva(t,"designs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:"type_and_asset",design_type:{type:"custom",width,height},asset_id:asset.id,title})});
 const design=created.design||{};if(!design.id||!design.urls?.edit_url)throw new Error("Canva did not confirm the created design.");
 return {design_id:design.id,title:design.title||title,edit_url:design.urls.edit_url,view_url:design.urls.view_url||null,thumbnail_url:design.thumbnail?.url||null,asset_id:asset.id,width,height,created_at:design.created_at||null,account_key:k,stored_in:LABELS[k]};
}
Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({ok:false,error:"POST required"},405);if(!await who(req))return json({ok:false,error:"Owner authentication required"},401);
try{
 const body=await req.json().catch(()=>({})),action=String(body.action||"test_connection"),requested=String(body.account_key||"");
 if(!["test_connection","list_designs","publish_creative","account_status"].includes(action))return json({ok:false,error:"Action not allowlisted"},403);
 if(action==="image_generation_capabilities"){
  const k=ACCOUNTS.includes(requested)?requested:null;
  if(!k)return json({ok:false,error:"account_key must be one of the three configured accounts"},400);
  const {token}=await resolveCanvaAccount(k);
  try{
   const result=await getImageCapabilities(token);
   return json({ok:true,account_key:k,account_label:LABELS[k],...result,scope_ready:String(token.scope||"").split(/\\s+/).includes("profile:read"),generation_cost_notice:"إنشاء الصورة يستهلك رصيد Canva AI للحساب المختار؛ فحص الإمكانية لا يستهلك رصيدًا."});
  }catch(e){
   return json({ok:false,error:String(e instanceof Error?e.message:e).slice(0,350),reauthorization_required:true,required_scope:"profile:read"},409);
  }
 }
 if(action==="generate_image"){
  const k=ACCOUNTS.includes(requested)?requested:null;
  if(!k)return json({ok:false,error:"اختر حساب Canva واحدًا من الحسابات الثلاثة."},400);
  if(body?.owner_confirmed_ai_credits!==true)return json({ok:false,error:"يلزم تأكيد استخدام رصيد Canva AI قبل كل عملية توليد."},428);
  const prompt=String(body.prompt||"").trim();
  if(!prompt||prompt.length>10000)return json({ok:false,error:"وصف الصورة مطلوب وبحد أقصى 10000 حرف."},400);
  const aspect=String(body.aspect_ratio||"portrait_4_5");
  const validAspects=["square","landscape","portrait","landscape_3_2","portrait_2_3","portrait_4_5","landscape_4_3","portrait_3_4","landscape_5_4","landscape_2_1","portrait_1_2"];
  if(!validAspects.includes(aspect))return json({ok:false,error:"مقاس الصورة غير مدعوم."},400);
  const model=String(body.model||"auto");
  if(!["auto","craft_v1_2k","lucid_origin","z_image_turbo"].includes(model))return json({ok:false,error:"نموذج Canva غير مدعوم."},400);
  const creative=await readCreative(String(body.creative_id||""));
  const {token}=await resolveCanvaAccount(k);
  let caps;
  try{caps=await getImageCapabilities(token)}catch(e){return json({ok:false,error:String(e instanceof Error?e.message:e).slice(0,320),reauthorization_required:true,required_scope:"profile:read"},409);}
  if(!caps.image_generation)return json({ok:false,error:"حساب Canva لا يملك صلاحية image_generation. راجع أهلية Canva AI/Magic Media للحساب ثم أعد الفحص.",capability_missing:true},403);
  const requestBody:any={prompt,aspect_ratio:aspect,idempotency_key:crypto.randomUUID(),asset_upload:{type:"upload",asset_name:String(creative.title||"ZOZ Ad Image").slice(0,255)}};
  if(model!=="auto")requestBody.model=model;
  const generated=await canva(token,"image-generations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(requestBody)});
  const job=generated.job||{};
  if(!job.id)throw new Error("Canva لم يرجع رقم مهمة توليد صالحًا.");
  const metadata={provider:"canva",account_key:k,account_label:LABELS[k],job_id:job.id,status:job.status||"in_progress",prompt,aspect_ratio:aspect,model,requested_at:new Date().toISOString(),ai_credits_consumed:true};
  await writeCreativeImageJob(creative,metadata);
  return json({ok:true,action,creative_id:creative.id,account_key:k,account_label:LABELS[k],job_id:job.id,status:job.status||"in_progress",ai_credits_consumed:true,message:"بدأ توليد الصورة عبر Canva؛ ستظهر في التصميم بعد اكتمال المهمة وحفظها في المساحة الخاصة."});
 }
 if(action==="get_image_generation_job"){
  const k=ACCOUNTS.includes(requested)?requested:null;
  if(!k)return json({ok:false,error:"account_key must be one of the three configured accounts."},400);
  const creative=await readCreative(String(body.creative_id||""));
  const expected=creative.design_json?.generated_image||{};
  const jobId=String(body.job_id||"");
  if(!jobId||jobId!==String(expected.job_id||"")||String(expected.account_key||"")!==k)return json({ok:false,error:"مهمة الصورة لا تطابق التصميم أو حساب Canva المحدد."},403);
  const {token}=await resolveCanvaAccount(k);
  const response=await canva(token,"image-generations/"+encodeURIComponent(jobId));
  const job=response.job||{};
  if(job.id!==jobId)return json({ok:false,error:"رد Canva لا يطابق رقم المهمة."},502);
  if(job.status==="failed"){
   const failed={...expected,status:"failed",error_code:String(job.error?.code||"generation_failed"),error_message:String(job.error?.message||"تعذر توليد الصورة."),completed_at:new Date().toISOString()};
   await writeCreativeImageJob(creative,failed);
   return json({ok:true,status:"failed",creative_id:creative.id,job_id:jobId,error:failed.error_message,error_code:failed.error_code});
  }
  if(job.status!=="success")return json({ok:true,status:"in_progress",creative_id:creative.id,job_id:jobId});
  if(expected.status==="ready"&&expected.storage_path)return json({ok:true,status:"ready",creative_id:creative.id,job_id:jobId,generated_image:expected});
  const generatedImage=await storeGeneratedImage(token,k,creative,job);
  return json({ok:true,status:"ready",creative_id:creative.id,job_id:jobId,generated_image:generatedImage});
 }
 if(action==="account_status"){
   const rows=[];
   for(const k of ACCOUNTS){
     const [c,t]=await Promise.all([credentials(k),getTokens(k)]);
     rows.push({account_key:k,account_label:LABELS[k],client_credentials_configured:!!(c?.client_id&&c?.client_secret),oauth_connected:!!(t?.refresh_token),token_expiry:t?.expires_at||null,token_expired:!!t?.expires_at&&Date.parse(t.expires_at)<Date.now()});
   }
   return json({ok:true,accounts:rows});
 }
 const k=ACCOUNTS.includes(requested)?requested:null;if(!k)return json({ok:false,error:"account_key must be one of the three configured accounts"},400);
 let t=await getTokens(k);if(!t?.refresh_token)return json({ok:false,error:"Canva OAuth is not connected for "+LABELS[k]},409);
 const c=await credentials(k);if(!c?.client_id||!c?.client_secret)return json({ok:false,error:"Canva Developer credentials are missing for "+LABELS[k]},409);
 if(!t.access_token||!t.expires_at||Date.parse(t.expires_at)<Date.now()+60000)t=await refresh(k,t,c);
 if(action==="publish_creative"){const result=await publishCreative(t,body,k);return json({ok:true,action,account_key:k,result});}
 if(action==="test_connection"){const d=await canva(t,"users/me");return json({ok:true,action,account_key:k,account_label:LABELS[k],result:{connected:true,user_id:d.team_user?.user_id||d.user?.id||null,display_name:d.team_user?.display_name||d.user?.display_name||null,granted_scopes:t.scope||null}});}
 const d=await canva(t,"designs");return json({ok:true,action,account_key:k,account_label:LABELS[k],result:d});
}catch(e){return json({ok:false,error:String(e instanceof Error?e.message:e).slice(0,350)},502);}});