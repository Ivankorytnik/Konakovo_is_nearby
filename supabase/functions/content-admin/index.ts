import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ORIGIN="https://ivankorytnik.github.io";
const H={"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN,"access-control-allow-headers":"content-type,x-admin-key","access-control-allow-methods":"GET,POST,OPTIONS","cache-control":"no-store"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
async function sha(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function auth(req:Request){const k=req.headers.get("x-admin-key")||"";if(!k)return false;const {data}=await db.from("app_config").select("value").eq("key","admin_key_sha256").maybeSingle();return !!data?.value?.value&&(await sha(k))===String(data.value.value)}
const t=(v:any,n:number)=>{const s=String(v??"").trim();return s?s.slice(0,n):null};
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 if(!(await auth(req)))return json({error:"unauthorized"},401);
 if(req.method==="GET"){const {data,error}=await db.from("content_items").select("*").order("created_at",{ascending:false}).limit(500);return error?json({error:error.message},500):json(data)}
 if(req.method==="POST"){
   const b=await req.json();const title=t(b.title,300);if(!title)return json({error:"title_required"},400);
   const type=["news","event","alert"].includes(b.type)?b.type:"news";
   const status=["draft","published","archived"].includes(b.status)?b.status:"draft";
   const patch:any={title,type,body:t(b.body,20000),status,updated_at:new Date().toISOString()};
   if(status==="published")patch.published_at=new Date().toISOString();
   if(status==="draft")patch.published_at=null;
   let q=b.id?db.from("content_items").update(patch).eq("id",b.id).select().single():db.from("content_items").insert(patch).select().single();
   const {data,error}=await q;if(error)return json({error:error.message},400);
   await db.from("audit_log").insert({actor:"admin",action:b.id?"content_updated":"content_created",entity_type:"content_item",entity_id:String(data.id),metadata:{status,type}});
   return json(data,b.id?200:201)
 }
 return json({error:"method_not_allowed"},405);
});