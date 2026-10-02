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

function mainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Что происходит рядом", callback_data: "feed" }],
      [{ text: "Нужна помощь", callback_data: "help" }],
      [{ text: "Места и бизнес", callback_data: "business" }]
    ]
  };
}

function helpKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Потерялось животное", callback_data: "helpcat:lost_pet" }],
      [{ text: "Нужна помощь", callback_data: "helpcat:need_help" }],
      [{ text: "Могу помочь", callback_data: "helpcat:can_help" }],
      [{ text: "Другое", callback_data: "helpcat:other" }],
      [{ text: "Назад", callback_data: "home" }]
    ]
  };
}

async function sendMessage(token: string, chatId: number | string, text: string, reply_markup?: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: reply_markup ?? mainKeyboard() })
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

async function getOrCreateProfile(from: any) {
  const externalId = String(from.id);
  const { data: identity, error: identityError } = await supabase
    .from("identity_links")
    .select("profile_id")
    .eq("channel", "telegram")
    .eq("external_user_id", externalId)
    .maybeSingle();
  if (identityError) throw identityError;
  if (identity?.profile_id) return identity.profile_id as string;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      role: "registered",
      display_name: [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Telegram user"
    })
    .select("id")
    .single();
  if (profileError) throw profileError;

  const { error: linkError } = await supabase.from("identity_links").insert({
    profile_id: profile.id,
    channel: "telegram",
    external_user_id: externalId,
    username: from.username ?? null,
    first_name: from.first_name ?? null,
    last_name: from.last_name ?? null,
    is_primary: true
  });
  if (linkError) throw linkError;
  return profile.id as string;
}

async function setState(profileId: string, state: string, data: Record<string, unknown> = {}) {
  const { error } = await supabase.from("bot_states").upsert(
    { profile_id: profileId, state, data, updated_at: new Date().toISOString() },
    { onConflict: "profile_id" }
  );
  if (error) throw error;
}

async function clearState(profileId: string) {
  await supabase.from("bot_states").delete().eq("profile_id", profileId);
}

async function showFeed(token: string, chatId: number | string) {
  const { data, error } = await supabase
    .from("content_items")
    .select("title,body,published_at,type")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(5);

  if (error) throw error;
  if (!data?.length) {
    await sendMessage(token, chatId, "Пока нет опубликованных материалов. Лента уже подключена и скоро начнёт наполняться.");
    return;
  }

  const text = data.map((x: any) => {
    const date = x.published_at ? new Date(x.published_at).toLocaleDateString("ru-RU") : "";
    return `• ${x.title}${date ? " — " + date : ""}\n${x.body || ""}`;
  }).join("\n\n");

  await sendMessage(token, chatId, "Что происходит рядом\n\n" + text);
}

async function showBusinesses(token: string, chatId: number | string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("name,category,description,address,phone,website,verified")
    .eq("status", "active")
    .order("verified", { ascending: false })
    .order("name", { ascending: true })
    .limit(10);

  if (error) throw error;
  if (!data?.length) {
    await sendMessage(
      token,
      chatId,
      "Места и бизнес\n\nКаталог уже подключён, но пока пуст. Организации будут появляться после проверки в WEB Control Center."
    );
    return;
  }

  const text = data.map((x: any) => {
    const mark = x.verified ? "✓ " : "";
    const parts = [mark + x.name, x.category, x.address, x.phone, x.website].filter(Boolean);
    return parts.join("\n");
  }).join("\n\n");

  await sendMessage(token, chatId, "Места и бизнес\n\n" + text);
}

const categoryTitles: Record<string,string> = {
  lost_pet: "Потерялось животное",
  need_help: "Нужна помощь",
  can_help: "Могу помочь",
  other: "Другое"
};

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
  if (!from || !chatId) return new Response("ok");

  const profileId = await getOrCreateProfile(from);
  const text = update.message?.text?.trim();
  const action = update.callback_query?.data;

  if (update.callback_query?.id) await answerCallback(token, update.callback_query.id);

  if (action === "home" || text === "/start" || text === "/start@konakovo_ryadom_bot") {
    await clearState(profileId);
    await sendMessage(
      token,
      chatId,
      "Конаково Рядом\n\nГородской помощник: события, помощь, места, объявления и полезная информация рядом.",
      mainKeyboard()
    );
  } else if (action === "feed" || text === "/nearby") {
    await clearState(profileId);
    await showFeed(token, chatId);
  } else if (action === "business" || text === "/places") {
    await clearState(profileId);
    await showBusinesses(token, chatId);
  } else if (action === "help" || text === "/help") {
    await setState(profileId, "help_category");
    await sendMessage(token, chatId, "Нужна помощь\n\nВыберите тип обращения:", helpKeyboard());
  } else if (action?.startsWith("helpcat:")) {
    const category = action.split(":")[1];
    await setState(profileId, "help_description", { category });
    await sendMessage(
      token,
      chatId,
      `${categoryTitles[category] || "Обращение"}\n\nОпишите ситуацию одним сообщением. После этого я попрошу указать место.`,
      { inline_keyboard: [[{ text: "Отмена", callback_data: "home" }]] }
    );
  } else if (text) {
    const { data: state } = await supabase
      .from("bot_states")
      .select("state,data")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (state?.state === "help_description") {
      const category = state.data?.category || "other";
      await setState(profileId, "help_location", { category, description: text });
      await sendMessage(
        token,
        chatId,
        "Теперь напишите место: улица, район или ориентир. Если точное место неважно, напишите «Конаково».",
        { inline_keyboard: [[{ text: "Отмена", callback_data: "home" }]] }
      );
    } else if (state?.state === "help_location") {
      const category = state.data?.category || "other";
      const description = state.data?.description || "";
      const title = categoryTitles[category] || "Обращение";

      const { data: requestRow, error } = await supabase
        .from("help_requests")
        .insert({
          author_profile_id: profileId,
          category,
          title,
          description,
          location_text: text,
          status: "new"
        })
        .select("id")
        .single();

      if (error) throw error;
      await clearState(profileId);

      await supabase.from("audit_log").insert({
        actor: "telegram",
        action: "help_request_created",
        entity_type: "help_request",
        entity_id: requestRow.id,
        metadata: { category }
      });

      await sendMessage(
        token,
        chatId,
        "Готово. Обращение принято и отправлено на модерацию. После проверки оно сможет появиться в разделе помощи.",
        mainKeyboard()
      );
    } else {
      await sendMessage(token, chatId, "Выберите нужный раздел в меню.", mainKeyboard());
    }
  }

  await supabase
    .from("telegram_updates")
    .update({ processed_at: new Date().toISOString() })
    .eq("update_id", updateId);

  return new Response("ok");
});