import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ORIGIN="https://ivankorytnik.github.io";
const TENANT_ID="11111111-1111-4111-8111-111111111111";
const H={"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN,"access-control-allow-headers":"content-type,x-admin-key","access-control-allow-methods":"GET,POST,OPTIONS","cache-control":"no-store"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
async function sha(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function auth(req:Request){const k=req.headers.get("x-admin-key")||"";if(!k)return false;const {data}=await db.from("app_config").select("value").eq("key","admin_key_sha256").maybeSingle();return !!data?.value?.value&&(await sha(k))===String(data.value.value)}
async function notify(profileId:string,status:string,note?:string|null){
  if(!["approved","rejected","closed"].includes(status))return;
  const {data:link}=await db.from("identity_links").select("external_user_id").eq("tenant_id",TENANT_ID).eq("profile_id",profileId).eq("channel","telegram").maybeSingle();
  if(!link?.external_user_id)return;
  const {data:token}=await db.rpc("get_platform_secret",{p_name:"telegram_bot_token"});
  if(!token)return;
  const label=status==="approved"?"одобрено":status==="rejected"?"отклонено":"закрыто";
  const text="Конаково Рядом\n\nВаше обращение помощи "+label+"."+(note?"\n\nКомментарий модератора: "+String(note).slice(0,500):"");
  await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:link.external_user_id,text})});
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 if(!(await auth(req)))return json({error:"unauthorized"},401);
 if(req.method==="GET"){
   const {data,error}=await db.from("help_requests").select("*").eq("tenant_id",TENANT_ID).order("created_at",{ascending:false}).limit(500);
   return error?json({error:error.message},500):json(data)
 }
 if(req.method==="POST"){
   const b=await req.json();
   const ok=["new","review","approved","rejected","closed"];
   if(!b.id||!ok.includes(b.status))return json({error:"invalid_input"},400);
   const {data,error}=await db.from("help_requests").update({
     status:b.status,
     moderation_note:b.note?String(b.note).slice(0,2000):null,
     moderated_at:b.status==="new"?null:new Date().toISOString(),
     updated_at:new Date().toISOString()
   }).eq("tenant_id",TENANT_ID).eq("id",b.id).select().single();
   if(error)return json({error:error.message},400);
   await db.from("audit_log").insert({tenant_id:TENANT_ID,actor:"admin",action:"help_moderated",entity_type:"help_request",entity_id:String(b.id),metadata:{status:b.status}});
   if(data.author_profile_id)await notify(data.author_profile_id,b.status,b.note);
   return json(data)
 }
 return json({error:"method_not_allowed"},405);
});