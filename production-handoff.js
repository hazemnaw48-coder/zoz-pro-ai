(function(){
"use strict";
const HANDOFF_KEY="zoz-pro-pending-production-handoff-v1";
const SUPABASE_URL="https://vjnwojrqduoxhetutxrs.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqbndvanJxZHVveGhldHV0eHJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxODM3ODcsImV4cCI6MjEwNzc1OTc4N30.2qoa7Fh1qLGGwrOUem7QVTJJivTADTTJPkO_FdbC9_Y";
const CONTENT=SUPABASE_URL+"/functions/v1/zoz-pro-content-center";
let running=false;
function message(text){
 const target=document.querySelector("#login-message");
 if(target){target.textContent=text;target.className="msg warn";}
}
async function importHandoff(){
 if(running)return;
 let h=null;
 try{h=JSON.parse(localStorage.getItem(HANDOFF_KEY)||"null")}catch(_){localStorage.removeItem(HANDOFF_KEY)}
 if(!h)return;
 const isRecommendation=h.handoff_type==="analytics_recommendation"&&h.recommendation;
 const isPackage=!!h.production_package;
 if(!isRecommendation&&!isPackage)return;
 const app=document.querySelector("#app");
 if(!app||app.classList.contains("hidden"))return;
 running=true;
 try{
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data:{session}}=await client.auth.getSession();
  if(!session?.access_token){message("سجّل الدخول بحساب مالك ZOZ Pro لاستلام التوصية. ستبقى محفوظة هنا.");running=false;return;}
  const {data:{user}}=await client.auth.getUser();
  if((user?.email||"").toLowerCase()!=="hazemnaw48@gmail.com"||!user.email_confirmed_at){message("يجب فتح مركز الإنتاج بحساب المالك المؤكد نفسه. التوصية محفوظة ولم تُحذف.");running=false;return;}
  message(isRecommendation?"جارٍ تسليم التوصية المعتمدة وأدلتها إلى مهمة الإنتاج…":"جارٍ استيراد حزمة الإنتاج المرسلة من مركز تحليل القناة…");
  const payload=isRecommendation
   ? {action:"import_recommendation",recommendation:h.recommendation,recommendation_id:h.recommendation.id,analytics_snapshot_id:h.recommendation.snapshot_id,channel_id:h.recommendation.channel_id}
   : {action:"import_package",handoff_id:h.calendar_item_id,calendar_item_id:h.calendar_item_id,analytics_snapshot_id:h.analytics_snapshot_id,topic:h.topic,audience:h.audience,language:h.language,duration_seconds:h.duration_seconds,production_package:h.production_package};
  const response=await fetch(CONTENT,{method:"POST",headers:{authorization:"Bearer "+session.access_token,apikey:SUPABASE_KEY,"content-type":"application/json"},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false)throw new Error(data.error||("HTTP "+response.status));
  const generationNote=isRecommendation?" أُنشئت مهمة بانتظار موافقتك على بدء الإنشاء؛ لم يتم استدعاء نموذج ولم يتم النشر.":"";
  localStorage.removeItem(HANDOFF_KEY);
  const refresh=document.querySelector("#refresh-jobs")||document.querySelector("#refresh");
  if(refresh)refresh.click();
  const jobs=document.querySelector("[data-tab='jobs']");
  if(jobs)jobs.click();
  message((data.already_imported?"هذه التوصية مستلمة سابقًا؛ لم تُكرر المهمة.":(isRecommendation?"وصلت التوصية المعتمدة إلى مركز الإنتاج مع أدلتها وبيانات الفيديو المرجعي.":"تم استيراد الحزمة إلى مركز الإنتاج."))+generationNote+" لم يتم النشر.");

 }catch(e){
  message("تعذر استلام التوصية/الحزمة: "+(e.message||String(e))+". بقيت محفوظة للمحاولة التالية.");
 }finally{running=false;}
}
document.addEventListener("DOMContentLoaded",()=>{
 const app=document.querySelector("#app");
 if(app&&window.MutationObserver)new MutationObserver(()=>{if(!app.classList.contains("hidden"))importHandoff()}).observe(app,{attributes:true,attributeFilter:["class"]});
 const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 client.auth.onAuthStateChange(()=>{setTimeout(importHandoff,300)});
 setTimeout(importHandoff,800);
});
})();