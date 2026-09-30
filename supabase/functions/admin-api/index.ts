import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const ADMIN_ACCESS_KEY = Deno.env.get("ADMIN_ACCESS_KEY")!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-admin-key"
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.headers.get("x-admin-key") !== ADMIN_ACCESS_KEY) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const path = url.pathname.split("/").filter(Boolean).pop();

  if (req.method === "GET" && path === "dashboard") {
    const [profiles, content, help] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("content_items").select("*", { count: "exact", head: true }),
      supabase.from("help_requests").select("*", { count: "exact", head: true })
    ]);
    return json({
      users: profiles.count ?? 0,
      content: content.count ?? 0,
      helpRequests: help.count ?? 0,
      version: "3.5 Platform Ready"
    });
  }

  if (req.method === "GET" && path === "users") {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,role,display_name,status,created_at,identity_links(channel,username,external_user_id)")
      .order("created_at", { ascending: false })
      .limit(200);
    return error ? json({ error: error.message }, 500) : json(data);
  }

  if (req.method === "GET" && path === "content") {
    const { data, error } = await supabase
      .from("content_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return error ? json({ error: error.message }, 500) : json(data);
  }

  if (req.method === "POST" && path === "content") {
    const body = await req.json();
    const { data, error } = await supabase
      .from("content_items")
      .insert({
        type: body.type ?? "news",
        title: body.title,
        body: body.body ?? null,
        status: body.status ?? "draft",
        published_at: body.status === "published" ? new Date().toISOString() : null
      })
      .select()
      .single();
    return error ? json({ error: error.message }, 400) : json(data, 201);
  }

  if (req.method === "GET" && path === "help") {
    const { data, error } = await supabase
      .from("help_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return error ? json({ error: error.message }, 500) : json(data);
  }

  return json({ error: "not_found" }, 404);
});
