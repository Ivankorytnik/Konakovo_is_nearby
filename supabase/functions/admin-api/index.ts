import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const TENANT_ID="11111111-1111-4111-8111-111111111111";
const ORIGIN="https://ivankorytnik.github.io";
const H={"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN,"access-control-allow-headers":"content-type,authorization,x-admin-key","access-control-allow-methods":"GET,POST,OPTIONS","cache-control":"no-store"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});

async function sha256(v:string){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
  return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function legacyKeyOk(req:Request){
  const k=req.headers.get("x-admin-key")||"";
  if(!k)return false;
  const {data}=await db.from("app_config").select("value").eq("key","admin_key_sha256").maybeSingle();
  return !!data?.value?.value&&(await sha256(k))===String(data.value.value);
}
async function actor(req:Request){
  const h=req.headers.get("authorization")||"";
  if(!h.toLowerCase().startsWith("bearer "))return null;
  const token=h.slice(7).trim();
  const {data:u,error}=await db.auth.getUser(token);
  if(error||!u.user)return null;
  const {data:staff}=await db.from("control_center_users")
    .select("id,auth_user_id,email,display_name,role,status")
    .eq("tenant_id",TENANT_ID).eq("auth_user_id",u.user.id).maybeSingle();
  if(!staff||staff.status!=="active")return null;
  await db.from("control_center_users").update({last_login_at:new Date().toISOString()})
    .eq("tenant_id",TENANT_ID).eq("id",staff.id);
  return staff;
}
function requireAdmin(a:any){return a?.role==="administrator"}

async function getSecret(name:string){
  const {data,error}=await db.rpc("get_platform_secret",{p_name:name});
  if(error)throw error; return data as string|null;
}
async function setSecret(name:string,value:string){
  const {error}=await db.rpc("set_platform_secret",{p_name:name,p_secret:value});
  if(error)throw error;
}
async function telegramCall(token:string,method:string,body:Record<string,unknown>={}){
  const res=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const data=await res.json(); if(!res.ok||!data.ok)throw new Error(data.description||`Telegram ${method} failed`); return data;
}
async function configureBot(token:string){
  await telegramCall(token,"setMyName",{name:"Конаково Рядом"});
  await telegramCall(token,"setMyDescription",{description:"Городской помощник Конаково: новости, события, помощь, места, объявления и полезная информация рядом."});
  await telegramCall(token,"setMyShortDescription",{short_description:"Конаково рядом: новости, события, помощь, места и полезная городская информация."});
  const commands=[
    {command:"start",description:"Открыть главное меню"},
    {command:"nearby",description:"Что происходит рядом"},
    {command:"help",description:"Нужна помощь"},
    {command:"places",description:"Места и бизнес"}
  ];
  await telegramCall(token,"setMyCommands",{commands});
  await telegramCall(token,"setMyCommands",{language_code:"ru",commands});
  await telegramCall(token,"setChatMenuButton",{menu_button:{type:"commands"}});
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
  const path=new URL(req.url).pathname.split("/").filter(Boolean).pop();

  if(req.method==="GET"&&path==="bootstrap-status"){
    const {count}=await db.from("control_center_users").select("*",{count:"exact",head:true}).eq("tenant_id",TENANT_ID);
    return json({needsBootstrap:(count??0)===0});
  }

  if(req.method==="POST"&&path==="bootstrap-admin"){
    const {count}=await db.from("control_center_users").select("*",{count:"exact",head:true}).eq("tenant_id",TENANT_ID);
    if((count??0)>0)return json({error:"bootstrap_closed"},409);
    if(!(await legacyKeyOk(req)))return json({error:"invalid_setup_key"},401);
    const b=await req.json();
    const email=String(b.email||"").trim().toLowerCase();
    const password=String(b.password||"");
    const display_name=String(b.display_name||"").trim().slice(0,120)||"Администратор";
    if(!email.includes("@")||password.length<10)return json({error:"email_or_password_invalid"},400);
    const {data:u,error:ue}=await db.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{control_center_role:"administrator"}});
    if(ue||!u.user)return json({error:ue?.message||"create_user_failed"},400);
    const {error:se}=await db.from("control_center_users").insert({tenant_id:TENANT_ID,auth_user_id:u.user.id,email,display_name,role:"administrator",status:"active"});
    if(se){await db.auth.admin.deleteUser(u.user.id);return json({error:se.message},400)}
    await db.from("audit_log").insert({tenant_id:TENANT_ID,actor:email,action:"control_center_bootstrap",entity_type:"staff",entity_id:u.user.id,metadata:{role:"administrator"}});
    return json({ok:true},201);
  }

  const a=await actor(req);
  if(!a)return json({error:"unauthorized"},401);

  if(req.method==="GET"&&path==="me")return json(a);

  if(req.method==="GET"&&path==="dashboard"){
    const [profiles,content,help]=await Promise.all([
      db.from("profiles").select("*",{count:"exact",head:true}).eq("tenant_id",TENANT_ID),
      db.from("content_items").select("*",{count:"exact",head:true}).eq("tenant_id",TENANT_ID),
      db.from("help_requests").select("*",{count:"exact",head:true}).eq("tenant_id",TENANT_ID)
    ]);
    return json({users:profiles.count??0,content:content.count??0,helpRequests:help.count??0,version:"3.5 Platform Ready",actor:a});
  }

  if(req.method==="GET"&&path==="users"){
    const {data,error}=await db.from("profiles").select("id,role,display_name,status,beta_allowed,created_at,identity_links(channel,username,external_user_id)")
      .eq("tenant_id",TENANT_ID).order("created_at",{ascending:false}).limit(200);
    return error?json({error:error.message},500):json(data);
  }

  if(req.method==="GET"&&path==="team"){
    if(!requireAdmin(a))return json({error:"forbidden"},403);
    const {data,error}=await db.from("control_center_users").select("id,auth_user_id,email,display_name,role,status,created_at,last_login_at")
      .eq("tenant_id",TENANT_ID).order("created_at",{ascending:true});
    return error?json({error:error.message},500):json(data);
  }

  if(req.method==="POST"&&path==="team"){
    if(!requireAdmin(a))return json({error:"forbidden"},403);
    const b=await req.json(), action=String(b.action||"create");
    if(action==="create"){
      const email=String(b.email||"").trim().toLowerCase(), password=String(b.password||"");
      const display_name=String(b.display_name||"").trim().slice(0,120);
      const role=["administrator","senior_moderator","moderator"].includes(b.role)?b.role:"moderator";
      if(!email.includes("@")||password.length<10)return json({error:"email_or_password_invalid"},400);
      const {data:u,error:ue}=await db.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{control_center_role:role}});
      if(ue||!u.user)return json({error:ue?.message||"create_user_failed"},400);
      const {data:row,error:se}=await db.from("control_center_users").insert({tenant_id:TENANT_ID,auth_user_id:u.user.id,email,display_name:display_name||email,role,status:"active"}).select().single();
      if(se){await db.auth.admin.deleteUser(u.user.id);return json({error:se.message},400)}
      await db.from("audit_log").insert({tenant_id:TENANT_ID,actor:a.email,action:"staff_created",entity_type:"staff",entity_id:u.user.id,metadata:{email,role}});
      return json(row,201);
    }
    if(action==="update"){
      const id=String(b.id||"");
      const role=["administrator","senior_moderator","moderator"].includes(b.role)?b.role:null;
      const status=["active","blocked"].includes(b.status)?b.status:null;
      if(!id||!role||!status)return json({error:"invalid_input"},400);
      const {data:target}=await db.from("control_center_users").select("*").eq("tenant_id",TENANT_ID).eq("id",id).maybeSingle();
      if(!target)return json({error:"not_found"},404);
      if(target.auth_user_id===a.auth_user_id&&status==="blocked")return json({error:"cannot_block_self"},400);
      const {data:row,error}=await db.from("control_center_users").update({role,status,updated_at:new Date().toISOString()}).eq("tenant_id",TENANT_ID).eq("id",id).select().single();
      if(error)return json({error:error.message},400);
      await db.auth.admin.updateUserById(target.auth_user_id,{app_metadata:{control_center_role:role},ban_duration:status==="blocked"?"876000h":"none"});
      await db.from("audit_log").insert({tenant_id:TENANT_ID,actor:a.email,action:"staff_updated",entity_type:"staff",entity_id:target.auth_user_id,metadata:{role,status}});
      return json(row);
    }
    return json({error:"unknown_action"},400);
  }

  if(req.method==="GET"&&path==="telegram-status"){
    if(!requireAdmin(a))return json({error:"forbidden"},403);
    try{
      const token=await getSecret("telegram_bot_token");
      if(!token)return json({configured:false});
      const [me,webhook,commands]=await Promise.all([telegramCall(token,"getMe"),telegramCall(token,"getWebhookInfo"),telegramCall(token,"getMyCommands")]);
      return json({configured:true,bot:me.result,webhook:webhook.result,commands:commands.result});
    }catch(e){return json({configured:true,error:e instanceof Error?e.message:String(e)},500)}
  }

  if(req.method==="POST"&&path==="telegram-connect"){
    if(!requireAdmin(a))return json({error:"forbidden"},403);
    try{
      const b=await req.json(),token=String(b.token||"").trim();
      if(!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token))return json({error:"invalid_token_format"},400);
      const me=await telegramCall(token,"getMe"); await setSecret("telegram_bot_token",token);
      const webhookSecret=await getSecret("telegram_webhook_secret"); if(!webhookSecret)return json({error:"webhook_secret_missing"},500);
      const webhookUrl=`${SUPABASE_URL}/functions/v1/telegram-webhook`;
      await telegramCall(token,"setWebhook",{url:webhookUrl,secret_token:webhookSecret,allowed_updates:["message","callback_query"],drop_pending_updates:false});
      await configureBot(token);
      await db.from("audit_log").insert({tenant_id:TENANT_ID,actor:a.email,action:"telegram_connected",entity_type:"integration",entity_id:String(me.result.id),metadata:{username:me.result.username,webhook_url:webhookUrl}});
      return json({ok:true,bot:me.result});
    }catch(e){return json({error:e instanceof Error?e.message:String(e)},400)}
  }

  return json({error:"not_found"},404);
});