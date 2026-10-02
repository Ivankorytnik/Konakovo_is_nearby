import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const TENANT_ID = "11111111-1111-4111-8111-111111111111";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-admin-key",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    }
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function authorized(req: Request) {
  const key = req.headers.get("x-admin-key") || "";
  if (!key) return false;
  const { data, error } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "admin_key_sha256")
    .maybeSingle();
  if (error || !data?.value?.value) return false;
  return (await sha256(key)) === data.value.value;
}

async function getSecret(name: string) {
  const { data, error } = await supabase.rpc("get_platform_secret", { p_name: name });
  if (error) throw error;
  return data as string | null;
}

async function setSecret(name: string, value: string) {
  const { error } = await supabase.rpc("set_platform_secret", { p_name: name, p_secret: value });
  if (error) throw error;
}

async function telegramCall(token: string, method: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.description || `Telegram ${method} failed`);
  }
  return data;
}

async function configureBot(token: string) {
  await telegramCall(token, "setMyName", {
    name: "Конаково Рядом"
  });

  await telegramCall(token, "setMyDescription", {
    description:
      "Городской помощник Конаково: новости, события, помощь, места, объявления и полезная информация рядом."
  });

  await telegramCall(token, "setMyShortDescription", {
    short_description:
      "Конаково рядом: новости, события, помощь, места и полезная городская информация."
  });

  const commands = [
    { command: "start", description: "Открыть главное меню" },
    { command: "nearby", description: "Что происходит рядом" },
    { command: "help", description: "Нужна помощь" },
    { command: "places", description: "Места и бизнес" }
  ];

  await telegramCall(token, "setMyCommands", { commands });
  await telegramCall(token, "setMyCommands", {
    language_code: "ru",
    commands
  });

  await telegramCall(token, "setChatMenuButton", {
    menu_button: { type: "commands" }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (!(await authorized(req))) return json({ error: "unauthorized" }, 401);

  const path = new URL(req.url).pathname.split("/").filter(Boolean).pop();

  if (req.method === "GET" && path === "dashboard") {
    const [profiles, content, help] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT_ID),
      supabase.from("content_items").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT_ID),
      supabase.from("help_requests").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT_ID)
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
      .eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: false })
      .limit(200);
    return error ? json({ error: error.message }, 500) : json(data);
  }

  if (req.method === "GET" && path === "content") {
    const { data, error } = await supabase
      .from("content_items")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: false })
      .limit(200);
    return error ? json({ error: error.message }, 500) : json(data);
  }

  if (req.method === "POST" && path === "content") {
    const body = await req.json();
    if (!body.title?.trim()) return json({ error: "title_required" }, 400);

    const { data, error } = await supabase
      .from("content_items")
      .insert({
        tenant_id: TENANT_ID,
        type: body.type ?? "news",
        title: body.title.trim(),
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
      .eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: false })
      .limit(200);
    return error ? json({ error: error.message }, 500) : json(data);
  }

  if (req.method === "GET" && path === "telegram-status") {
    try {
      const token = await getSecret("telegram_bot_token");
      if (!token) return json({ configured: false });

      const [me, webhook, commands] = await Promise.all([
        telegramCall(token, "getMe"),
        telegramCall(token, "getWebhookInfo"),
        telegramCall(token, "getMyCommands")
      ]);

      return json({
        configured: true,
        bot: me.result,
        webhook: webhook.result,
        commands: commands.result
      });
    } catch (e) {
      return json({
        configured: true,
        error: e instanceof Error ? e.message : String(e)
      }, 500);
    }
  }

  if (req.method === "POST" && path === "telegram-connect") {
    try {
      const body = await req.json();
      const token = String(body.token || "").trim();

      if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
        return json({ error: "invalid_token_format" }, 400);
      }

      const me = await telegramCall(token, "getMe");
      await setSecret("telegram_bot_token", token);

      const webhookSecret = await getSecret("telegram_webhook_secret");
      if (!webhookSecret) return json({ error: "webhook_secret_missing" }, 500);

      const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-webhook`;

      await telegramCall(token, "setWebhook", {
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false
      });

      await configureBot(token);

      const webhook = await telegramCall(token, "getWebhookInfo");
      const commands = await telegramCall(token, "getMyCommands");

      await supabase.from("audit_log").insert({
        tenant_id: TENANT_ID,
        actor: "admin",
        action: "telegram_connected",
        entity_type: "integration",
        entity_id: String(me.result.id),
        metadata: {
          username: me.result.username,
          webhook_url: webhookUrl,
          commands: commands.result
        }
      });

      return json({
        ok: true,
        bot: me.result,
        webhook: webhook.result,
        commands: commands.result
      });
    } catch (e) {
      return json({
        error: e instanceof Error ? e.message : String(e)
      }, 400);
    }
  }

  return json({ error: "not_found" }, 404);
});