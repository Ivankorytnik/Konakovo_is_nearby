import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const ALLOWED_ORIGIN = "https://ivankorytnik.github.io";
const BASE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": ALLOWED_ORIGIN,
  "access-control-allow-headers": "content-type,authorization",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "cache-control": "no-store",
  "vary": "Origin",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: BASE_HEADERS });

function cleanText(value: unknown, max: number, required = false) {
  const v = String(value ?? "").trim().replace(/\u0000/g, "");
  if (required && !v) throw new Error("required_field");
  return v.slice(0, max);
}

async function currentUser(req: Request) {
  const header = req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function ensureProfile(user: any) {
  const { data: existingLink, error: linkError } = await db
    .from("identity_links")
    .select("profile_id")
    .eq("tenant_id", TENANT_ID)
    .eq("channel", "web")
    .eq("external_user_id", user.id)
    .maybeSingle();

  if (linkError) throw linkError;

  if (existingLink?.profile_id) {
    const { data: profile, error } = await db
      .from("profiles")
      .select("id,display_name,email,phone,role,status,created_at")
      .eq("tenant_id", TENANT_ID)
      .eq("id", existingLink.profile_id)
      .maybeSingle();
    if (error) throw error;
    if (!profile) throw new Error("profile_not_found");
    if (profile.status !== "active") throw new Error("profile_blocked");
    return profile;
  }

  const email = cleanText(user.email, 320);
  const metaName = cleanText(
    user.user_metadata?.display_name || user.user_metadata?.full_name || "",
    120
  );
  const displayName = metaName || (email ? email.split("@")[0].slice(0, 80) : "Житель Конаково");

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .insert({
      tenant_id: TENANT_ID,
      role: "registered",
      display_name: displayName,
      email: email || null,
      status: "active",
    })
    .select("id,display_name,email,phone,role,status,created_at")
    .single();

  if (profileError) throw profileError;

  const { error: identityError } = await db.from("identity_links").insert({
    tenant_id: TENANT_ID,
    profile_id: profile.id,
    channel: "web",
    external_user_id: user.id,
    username: email || null,
    first_name: displayName,
    is_primary: true,
  });

  if (identityError) throw identityError;

  await db.from("audit_log").insert({
    tenant_id: TENANT_ID,
    actor: "web",
    action: "resident_profile_created",
    entity_type: "profile",
    entity_id: profile.id,
    metadata: { auth_user_id: user.id },
  });

  return profile;
}

async function getContext(req: Request) {
  const user = await currentUser(req);
  if (!user) return null;
  const profile = await ensureProfile(user);
  return { user, profile };
}

async function audit(profileId: string, action: string, entityType: string, entityId: string, metadata: any = {}) {
  await db.from("audit_log").insert({
    tenant_id: TENANT_ID,
    actor: "web:" + profileId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: BASE_HEADERS });
  if (!["GET", "POST"].includes(req.method)) return json({ error: "method_not_allowed" }, 405);

  try {
    const ctx = await getContext(req);
    if (!ctx) return json({ error: "unauthorized" }, 401);

    const url = new URL(req.url);
    let action = url.searchParams.get("action") || "me";
    let body: any = {};

    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      action = body.action || action;
    }

    const { profile } = ctx;

    if (action === "me") {
      const { data: identities } = await db
        .from("identity_links")
        .select("channel,username,is_primary")
        .eq("tenant_id", TENANT_ID)
        .eq("profile_id", profile.id);

      const { count: unread } = await db
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", TENANT_ID)
        .eq("profile_id", profile.id)
        .is("read_at", null);

      return json({ profile, identities: identities || [], unread_notifications: unread || 0 });
    }

    if (action === "notifications") {
      const { data, error } = await db
        .from("notifications")
        .select("id,type,title,body,entity_type,entity_id,created_at,read_at")
        .eq("tenant_id", TENANT_ID)
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return json(data || []);
    }

    if (action === "mark_notifications_read") {
      const { error } = await db
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("tenant_id", TENANT_ID)
        .eq("profile_id", profile.id)
        .is("read_at", null);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "create_help") {
      const category = cleanText(body.category || "other", 80, true);
      const description = cleanText(body.description, 3000, true);
      const location = cleanText(body.location_text, 300);
      const title = cleanText(body.title || "Нужна помощь", 180, true);

      const { data, error } = await db
        .from("help_requests")
        .insert({
          tenant_id: TENANT_ID,
          author_profile_id: profile.id,
          category,
          title,
          description,
          location_text: location || null,
          status: "new",
        })
        .select("id,status")
        .single();
      if (error) throw error;
      await audit(profile.id, "help_request_created", "help_request", data.id, { category, source_channel: "web" });
      return json(data, 201);
    }

    if (action === "create_post") {
      const category = cleanText(body.category || "general", 80, true);
      const title = cleanText(body.title, 200, true);
      const text = cleanText(body.body, 5000, true);
      const location = cleanText(body.location_text, 300);

      const { data, error } = await db
        .from("community_posts")
        .insert({
          tenant_id: TENANT_ID,
          author_profile_id: profile.id,
          category,
          title,
          body: text,
          location_text: location || null,
          status: "pending",
        })
        .select("id,status")
        .single();
      if (error) throw error;
      await audit(profile.id, "community_post_submitted", "community_post", data.id, { category, source_channel: "web" });
      return json(data, 201);
    }

    if (action === "suggest_content") {
      const type = ["news", "event"].includes(String(body.type)) ? String(body.type) : "news";
      const title = cleanText(body.title, 220, true);
      const text = cleanText(body.body, 6000, true);

      const { data, error } = await db
        .from("content_items")
        .insert({
          tenant_id: TENANT_ID,
          author_profile_id: profile.id,
          type,
          title,
          body: text,
          status: "draft",
          source_name: "Житель / WEB",
          auto_collected: false,
        })
        .select("id,status,type")
        .single();
      if (error) throw error;
      await audit(profile.id, "content_suggested", "content_item", data.id, { type, source_channel: "web" });
      return json(data, 201);
    }

    if (action === "create_business") {
      const name = cleanText(body.name, 300, true);
      const category = cleanText(body.category, 160, true);
      const address = cleanText(body.address, 500, true);
      const phone = cleanText(body.phone, 100, true);
      const website = cleanText(body.website, 1000);
      const description = cleanText(body.description, 5000, true);

      const { data, error } = await db
        .from("businesses")
        .insert({
          tenant_id: TENANT_ID,
          owner_profile_id: profile.id,
          name,
          category,
          address,
          phone,
          website: website || null,
          description,
          status: "draft",
          verified: false,
          moderation_status: "pending",
          submitted_at: new Date().toISOString(),
        })
        .select("id,moderation_status")
        .single();
      if (error) throw error;
      await audit(profile.id, "business_submitted", "business", data.id, { source_channel: "web" });
      return json(data, 201);
    }

    if (action === "comment") {
      const postId = cleanText(body.post_id, 80, true);
      const commentText = cleanText(body.body, 3000, true);

      const { data: post, error: postError } = await db
        .from("community_posts")
        .select("id,author_profile_id,title,comments_enabled,status")
        .eq("tenant_id", TENANT_ID)
        .eq("id", postId)
        .eq("status", "published")
        .maybeSingle();
      if (postError) throw postError;
      if (!post || !post.comments_enabled) return json({ error: "comments_closed" }, 409);

      const { data, error } = await db
        .from("community_comments")
        .insert({
          tenant_id: TENANT_ID,
          author_profile_id: profile.id,
          entity_type: "community_post",
          entity_id: post.id,
          body: commentText,
          status: "published",
        })
        .select("id,created_at")
        .single();
      if (error) throw error;

      if (post.author_profile_id && post.author_profile_id !== profile.id) {
        await db.from("notifications").insert({
          tenant_id: TENANT_ID,
          profile_id: post.author_profile_id,
          type: "community_comment",
          title: "Новый комментарий",
          body: commentText.slice(0, 300),
          entity_type: "community_post",
          entity_id: post.id,
        });
      }

      await audit(profile.id, "community_comment_created", "community_post", post.id, { comment_id: data.id, source_channel: "web" });
      return json(data, 201);
    }

    if (action === "reaction") {
      const postId = cleanText(body.post_id, 80, true);
      const reaction = ["like", "heart"].includes(String(body.reaction)) ? String(body.reaction) : "like";

      const { data: post } = await db
        .from("community_posts")
        .select("id")
        .eq("tenant_id", TENANT_ID)
        .eq("id", postId)
        .eq("status", "published")
        .maybeSingle();
      if (!post) return json({ error: "post_not_found" }, 404);

      const { data: existing } = await db
        .from("community_reactions")
        .select("id")
        .eq("tenant_id", TENANT_ID)
        .eq("profile_id", profile.id)
        .eq("entity_type", "community_post")
        .eq("entity_id", postId)
        .eq("reaction", reaction)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await db
          .from("community_reactions")
          .delete()
          .eq("tenant_id", TENANT_ID)
          .eq("id", existing.id);
        if (error) throw error;
        return json({ active: false });
      }

      const { error } = await db.from("community_reactions").insert({
        tenant_id: TENANT_ID,
        profile_id: profile.id,
        entity_type: "community_post",
        entity_id: postId,
        reaction,
      });
      if (error) throw error;
      return json({ active: true });
    }

    return json({ error: "unknown_action" }, 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal_error";
    if (message === "required_field") return json({ error: "required_field" }, 400);
    if (message === "profile_blocked") return json({ error: "profile_blocked" }, 403);
    console.error("resident-api", e);
    return json({ error: "internal_error" }, 500);
  }
});
