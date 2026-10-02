import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const TENANT_ID = "11111111-1111-4111-8111-111111111111";

async function getSecret(name: string) {
  const { data, error } = await supabase.rpc("get_platform_secret", { p_name: name });
  if (error) throw error;
  return data as string | null;
}

function mainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Открыть Конаково Рядом", web_app: { url: "https://ivankorytnik.github.io/Konakovo_is_nearby/app.html" } }],
      [{ text: "Что происходит рядом", callback_data: "feed" }],
      [{ text: "Нужна помощь", callback_data: "help" }],
      [{ text: "Места и бизнес", callback_data: "business" }],
      [{ text: "Добавить свой бизнес", callback_data: "business_register" }],
      [{ text: "Мой бизнес", callback_data: "my_business" }],
      [{ text: "Помощь рядом", callback_data: "help_list" }],
      [{ text: "Поделиться ботом", callback_data: "share" }],
      [{ text: "Мои обращения", callback_data: "my_help" }],
      [{ text: "Мой профиль", callback_data: "profile" }]
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
      [{ text: "Посмотреть одобренные", callback_data: "help_list" }],
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

async function ensureCommands(token: string) {
  const commands = [
    { command: "start", description: "Открыть главное меню" },
    { command: "nearby", description: "Что происходит рядом" },
    { command: "help", description: "Нужна помощь" },
    { command: "places", description: "Места и бизнес" },
    { command: "share", description: "Поделиться ботом" },
    { command: "requests", description: "Мои обращения" },
    { command: "my", description: "Мой профиль" },
    { command: "business", description: "Мой бизнес" }
  ];
  await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ commands, language_code: "ru" })
  });
  await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      menu_button: {
        type: "web_app",
        text: "Конаково Рядом",
        web_app: { url: "https://ivankorytnik.github.io/Konakovo_is_nearby/app.html" }
      }
    })
  });
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
    .eq("tenant_id", TENANT_ID)
    .eq("channel", "telegram")
    .eq("external_user_id", externalId)
    .maybeSingle();
  if (identityError) throw identityError;
  if (identity?.profile_id) return identity.profile_id as string;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      tenant_id: TENANT_ID,
      role: "registered",
      display_name: [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Telegram user"
    })
    .select("id")
    .single();
  if (profileError) throw profileError;

  const { error: linkError } = await supabase.from("identity_links").insert({
    profile_id: profile.id,
    tenant_id: TENANT_ID,
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
    { profile_id: profileId, tenant_id: TENANT_ID, state, data, updated_at: new Date().toISOString() },
    { onConflict: "profile_id" }
  );
  if (error) throw error;
}

async function clearState(profileId: string) {
  await supabase.from("bot_states").delete().eq("tenant_id", TENANT_ID).eq("profile_id", profileId);
}

async function showFeed(token: string, chatId: number | string) {
  const { data, error } = await supabase
    .from("content_items")
    .select("title,body,published_at,type")
    .eq("tenant_id", TENANT_ID)
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

async function showApprovedHelp(token: string, chatId: number | string) {
  const { data, error } = await supabase
    .from("help_requests")
    .select("title,description,location_text,created_at")
    .eq("tenant_id", TENANT_ID)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  if (!data?.length) {
    await sendMessage(token, chatId, "Пока нет одобренных обращений помощи.");
    return;
  }

  const text = data.map((x: any) => {
    const date = x.created_at ? new Date(x.created_at).toLocaleDateString("ru-RU") : "";
    return `• ${x.title}${date ? " — " + date : ""}\n${x.description || ""}\n${x.location_text ? "Место: " + x.location_text : ""}`;
  }).join("\n\n");

  await sendMessage(token, chatId, "Помощь рядом\n\n" + text);
}

async function showMyHelp(token: string, chatId: number | string, profileId: string) {
  const { data, error } = await supabase
    .from("help_requests")
    .select("title,description,location_text,status,created_at,moderation_note")
    .eq("tenant_id", TENANT_ID)
    .eq("author_profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  if (!data?.length) {
    await sendMessage(token, chatId, "У вас пока нет обращений помощи.");
    return;
  }

  const labels: Record<string,string> = {
    new: "Новое",
    review: "На проверке",
    approved: "Одобрено",
    rejected: "Отклонено",
    closed: "Закрыто"
  };

  const text = data.map((x: any) => {
    const date = new Date(x.created_at).toLocaleDateString("ru-RU");
    return `• ${x.title} — ${labels[x.status] || x.status} — ${date}\n${x.description || ""}${x.moderation_note ? "\nКомментарий: " + x.moderation_note : ""}`;
  }).join("\n\n");

  await sendMessage(token, chatId, "Мои обращения\n\n" + text);
}

async function showProfile(token: string, chatId: number | string, profileId: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name,role,status,created_at,referral_code")
    .eq("tenant_id", TENANT_ID)
    .eq("id", profileId)
    .single();
  if (error) throw error;

  const { count } = await supabase
    .from("referrals")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT_ID)
    .eq("inviter_profile_id", profileId);

  const roles: Record<string,string> = {
    guest: "Гость",
    registered: "Пользователь",
    verified: "Проверенный пользователь",
    business: "Бизнес",
    admin: "Администратор"
  };

  const text = [
    "Мой профиль",
    "",
    profile.display_name ? "Имя: " + profile.display_name : null,
    "Статус: " + (roles[profile.role] || profile.role),
    "В боте с: " + new Date(profile.created_at).toLocaleDateString("ru-RU"),
    "Приглашено людей: " + (count || 0)
  ].filter(Boolean).join("\n");

  await sendMessage(token, chatId, text);
}

async function shareBot(token: string, chatId: number | string, profileId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("referral_code")
    .eq("tenant_id", TENANT_ID)
    .eq("id", profileId)
    .single();
  if (error) throw error;

  const code = data?.referral_code || "";
  const url = `https://t.me/konakovo_ryadom_bot?start=ref_${code}`;

  await sendMessage(
    token,
    chatId,
    "Поделитесь «Конаково Рядом» с друзьями и соседями. Чем больше жителей подключится, тем полезнее станет городской помощник.",
    { inline_keyboard: [
      [{ text: "Открыть ссылку для приглашения", url }],
      [{ text: "Назад", callback_data: "home" }]
    ]}
  );
}

async function registerReferral(profileId: string, startText?: string) {
  if (!startText?.startsWith("/start ref_")) return;
  const code = startText.replace("/start ref_", "").trim().slice(0, 32);
  if (!code) return;

  const { data: inviter } = await supabase
    .from("profiles")
    .select("id")
    .eq("tenant_id", TENANT_ID)
    .eq("referral_code", code)
    .maybeSingle();

  if (!inviter?.id || inviter.id === profileId) return;

  await supabase.from("referrals").insert({
    tenant_id: TENANT_ID,
    inviter_profile_id: inviter.id,
    invitee_profile_id: profileId,
    channel: "telegram"
  });
}

async function showMyBusiness(token: string, chatId: number | string, profileId: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("name,category,address,phone,website,status,verified,moderation_status,moderation_note,created_at")
    .eq("tenant_id", TENANT_ID)
    .eq("owner_profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  if (!data?.length) {
    await sendMessage(token, chatId, "У вас пока нет зарегистрированного бизнеса.");
    return;
  }

  const labels: Record<string,string> = {
    pending: "На проверке",
    approved: "Одобрено",
    rejected: "Отклонено"
  };

  const text = data.map((x: any) => {
    const parts = [
      x.verified ? "✓ " + x.name : x.name,
      x.category,
      "Статус: " + (labels[x.moderation_status] || x.moderation_status),
      x.address,
      x.phone,
      x.website,
      x.moderation_note ? "Комментарий: " + x.moderation_note : null
    ].filter(Boolean);
    return parts.join("\n");
  }).join("\n\n");

  await sendMessage(token, chatId, "Мой бизнес\n\n" + text);
}

async function showBusinesses(token: string, chatId: number | string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("name,category,description,address,phone,website,verified")
    .eq("tenant_id", TENANT_ID)
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
    .insert({ tenant_id: TENANT_ID, update_id: updateId, payload: update });

  if (insertError?.code === "23505") return new Response("duplicate");
  if (insertError) return new Response(insertError.message, { status: 500 });

  const from = update.message?.from ?? update.callback_query?.from;
  const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
  if (!from || !chatId) return new Response("ok");

  const { data: killSwitch } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "kill_switch")
    .maybeSingle();

  if (killSwitch?.value?.enabled === true) {
    await sendMessage(token, chatId, "Конаково Рядом временно недоступен. Попробуйте немного позже.");
    await supabase.from("telegram_updates").update({ processed_at: new Date().toISOString() }).eq("tenant_id", TENANT_ID).eq("update_id", updateId);
    return new Response("ok");
  }

  const profileId = await getOrCreateProfile(from);
  const text = update.message?.text?.trim();
  await registerReferral(profileId, text);

  const { data: profileStatus } = await supabase
    .from("profiles")
    .select("status,beta_allowed")
    .eq("tenant_id", TENANT_ID)
    .eq("id", profileId)
    .single();

  const { data: betaConfig } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "private_beta")
    .maybeSingle();

  if (betaConfig?.value?.enabled === true && profileStatus?.beta_allowed !== true) {
    await sendMessage(token, chatId, "Конаково Рядом сейчас работает в закрытом тестовом режиме. Ваш профиль создан, но доступ должен подтвердить администратор.");
    await supabase.from("telegram_updates").update({ processed_at: new Date().toISOString() }).eq("tenant_id", TENANT_ID).eq("update_id", updateId);
    return new Response("ok");
  }

  if (profileStatus?.status === "blocked") {
    await sendMessage(token, chatId, "Доступ к боту временно ограничен.");
    await supabase.from("telegram_updates").update({ processed_at: new Date().toISOString() }).eq("tenant_id", TENANT_ID).eq("update_id", updateId);
    return new Response("ok");
  }

  const { data: rateAllowed, error: rateError } = await supabase.rpc("consume_rate_limit", {
    p_tenant: TENANT_ID,
    p_profile: profileId
  });
  if (rateError) throw rateError;
  if (!rateAllowed) {
    await sendMessage(token, chatId, "Слишком много запросов за короткое время. Попробуйте через минуту.");
    await supabase.from("telegram_updates").update({ processed_at: new Date().toISOString() }).eq("tenant_id", TENANT_ID).eq("update_id", updateId);
    return new Response("ok");
  }
  const action = update.callback_query?.data;

  if (update.callback_query?.id) await answerCallback(token, update.callback_query.id);

  if (action === "home" || text === "/start" || text?.startsWith("/start ref_") || text === "/start@konakovo_ryadom_bot") {
    await clearState(profileId);
    await ensureCommands(token);
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
  } else if (action === "my_business" || text === "/business") {
    await clearState(profileId);
    await showMyBusiness(token, chatId, profileId);
  } else if (action === "business_register") {
    await setState(profileId, "business_name", {});
    await sendMessage(token, chatId, "Регистрация бизнеса\n\nВведите название организации.", { inline_keyboard: [[{ text: "Отмена", callback_data: "home" }]] });
  } else if (action === "help_list") {
    await clearState(profileId);
    await showApprovedHelp(token, chatId);
  } else if (action === "share" || text === "/share") {
    await clearState(profileId);
    await shareBot(token, chatId, profileId);
  } else if (action === "my_help" || text === "/requests") {
    await clearState(profileId);
    await showMyHelp(token, chatId, profileId);
  } else if (action === "profile" || text === "/my") {
    await clearState(profileId);
    await showProfile(token, chatId, profileId);
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
      .eq("tenant_id", TENANT_ID)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (state?.state === "business_name") {
      await setState(profileId, "business_category", { name: text.slice(0,300) });
      await sendMessage(token, chatId, "Укажите категорию бизнеса. Например: кафе, автосервис, магазин, услуги.", { inline_keyboard: [[{ text: "Отмена", callback_data: "home" }]] });
    } else if (state?.state === "business_category") {
      await setState(profileId, "business_address", { ...state.data, category: text.slice(0,200) });
      await sendMessage(token, chatId, "Введите адрес бизнеса.", { inline_keyboard: [[{ text: "Отмена", callback_data: "home" }]] });
    } else if (state?.state === "business_address") {
      await setState(profileId, "business_phone", { ...state.data, address: text.slice(0,500) });
      await sendMessage(token, chatId, "Введите телефон для связи.", { inline_keyboard: [[{ text: "Отмена", callback_data: "home" }]] });
    } else if (state?.state === "business_phone") {
      await setState(profileId, "business_website", { ...state.data, phone: text.slice(0,100) });
      await sendMessage(token, chatId, "Введите сайт или ссылку на соцсеть. Если нет — напишите «нет».", { inline_keyboard: [[{ text: "Отмена", callback_data: "home" }]] });
    } else if (state?.state === "business_website") {
      await setState(profileId, "business_description", { ...state.data, website: text.toLowerCase()==="нет" ? null : text.slice(0,1000) });
      await sendMessage(token, chatId, "Кратко опишите ваш бизнес и основные услуги.", { inline_keyboard: [[{ text: "Отмена", callback_data: "home" }]] });
    } else if (state?.state === "business_description") {
      const d = state.data || {};
      const { data: row, error } = await supabase.from("businesses").insert({
        tenant_id: TENANT_ID,
        owner_profile_id: profileId,
        name: d.name,
        category: d.category,
        address: d.address,
        phone: d.phone,
        website: d.website,
        description: text.slice(0,5000),
        status: "draft",
        verified: false,
        moderation_status: "pending",
        submitted_at: new Date().toISOString()
      }).select("id").single();
      if (error) throw error;

      await supabase.from("audit_log").insert({
        tenant_id: TENANT_ID,
        actor: "telegram",
        action: "business_submitted",
        entity_type: "business",
        entity_id: row.id,
        metadata: { owner_profile_id: profileId }
      });

      await clearState(profileId);
      await sendMessage(token, chatId, "Заявка на регистрацию бизнеса отправлена на проверку. После модерации я сообщу результат.", mainKeyboard());
    } else if (state?.state === "help_description") {
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
          tenant_id: TENANT_ID,
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
        tenant_id: TENANT_ID,
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
    .eq("tenant_id", TENANT_ID).eq("update_id", updateId);

  return new Response("ok");
});