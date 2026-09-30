import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function sendMessage(chatId: number | string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [
          [{ text: "Что происходит рядом", callback_data: "feed" }],
          [{ text: "Нужна помощь", callback_data: "help" }],
          [{ text: "Места и бизнес", callback_data: "business" }]
        ]
      }
    })
  });
  if (!res.ok) throw new Error(await res.text());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== TELEGRAM_WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const update = await req.json();
  const updateId = Number(update.update_id);
  if (!Number.isFinite(updateId)) return new Response("bad update", { status: 400 });

  const { error: insertError } = await supabase
    .from("telegram_updates")
    .insert({ update_id: updateId, payload: update });

  if (insertError && insertError.code === "23505") return new Response("duplicate");
  if (insertError) return new Response(insertError.message, { status: 500 });

  const from = update.message?.from ?? update.callback_query?.from;
  const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;

  if (from) {
    const externalId = String(from.id);
    const { data: identity } = await supabase
      .from("identity_links")
      .select("profile_id")
      .eq("channel", "telegram")
      .eq("external_user_id", externalId)
      .maybeSingle();

    let profileId = identity?.profile_id;

    if (!profileId) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .insert({
          role: "registered",
          display_name: [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Telegram user"
        })
        .select("id")
        .single();

      if (profileError) return new Response(profileError.message, { status: 500 });
      profileId = profile.id;

      const { error: linkError } = await supabase.from("identity_links").insert({
        profile_id: profileId,
        channel: "telegram",
        external_user_id: externalId,
        username: from.username ?? null,
        first_name: from.first_name ?? null,
        last_name: from.last_name ?? null,
        is_primary: true
      });

      if (linkError) return new Response(linkError.message, { status: 500 });
    }
  }

  if (chatId && update.message?.text === "/start") {
    await sendMessage(
      chatId,
      "Конаково Рядом\n\nГородской помощник: события, помощь, места, объявления и полезная информация рядом."
    );
  }

  if (chatId && update.callback_query?.data === "help") {
    await sendMessage(chatId, "Раздел «Помощь» готовится. Здесь можно будет сообщить о потерянных животных, попросить помощи или откликнуться.");
  }

  await supabase
    .from("telegram_updates")
    .update({ processed_at: new Date().toISOString() })
    .eq("update_id", updateId);

  return new Response("ok");
});
