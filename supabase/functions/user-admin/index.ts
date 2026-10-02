import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ORIGIN="https://ivankorytnik.github.io";
const TENANT_ID="11111111-1111-4111-8111-111111111111";
const H={"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN,"access-control-allow-headers":"content-type,authorization","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store"};
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
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 const staffUser=await staff(req);if(!staffUser)return json({error:"unauthorized"},401);
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const b=await req.json();
 const roles=["guest","registered","verified","business","admin"];
 const statuses=["active","blocked"];
 if(!b.id||!roles.includes(b.role)||!statuses.includes(b.status))return json({error:"invalid_input"},400);
 const patch:any={role:b.role,status:b.status,updated_at:new Date().toISOString()};
 if(typeof b.beta_allowed==="boolean")patch.beta_allowed=b.beta_allowed;
 const {data,error}=await db.from("profiles").update(patch).eq("tenant_id",TENANT_ID).eq("id",b.id).select().single();
 if(error)return json({error:error.message},400);
 await db.from("audit_log").insert({tenant_id:TENANT_ID,actor:staffUser.email,action:"user_updated",entity_type:"profile",entity_id:String(b.id),metadata:{role:b.role,status:b.status,beta_allowed:b.beta_allowed}});
 return json(data);
});