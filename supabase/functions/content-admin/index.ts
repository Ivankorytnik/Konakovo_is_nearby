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
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 const staffUser=await staff(req);if(!staffUser)return json({error:"unauthorized"},401);
 if(req.method==="GET"){const {data,error}=await db.from("content_items").select("*").eq("tenant_id",TENANT_ID).order("created_at",{ascending:false}).limit(500);return error?json({error:error.message},500):json(data)}
 if(req.method==="POST"){
   const b=await req.json();const title=t(b.title,300);if(!title)return json({error:"title_required"},400);
   const type=["news","event","alert"].includes(b.type)?b.type:"news";
   const status=["draft","published","archived"].includes(b.status)?b.status:"draft";
   const patch:any={tenant_id:TENANT_ID,title,type,body:t(b.body,20000),status,updated_at:new Date().toISOString()};
   if(status==="published")patch.published_at=new Date().toISOString();
   if(status==="draft")patch.published_at=null;
   let q=b.id?db.from("content_items").update(patch).eq("tenant_id",TENANT_ID).eq("id",b.id).select().single():db.from("content_items").insert(patch).select().single();
   const {data,error}=await q;if(error)return json({error:error.message},400);
   await db.from("audit_log").insert({tenant_id:TENANT_ID,actor:staffUser.email,action:b.id?"content_updated":"content_created",entity_type:"content_item",entity_id:String(data.id),metadata:{status,type}});
   return json(data,b.id?200:201)
 }
 return json({error:"method_not_allowed"},405);
});