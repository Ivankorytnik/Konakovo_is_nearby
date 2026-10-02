import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ORIGIN="https://ivankorytnik.github.io";
const TENANT_ID="11111111-1111-4111-8111-111111111111";
const H={"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN,"access-control-allow-headers":"content-type,x-admin-key","access-control-allow-methods":"GET,OPTIONS","cache-control":"no-store"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
async function sha(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function auth(req:Request){const k=req.headers.get("x-admin-key")||"";if(!k)return false;const {data}=await db.from("app_config").select("value").eq("key","admin_key_sha256").maybeSingle();return !!data?.value?.value&&(await sha(k))===String(data.value.value)}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 if(!(await auth(req)))return json({error:"unauthorized"},401);
 const [r,a,p,h,b,cp,cpp,cr]=await Promise.all([
  db.from("referrals").select("*",{count:"exact",head:true}).eq("tenant_id",TENANT_ID),
  db.from("profiles").select("*",{count:"exact",head:true}).eq("tenant_id",TENANT_ID).eq("status","active"),
  db.from("content_items").select("*",{count:"exact",head:true}).eq("tenant_id",TENANT_ID).eq("status","published"),
  db.from("help_requests").select("*",{count:"exact",head:true}).eq("tenant_id",TENANT_ID).eq("status","new"),
  db.from("businesses").select("*",{count:"exact",head:true}).eq("tenant_id",TENANT_ID).eq("status","active"),
  db.from("community_posts").select("*",{count:"exact",head:true}).eq("tenant_id",TENANT_ID).eq("status","published"),
  db.from("community_posts").select("*",{count:"exact",head:true}).eq("tenant_id",TENANT_ID).eq("status","pending"),
  db.from("community_reports").select("*",{count:"exact",head:true}).eq("tenant_id",TENANT_ID).eq("status","new")
 ]);
 return json({referrals:r.count??0,activeUsers:a.count??0,publishedContent:p.count??0,newHelp:h.count??0,activeBusinesses:b.count??0,publishedCommunity:cp.count??0,pendingCommunity:cpp.count??0,newCommunityReports:cr.count??0});
});