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
 if(!h||!h.production_package)return;
 const app=document.querySelector("#app");
 if(!app||app.classList.contains("hidden"))return;
 running=true;
 try{
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data:{session}}=await client.auth.getSession();
  if(!session?.access_token){running=false;return;}
  const {data:{user}}=await client.auth.getUser();
  if((user?.email||"").toLowerCase()!=="hazemnaw48@gmail.com"||!user.email_confirmed_at){running=false;return;}
  message("جارٍ استيراد حزمة الإنتاج المرسلة من مركز تحليل القناة…");
  const response=await fetch(CONTENT,{method:"POST",headers:{authorization:"Bearer "+session.access_token,apikey:SUPABASE_KEY,"content-type":"application/json"},body:JSON.stringify({action:"import_package",handoff_id:h.calendar_item_id,calendar_item_id:h.calendar_item_id,analytics_snapshot_id:h.analytics_snapshot_id,topic:h.topic,audience:h.audience,language:h.language,duration_seconds:h.duration_seconds,production_package:h.production_package})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false)throw new Error(data.error||("HTTP "+response.status));
  localStorage.removeItem(HANDOFF_KEY);
  const refresh=document.querySelector("#refresh-jobs")||document.querySelector("#refresh");
  if(refresh)refresh.click();
  const jobs=document.querySelector("[data-tab='jobs']");
  if(jobs)jobs.click();
  message(data.already_imported?"الحزمة مستوردة سابقًا؛ لم تُكرر المهمة.":(data.render_ready?"تم استيراد الحزمة إلى مركز الإنتاج. راجع المشاهد وجهّز المقاطع المتحركة قبل النشر.":(data.message||"تم استيراد الحزمة؛ يلزم استكمال المشاهد قبل الدمج.")));
  const cards=[...document.querySelectorAll("#jobs .item")];
  const card=data.job&&cards.find(x=>x.textContent.includes(data.job.id));
  if(card)card.scrollIntoView({behavior:"smooth",block:"center"});
 }catch(e){
  message("تعذر استيراد الحزمة: "+(e.message||String(e))+". ستبقى الحزمة محفوظة للمحاولة التالية.");
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