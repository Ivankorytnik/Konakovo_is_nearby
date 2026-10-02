import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ORIGIN="https://ivankorytnik.github.io";
const TENANT_ID="11111111-1111-4111-8111-111111111111";
const H={"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN,"access-control-allow-headers":"content-type,authorization","access-control-allow-methods":"GET,POST,OPTIONS","cache-control":"no-store"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
async function staff(req:Request){
 const h=req.headers.get("authorization")||""; if(!h.toLowerCase().startsWith("bearer "))return null;
 const token=h.slice(7).trim(); const {data:u,error}=await db.auth.getUser(token); if(error||!u.user)return null;
 const {data:s}=await db.from("control_center_users").select("email,role,status").eq("tenant_id",TENANT_ID).eq("auth_user_id",u.user.id).maybeSingle();
 return s&&s.status==="active"?s:null;
}
const clean=(v:any,n:number)=>{const s=String(v??"").trim();return s?s.slice(0,n):null};
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 const user=await staff(req); if(!user)return json({error:"unauthorized"},401);
 if(req.method==="GET"){
   const u=new URL(req.url); const status=u.searchParams.get("status")||"pending";
   const [{data:items,error},{data:sources},{count:pendingCount}]=await Promise.all([
     db.from("news_candidates").select("*").eq("tenant_id",TENANT_ID).eq("status",status).order("relevance_score",{ascending:false}).order("discovered_at",{ascending:false}).limit(300),
     db.from("news_sources").select("id,name,url,enabled,priority,min_score,last_checked_at,last_success_at,last_error").eq("tenant_id",TENANT_ID).order("priority",{ascending:false}),
     db.from("news_candidates").select("*",{count:"exact",head:true}).eq("tenant_id",TENANT_ID).eq("status","pending")
   ]);
   if(error)return json({error:error.message},500);
   return json({items:items||[],sources:sources||[],pendingCount:pendingCount||0});
 }
 if(req.method==="POST"){
   const b=await req.json();
   if(b.action==="scan"){
     const {data:sc}=await db.from("app_config").select("value").eq("key","news_cron_secret").maybeSingle();
     const secret=sc?.value?.value||"";
     if(!secret)return json({error:"collector_secret_missing"},500);
     const r=await fetch("https://lwzqfmrbwtwfeuuikqsw.supabase.co/functions/v1/news-collector",{method:"POST",headers:{"content-type":"application/json","x-news-cron-secret":secret},body:JSON.stringify({trigger:"admin",actor:user.email})});
     const out=await r.json().catch(()=>({}));
     await db.from("audit_log").insert({tenant_id:TENANT_ID,actor:user.email,action:"news_scan_manual",entity_type:"news_candidate",entity_id:"batch",metadata:out});
     return json(out,r.ok?200:r.status);
   }
   const id=clean(b.id,100); if(!id)return json({error:"id_required"},400);
   const {data:item,error:ie}=await db.from("news_candidates").select("*").eq("tenant_id",TENANT_ID).eq("id",id).maybeSingle();
   if(ie||!item)return json({error:"not_found"},404);
   if(b.action==="reject"){
     const {error}=await db.from("news_candidates").update({status:"rejected",reviewed_by:user.email,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id);
     if(error)return json({error:error.message},400);
     await db.from("audit_log").insert({tenant_id:TENANT_ID,actor:user.email,action:"news_rejected",entity_type:"news_candidate",entity_id:id,metadata:{source:item.source_name,title:item.title}});
     return json({ok:true,status:"rejected"});
   }
   if(b.action==="approve"){
     const title=clean(b.title,300)||item.title; const body=clean(b.body,20000)||item.draft_body||item.title;
     const type=["news","event","alert"].includes(b.type)?b.type:"news";
     const now=new Date().toISOString();
     const {data:content,error}=await db.from("content_items").insert({
       tenant_id:TENANT_ID,type,title,body,status:"published",published_at:now,
       source_name:item.source_name,source_url:item.source_url,source_article_url:item.article_url,
       source_published_at:item.source_published_at,auto_collected:true,updated_at:now
     }).select().single();
     if(error)return json({error:error.message},400);
     await db.from("news_candidates").update({status:"approved",reviewed_by:user.email,reviewed_at:now,published_content_id:content.id,updated_at:now}).eq("id",id);
     await db.from("audit_log").insert({tenant_id:TENANT_ID,actor:user.email,action:"news_approved",entity_type:"content_item",entity_id:String(content.id),metadata:{candidate_id:id,source:item.source_name,article_url:item.article_url}});
     return json({ok:true,content});
   }
   return json({error:"unknown_action"},400);
 }
 return json({error:"method_not_allowed"},405);
});