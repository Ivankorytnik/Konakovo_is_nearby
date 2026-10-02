import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ORIGIN="https://ivankorytnik.github.io";
const TENANT_ID="11111111-1111-4111-8111-111111111111";
const H={"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN,"access-control-allow-headers":"content-type,authorization","access-control-allow-methods":"GET,POST,OPTIONS","cache-control":"no-store"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
async function staff(req:Request){
 const h=req.headers.get("authorization")||"";
 if(!h.toLowerCase().startsWith("bearer "))return null;
 const token=h.slice(7).trim();
 const {data:u,error}=await db.auth.getUser(token);
 if(error||!u.user)return null;
 const {data:s}=await db.from("control_center_users").select("email,role,status").eq("tenant_id",TENANT_ID).eq("auth_user_id",u.user.id).maybeSingle();
 return s&&s.status==="active"?s:null;
}
const t=(v:any,n:number)=>{const s=String(v??"").trim();return s?s.slice(0,n):null};
async function notifyOwner(profileId:string,status:string,note?:string|null){
 const {data:link}=await db.from("identity_links").select("external_user_id").eq("tenant_id",TENANT_ID).eq("profile_id",profileId).eq("channel","telegram").maybeSingle();
 if(!link?.external_user_id)return;
 const {data:token}=await db.rpc("get_platform_secret",{p_name:"telegram_bot_token"});
 if(!token)return;
 const label=status==="approved"?"одобрена":"отклонена";
 const text="Конаково Рядом\n\nВаша заявка на регистрацию бизнеса "+label+"."+(note?"\n\nКомментарий модератора: "+String(note).slice(0,500):"");
 await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:link.external_user_id,text})});
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 const staffUser=await staff(req);if(!staffUser)return json({error:"unauthorized"},401);
 if(req.method==="GET"){const {data,error}=await db.from("businesses").select("*").eq("tenant_id",TENANT_ID).order("created_at",{ascending:false}).limit(500);return error?json({error:error.message},500):json(data)}
 if(req.method==="POST"){
 const b=await req.json();
 const name=t(b.name,300);if(!name)return json({error:"name_required"},400);
 const moderation=["pending","approved","rejected"].includes(b.moderation_status)?b.moderation_status:"pending";
 const status=moderation==="approved"?"active":moderation==="rejected"?"archived":"draft";
 const verified=moderation==="approved";
 const patch={
   tenant_id:TENANT_ID,
   name,
   category:t(b.category,200),
   description:t(b.description,5000),
   address:t(b.address,500),
   phone:t(b.phone,100),
   website:t(b.website,1000),
   status,
   verified,
   moderation_status:moderation,
   moderation_note:t(b.moderation_note,2000),
   moderated_at:moderation==="pending"?null:new Date().toISOString(),
   updated_at:new Date().toISOString()
 };
 let q=b.id
   ?db.from("businesses").update(patch).eq("tenant_id",TENANT_ID).eq("id",b.id).select().single()
   :db.from("businesses").insert({...patch,submitted_at:new Date().toISOString()}).select().single();
 const {data,error}=await q;if(error)return json({error:error.message},400);
 if(data.owner_profile_id&&moderation==="approved"){
   await db.from("profiles").update({role:"business",updated_at:new Date().toISOString()}).eq("tenant_id",TENANT_ID).eq("id",data.owner_profile_id);
 }
 await db.from("audit_log").insert({
   tenant_id:TENANT_ID,
   actor:staffUser.email,
   action:b.id?"business_moderated":"business_created",
   entity_type:"business",
   entity_id:String(data.id),
   metadata:{moderation_status:moderation,verified}
 });
 if(data.owner_profile_id&&moderation!=="pending")await notifyOwner(data.owner_profile_id,moderation,b.moderation_note);
 return json(data,b.id?200:201)
 }
 return json({error:"method_not_allowed"},405);
});