const FOCUS_TASK=new URLSearchParams(location.search).get("task")||"";let focusAutoStarted=false;const URL0="https://vjnwojrqduoxhetutxrs.supabase.co",KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqbndvanJxZHVveGhldHV0eHJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxODM3ODcsImV4cCI6MjEwNzc1OTc4N30.2qoa7Fh1qLGGwrOUem7QVTJJivTADTTJPkO_FdbC9_Y",STUDIO=URL0+"/functions/v1/zoz-pro-studio",CONTENT=URL0+"/functions/v1/zoz-pro-content-center",VIDEO=URL0+"/functions/v1/zoz-pro-video-engine",MEDIA=URL0+"/functions/v1/zoz-pro-media-upload",sb=window.supabase.createClient(URL0,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});let state=null;const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));function msg(s,t,k=""){const e=$(s);if(e){e.textContent=t;e.className="msg "+k}}async function call(url,b){const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)throw Error("سجّل الدخول مجددًا.");const r=await fetch(url,{method:b?"POST":"GET",headers:{authorization:"Bearer "+session.access_token,apikey:KEY,"content-type":"application/json"},...(b?{body:JSON.stringify(b)}:{})}),d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw Error(d.error||d.message||"فشل الطلب "+r.status);return d}function auth(on){$("#login").classList.toggle("hidden",on);$("#app").classList.toggle("hidden",!on);$("#logout").classList.toggle("hidden",!on);$("#connection").textContent=on?"متصل":"غير متصل";$("#connection").className="pill "+(on?"ok":"")}async function boot(){applyProductionFocus();const {data:{session}}=await sb.auth.getSession();if(session){const {data:{user}}=await sb.auth.getUser();if((user?.email||"").toLowerCase()!=="hazemnaw48@gmail.com"||!user.email_confirmed_at){await sb.auth.signOut();auth(false);msg("#login-message","يلزم حساب المالك المؤكد.","bad");return}auth(true);await refresh();await autoStartApprovedFocus()}else auth(false)}
async function autoStartApprovedFocus(){
 if(!FOCUS_TASK||focusAutoStarted)return;
 const job=(state?.jobs||[]).find(j=>j.id===FOCUS_TASK);if(!job)return;
 const sj=job.script_json||{};
 if(sj.production_state!=="approved_for_creation"||(Array.isArray(sj.scenes)&&sj.scenes.length>0))return;
 if(!["queued","generating","script_ready"].includes(job.status))return;
 focusAutoStarted=true;const target="#m-"+FOCUS_TASK;
 if(job.status==="generating"){msg(target,"المهمة قيد الإنشاء بالفعل. انتظر قليلًا ثم حدّث الحالة.","warn");return}
 msg(target,"بدأ التوليد تلقائيًا لأن موافقة الإنشاء محفوظة. نجرب المحركات المتاحة ثم البديل المحلي إذا تعذرت.","warn");
 try{const d=await call(CONTENT,{action:"generate",job_id:FOCUS_TASK,provider:"auto"});const g=d.generation||{};msg(target,"اكتمل توليد النص والمشاهد عبر "+(g.provider||"المحرك المتاح")+". لم يتم نشر الفيديو. انتقل الآن إلى المقاطع الأصلية لإنتاج MP4.","good");await refresh()}
 catch(e){msg(target,"تعذر التوليد التلقائي: "+(e.message||String(e))+". المهمة محفوظة؛ يمكنك إعادة المحاولة من زر توليد النص والمشاهد.","bad")}
}
async function renderLocalMp4(id,target,button){
 const card=button?.closest(".item");
 const job=(state?.jobs||[]).find(x=>x.id===id);
 const imageInput=card?.querySelector("[data-scene-images]");
 const videoInput=card?.querySelector("[data-scene-videos]");
 const videoSource=card?.querySelector("[data-render-source]")?.value||"google-flow";
 let videoFiles=[...(videoInput?.files||[])];
 let sourceTool=(videoFiles.length?videoSource:"zoz-pro-local-renderer");
 if(!button){msg(target,"تعذر تحديد زر إنتاج الفيديو. حدّث الصفحة وأعد المحاولة.","bad");return}
 if(!job?.script_json?.scenes?.length){msg(target,"لا توجد مشاهد محفوظة. اضغط «توليد النص والمشاهد» أولًا.","bad");return}
 if(!window.ZOZLocalRenderer?.render){msg(target,"ملف محرك الإنتاج لم يُحمّل. افتح المركز في Chrome ثم أعد تحميل الصفحة.","bad");return}
 button.disabled=true;
 msg(target,"بدأ إنتاج الفيديو محليًا. جارٍ تجهيز المشاهد؛ أبقِ الصفحة مفتوحة حتى ظهور النتيجة.","warn");
 const status=$(target);
 if(status) status.scrollIntoView({behavior:"smooth",block:"nearest"});
 try{
   if(!videoFiles.length){
     const allStored=(state?.assets||[])
       .filter(x=>x.job_id===id&&x.asset_type==="video"&&x.status==="ready"&&x.storage_path);
     let stored=allStored.filter(x=>x.provider_key===videoSource);
     if(stored.length<8){
       const groups=new Map();
       for(const asset of allStored){const key=asset.provider_key||"manual-upload";groups.set(key,[...(groups.get(key)||[]),asset]);}
       const available=[...groups.entries()].filter(([,items])=>items.length>=8);
       if(available.length===1){sourceTool=available[0][0];stored=available[0][1];}
     }else sourceTool=videoSource;
     stored.sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
     if(stored.length<8) throw Error("وجد المركز "+allStored.length+" مقطعًا محفوظًا لهذه المهمة، لكن لا يوجد 8 مقاطع من مصدر واحد. ارفع المقاطع الثمانية بالترتيب إلى المهمة نفسها؛ لن يخلط المركز مصادر أو مهامًا مختلفة.");
     if(stored.length>8) stored=stored.slice(-8);
     msg(target,"جارٍ جلب أحدث "+stored.length+" مقاطع محفوظة من المصدر "+sourceTool+"، بترتيب الرفع…","warn");
     videoFiles=[];
     for(let i=0;i<stored.length;i++){
       const asset=stored[i];
       const fresh=await call(MEDIA,{action:"get_download_url",job_id:id,asset_id:asset.id});
       const response=await fetch(fresh.url,{method:"GET",cache:"no-store",credentials:"omit"});
       if(!response.ok) throw Error("تعذّر تنزيل المقطع المحفوظ رقم "+(i+1)+" من التخزين ("+response.status+"). أعد المحاولة بعد تحديث الحالة.");
       const blob=await response.blob();
       if(!blob.size) throw Error("المقطع المحفوظ رقم "+(i+1)+" فارغ.");
       videoFiles.push(new File([blob],fresh.filename||asset.metadata?.filename||("scene-"+(i+1)+".mp4"),{type:asset.mime_type||blob.type||"video/mp4"}));
     }
   }
   if(videoFiles.length!==8) throw Error("إيقاف آمن: يلزم 8 مقاطع MP4 أصلية بالضبط، والموجود "+videoFiles.length+". لم يبدأ الدمج ولم يُرفع أي ناتج.");
   const file=await window.ZOZLocalRenderer.render({
     job,
     videoFiles,
     onProgress:p=>msg(target,"تجميع المشاهد وحفظ MP4 النهائي: "+p+"% — أبقِ الصفحة مفتوحة","warn")
   });
   if(file.type!=="video/mp4"||!file.size)throw Error("لم ينتج محرك الإنتاج ملف MP4 صالحًا.");
   if(file.size>50*1024*1024)throw Error("حجم MP4 الناتج "+(file.size/1024/1024).toFixed(1)+" ميجابايت ويتجاوز حد التخزين الحالي 50 ميجابايت. أوقفت الرفع للحفاظ على الجودة الأصلية؛ لم أضغط الفيديو أو أقلل دقته. يلزم رفع حد التخزين في إعدادات Supabase قبل حفظه داخل المركز.");
   msg(target,"2/5 حفظ البرومبت ومصدر الإنتاج مع المهمة…","warn");
   const savedPrompt=job.script_json.original_prompt||job.script_json.script||job.topic;
   await call(MEDIA,{action:"save_prompt",job_id:id,prompt:savedPrompt,source_tool:sourceTool,notes:"تم تجميع MP4 داخل مركز الإنتاج من "+videoFiles.length+" مقاطع حقيقية من "+videoSource+". "+(videoInput?.files?.length?"المقاطع مختارة من الهاتف.":"المقاطع مسترجعة من التخزين الخاص للمهمة.")+" تم استخدام الدمج دون إعادة ترميز أو إضافة نصوص أو شعارات أو موسيقى؛ افحص الصوت في المعاينة قبل النشر."});
   msg(target,"3/5 طلب مسار رفع آمن إلى التخزين الخاص…","warn");
   const prepared=await call(MEDIA,{action:"prepare_upload",job_id:id,filename:file.name,mime_type:"video/mp4",size:file.size,source_tool:sourceTool});
   msg(target,"4/5 رفع ملف MP4 إلى التخزين الخاص ("+(file.size/1024/1024).toFixed(1)+" MB)…","warn");
   const {data:uploadData,error:uploadError}=await sb.storage.from("zoz-pro-media").uploadToSignedUrl(prepared.path,prepared.token,file,{contentType:"video/mp4"});
   if(uploadError)throw Error("فشل رفع MP4 إلى Supabase Storage: "+(uploadError.message||"خطأ في الرفع"));
   if(!uploadData)throw Error("لم يؤكد Supabase اكتمال رفع الملف.");
   msg(target,"5/5 التحقق من الملف وربطه بالمهمة…","warn");
   const final=await call(MEDIA,{action:"finalize_upload",job_id:id,path:prepared.path,mime_type:"video/mp4",size:file.size,filename:file.name,source_tool:sourceTool,is_final_video:true});
   if(!final.verified_in_storage||!final.job?.video_url)throw Error("رُفع الملف لكن لم ينجح التحقق النهائي من ربطه بالمهمة.");
   msg(target,final.production_export?.ok?"نجح الإنتاج والتصدير: تم حفظ MP4 والتحقق منه وإرساله تلقائيًا إلى مركز النشر. لم يتم نشره؛ راجعه هناك ثم وافق على الرفع الخاص.":"تم حفظ MP4 والتحقق منه وربطه بالمهمة. "+(final.production_export?.error?"لكن تعذر تصديره تلقائيًا إلى مركز النشر: "+final.production_export.error:"تعذر تأكيد التصدير الآلي؛ راجع حالة الاستقبال في مركز النشر.")+" لم يتم النشر العام.",final.production_export?.ok?"good":"warn");
   await refresh();
 }catch(err){
   msg(target,"لم يكتمل الإنتاج والحفظ: "+(err?.message||String(err)),"bad");
 }finally{button.disabled=false}
}
function applyProductionFocus(){
 if(!FOCUS_TASK)return;
 document.body.classList.add("production-focus");
 const style=document.createElement("style");
 style.textContent="body.production-focus main{max-width:980px} body.production-focus nav{display:none!important} body.production-focus #tab-home,body.production-focus #tab-content,body.production-focus #tab-channels,body.production-focus #tab-tools{display:none!important} body.production-focus #tab-jobs{display:block!important} body.production-focus #tab-jobs>.row{display:none!important} body.production-focus .intake-panel,body.production-focus #publications,body.production-focus #assets,body.production-focus #tab-jobs>h2{display:none!important} body.production-focus #jobs>.item{max-width:100%;margin:0 auto} body.production-focus #jobs .item{padding:clamp(16px,3vw,28px);border-radius:22px} body.production-focus .script-preview{line-height:1.9} body.production-focus .scene{margin:12px 0;padding:14px;border-radius:14px;background:rgba(127,127,127,.08)} body.production-focus .production-focus-banner{display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 0 18px;padding:18px;border-radius:20px;background:linear-gradient(120deg,rgba(25,100,90,.13),rgba(65,105,170,.10));border:1px solid rgba(120,140,160,.3)} body.production-focus .production-focus-banner h1{font-size:clamp(22px,4vw,32px);margin:0 0 6px} body.production-focus .production-focus-banner p{margin:0;opacity:.82} body.production-focus .production-focus-banner a{display:inline-block;padding:10px 14px;border:1px solid rgba(120,140,160,.45);border-radius:12px;text-decoration:none} body.production-focus .local-render-box{padding:18px;border:1px solid rgba(120,140,160,.35);border-radius:18px;margin-top:18px} body.production-focus button{min-height:42px}";
 document.head.appendChild(style);
 const jobs=$("#tab-jobs");
 if(jobs&&!$("#production-focus-banner")){const banner=document.createElement("div");banner.id="production-focus-banner";banner.className="production-focus-banner";banner.innerHTML='<div><h1>مساحة إنتاج مخصصة</h1><p>مهمة واحدة فقط · لا مهام قديمة ولا نشر تلقائي</p></div><div><a href="./channel-control.html">العودة إلى مركز بيانات القناة</a> <a href="./index.html">كل المهام</a></div>';jobs.prepend(banner)}
 $("#tab-jobs")?.classList.remove("hidden");
}
async function refresh(){
 try{
  state=await call(STUDIO);
  if(FOCUS_TASK){
   try{const detail=await call(STUDIO,{action:"job_detail",job_id:FOCUS_TASK});if(detail?.job){state.jobs=[detail.job];state.assets=detail.assets||[];state.publications=detail.publications||[]}else state.jobs=(state.jobs||[]).filter(j=>j.id===FOCUS_TASK)}
   catch(err){state.jobs=(state.jobs||[]).filter(j=>j.id===FOCUS_TASK);if(!state.jobs.length)throw err}
  }
  render();
 }catch(e){msg("#login-message",e.message,"bad");$("#connection").textContent="تعذر الاتصال";$("#connection").className="pill bad"}
}function pill(s){return '<span class="pill '+(["ready","connected","published","script_ready"].includes(s)?"ok":["error","failed","blocked","needs_auth"].includes(s)?"bad":"warn")+'">'+esc(s||"unknown")+"</span>"}function render(){const a=state||{};const intakeSelect=$("#intake-job");if(intakeSelect){const prev=intakeSelect.value;intakeSelect.innerHTML='<option value="">إنشاء مهمة استلام جديدة</option>'+(a.jobs||[]).map(j=>'<option value="'+esc(j.id)+'">'+esc(j.topic)+" · "+esc(j.status)+" · "+esc(j.id.slice(0,8))+'</option>').join("");if(prev)intakeSelect.value=prev}$("#stats").innerHTML=[["القنوات",(a.channels||[]).length],["المهام",(a.jobs||[]).length],["الملفات",(a.assets||[]).length],["النشر",(a.publications||[]).length]].map(x=>'<div class="stat"><span>'+x[0]+'</span><strong>'+x[1]+"</strong></div>").join("");$("#health").innerHTML=(a.integrations||[]).map(x=>'<article class="health"><div class="healthtop"><h3>'+esc(x.display_name)+'</h3>'+pill(x.status)+'</div><p>'+esc(x.direct_to_supabase?"اتصال مباشر بـ Supabase":x.configured?"تكامل خارجي مُعرّف":"الإعداد غير مكتمل")+'</p><p>'+esc(x.last_error||x.notes||"")+"</p></article>").join("");$("#channels").innerHTML=(a.channels||[]).map(c=>'<article class="panel"><div class="healthtop"><h3>'+esc(c.display_name)+'</h3>'+pill(c.connection_status)+'</div><p>'+esc(c.platform+" · "+(c.handle||c.channel_id))+'</p><p>تفويض مباشر: '+(c.direct_supabase_oauth?"نعم":"لا")+' · النشر: '+(c.can_publish_direct?"مسموح بحسب النطاق":"غير جاهز")+'</p><p class="hint">'+esc((c.scopes||[]).join(", "))+"</p></article>").join("")||'<article class="panel">اربط قناة من الأزرار أعلاه.</article>';$("#jobs").innerHTML=(a.jobs||[]).map(j=>{
 const sj=j.script_json;const hasVideoAsset=(a.assets||[]).some(x=>x.job_id===j.id&&x.asset_type==="video"&&x.status==="ready");const promptHtml=sj&&sj.original_prompt?'<details><summary>البرومبت الأصلي المحفوظ · '+esc(sj.prompt_source||"")+'</summary><pre>'+esc(sj.original_prompt)+'</pre><p>'+esc(sj.intake_notes||"")+'</p></details>':"";
 const scriptHtml=sj?'<section class="script-preview"><h4>'+esc(sj.title||"النص المنتج")+'</h4><p>'+esc(sj.script||"")+'</p>'+promptHtml+'<details><summary>عرض المشاهد ('+((sj.scenes||[]).length)+')</summary>'+((sj.scenes||[]).map((sc,i)=>'<article class="scene"><b>مشهد '+(i+1)+'</b><p>'+esc(sc.narration||"")+'</p><p>'+esc(sc.visual||"")+'</p><p>'+esc(sc.on_screen_text||"")+'</p></article>').join(""))+'</details><p>'+esc(sj.caption||"")+'</p><p>'+esc((sj.hashtags||[]).join(" "))+'</p><details class="production-package"><summary>حزمة الإنتاج الكاملة</summary><p><b>التعليق الصوتي:</b> '+esc(sj.voiceover_script||sj.script||"")+'</p><p><b>عنوان البحث:</b> '+esc(sj.seo_title||sj.title||"")+'</p><p><b>وصف YouTube:</b> '+esc(sj.description||sj.caption||"")+'</p><p><b>الكلمات المفتاحية:</b> '+esc((sj.tags||[]).join(", "))+'</p><p><b>الصورة المصغرة:</b> '+esc(sj.thumbnail_brief||"")+'</p><p><b>تعليق مثبت:</b> '+esc(sj.pinned_comment||"")+'</p><p><b>تعليمات المونتاج:</b> '+esc(sj.editing_notes||"")+'</p><p><b>مصادر يلزم التحقق منها:</b> '+esc((sj.source_notes||[]).map(x=>typeof x==="string"?x:JSON.stringify(x)).join(" | "))+'</p><p><b>قائمة التحقق التاريخي:</b> '+esc((sj.fact_check_required||[]).map(x=>typeof x==="string"?x:JSON.stringify(x)).join(" | "))+'</p><details><summary>ملف الترجمة SRT</summary><pre>'+esc(sj.subtitles_srt||"لم يُنشأ ملف ترجمة مستقل في هذه المهمة.")+'</pre></details></details></section>':'';
 const videoHtml=j.video_url?'<video class="video-preview" controls playsinline preload="metadata" src="'+esc(j.video_url)+'"></video>':'<p>لم يُحفظ MP4 بعد.</p>';
 return '<article class="item"><div class="healthtop"><h3>'+esc(j.topic)+'</h3>'+pill(j.status)+'</div><p>معرّف المهمة: '+esc(j.id)+'</p><p>محرك النص: '+esc(j.generation_provider||"لم يُولّد بعد")+(j.generation_error?' · ملاحظة: '+esc(j.generation_error):'')+'</p>'+scriptHtml+videoHtml+(sj&&sj.recommendation_context&&sj.production_state==="awaiting_creation_approval"?'<div class="panel approval-gate"><b>التوصية مستلمة — الإنشاء متوقف لحين موافقتك</b><p>'+esc(sj.recommendation_context.recommendation_title||j.topic)+'</p><p>الدليل: '+esc(JSON.stringify(sj.recommendation_context.evidence||{}))+'</p><button data-approve-creation="'+esc(j.id)+'" class="primary">الموافقة على بدء الإنشاء</button></div>':'')+'<div class="actions"><select data-provider="'+esc(j.id)+'"><option value="auto" selected>تلقائي: Gemini ثم Claude ثم محلي</option><option value="local">قالب محلي بلا API</option><option value="gemini">تلقائي مع المحركات المتاحة</option><option value="claude">تلقائي مع المحركات المتاحة (بدائل)</option></select><button data-script="'+esc(j.id)+'">توليد النص والمشاهد</button><div class="local-render-box"><p><b>إنتاج MP4 داخل المركز — دون API مدفوع</b></p><label>اختر المقاطع الثمانية الأصلية بصيغة MP4 وبالترتيب الصحيح<input type="file" accept="video/mp4,.mp4" multiple data-scene-videos="'+esc(j.id)+'"></label><label>مصدر المقاطع<select data-render-source="'+esc(j.id)+'"><option value="google-flow">Google Flow / ZOZ NOW</option><option value="manual-upload">مقاطع مرفوعة يدويًا إلى المركز</option><option value="gemini">Gemini</option><option value="kling">Kling</option><option value="luma">Luma</option><option value="runway">Runway</option><option value="pixverse">PixVerse</option><option value="vidu">Vidu</option><option value="qwen">Qwen / Alibaba</option><option value="other">أداة أخرى</option></select></label><p class="hint">يلزم 8 مقاطع MP4 أصلية. عند اختيار الملفات من الهاتف، حدّدها بالترتيب من المشهد 1 إلى المشهد 8. عند استخدام المقاطع المحفوظة، اختر مصدرها؛ سيستخدم المركز أحدث 8 مقاطع من المهمة والمصدر نفسيهما إذا كانت هناك ملفات أقدم مكررة، ولن يخلط مهامًا مختلفة. الدمج دون إعادة ضغط مع الحفاظ على الصوت الأصلي؛ بلا نصوص أو شعارات أو علامات مضافة أو موسيقى. إذا لم تتوافق المقاطع سيوقف الدمج بدل خفض الجودة. راجع المعاينة قبل النشر.</p><button data-render-video="'+esc(j.id)+'">تجميع المقاطع إلى فيديو MP4 نهائي وحفظه للمراجعة</button></div><button data-download-video="'+esc(j.id)+'" '+(hasVideoAsset?"":"disabled title=\"لا يوجد ملف فيديو محفوظ لهذه المهمة بعد\"")+'>تنزيل MP4</button><button data-export="txt" data-job="'+esc(j.id)+'">تنزيل النص TXT</button><button data-export="json" data-job="'+esc(j.id)+'">تنزيل الحزمة JSON</button><div class="channel-checks" style="display:grid;gap:8px;min-width:100%">' + ((a.channels||[]).filter(c=>c.connection_status==="connected"&&c.can_publish_direct).map(c=>'<label style="display:flex;align-items:center;gap:8px"><input type="checkbox" data-publish-channel="'+esc(j.id)+'" value="'+esc(c.platform+"|"+c.channel_id)+'"> '+esc(c.display_name)+' · '+esc(c.platform)+'</label>').join("")||'<p class="hint">لا توجد قنوات مفوضة مباشرة بعد. اربط YouTube أو TikTok من تبويب القنوات أولًا.</p>') + '</div><button data-publish="'+esc(j.id)+'">رفع خاص للقنوات المحددة للمراجعة</button></div><p id="m-'+esc(j.id)+'" class="msg"></p></article>';
}).join("")||'<article class="item">لا توجد مهام؛ أنشئ مهمة من قسم إنتاج المحتوى.</article>';$("#publications").innerHTML=(a.publications||[]).map(p=>'<article class="item"><h3>'+esc(p.platform)+' · '+pill(p.status)+'</h3><p>'+esc(p.remote_post_id||p.error_message||p.result_url||"لا توجد نتيجة نهائية بعد")+"</p></article>").join("")||'<article class="item">لا توجد سجلات نشر.</article>';$("#assets").innerHTML=(a.assets||[]).map(x=>'<article class="item"><h3>'+esc(x.metadata?.filename||x.asset_type)+' · '+pill(x.status)+'</h3><p>النوع: '+esc(x.asset_type)+' · المصدر: '+esc(x.provider_key||"غير محدد")+'</p><p>المهمة: '+esc((a.jobs||[]).find(j=>j.id===x.job_id)?.topic||x.job_id||"ملف عام")+'</p>'+(x.storage_path?'<p class="hint">محفوظ في التخزين الخاص — لا يُعرض المسار الداخلي كرابط عام.</p>':'')+(x.job_id&&x.status==="ready"?'<button type="button" data-asset-download="'+esc(x.id)+'" data-asset-job="'+esc(x.job_id)+'">فتح / تنزيل الملف</button>':'<p class="hint">لا يتوفر تنزيل لهذا الملف في حالته الحالية.</p>')+'</article>').join("")||'<article class="item">لا توجد ملفات.</article>';for(const p of ["gemini","claude"]){const x=(a.integrations||[]).find(y=>y.provider_key===p);msg("#"+p+"-result",x?x.status+(x.last_error?" · "+x.last_error:""):"غير مسجل")}}$("#login-form").addEventListener("submit",async e=>{e.preventDefault();try{const {data,error}=await sb.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});if(error)throw error;const {data:{user}}=await sb.auth.getUser();if((user?.email||"").toLowerCase()!=="hazemnaw48@gmail.com"||!user.email_confirmed_at){await sb.auth.signOut();throw Error("هذا ليس حساب المالك المؤكد.")}auth(true);await refresh()}catch(e){msg("#login-message",e.message,"bad")}});$("#logout").onclick=async()=>{await sb.auth.signOut();auth(false)};$$("[data-tab]").forEach(b=>b.onclick=()=>{$$(".tab").forEach(x=>x.classList.toggle("active",x===b));["home","content","channels","tools","jobs"].forEach(t=>$("#tab-"+t).classList.toggle("hidden",t!==b.dataset.tab))});$("#refresh").onclick=$("#refresh-jobs").onclick=refresh;$$("[data-oauth]").forEach(b=>b.onclick=async()=>{try{const d=await call(STUDIO,{action:"oauth_start",platform:b.dataset.oauth});location.href=d.url}catch(e){alert(e.message)}});$("#test-gemini").onclick=async()=>{msg("#gemini-result","جارٍ الاختبار");try{const d=await call(STUDIO,{action:"gemini_test"});msg("#gemini-result","نجح: "+d.model,"good");await refresh()}catch(e){msg("#gemini-result",e.message,"bad")}};$("#test-claude").onclick=async()=>{msg("#claude-result","جارٍ الاختبار");try{const d=await call(STUDIO,{action:"claude_test"});msg("#claude-result","نجح: "+d.model,"good");await refresh()}catch(e){msg("#claude-result",e.message,"bad")}};$("#intake-job").onchange=()=>{const id=$("#intake-job").value;const job=(state?.jobs||[]).find(x=>x.id===id);if(job){$("#intake-topic").value=job.topic||"";$("#intake-duration").value=String(job.duration_seconds||60);if(!$("#intake-prompt").value.trim()&&job.script_json?.original_prompt)$("#intake-prompt").value=job.script_json.original_prompt;}else{$("#intake-topic").value="";}};
$("#intake-form").onsubmit=async e=>{
  e.preventDefault();
  const button=$("#intake-submit"),files=[...$("#intake-file").files],topic=$("#intake-topic").value.trim(),source=$("#intake-source").value,prompt=$("#intake-prompt").value,notes=$("#intake-notes").value,duration=Number($("#intake-duration").value)||60;
  if(!files.length){msg("#intake-message","اختر فيديو واحدًا أو أكثر من Google Flow أو أداة الفيديو أولًا.","bad");return}
  if(files.length>10){msg("#intake-message","الحد الأقصى 10 فيديوهات في الدفعة الواحدة. أرسل الباقي في دفعة ثانية للمهمة نفسها.","bad");return}
  for(const file of files){
    const isMp4=file.type==="video/mp4"||file.name.toLowerCase().endsWith(".mp4");
    if(!isMp4){msg("#intake-message","الملف «"+file.name+"» ليس MP4. نزّله من Flow بصيغة MP4 ثم أعد المحاولة.","bad");return}
    if(file.size<1||file.size>50*1024*1024){msg("#intake-message","حجم الملف «"+file.name+"» يجب ألا يتجاوز 50 ميجابايت.","bad");return}
  }
  button.disabled=true;$("#intake-result").classList.add("hidden");
  let jobId=$("#intake-job").value;
  const saved=[];
  try{
    if(!jobId){
      msg("#intake-message","1/3 إنشاء مهمة استقبال واحدة للملفات…");
      const created=await call(CONTENT,{action:"create",topic,audience:$("#audience").value||"جمهور عربي عام",language:$("#language").value||"ar",duration_seconds:duration});
      jobId=created.job.id;
    }
    msg("#intake-message","2/3 حفظ مصدر الأداة والبرومبت…");
    await call(MEDIA,{action:"save_prompt",job_id:jobId,prompt,source_tool:source,notes:(notes?notes+"\n":"")+"الملفات المستلمة من "+source+": "+files.map(f=>f.name).join(", ")});
    for(let i=0;i<files.length;i++){
      const file=files[i],mime="video/mp4";
      msg("#intake-message","رفع الفيديو "+(i+1)+"/"+files.length+": "+file.name+"…");
      const prepared=await call(MEDIA,{action:"prepare_upload",job_id:jobId,filename:file.name,mime_type:mime,size:file.size,source_tool:source});
      const {data:uploadData,error:uploadError}=await sb.storage.from("zoz-pro-media").uploadToSignedUrl(prepared.path,prepared.token,file,{contentType:mime});
      if(uploadError)throw Error("فشل رفع "+file.name+" إلى Supabase Storage: "+uploadError.message);
      if(!uploadData)throw Error("لم يؤكد Supabase اكتمال رفع الملف "+file.name+".");
      const final=await call(MEDIA,{action:"finalize_upload",job_id:jobId,path:prepared.path,mime_type:mime,size:file.size,filename:file.name,source_tool:source,is_final_video:false});
      saved.push({name:file.name,url:final.review_url||"",path:prepared.path});
    }
    $("#intake-result").classList.remove("hidden");
    $("#intake-result").innerHTML='<article class="item"><h3>تم نقل '+saved.length+' فيديو إلى مركز الإنتاج وحفظها للمراجعة</h3><p>المهمة: '+esc((state?.jobs||[]).find(j=>j.id===jobId)?.topic||topic)+'</p><p>معرّف المهمة: '+esc(jobId)+'</p><p>المصدر: '+esc(source)+'</p>'+saved.map((v,i)=>'<p>'+(i+1)+'. '+esc(v.name)+' — <a href="'+esc(v.url)+'" target="_blank" rel="noopener">فتح الفيديو المحفوظ</a></p>').join("")+'<p>حُفظت الملفات داخل التخزين الخاص وربطت بالمهمة نفسها. لم يتم النشر العام.</p></article>';
    msg("#intake-message","نجح النقل: تم التحقق من "+saved.length+" ملفات MP4 وربطها بالمهمة نفسها. لم يُنشر أي فيديو.","good");
    $("#intake-file").value="";await refresh();
  }catch(err){msg("#intake-message","توقف النقل بعد "+saved.length+" ملفات محفوظة. الملفات التي تمت بنجاح بقيت في المركز، ويمكن إعادة إرسال الملفات غير المكتملة. "+(err.message||err),"bad")}
  finally{button.disabled=false}
};
$("#create-form").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const d=await call(CONTENT,{action:"create",topic:$("#topic").value.trim(),audience:$("#audience").value,language:$("#language").value,duration_seconds:Number($("#duration").value)});msg("#create-message","تم حفظ المهمة "+d.job.id,"good");$("#new-job").classList.remove("hidden");$("#new-job").innerHTML='<h3>'+esc(d.job.topic)+'</h3><button id="new-script" class="primary">توليد النص والمشاهد</button><p id="new-script-msg" class="msg"></p>';$("#new-script").onclick=()=>script(d.job.id,"#new-script-msg","auto");$("#topic").value="";await refresh()}catch(e){msg("#create-message",e.message,"bad")}finally{b.disabled=false}};async function script(id,target,provider="auto"){if(provider!=="local"&&!confirm("سيستخدم المركز المحركات المهيأة فقط، بالترتيب Gemini ثم Claude، ثم القالب المحلي عند نفاد الحصة أو تعذر الخدمة. لن يتم تفعيل فوترة أو خدمة مدفوعة جديدة. قد تستخدم المحركات المهيأة حصتها الحالية؛ هل تتابع؟"))return;msg(target,provider==="local"?"جارٍ إعداد نص محلي دون API خارجي":"جارٍ تجربة المحركات المتاحة ثم البديل المحلي تلقائيًا");try{const d=await call(CONTENT,{action:"generate",job_id:id,provider});const g=d.generation||{};msg(target,"حُفظ النص عبر "+g.provider+(g.warning?" — "+g.warning:""),g.used_fallback?"warn":"good");await refresh()}catch(e){msg(target,"تعذر إكمال طلب التوليد الآن؛ المهمة محفوظة ولم يتم النشر. "+e.message,"bad")}}async function video(id,target){msg(target,"جارٍ طلب الفيديو");try{const d=await call(VIDEO,{action:"generate_video",job_id:id});msg(target,"حُفظ في التخزين الخاص: "+d.review_url,"good");await refresh()}catch(e){msg(target,e.message,"bad")}}async function publish(id,target,button){
 const selected=[...document.querySelectorAll('[data-publish-channel="'+CSS.escape(id)+'"]:checked')].map(el=>el.value).filter(v=>v.includes("|"));
 if(!selected.length){msg(target,"حدد قناة واحدة على الأقل بعد إتمام التفويض المباشر. لا توجد عملية نشر بدأت.","warn");return}
 if(!confirm("سيتم رفع نسخة خاصة للمراجعة إلى "+selected.length+" قناة محددة. لن تصبح المقاطع عامة تلقائيًا. هل تريد المتابعة؟"))return;
 const results=[];
 if(button)button.disabled=true;
 try{
   for(let i=0;i<selected.length;i++){
     const [platform,channel_id]=selected[i].split("|");
     const channel=(state?.channels||[]).find(c=>c.platform===platform&&c.channel_id===channel_id);
     msg(target,"رفع خاص للمراجعة ("+(i+1)+"/"+selected.length+"): "+(channel?.display_name||platform)+"…","warn");
     try{
       const d=await call(STUDIO,{action:"publish",job_id:id,platform,channel_id});
       results.push((channel?.display_name||platform)+": تم إرسال الفيديو للمنصة بوضع خاص · "+(d.status||"processing")+" · "+(d.remote_post_id||"لا يوجد معرّف بعد"));
     }catch(error){results.push((channel?.display_name||platform)+": فشل الرفع · "+(error?.message||String(error)));}
   }
   msg(target,results.join("\n"),results.every(x=>x.includes("تم إرسال الفيديو"))?"good":"warn");
   await refresh();
 }finally{if(button)button.disabled=false}
}
function downloadText(name,text,mime){const blob=new Blob([text],{type:mime+";charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function downloadVideo(id,target){msg(target,"جارٍ تجهيز رابط MP4 الخاص");try{const d=await call(STUDIO,{action:"video_download",job_id:id});const a=document.createElement("a");a.href=d.url;a.download=d.filename||("ZOZ-Pro-"+id+".mp4");a.target="_blank";a.rel="noopener";document.body.appendChild(a);a.click();a.remove();msg(target,"تم تجهيز رابط التنزيل الخاص (صالح لمدة ساعة).","good")}catch(e){msg(target,e.message,"bad")}}
document.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.assetDownload){const assetId=b.dataset.assetDownload,jobId=b.dataset.assetJob,target="#m-"+jobId;b.disabled=true;call(MEDIA,{action:"get_download_url",job_id:jobId,asset_id:assetId}).then(d=>{const a=document.createElement("a");a.href=d.url;a.download=d.filename||"ZOZ-Pro-asset";a.target="_blank";a.rel="noopener";document.body.appendChild(a);a.click();a.remove();msg(target,"تم تجهيز رابط خاص لتنزيل الملف؛ صالح لمدة 7 أيام.","good")}).catch(err=>msg(target,err.message||"تعذر فتح الملف.","bad")).finally(()=>{b.disabled=false});return}const id=b.dataset.approveCreation||b.dataset.script||b.dataset.video||b.dataset.renderVideo||b.dataset.publish||b.dataset.downloadVideo||b.dataset.job;if(!id)return;const target="#m-"+id;if(b.dataset.approveCreation){if(!confirm("هل توافق على بدء إنشاء النص والمشاهد لهذه التوصية؟ لن يتم نشر المحتوى."))return;b.disabled=true;msg(target,"جارٍ حفظ موافقة الإنشاء…");call(CONTENT,{action:"approve_creation",job_id:id}).then(async d=>{if(d.already_approved){msg(target,"سبق اعتماد الإنشاء؛ جارٍ تحديث المهمة.","good");await refresh();return}msg(target,"تم حفظ موافقتك. جارٍ توليد النص والمشاهد محليًا دون API مدفوع…","warn");await refresh();const generated=await call(CONTENT,{action:"generate",job_id:id,provider:"local"});const provider=generated.generation?.provider||"القالب المحلي";msg(target,"اكتملت الموافقة وتوليد النص والمشاهد عبر "+provider+". لم يتم النشر. لإنتاج فيديو واقعي، اختر المقاطع الأصلية الثمانية من Google Flow ثم اضغط تجميع MP4.","good");await refresh()}).catch(e=>{msg(target,"تعذر إكمال خطوة الإنشاء: "+(e.message||"خطأ غير معروف")+". إذا حُفظت الموافقة بالفعل، حدّث الحالة ثم أعد توليد النص محليًا.","bad");b.disabled=false});return}else if(b.dataset.script){const provider=$('[data-provider="'+CSS.escape(id)+'"]')?.value||"auto";script(id,target,provider)}else if(b.dataset.video)video(id,target);else if(b.dataset.renderVideo)renderLocalMp4(id,target,b);else if(b.dataset.downloadVideo)downloadVideo(id,target);else if(b.dataset.export){const j=(state?.jobs||[]).find(x=>x.id===id);if(!j?.script_json){msg(target,"ولّد النص أولًا قبل تنزيله.","warn");return}if(b.dataset.export==="json")downloadText("ZOZ-Pro-"+id+".json",JSON.stringify({job:{id:j.id,topic:j.topic,audience:j.audience,language:j.language,duration_seconds:j.duration_seconds,status:j.status},script:j.script_json},null,2),"application/json");else downloadText("ZOZ-Pro-"+id+".txt",[j.script_json.title||j.topic,j.script_json.hook||"",j.script_json.script||"", "الوصف: "+(j.script_json.caption||""),"الوسوم: "+(j.script_json.hashtags||[]).join(" "),"دعوة الإجراء: "+(j.script_json.call_to_action||""),"ملاحظات: "+(j.script_json.safety_notes||"")].join("\n\n"),"text/plain")}else if(b.dataset.publish)publish(id,target,b)});boot();