import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")!;
const ADMIN_ACCESS_KEY = Deno.env.get("ADMIN_ACCESS_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

Deno.serve(async (req) => {
  if (req.headers.get("x-admin-key") !== ADMIN_ACCESS_KEY) {
    return new Response("unauthorized", { status: 401 });
  }

  const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-webhook`;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false
    })
  });

  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
});
