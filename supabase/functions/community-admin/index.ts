import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ORIGIN="https://ivankorytnik.github.io";
const TENANT_ID="11111111-1111-4111-8111-111111111111";
const H={"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN,"access-control-allow-headers":"content-type,x-admin-key","access-control-allow-methods":"GET,POST,OPTIONS","cache-control":"no-store"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
async function sha(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function auth(req:Request){const k=req.headers.get("x-admin-key")||"";if(!k)return false;const {data}=await db.from("app_config").select("value").eq("key","admin_key_sha256").maybeSingle();return !!data?.value?.value&&(await sha(k))===String(data.value.value)}
async function notify(profileId:string,text:string){
 const {data:link}=await db.from("identity_links").select("external_user_id").eq("tenant_id",TENANT_ID).eq("profile_id",profileId).eq("channel","telegram").maybeSingle();
 if(!link?.external_user_id)return;
 const {data:token}=await db.rpc("get_platform_secret",{p_name:"telegram_bot_token"});
 if(!token)return;
 await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:link.external_user_id,text})});
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 if(!(await auth(req)))return json({error:"unauthorized"},401);
 const url=new URL(req.url);
 if(req.method==="GET"){
   const [posts,reports]=await Promise.all([
     db.from("community_posts").select("*,profiles!community_posts_author_profile_id_fkey(display_name)").eq("tenant_id",TENANT_ID).order("created_at",{ascending:false}).limit(300),
     db.from("community_reports").select("*").eq("tenant_id",TENANT_ID).order("created_at",{ascending:false}).limit(300)
   ]);
   if(posts.error)return json({error:posts.error.message},500);
   if(reports.error)return json({error:reports.error.message},500);
   return json({posts:posts.data||[],reports:reports.data||[]});
 }
 if(req.method==="POST"){
   const b=await req.json();
   if(b.action==="moderate_post"){
     const allowed=["pending","published","rejected","archived"];
     if(!b.id||!allowed.includes(b.status))return json({error:"invalid_input"},400);
     const patch:any={status:b.status,moderation_note:b.note?String(b.note).slice(0,2000):null,updated_at:new Date().toISOString()};
     if(b.status==="published")patch.published_at=new Date().toISOString();
     const {data,error}=await db.from("community_posts").update(patch).eq("tenant_id",TENANT_ID).eq("id",b.id).select().single();
     if(error)return json({error:error.message},400);
     await db.from("audit_log").insert({tenant_id:TENANT_ID,actor:"admin",action:"community_post_moderated",entity_type:"community_post",entity_id:String(b.id),metadata:{status:b.status}});
     if(data.author_profile_id){
       const label=b.status==="published"?"опубликовано":b.status==="rejected"?"отклонено":b.status;
       await notify(data.author_profile_id,"Конаково Рядом\n\nВаше обсуждение «"+data.title+"» "+label+"."+(b.note?"\n\nКомментарий модератора: "+String(b.note).slice(0,500):""));
     }
     return json(data);
   }
   if(b.action==="resolve_report"){
     const allowed=["new","review","resolved","dismissed"];
     if(!b.id||!allowed.includes(b.status))return json({error:"invalid_input"},400);
     const {data,error}=await db.from("community_reports").update({status:b.status,resolved_at:["resolved","dismissed"].includes(b.status)?new Date().toISOString():null}).eq("tenant_id",TENANT_ID).eq("id",b.id).select().single();
     if(error)return json({error:error.message},400);
     await db.from("audit_log").insert({tenant_id:TENANT_ID,actor:"admin",action:"community_report_updated",entity_type:"community_report",entity_id:String(b.id),metadata:{status:b.status}});
     return json(data);
   }
   return json({error:"unknown_action"},400);
 }
 return json({error:"method_not_allowed"},405);
});