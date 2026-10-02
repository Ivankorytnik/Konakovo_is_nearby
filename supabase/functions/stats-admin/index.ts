import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ORIGIN="https://ivankorytnik.github.io";
const TENANT_ID="11111111-1111-4111-8111-111111111111";
const H={"content-type":"application/json; charset=utf-8","access-control-allow-origin":ORIGIN,"access-control-allow-headers":"content-type,authorization","access-control-allow-methods":"GET,OPTIONS","cache-control":"no-store"};
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