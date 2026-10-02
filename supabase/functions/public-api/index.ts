import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TENANT_ID="11111111-1111-4111-8111-111111111111";
const H={"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","cache-control":"public, max-age=60"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
Deno.serve(async req=>{
 if(req.method!=="GET")return json({error:"method_not_allowed"},405);
 const section=new URL(req.url).searchParams.get("section")||"health";
 if(section==="health")return json({ok:true,tenant:"konakovo",version:"3.5"});
 if(section==="feed"){
   const {data,error}=await db.from("content_items").select("id,type,title,body,published_at").eq("tenant_id",TENANT_ID).eq("status","published").order("published_at",{ascending:false}).limit(30);
   return error?json({error:error.message},500):json(data);
 }
 if(section==="help"){
   const {data,error}=await db.from("help_requests").select("id,category,title,description,location_text,created_at").eq("tenant_id",TENANT_ID).eq("status","approved").order("created_at",{ascending:false}).limit(30);
   return error?json({error:error.message},500):json(data);
 }
 if(section==="business"){
   const {data,error}=await db.from("businesses").select("id,name,category,description,address,phone,website,verified").eq("tenant_id",TENANT_ID).eq("status","active").order("verified",{ascending:false}).order("name",{ascending:true}).limit(100);
   return error?json({error:error.message},500):json(data);
 }
 return json({error:"unknown_section"},404);
});