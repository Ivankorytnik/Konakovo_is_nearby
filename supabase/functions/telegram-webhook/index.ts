import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function getSecret(name: string) {
  const { data, error } = await supabase.rpc("get_platform_secret", { p_name: name });
  if (error) throw error;
  return data as string | null;
}

function keyboard() {
  return {
    inline_keyboard: [
      [{ text: "Что происходит рядом", callback_data: "feed" }],
      [{ text: "Нужна помощь", callback_data: "help" }],
      [{ text: "Места и бизнес", callback_data: "business" }]
    ]
  };
}

async function sendMessage(token: string, chatId: number | string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: keyboard()
    })
  });
  if (!res.ok) throw new Error(await res.text());
}

async function answerCallback(token: string, id: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: id })
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  const [webhookSecret, token] = await Promise.all([
    getSecret("telegram_webhook_secret"),
    getSecret("telegram_bot_token")
  ]);

  if (!webhookSecret || req.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret) {
    return new Response("forbidden", { status: 403 });
  }
  if (!token) return new Response("bot not configured", { status: 503 });

  const update = await req.json();
  const updateId = Number(update.update_id);
  if (!Number.isFinite(updateId)) return new Response("bad update", { status: 400 });

  const { error: insertError } = await supabase
    .from("telegram_updates")
    .insert({ update_id: updateId, payload: update });

  if (insertError?.code === "23505") return new Response("duplicate");
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

    if (!identity?.profile_id) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .insert({
          role: "registered",
          display_name:
            [from.first_name, from.last_name].filter(Boolean).join(" ") ||
            from.username ||
            "Telegram user"
        })
        .select("id")
        .single();

      if (profileError) return new Response(profileError.message, { status: 500 });

      const { error: linkError } = await supabase
        .from("identity_links")
        .insert({
          profile_id: profile.id,
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

  const text = update.message?.text?.trim();
  const action = update.callback_query?.data;

  if (update.callback_query?.id) {
    await answerCallback(token, update.callback_query.id);
  }

  if (chatId && (text === "/start" || text === "/start@konakovo_ryadom_bot")) {
    await sendMessage(
      token,
      chatId,
      "Конаково Рядом\n\nГородской помощник: события, помощь, места, объявления и полезная информация рядом."
    );
  } else if (chatId && (text === "/nearby" || action === "feed")) {
    await sendMessage(
      token,
      chatId,
      "Что происходит рядом\n\nЗдесь будут новости, события и важные сообщения по Конаково."
    );
  } else if (chatId && (text === "/help" || action === "help")) {
    await sendMessage(
      token,
      chatId,
      "Нужна помощь\n\nЗдесь можно будет сообщить о потерянных животных, попросить помощи или откликнуться."
    );
  } else if (chatId && (text === "/places" || action === "business")) {
    await sendMessage(
      token,
      chatId,
      "Места и бизнес\n\nЗдесь появятся услуги, организации, акции и полезные места Конаково."
    );
  } else if (chatId && text?.startsWith("/")) {
    await sendMessage(token, chatId, "Команда пока не поддерживается. Выберите раздел в меню.");
  }

  await supabase
    .from("telegram_updates")
    .update({ processed_at: new Date().toISOString() })
    .eq("update_id", updateId);

  return new Response("ok");
});