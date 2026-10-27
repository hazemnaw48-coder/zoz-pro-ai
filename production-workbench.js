(function(){
"use strict";
const KEY_NAME="zoz-pro-pending-production-handoff-v1";
const URL="https://vjnwojrqduoxhetutxrs.supabase.co";
const KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInR5cCI6IkpXVCJ9"; 
const PUBLISHABLE="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
const REAL_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6InZqbndvanJxZHVveGhldHV0eHJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxODM3ODcsImV4cCI6MjEwNzc1OTc4N30.2qoa7Fh1qLGGwrOUem7QVTJJivTADTTJPkO_FdbC9_Y";
const CONTENT=URL+"/functions/v1/zoz-pro-content-center";
const MEDIA=URL+"/functions/v1/zoz-pro-media-upload";
const sb=window.supabase.createClient(URL,REAL_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let handoff=null, job=null, busy=false;
function notice(id,text,kind){const e=$(id);if(e){e.textContent=text;e.className="status"+(kind?" "+kind:"");}}
function titleOf(j){return j?.script_json?.title||j?.topic||"مهمة إنتاج";}
function currentPackage(){return handoff?.production_package||handoff?.package||null;}
function recommendation(){return handoff?.recommendation||null;}
async function api(url,body){
 const {data:{session}}=await sb.auth.getSession();
 if(!session?.access_token)throw Error("انتهت جلسة الدخول. سجّل الدخول ثم أعد المحاولة.");
 const r=await fetch(url,{method:body?"POST":"GET",headers:{authorization:"Bearer "+session.access_token,apikey:REAL_KEY,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
 const d=await r.json().catch(()=>({}));
 if(!r.ok||d.ok===false)throw Error(d.error||d.message||("فشل الطلب HTTP "+r.status));
 return d;
}
function showIncoming(){
 handoff=null;
 try{handoff=JSON.parse(localStorage.getItem(KEY_NAME)||"null")}catch(_){}
 const pkg=currentPackage(),rec=recommendation();
 if(!pkg&&!rec){
  $("incoming-type").textContent="لا توجد حزمة واردة";
  notice("incoming-summary","لم تصل حزمة بعد. افتح مركز تحليل القناة ثم اختر «إرسال إلى مركز الإنتاج» من التوصية المعتمدة أو من بطاقة تقويم المحتوى. ستبقى الحزمة محفوظة على نفس نطاق GitHub Pages.","warn");
  $("import-button").disabled=true;$("incoming-details").innerHTML="";
  return;
 }
 $("import-button").disabled=false;
 $("incoming-type").textContent=rec?"توصية تحليل":"حزمة إنتاج";
 const p=pkg||{};
 const lines=rec?[
  ["نوع التوصية",rec.recommendation_type||"—"],["العنوان",rec.title||"—"],["التوجيه",rec.body||"—"],["الدليل التحليلي",JSON.stringify(rec.evidence||{},null,2)],["حالة الاعتماد",rec.status||"—"]
 ]:[
  ["عنوان الفيديو",p.title_for_upload||p.working_title||handoff.topic||"—"],["المدة المستهدفة",(p.target_duration_seconds||handoff.duration_seconds||45)+" ثانية"],["الجمهور",p.audience||handoff.audience||"—"],["الوصف",p.description||"—"],["التعليق الصوتي",(p.narration||[]).map(n=>(n.time||"")+" — "+(n.text||"")).join("\n")||"—"],["خطة المشاهد",(p.shotPlan||[]).map((s,i)=>(i+1)+". "+(s.time||"") +"\nالصورة: "+(s.visual||s.generation_prompt||"—")+"\nالصوت: "+(s.audio||"—")+"\nالنص: "+(s.overlay||"—")).join("\n\n")||"—"],["الوصف/الهاشتاغات",(p.description||"")+"\n"+(p.hashtags||[]).join(" ")],["الكلمات المفتاحية",(p.tags||[]).join("، ")||"—"],["موجز الصورة المصغرة",p.thumbnail_brief||"—"],["مراجعة الحقائق",(p.fact_check||[]).map((x,i)=>(i+1)+". "+x).join("\n")||"يلزم التحقق من المصادر قبل النشر."],["المراجع",(p.sources||[]).map(s=>(s.name||"مصدر")+" — "+(s.url||"")+"\n"+(s.purpose||"")).join("\n\n")||"لم تُرفق مراجع مباشرة."]
 ];
 notice("incoming-summary",rec?"تم التقاط التوصية الواردة من مركز التحليل. ستُنشأ مهمة مستقلة في الإنتاج؛ لن يبدأ أي توليد مدفوع أو نشر تلقائي.":"تم التقاط حزمة الإنتاج من مركز التحليل. راجع العنوان والوصف والمشاهد قبل الاستيراد إلى قاعدة الإنتاج.","good");
 $("incoming-details").innerHTML=lines.map(([h,v])=>'<details class="scene" '+(["عنوان الفيديو","التوجيه","الوصف","التعليق الصوتي","خطة المشاهد"].includes(h)?'open':"")+'><summary>'+esc(h)+'</summary><div class="prewrap">'+esc(v)+'</div></details>').join("");
}
function setAuth(on,email){
 $("auth-pill").textContent=on?"جلسة المالك مؤكدة":"لم يتم التحقق";
 $("login-button").classList.toggle("hidden",on);
 $("password").classList.toggle("hidden",on);
 $("email").classList.toggle("hidden",on);
 $("logout-button").classList.toggle("hidden",!on);
 $("login-card").classList.remove("hidden");
 if(on){$("auth-message").textContent="تم التحقق من جلسة المالك. يمكنك استيراد الحزمة وحفظها في مشروع الإنتاج."; $("auth-message").className="status good";refreshJobs().catch(()=>{});}
 else {$("email").classList.remove("hidden");$("password").classList.remove("hidden");}
}
async function checkSession(){
 const {data:{session}}=await sb.auth.getSession();
 if(!session){setAuth(false);return;}
 const {data:{user}}=await sb.auth.getUser();
 if((user?.email||"").toLowerCase()!=="hazemnaw48@gmail.com"||!user.email_confirmed_at){await sb.auth.signOut();setAuth(false);notice("auth-message","يلزم حساب مالك ZOZ Pro المؤكد في مشروع الإنتاج.","bad");return;}
 setAuth(true,user.email);
}
async function login(e){
 e?.preventDefault();
 const b=$("login-button");b.disabled=true;
 notice("auth-message","جارٍ التحقق من حساب الإنتاج…");
 try{
  const {data,error}=await sb.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
  if(error)throw error;
  if((data.user?.email||"").toLowerCase()!=="hazemnaw48@gmail.com"||!data.user?.email_confirmed_at){await sb.auth.signOut();throw Error("هذا ليس حساب المالك المؤكد لمشروع الإنتاج.");}
  setAuth(true,data.user.email);
 }catch(e){notice("auth-message",e.message||"تعذر تسجيل الدخول.","bad");}
 finally{b.disabled=false;}
}
function packageForImport(){
 const p=currentPackage();
 if(p)return {kind:"package",handoff:handoff,pkg:p};
 const r=recommendation();
 if(r)return {kind:"recommendation",handoff:handoff,rec:r};
 throw Error("لا توجد حزمة أو توصية محفوظة للاستيراد.");
}
async function importIncoming(){
 if(busy)return;busy=true;const b=$("import-button");b.disabled=true;
 try{
  const {kind,handoff:h,pkg,rec}=packageForImport();
  let result;
  if(kind==="recommendation"){
   if(!rec.id||!rec.status||rec.status!=="approved")throw Error("اعتمد التوصية أولًا في مركز التحليل، ثم أرسلها مرة أخرى.");
   result=await api(CONTENT,{action:"import_recommendation",recommendation:rec,recommendation_id:rec.id,analytics_snapshot_id:rec.snapshot_id,channel_id:rec.channel_id});
  }else{
   const shots=Array.isArray(pkg.shotPlan)?pkg.shotPlan:[];
   const narration=Array.isArray(pkg.narration)?pkg.narration:[];
   if(!shots.length||!narration.length)throw Error("حزمة الإنتاج ناقصة: يجب أن تحتوي على خطة مشاهد وتعليق صوتي. لم تُنشأ مهمة ناقصة.");
   const id=h.calendar_item_id||h.handoff_id;
   if(!id)throw Error("معرّف تسليم الحزمة غير موجود؛ ارجع إلى بطاقة التقويم وأرسل الحزمة من جديد.");
   result=await api(CONTENT,{action:"import_package",handoff_id:id,calendar_item_id:h.calendar_item_id||id,analytics_snapshot_id:h.analytics_snapshot_id,topic:h.topic||pkg.title_for_upload,audience:h.audience||pkg.audience,language:h.language||pkg.language||"ar-EG",duration_seconds:h.duration_seconds||pkg.target_duration_seconds||45,production_package:pkg});
  }
  job=result.job;
  if(!job?.id)throw Error("لم يرجع مركز الإنتاج معرّف المهمة بعد الاستيراد.");
  localStorage.removeItem(KEY_NAME);
  handoff=null;
  notice("import-message",(result.already_imported?"هذه الحزمة مستوردة سابقًا؛ تم فتح المهمة المحفوظة. ":"تم استيراد الحزمة وحفظ المهمة. ")+"لم يتم تشغيل توليد مدفوع أو نشر الفيديو.","good");
  await showJob(job);
  await refreshJobs();
 }catch(e){notice("import-message","لم يكتمل الاستيراد: "+(e.message||String(e))+". لم تُحذف الحزمة الواردة.","bad");}
 finally{busy=false;b.disabled=false;showIncoming();}
}
function sceneText(scene,i){
 return ["المشهد "+(scene.scene_number||i+1)+" · "+(scene.time||scene.seconds?String(scene.time||scene.seconds+" ثانية"):""),
 "الوصف البصري: "+(scene.generation_prompt||scene.visual||"حدّد وصفًا بصريًا دقيقًا."),
 "التعليق الصوتي: "+(scene.narration||""),
 "حركة الكاميرا: "+(scene.camera_motion||"حركة سينمائية طبيعية هادئة"),
 "الصوت: "+(scene.sound_design||"التعليق الصوتي الأصلي؛ لا تضف موسيقى تلقائيًا"),
 "الانتقال: "+(scene.transition||"قطع وثائقي نظيف"),
 "ملاحظات: لا تضف شعارات أو علامة مائية. تحقّق من صحة الوقائع وحقوق المشاهد."].join("\n");
}
function showJob(j){
 job=j;const s=j.script_json||{},scenes=Array.isArray(s.scenes)?s.scenes:[];
 $("job-card").classList.remove("hidden");
 $("job-title").textContent=titleOf(j);
 $("job-status").textContent=j.status||"—";
 $("job-meta").textContent="المهمة: "+j.id+" · "+(j.duration_seconds||s.duration_seconds||45)+" ثانية · "+(j.language||"ar");
 $("job-brief").textContent="عنوان YouTube: "+(s.seo_title||s.title||j.topic)+"\n\nالوصف: "+(s.description||s.caption||"—")+"\n\nالكلمات المفتاحية: "+(s.tags||[]).join("، ")+"\n\nالصورة المصغرة: "+(s.thumbnail_brief||"—")+"\n\nملاحظات المصادر: "+(s.source_notes||[]).map(x=>typeof x==="string"?x:(x.name||"")+" "+(x.url||"")).join("\n");
 $("scenes-list").innerHTML=scenes.map((sc,i)=>'<details class="scene" open><summary>'+esc("المشهد "+(sc.scene_number||i+1)+" · "+(sc.time||((sc.seconds||"")+" ثانية")))+'</summary><div class="prewrap">'+esc(sceneText(sc,i))+'</div><div class="actions"><button class="secondary" type="button" data-copy-scene="'+i+'">نسخ تعليمات هذا المشهد</button></div></details>').join("")||'<div class="status warn">لا توجد مشاهد بعد. إذا كانت هذه توصية تحليل، وافق على إعداد المشاهد أولًا.</div>';
 $("prepare-scenes-button").classList.toggle("hidden",!(s.recommendation_context&&!(Array.isArray(s.scenes)&&s.scenes.length)));
 $("prepare-scenes-button").disabled=false;
 $("step-incoming").classList.add("done");$("step-scenes").classList.add("active");$("step-review").classList.remove("active");
 notice("scene-message",scenes.length?"تم تحميل "+scenes.length+" مشاهد من قاعدة الإنتاج. انسخ وصف كل مشهد إلى أداة الفيديو ثم ارفع ملف MP4 النهائي للمراجعة.":"وصلت التوصية إلى الإنتاج، لكن لم تُنشأ المشاهد بعد. اضغط اعتماد إعداد المشاهد لتوليد مسودة محلية مجانية.","good");
}
async function prepareScenes(){
 if(!job)return;
 const b=$("prepare-scenes-button");b.disabled=true;
 try{
  const approval=await api(CONTENT,{action:"approve_creation",job_id:job.id});
  job=approval.job||job;
  notice("scene-message","تم تسجيل موافقتك على إعداد المحتوى. جارٍ إنشاء مسودة مشاهد محلية دون استدعاء Gemini أو Claude…","warn");
  const g=await api(CONTENT,{action:"generate",job_id:job.id,provider:"local"});
  job=g.job||{...job,script_json:g.script_json,status:"script_ready"};
  if(g.script_json)job.script_json=g.script_json;
  showJob(job);await refreshJobs();
  notice("scene-message","اكتملت مسودة المشاهد المحلية. راجع النص والحقائق، ثم نفّذ المشاهد في أداة الفيديو وارفع MP4. لم يتم نشر شيء.","good");
 }catch(e){notice("scene-message","تعذر إعداد المشاهد: "+(e.message||String(e)),"bad");}
 finally{b.disabled=false;}
}
async function refreshJobs(){
 const host=$("recent-list");
 try{
  const d=await api(CONTENT);
  const jobs=Array.isArray(d.jobs)?d.jobs:[];
  host.innerHTML=jobs.map(j=>'<div class="taskitem"><div><div class="name">'+esc(titleOf(j))+'</div><div class="mini">'+esc(j.status||"")+" · "+esc(j.id)+'</div></div><button type="button" class="secondary" data-open-job="'+esc(j.id)+'">فتح</button></div>').join("")||'<div class="mini">لا توجد مهام محفوظة.</div>';
  host.querySelectorAll("[data-open-job]").forEach(b=>b.addEventListener("click",async()=>{const j=jobs.find(x=>x.id===b.dataset.openJob);if(j)showJob(j);}));
 }catch(e){host.innerHTML='<div class="status bad">'+esc(e.message||"تعذر تحميل المهام")+'</div>';}
}
async function loadExistingJob(){
 const params=new URLSearchParams(location.search),task=params.get("task")||params.get("job");
 if(!task)return;
 try{const d=await api(CONTENT);const j=(d.jobs||[]).find(x=>x.id===task);if(j)showJob(j);}
 catch(_){}
}
async function uploadFinal(){
 if(!job)throw Error("استورد الحزمة أو افتح مهمة محفوظة أولًا.");
 const file=$("upload-file").files?.[0];if(!file)throw Error("اختر ملف MP4 النهائي أولًا.");
 if(!file.name.toLowerCase().endsWith(".mp4")&&file.type!=="video/mp4")throw Error("ارفع ملف MP4 نهائيًا.");
 if(file.size<1||file.size>50*1024*1024)throw Error("حجم الملف يجب أن يكون بين 1 بايت و50 ميجابايت في إعداد التخزين الحالي.");
 const b=$("upload-final-button");if(busy)return;busy=true;b.disabled=true;
 try{
  notice("upload-message","١/٣ تجهيز رفع خاص للفيديو النهائي…","warn");
  await api(MEDIA,{action:"save_prompt",job_id:job.id,prompt:job.script_json?.original_prompt||job.script_json?.script||job.topic,source_tool:$("source-tool").value,notes:"تم استلام الناتج النهائي عبر ورشة الإنتاج المستقلة من مصدر "+$("source-tool").value+". الحزمة أصلها من مركز تحليل القناة. ينتظر مراجعة المالك؛ لا نشر تلقائي."});
  const prepared=await api(MEDIA,{action:"prepare_upload",job_id:job.id,filename:file.name,mime_type:"video/mp4",size:file.size,source_tool:$("source-tool").value});
  notice("upload-message","٢/٣ رفع "+(file.size/1024/1024).toFixed(1)+" ميجابايت إلى التخزين الخاص…","warn");
  const {data,error}=await sb.storage.from("zoz-pro-media").uploadToSignedUrl(prepared.path,prepared.token,file,{contentType:"video/mp4"});
  if(error)throw Error(error.message||"فشل رفع الملف.");
  if(!data)throw Error("لم يؤكد التخزين اكتمال الرفع.");
  notice("upload-message","٣/٣ التحقق من الملف وربطه بمهمة الإنتاج…","warn");
  const final=await api(MEDIA,{action:"finalize_upload",job_id:job.id,path:prepared.path,mime_type:"video/mp4",size:file.size,filename:file.name,source_tool:$("source-tool").value,is_final_video:true});
  if(!final.verified_in_storage||!final.job?.video_url)throw Error("لم يؤكد النظام حفظ MP4 وربطه بالمهمة.");
  job=final.job;
  notice("upload-message","تم حفظ MP4 والتحقق منه وربطه بالمهمة. "+(final.production_export?.ok?"تم أيضًا إرساله إلى قائمة الاستقبال للمراجعة.":final.production_export?.error?"تعذر التصدير إلى قائمة النشر: "+final.production_export.error:"لم يؤكد التصدير الآلي إلى مركز النشر.")+" لا يوجد نشر عام تلقائي.","good");
  showJob(job);await refreshJobs();$("upload-file").value="";
 }catch(e){notice("upload-message","فشل حفظ الفيديو: "+(e.message||String(e))+". المهمة محفوظة؛ لم يُنشر الفيديو.","bad");}
 finally{busy=false;b.disabled=false;}
}
async function copyText(text){
 try{await navigator.clipboard.writeText(text);return true;}catch(_){
  const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();const ok=document.execCommand("copy");ta.remove();return ok;
 }
}
function downloadPlan(){
 if(!job)return;
 const s=job.script_json||{},scenes=s.scenes||[];
 const text=["ZOZ PRO — حزمة الإنتاج", "العنوان: "+(s.title||job.topic),"المدة: "+(job.duration_seconds||s.duration_seconds||45),"الوصف: "+(s.description||s.caption||""),"\nالتعليق الصوتي:\n"+(s.voiceover_script||s.script||""),"\nالمشاهد:\n"+scenes.map((sc,i)=>sceneText(sc,i)).join("\n\n----------------\n\n"),"\nالكلمات المفتاحية: "+(s.tags||[]).join("، "),"\nموجز الصورة المصغرة: "+(s.thumbnail_brief||""),"\nالمراجع: "+(s.source_notes||[]).map(x=>typeof x==="string"?x:JSON.stringify(x)).join("\n"),"\nالتحقق المطلوب: "+(s.fact_check_required||[]).join("\n")].join("\n");
 const blob=new Blob(["\ufeff",text],{type:"text/plain;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=(s.title||job.topic||"zoz-production").replace(/[^\p{L}\p{N}-]+/gu,"-").slice(0,50)+".txt";a.click();URL.revokeObjectURL(url);
}
function bind(){
 $("login-form").addEventListener("submit",login);
 $("logout-button").addEventListener("click",async()=>{await sb.auth.signOut();setAuth(false);});
 $("import-button").addEventListener("click",importIncoming);
 $("retry-read-button").addEventListener("click",showIncoming);
 $("refresh-jobs-button").addEventListener("click",refreshJobs);
 $("reload-job-button").addEventListener("click",()=>refreshJobs().then(loadExistingJob));
 $("prepare-scenes-button").addEventListener("click",prepareScenes);
 $("upload-final-button").addEventListener("click",uploadFinal);
 $("download-plan-button").addEventListener("click",downloadPlan);
 $("copy-all-button").addEventListener("click",async()=>{if(!job)return notice("scene-message","افتح مهمة إنتاج أولًا.","warn");const text=(job.script_json?.scenes||[]).map(sceneText).join("\n\n");notice("scene-message",await copyText(text)?"تم نسخ تعليمات كل المشاهد.":"تعذر النسخ التلقائي؛ استخدم تنزيل TXT.","good");});
 $("scenes-list").addEventListener("click",async e=>{const b=e.target.closest("[data-copy-scene]");if(!b||!job)return;const sc=job.script_json?.scenes?.[Number(b.dataset.copyScene)];notice("scene-message",await copyText(sceneText(sc,Number(b.dataset.copyScene)))?"تم نسخ تعليمات المشهد.":"تعذر النسخ؛ نزّل ملف TXT.","good");});
}
document.addEventListener("DOMContentLoaded",async()=>{bind();showIncoming();try{await checkSession();await loadExistingJob();}catch(e){notice("auth-message",e.message||"تعذر فحص الجلسة.","bad");}});
})();