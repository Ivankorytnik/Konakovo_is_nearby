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

function baseKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Открыть Конаково Рядом", style: "primary", web_app: { url: "https://ivankorytnik.github.io/Konakovo_is_nearby/app.html" } }],
      [{ text: "Главное меню", callback_data: "home" }]
    ]
  };
}



async function getSectionCounts(profileId: string) {
  const { data: reads } = await supabase
    .from("section_reads")
    .select("section,last_seen_at")
    .eq("tenant_id", TENANT_ID)
    .eq("profile_id", profileId);

  const seen = Object.fromEntries((reads || []).map((x: any) => [x.section, x.last_seen_at]));

  const [
    feedTotal, communityTotal, helpTotal,
    feedNew, communityNew, helpNew, communityNotifications
  ] = await Promise.all([
    supabase.from("content_items").select("*", { count: "exact", head: true })
      .eq("tenant_id", TENANT_ID).eq("status", "published"),
    supabase.from("community_posts").select("*", { count: "exact", head: true })
      .eq("tenant_id", TENANT_ID).eq("status", "published"),
    supabase.from("help_requests").select("*", { count: "exact", head: true })
      .eq("tenant_id", TENANT_ID).eq("status", "approved"),

    seen.feed
      ? supabase.from("content_items").select("*", { count: "exact", head: true })
          .eq("tenant_id", TENANT_ID).eq("status", "published").gt("published_at", seen.feed)
      : supabase.from("content_items").select("*", { count: "exact", head: true })
          .eq("tenant_id", TENANT_ID).eq("status", "published"),

    seen.community
      ? supabase.from("community_posts").select("*", { count: "exact", head: true })
          .eq("tenant_id", TENANT_ID).eq("status", "published").gt("published_at", seen.community)
      : supabase.from("community_posts").select("*", { count: "exact", head: true })
          .eq("tenant_id", TENANT_ID).eq("status", "published"),

    seen.help
      ? supabase.from("help_requests").select("*", { count: "exact", head: true })
          .eq("tenant_id", TENANT_ID).eq("status", "approved").gt("moderated_at", seen.help)
      : supabase.from("help_requests").select("*", { count: "exact", head: true })
          .eq("tenant_id", TENANT_ID).eq("status", "approved"),

    supabase.from("notifications").select("*", { count: "exact", head: true })
      .eq("tenant_id", TENANT_ID)
      .eq("profile_id", profileId)
      .is("read_at", null)
      .in("type", ["community_comment","community_reply","community_dm"])
  ]);

  return {
    feed: { total: feedTotal.count || 0, fresh: feedNew.count || 0 },
    community: { total: communityTotal.count || 0, fresh: (communityNew.count || 0) + (communityNotifications.count || 0) },
    help: { total: helpTotal.count || 0, fresh: helpNew.count || 0 }
  };
}

function countLabel(title: string, total: number, fresh: number) {
  return fresh > 0 ? title + " · " + total + " · новых " + fresh : title + " · " + total;
}

async function countedKeyboard(profileId: string) {
  const c = await getSectionCounts(profileId);
  return {
    inline_keyboard: [
      // Вход / витрина
      [{ text: "Открыть Конаково Рядом", style: "primary", web_app: { url: "https://ivankorytnik.github.io/Konakovo_is_nearby/app.html" } }],

      // Информация и общение
      [{ text: countLabel("Что происходит рядом", c.feed.total, c.feed.fresh), style: "primary", callback_data: "feed" }],
      [{ text: countLabel("Общение жителей", c.community.total, c.community.fresh), style: "primary", callback_data: "community" }],

      // Помощь
      [{ text: countLabel("Помощь рядом", c.help.total, c.help.fresh), callback_data: "help_list" }],
      [{ text: "Нужна помощь", callback_data: "help" }],
      [{ text: "Мои обращения", callback_data: "my_help" }],

      // Бизнес
      [{ text: "Места и бизнес", style: "success", callback_data: "business" }],
      [{ text: "Добавить свой бизнес", style: "success", callback_data: "business_register" }],
      [{ text: "Мой бизнес", style: "success", callback_data: "my_business" }],

      // Личное / распространение
      [{ text: "Мой профиль", callback_data: "profile" }],
      [{ text: "Поделиться ботом", callback_data: "share" }]
    ]
  };
}


async function markSectionRead(profileId: string, section: "feed" | "community" | "help") {
  const now = new Date().toISOString();
  await supabase.from("section_reads").upsert({
    tenant_id: TENANT_ID,
    profile_id: profileId,
    section,
    last_seen_at: now,
    updated_at: now
  }, { onConflict: "tenant_id,profile_id,section" });

  if (section === "community") {
    await supabase.from("notifications")
      .update({ read_at: now })
      .eq("tenant_id", TENANT_ID)
      .eq("profile_id", profileId)
      .is("read_at", null)
      .in("type", ["community_comment","community_reply","community_dm"]);
  }
}

function helpKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Потерялось животное", callback_data: "helpcat:lost_pet" }],
      [{ text: "Нужна помощь", callback_data: "helpcat:need_help" }],
      [{ text: "Могу помочь", callback_data: "helpcat:can_help" }],
      [{ text: "Другое", callback_data: "helpcat:other" }],
      [{ text: "Посмотреть одобренные", style: "primary", callback_data: "help_list" }],
      [{ text: "Назад", callback_data: "home" }]
    ]
  };
}

async function sendMessage(token: string, chatId: number | string, text: string, reply_markup?: unknown) {
  let markup = reply_markup;
  if (!markup) {
    const { data: link } = await supabase
      .from("identity_links")
      .select("profile_id")
      .eq("tenant_id", TENANT_ID)
      .eq("channel", "telegram")
      .eq("external_user_id", String(chatId))
      .maybeSingle();
    markup = link?.profile_id ? await countedKeyboard(link.profile_id) : baseKeyboard();
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: markup })
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
    { command: "business", description: "Мой бизнес" },
    { command: "community", description: "Общение жителей" },
    { command: "helpnearby", description: "Помощь рядом" },
    { command: "addbusiness", description: "Добавить свой бизнес" }
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


async function sendToProfile(token: string, profileId: string, messageText: string, replyMarkup?: unknown) {
  const { data: link } = await supabase
    .from("identity_links")
    .select("external_user_id")
    .eq("tenant_id", TENANT_ID)
    .eq("profile_id", profileId)
    .eq("channel", "telegram")
    .maybeSingle();
  if (!link?.external_user_id) return;
  await sendMessage(token, link.external_user_id, messageText, replyMarkup);
}

async function showCommunity(token: string, chatId: number | string) {
  const { data: posts, error } = await supabase
    .from("community_posts")
    .select("id,title")
    .eq("tenant_id", TENANT_ID)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(8);
  if (error) throw error;

  if (!posts?.length) {
    await sendMessage(token, chatId, "Общение жителей\n\nПока опубликованных обсуждений нет. Можно создать первое.", {
      inline_keyboard: [
        [{ text: "Создать обсуждение", style: "success", callback_data: "community_new" }],
        [{ text: "Назад", callback_data: "home" }]
      ]
    });
    return;
  }

  const rows = posts.map((p: any) => [{ text: String(p.title).slice(0, 48), callback_data: "cpost:" + p.id }]);
  rows.push([{ text: "Создать обсуждение", callback_data: "community_new" }]);
  rows.push([{ text: "Мои обсуждения", callback_data: "community_my" }]);
  rows.push([{ text: "Назад", callback_data: "home" }]);
  await sendMessage(token, chatId, "Общение жителей\n\nВыберите обсуждение:", { inline_keyboard: rows });
}


async function showMyCommunity(token: string, chatId: number | string, profileId: string) {
  const { data, error } = await supabase
    .from("community_posts")
    .select("id,title,status,moderation_note,created_at")
    .eq("tenant_id", TENANT_ID)
    .eq("author_profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  if (!data?.length) {
    await sendMessage(token, chatId, "У вас пока нет обсуждений.", { inline_keyboard: [[{ text: "Создать обсуждение", callback_data: "community_new" }],[{ text: "Назад", callback_data: "community" }]] });
    return;
  }
  const labels: Record<string,string> = { pending:"На проверке", published:"Опубликовано", rejected:"Отклонено", archived:"Архив" };
  const body = data.map((x:any)=>"• "+x.title+" — "+(labels[x.status]||x.status)+(x.moderation_note?"\nКомментарий: "+x.moderation_note:"")).join("\n\n");
  await sendMessage(token, chatId, "Мои обсуждения\n\n"+body, { inline_keyboard: [[{ text: "Создать обсуждение", callback_data: "community_new" }],[{ text: "Назад", callback_data: "community" }]] });
}

async function showCommunityPost(token: string, chatId: number | string, postId: string) {
  const { data: post, error } = await supabase
    .from("community_posts")
    .select("id,title,category,body,location_text,author_profile_id")
    .eq("tenant_id", TENANT_ID)
    .eq("id", postId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!post) {
    await sendMessage(token, chatId, "Обсуждение не найдено.");
    return;
  }

  const { data: comments } = await supabase
    .from("community_comments")
    .select("id,body,created_at,parent_comment_id")
    .eq("tenant_id", TENANT_ID)
    .eq("entity_type", "community_post")
    .eq("entity_id", postId)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .limit(8);

  const { data: reactions } = await supabase
    .from("community_reactions")
    .select("reaction")
    .eq("tenant_id", TENANT_ID)
    .eq("entity_type", "community_post")
    .eq("entity_id", postId);

  const counts: Record<string, number> = {};
  for (const r of reactions || []) counts[r.reaction] = (counts[r.reaction] || 0) + 1;

  const commentText = (comments || []).map((x: any, i: number) => String(i + 1) + ". " + x.body).join("\n");
  const replyRows = (comments || []).slice(-5).map((x:any,i:number)=>[{ text: "↩️ Ответить на " + String(Math.max(1,(comments||[]).length-4+i)), callback_data: "creply:" + x.id }]);
  const parts = [
    post.title,
    "",
    post.body,
    post.location_text ? "Место: " + post.location_text : null,
    "",
    "👍 " + (counts["like"] || 0) + "   ❤️ " + (counts["heart"] || 0),
    comments?.length ? "\nКомментарии:\n" + commentText : "\nКомментариев пока нет."
  ].filter(Boolean);

  await sendMessage(token, chatId, parts.join("\n"), {
    inline_keyboard: [
      [{ text: "Комментировать", callback_data: "ccomment:" + postId }],
      [{ text: "👍", callback_data: "creact:like:" + postId }, { text: "❤️", callback_data: "creact:heart:" + postId }],
      [{ text: "Написать автору", callback_data: "cdm:" + postId }],
      [{ text: "Пожаловаться", callback_data: "creport:" + postId }],
      ...replyRows,
      [{ text: "К обсуждениям", callback_data: "community" }]
    ]
  });
}

async function createOrGetThread(profileId: string, targetProfileId: string, postId: string) {
  const { data: rows, error } = await supabase
    .from("community_threads")
    .select("id,member_a_profile_id,member_b_profile_id")
    .eq("tenant_id", TENANT_ID)
    .eq("source_entity_type", "community_post")
    .eq("source_entity_id", postId)
    .limit(20);
  if (error) throw error;

  const existing = (rows || []).find((x: any) =>
    (x.member_a_profile_id === profileId && x.member_b_profile_id === targetProfileId) ||
    (x.member_a_profile_id === targetProfileId && x.member_b_profile_id === profileId)
  );
  if (existing?.id) return existing.id as string;

  const { data, error: insertError } = await supabase.from("community_threads").insert({
    tenant_id: TENANT_ID,
    member_a_profile_id: profileId,
    member_b_profile_id: targetProfileId,
    source_entity_type: "community_post",
    source_entity_id: postId
  }).select("id").single();
  if (insertError) throw insertError;
  return data.id as string;
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
    .select("title,body,published_at,type,source_name,source_article_url")
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
    return `• ${x.title}${date ? " — " + date : ""}\n${x.body || ""}${x.source_article_url ? "\nИсточник: " + (x.source_name || "ссылка") + " — " + x.source_article_url : ""}`;
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
      "Конаково Рядом\n\nВыберите нужный раздел:",
      await countedKeyboard(profileId)
    );
  } else if (text?.startsWith("/start cpost_")) {
    await clearState(profileId);
    await showCommunityPost(token, chatId, text.replace("/start cpost_", "").trim());
  } else if (action === "feed" || text === "/nearby") {
    await clearState(profileId);
    await showFeed(token, chatId);
    await markSectionRead(profileId, "feed");
  } else if (action === "business" || text === "/places") {
    await clearState(profileId);
    await showBusinesses(token, chatId);
  } else if (action === "my_business" || text === "/business") {
    await clearState(profileId);
    await showMyBusiness(token, chatId, profileId);
  } else if (action === "business_register" || text === "/addbusiness") {
    await setState(profileId, "business_name", {});
    await sendMessage(token, chatId, "Регистрация бизнеса\n\nВведите название организации.", { inline_keyboard: [[{ text: "Отмена", callback_data: "home" }]] });
  } else if (action === "community" || text === "/community") {
    await clearState(profileId);
    await showCommunity(token, chatId);
    await markSectionRead(profileId, "community");
  } else if (action === "community_my") {
    await clearState(profileId);
    await showMyCommunity(token, chatId, profileId);
  } else if (action === "community_new") {
    await setState(profileId, "community_category", {});
    await sendMessage(token, chatId, "Новое обсуждение\n\nНапишите категорию: например, транспорт, ЖКХ, родители, животные, рекомендации или другое.", { inline_keyboard: [[{ text: "Отмена", callback_data: "community" }]] });
  } else if (action?.startsWith("cpost:")) {
    await clearState(profileId);
    await showCommunityPost(token, chatId, action.slice(6));
  } else if (action?.startsWith("ccomment:")) {
    const postId = action.slice(9);
    await setState(profileId, "community_comment", { post_id: postId });
    await sendMessage(token, chatId, "Напишите комментарий одним сообщением.", { inline_keyboard: [[{ text: "Отмена", callback_data: "cpost:" + postId }]] });
  } else if (action?.startsWith("creact:")) {
    const parts = action.split(":");
    const reaction = parts[1];
    const postId = parts[2];
    if (["like","heart"].includes(reaction)) {
      const { data: existing } = await supabase.from("community_reactions").select("id")
        .eq("tenant_id", TENANT_ID).eq("profile_id", profileId).eq("entity_type", "community_post").eq("entity_id", postId).eq("reaction", reaction).maybeSingle();
      if (existing?.id) {
        await supabase.from("community_reactions").delete().eq("tenant_id", TENANT_ID).eq("id", existing.id);
      } else {
        await supabase.from("community_reactions").insert({ tenant_id: TENANT_ID, profile_id: profileId, entity_type: "community_post", entity_id: postId, reaction });
      }
      await showCommunityPost(token, chatId, postId);
    }
  } else if (action?.startsWith("creply:")) {
    const commentId = action.slice(7);
    const { data: comment } = await supabase.from("community_comments")
      .select("id,entity_id,author_profile_id")
      .eq("tenant_id", TENANT_ID)
      .eq("id", commentId)
      .eq("status", "published")
      .maybeSingle();
    if (!comment) {
      await sendMessage(token, chatId, "Комментарий не найден.");
    } else {
      await setState(profileId, "community_comment", { post_id: comment.entity_id, parent_comment_id: comment.id, parent_author_profile_id: comment.author_profile_id });
      await sendMessage(token, chatId, "Напишите ответ на комментарий одним сообщением.", { inline_keyboard: [[{ text: "Отмена", callback_data: "cpost:" + comment.entity_id }]] });
    }
  } else if (action?.startsWith("creport:")) {
    const postId = action.slice(8);
    await setState(profileId, "community_report", { post_id: postId });
    await sendMessage(token, chatId, "Опишите причину жалобы одним сообщением.", { inline_keyboard: [[{ text: "Отмена", callback_data: "cpost:" + postId }]] });
  } else if (action?.startsWith("cdm:")) {
    const postId = action.slice(4);
    const { data: post } = await supabase.from("community_posts").select("author_profile_id,title")
      .eq("tenant_id", TENANT_ID).eq("id", postId).eq("status", "published").maybeSingle();
    if (!post?.author_profile_id || post.author_profile_id === profileId) {
      await sendMessage(token, chatId, "Нельзя написать самому себе.");
    } else {
      await setState(profileId, "community_dm", { post_id: postId, target_profile_id: post.author_profile_id, title: post.title });
      await sendMessage(token, chatId, "Напишите сообщение автору. Ваш телефон и Telegram-контакт не будут раскрыты.", { inline_keyboard: [[{ text: "Отмена", callback_data: "cpost:" + postId }]] });
    }
  } else if (action?.startsWith("dmreply:")) {
    const threadId = action.slice(8);
    const { data: th } = await supabase.from("community_threads").select("member_a_profile_id,member_b_profile_id,status")
      .eq("tenant_id", TENANT_ID).eq("id", threadId).maybeSingle();
    if (th && th.status === "active" && [th.member_a_profile_id, th.member_b_profile_id].includes(profileId)) {
      await setState(profileId, "community_dm_reply", { thread_id: threadId });
      await sendMessage(token, chatId, "Напишите ответ одним сообщением.", { inline_keyboard: [[{ text: "Отмена", callback_data: "home" }]] });
    }
  } else if (action === "help_list" || text === "/helpnearby") {
    await clearState(profileId);
    await showApprovedHelp(token, chatId);
    await markSectionRead(profileId, "help");
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

    if (state?.state === "community_category") {
      await setState(profileId, "community_title", { category: text.slice(0,80) });
      await sendMessage(token, chatId, "Введите короткий заголовок обсуждения.", { inline_keyboard: [[{ text: "Отмена", callback_data: "community" }]] });
    } else if (state?.state === "community_title") {
      await setState(profileId, "community_body", { ...state.data, title: text.slice(0,200) });
      await sendMessage(token, chatId, "Напишите текст сообщения.", { inline_keyboard: [[{ text: "Отмена", callback_data: "community" }]] });
    } else if (state?.state === "community_body") {
      await setState(profileId, "community_location", { ...state.data, body: text.slice(0,5000) });
      await sendMessage(token, chatId, "Укажите место/район или напишите «нет».", { inline_keyboard: [[{ text: "Отмена", callback_data: "community" }]] });
    } else if (state?.state === "community_location") {
      const d = state.data || {};
      const { data: row, error } = await supabase.from("community_posts").insert({
        tenant_id: TENANT_ID,
        author_profile_id: profileId,
        category: d.category || "general",
        title: d.title,
        body: d.body,
        location_text: text.toLowerCase() === "нет" ? null : text.slice(0,300),
        status: "pending"
      }).select("id").single();
      if (error) throw error;

      await supabase.from("audit_log").insert({
        tenant_id: TENANT_ID,
        actor: "telegram",
        action: "community_post_submitted",
        entity_type: "community_post",
        entity_id: row.id,
        metadata: { author_profile_id: profileId }
      });

      await clearState(profileId);
      await sendMessage(token, chatId, "Обсуждение отправлено на модерацию. После одобрения оно появится у жителей.", baseKeyboard());
    } else if (state?.state === "community_comment") {
      const postId = state.data?.post_id;
      const { data: post } = await supabase.from("community_posts").select("author_profile_id,title")
        .eq("tenant_id", TENANT_ID).eq("id", postId).eq("status", "published").maybeSingle();
      if (!post) throw new Error("post_not_found");

      const { error } = await supabase.from("community_comments").insert({
        tenant_id: TENANT_ID,
        author_profile_id: profileId,
        entity_type: "community_post",
        entity_id: postId,
        parent_comment_id: state.data?.parent_comment_id || null,
        body: text.slice(0,3000),
        status: "published"
      });
      if (error) throw error;

      const parentAuthor = state.data?.parent_author_profile_id;
      if (parentAuthor && parentAuthor !== profileId) {
        await supabase.from("notifications").insert({
          tenant_id: TENANT_ID,
          profile_id: parentAuthor,
          type: "community_reply",
          title: "Ответ на ваш комментарий",
          body: text.slice(0,300),
          entity_type: "community_post",
          entity_id: postId
        });
        await sendToProfile(token, parentAuthor, "Ответ на ваш комментарий:\n\n" + text.slice(0,500), {
          inline_keyboard: [[{ text: "Открыть обсуждение", callback_data: "cpost:" + postId }]]
        });
      }

      if (post.author_profile_id !== profileId && post.author_profile_id !== parentAuthor) {
        await supabase.from("notifications").insert({
          tenant_id: TENANT_ID,
          profile_id: post.author_profile_id,
          type: "community_comment",
          title: "Новый комментарий",
          body: text.slice(0,300),
          entity_type: "community_post",
          entity_id: postId
        });
        await sendToProfile(token, post.author_profile_id, "Новый комментарий к «" + post.title + "»:\n\n" + text.slice(0,500), {
          inline_keyboard: [[{ text: "Открыть обсуждение", callback_data: "cpost:" + postId }]]
        });
      }

      await clearState(profileId);
      await showCommunityPost(token, chatId, postId);
    } else if (state?.state === "community_report") {
      const postId = state.data?.post_id;
      await supabase.from("community_reports").insert({
        tenant_id: TENANT_ID,
        reporter_profile_id: profileId,
        entity_type: "community_post",
        entity_id: postId,
        reason: "user_report",
        details: text.slice(0,2000),
        status: "new"
      });
      await clearState(profileId);
      await sendMessage(token, chatId, "Жалоба отправлена модератору.", { inline_keyboard: [[{ text: "К обсуждению", callback_data: "cpost:" + postId }]] });
    } else if (state?.state === "community_dm") {
      const target = state.data?.target_profile_id;
      const postId = state.data?.post_id;
      if (!target) throw new Error("target_missing");
      const threadId = await createOrGetThread(profileId, target, postId);

      await supabase.from("community_messages").insert({
        tenant_id: TENANT_ID,
        thread_id: threadId,
        sender_profile_id: profileId,
        body: text.slice(0,3000)
      });
      await supabase.from("notifications").insert({
        tenant_id: TENANT_ID,
        profile_id: target,
        type: "community_dm",
        title: "Новое личное сообщение",
        body: text.slice(0,300),
        entity_type: "community_thread",
        entity_id: threadId
      });
      await sendToProfile(token, target, "Новое сообщение через «Конаково Рядом»:\n\n" + text.slice(0,700), {
        inline_keyboard: [[{ text: "Ответить", callback_data: "dmreply:" + threadId }]]
      });

      await clearState(profileId);
      await sendMessage(token, chatId, "Сообщение отправлено через бота. Ваш контакт не раскрыт.", baseKeyboard());
    } else if (state?.state === "community_dm_reply") {
      const threadId = state.data?.thread_id;
      const { data: th } = await supabase.from("community_threads").select("member_a_profile_id,member_b_profile_id,status")
        .eq("tenant_id", TENANT_ID).eq("id", threadId).maybeSingle();
      if (!th || th.status !== "active") throw new Error("thread_not_found");

      const target = th.member_a_profile_id === profileId ? th.member_b_profile_id : th.member_a_profile_id;
      await supabase.from("community_messages").insert({
        tenant_id: TENANT_ID,
        thread_id: threadId,
        sender_profile_id: profileId,
        body: text.slice(0,3000)
      });
      await supabase.from("notifications").insert({
        tenant_id: TENANT_ID,
        profile_id: target,
        type: "community_dm",
        title: "Ответ на личное сообщение",
        body: text.slice(0,300),
        entity_type: "community_thread",
        entity_id: threadId
      });
      await sendToProfile(token, target, "Ответ через «Конаково Рядом»:\n\n" + text.slice(0,700), {
        inline_keyboard: [[{ text: "Ответить", callback_data: "dmreply:" + threadId }]]
      });

      await clearState(profileId);
      await sendMessage(token, chatId, "Ответ отправлен.", baseKeyboard());
    } else if (state?.state === "business_name") {
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
      await sendMessage(token, chatId, "Заявка на регистрацию бизнеса отправлена на проверку. После модерации я сообщу результат.", baseKeyboard());
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
        baseKeyboard()
      );
    } else {
      await sendMessage(token, chatId, "Выберите нужный раздел в меню.", baseKeyboard());
    }
  }

  await supabase
    .from("telegram_updates")
    .update({ processed_at: new Date().toISOString() })
    .eq("tenant_id", TENANT_ID).eq("update_id", updateId);

  return new Response("ok");
});