import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ORIGIN="https://ivankorytnik.github.io";
const TENANT_ID="11111111-1111-4111-8111-111111111111";
const H={"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN,"access-control-allow-headers":"content-type,x-admin-key","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
async function sha(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function auth(req:Request){const k=req.headers.get("x-admin-key")||"";if(!k)return false;const {data}=await db.from("app_config").select("value").eq("key","admin_key_sha256").maybeSingle();return !!data?.value?.value&&(await sha(k))===String(data.value.value)}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 if(!(await auth(req)))return json({error:"unauthorized"},401);
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const b=await req.json();
 const roles=["guest","registered","verified","business","admin"];
 const statuses=["active","blocked"];
 if(!b.id||!roles.includes(b.role)||!statuses.includes(b.status))return json({error:"invalid_input"},400);
 const patch:any={role:b.role,status:b.status,updated_at:new Date().toISOString()};
 if(typeof b.beta_allowed==="boolean")patch.beta_allowed=b.beta_allowed;
 const {data,error}=await db.from("profiles").update(patch).eq("tenant_id",TENANT_ID).eq("id",b.id).select().single();
 if(error)return json({error:error.message},400);
 await db.from("audit_log").insert({tenant_id:TENANT_ID,actor:"admin",action:"user_updated",entity_type:"profile",entity_id:String(b.id),metadata:{role:b.role,status:b.status,beta_allowed:b.beta_allowed}});
 return json(data);
});