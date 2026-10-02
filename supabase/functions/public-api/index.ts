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
 if(section==="community"){
   const {data:posts,error}=await db.from("community_posts").select("id,title,category,body,location_text,published_at").eq("tenant_id",TENANT_ID).eq("status","published").order("published_at",{ascending:false}).limit(30);
   if(error)return json({error:error.message},500);
   const ids=(posts||[]).map((x:any)=>x.id);
   let comments:any[]=[];let reactions:any[]=[];
   if(ids.length){
     const c=await db.from("community_comments").select("entity_id,body,created_at").eq("tenant_id",TENANT_ID).eq("entity_type","community_post").eq("status","published").in("entity_id",ids).order("created_at",{ascending:true});
     const r=await db.from("community_reactions").select("entity_id,reaction").eq("tenant_id",TENANT_ID).eq("entity_type","community_post").in("entity_id",ids);
     if(c.error)return json({error:c.error.message},500);
     if(r.error)return json({error:r.error.message},500);
     comments=c.data||[];reactions=r.data||[];
   }
   return json((posts||[]).map((p:any)=>({
     ...p,
     comments:comments.filter((c:any)=>c.entity_id===p.id).slice(-5),
     reactions:reactions.filter((r:any)=>r.entity_id===p.id).reduce((a:any,x:any)=>{a[x.reaction]=(a[x.reaction]||0)+1;return a;},{})
   })));
 }
 return json({error:"unknown_section"},404);
});