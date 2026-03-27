const { getStore } = require("@netlify/blobs");

const INSTAGRAM_APP_ID = "936619743392459";

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "y", "on"].includes(String(value).trim().toLowerCase());
}

function truncate(value, max) {
  if (!value) {
    return "";
  }
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
}

function parseRetryAfterSeconds(headerValue) {
  if (!headerValue) {
    return null;
  }

  const raw = String(headerValue).trim();
  if (!raw) {
    return null;
  }

  const numeric = Number.parseInt(raw, 10);
  if (!Number.isNaN(numeric) && numeric >= 0) {
    return numeric;
  }

  const dateMillis = Date.parse(raw);
  if (Number.isNaN(dateMillis)) {
    return null;
  }

  const seconds = Math.ceil((dateMillis - Date.now()) / 1000);
  return seconds > 0 ? seconds : 0;
}

function normalizeLatestPostFromProfileInfo(data) {
  const edges = data?.data?.user?.edge_owner_to_timeline_media?.edges || [];
  if (!edges.length) {
    return null;
  }

  const node = edges[0].node;
  const shortcode = node?.shortcode;
  if (!shortcode) {
    return null;
  }

  const caption =
    node?.edge_media_to_caption?.edges?.[0]?.node?.text?.replace(/\n/g, " ").trim() || "";

  return {
    shortcode,
    caption: truncate(caption, 180),
    postUrl: `https://www.instagram.com/p/${shortcode}/`
  };
}

function getConfig() {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  const instagramUsername = (process.env.INSTAGRAM_USERNAME || "").trim().replace(/^@/, "");
  const sendOnFirstRun = toBool(process.env.SEND_ON_FIRST_RUN, false);

  const missing = [];
  if (!token) missing.push("TELEGRAM_BOT_TOKEN");
  if (!chatId) missing.push("TELEGRAM_CHAT_ID");
  if (!instagramUsername) missing.push("INSTAGRAM_USERNAME");

  return {
    token,
    chatId,
    instagramUsername,
    sendOnFirstRun,
    missing
  };
}

function getTelegramConfig() {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();

  const missing = [];
  if (!token) missing.push("TELEGRAM_BOT_TOKEN");
  if (!chatId) missing.push("TELEGRAM_CHAT_ID");

  return {
    token,
    chatId,
    missing
  };
}

const INVITE_TEMPLATES = [
  {
    id: "template_1",
    label: "Invitación general",
    text: "✨ Nueva publicación de Beba ✨\nPásate a dejar tu comentario, dale like y apóyala con toda la buena vibra 💖"
  },
  {
    id: "template_2",
    label: "Llamado a comentar",
    text: "📝 Beba subió contenido nuevo\nCuéntanos qué te pareció en comentarios, deja tu like y comparte apoyo 🙌"
  },
  {
    id: "template_3",
    label: "Apoyo de la comunidad",
    text: "💫 Equipo Beba, nos activamos\nVamos a comentar, dejar like y apoyar esta nueva publicación con cariño 🤍"
  },
  {
    id: "template_4",
    label: "Impulso rápido",
    text: "🚀 Nueva publicación lista\nEntra ahora, comenta, dale me gusta y ayudemos a Beba a llegar a más gente 🔥"
  }
];

function getInviteTemplates() {
  return INVITE_TEMPLATES;
}

function isValidInstagramLink(value) {
  if (!value || typeof value !== "string") {
    return false;
  }

  try {
    const parsed = new URL(value.trim());
    return /(^|\.)instagram\.com$/i.test(parsed.hostname) && parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
}

async function runSendTemplateMessage(input) {
  const telegramConfig = getTelegramConfig();
  if (telegramConfig.missing.length) {
    return {
      statusCode: 500,
      payload: { ok: false, error: `Faltan variables: ${telegramConfig.missing.join(", ")}` }
    };
  }

  const templateId = (input?.templateId || "").trim();
  const postUrl = (input?.postUrl || "").trim();

  if (!templateId) {
    return {
      statusCode: 400,
      payload: { ok: false, error: "templateId es requerido" }
    };
  }

  if (!postUrl) {
    return {
      statusCode: 400,
      payload: { ok: false, error: "postUrl es requerido" }
    };
  }

  if (!isValidInstagramLink(postUrl)) {
    return {
      statusCode: 400,
      payload: { ok: false, error: "El link debe ser una URL válida de Instagram con https" }
    };
  }

  const template = INVITE_TEMPLATES.find((item) => item.id === templateId);
  if (!template) {
    return {
      statusCode: 400,
      payload: { ok: false, error: "templateId no válido" }
    };
  }

  const message = [template.text, postUrl].join("\n\n");

  try {
    await sendTelegramMessage({
      token: telegramConfig.token,
      chatId: telegramConfig.chatId,
      text: message
    });

    return {
      statusCode: 200,
      payload: {
        ok: true,
        state: "manual_sent",
        message: "Mensaje enviado correctamente",
        templateId,
        postUrl
      }
    };
  } catch (error) {
    return {
      statusCode: 500,
      payload: { ok: false, error: `Error: ${error.message}` }
    };
  }
}

function getDashboardToken() {
  return (process.env.DASHBOARD_TOKEN || "").trim();
}

function getHeaderValue(headers, key) {
  if (!headers) return "";
  return headers[key] || headers[key.toLowerCase()] || "";
}

function validateDashboardAuth(event) {
  const expected = getDashboardToken();
  if (!expected) {
    return { ok: true };
  }

  const provided = (getHeaderValue(event?.headers, "x-dashboard-token") || "").trim();
  if (provided !== expected) {
    return {
      ok: false,
      response: {
        statusCode: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Unauthorized" })
      }
    };
  }

  return { ok: true };
}

async function fetchLatestPost(username) {
  const encodedUsername = encodeURIComponent(username);
  const profileUrl = `https://www.instagram.com/${encodedUsername}/`;
  const commonHeaders = {
    "x-ig-app-id": INSTAGRAM_APP_ID,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    accept: "*/*",
    referer: profileUrl,
    "accept-language": "es-ES,es;q=0.9,en;q=0.8"
  };

  const candidates = [
    `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodedUsername}`,
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodedUsername}`
  ];

  let lastError = null;
  let maxRetryAfterSeconds = null;

  for (const url of candidates) {
    const response = await fetch(url, { headers: commonHeaders });

    if (response.status === 429) {
      const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
      if (retryAfterSeconds !== null) {
        maxRetryAfterSeconds =
          maxRetryAfterSeconds === null
            ? retryAfterSeconds
            : Math.max(maxRetryAfterSeconds, retryAfterSeconds);
      }
      continue;
    }

    if (!response.ok) {
      lastError = new Error(`Instagram HTTP ${response.status}`);
      continue;
    }

    const data = await response.json();
    return normalizeLatestPostFromProfileInfo(data);
  }

  if (maxRetryAfterSeconds !== null || !lastError) {
    const error = new Error("Instagram HTTP 429");
    error.code = "INSTAGRAM_RATE_LIMIT";
    if (maxRetryAfterSeconds !== null) {
      error.retryAfterSeconds = maxRetryAfterSeconds;
    }
    throw error;
  }

  throw lastError;
}

async function sendTelegramMessage({ token, chatId, text }) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: false
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram HTTP ${response.status}: ${body}`);
  }
}

function getStoreKeys(username) {
  return {
    lastShortcode: `${username}:last_shortcode`,
    lastResult: `${username}:last_result`,
    lastCheckedAt: `${username}:last_checked_at`,
    rateLimitedUntil: `${username}:rate_limited_until`,
    rateLimitCount: `${username}:rate_limit_count`
  };
}

function getRateLimitCooldownMinutes() {
  const value = Number.parseInt(process.env.RATE_LIMIT_COOLDOWN_MINUTES || "30", 10);
  if (Number.isNaN(value) || value < 1) {
    return 30;
  }
  return value;
}

function getStateStore() {
  const siteID = (process.env.NETLIFY_BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID || "").trim();
  const token = (
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.NETLIFY_API_TOKEN ||
    process.env.NETLIFY_AUTH_TOKEN ||
    process.env.NETLIFY_TOKEN ||
    ""
  ).trim();

  if (!siteID || !token) {
    throw new Error(
      `Blobs no configurado: NETLIFY_BLOBS_SITE_ID=${siteID ? "ok" : "missing"}, NETLIFY_BLOBS_TOKEN=${token ? "ok" : "missing"}`
    );
  }

  try {
    return getStore({ name: "instagram-bot-state", siteID, token });
  } catch (firstError) {
    try {
      return getStore("instagram-bot-state", { siteID, token });
    } catch (secondError) {
      throw new Error(
        `No se pudo inicializar Netlify Blobs: ${secondError.message || firstError.message}`
      );
    }
  }
}

async function runCheck() {
  const config = getConfig();
  if (config.missing.length) {
    return {
      statusCode: 500,
      payload: { ok: false, error: `Faltan variables: ${config.missing.join(", ")}` }
    };
  }

  let store;
  try {
    store = getStateStore();
  } catch (error) {
    return {
      statusCode: 500,
      payload: { ok: false, error: error.message }
    };
  }
  const keys = getStoreKeys(config.instagramUsername);

  try {
    const rateLimitedUntilRaw = await store.get(keys.rateLimitedUntil, { type: "text" });
    if (rateLimitedUntilRaw) {
      const rateLimitedUntil = new Date(rateLimitedUntilRaw);
      if (!Number.isNaN(rateLimitedUntil.getTime()) && rateLimitedUntil.getTime() > Date.now()) {
        await store.set(
          keys.lastResult,
          `Instagram con rate limit activo hasta ${rateLimitedUntil.toISOString()}`
        );
        await store.set(keys.lastCheckedAt, new Date().toISOString());
        return {
          statusCode: 200,
          payload: {
            ok: false,
            state: "rate_limited",
            message: `Instagram con rate limit activo hasta ${rateLimitedUntil.toISOString()}`,
            rateLimitedUntil: rateLimitedUntil.toISOString()
          }
        };
      }
      await store.delete(keys.rateLimitedUntil);
    }

    const latestPost = await fetchLatestPost(config.instagramUsername);
    await store.delete(keys.rateLimitCount);
    if (!latestPost) {
      await store.set(keys.lastResult, "Sin publicaciones para procesar");
      await store.set(keys.lastCheckedAt, new Date().toISOString());
      return {
        statusCode: 200,
        payload: { ok: true, state: "no_posts", message: "Sin publicaciones para procesar" }
      };
    }

    const lastShortcode = await store.get(keys.lastShortcode, { type: "text" });

    if (!lastShortcode) {
      await store.set(keys.lastShortcode, latestPost.shortcode);
      await store.set(keys.lastCheckedAt, new Date().toISOString());

      if (!config.sendOnFirstRun) {
        await store.set(keys.lastResult, "Primera ejecución: estado inicial guardado sin enviar");
        return {
          statusCode: 200,
          payload: {
            ok: true,
            state: "initialized",
            message: "Primera ejecución: estado inicial guardado sin enviar",
            latestShortcode: latestPost.shortcode
          }
        };
      }
    }

    if (lastShortcode === latestPost.shortcode) {
      await store.set(keys.lastResult, "Sin publicaciones nuevas");
      await store.set(keys.lastCheckedAt, new Date().toISOString());
      return {
        statusCode: 200,
        payload: {
          ok: true,
          state: "no_new",
          message: "Sin publicaciones nuevas",
          lastShortcode
        }
      };
    }

    const message = [
      `Nueva publicación de @${config.instagramUsername}`,
      latestPost.caption || "(Sin texto)",
      latestPost.postUrl
    ].join("\n");

    await sendTelegramMessage({ token: config.token, chatId: config.chatId, text: message });
    await store.set(keys.lastShortcode, latestPost.shortcode);
    await store.set(keys.lastResult, `Enviado post ${latestPost.shortcode}`);
    await store.set(keys.lastCheckedAt, new Date().toISOString());

    return {
      statusCode: 200,
      payload: {
        ok: true,
        state: "sent",
        message: `Enviado post ${latestPost.shortcode}`,
        latestShortcode: latestPost.shortcode,
        postUrl: latestPost.postUrl
      }
    };
  } catch (error) {
    if (error.code === "INSTAGRAM_RATE_LIMIT") {
      const baseCooldownMinutes = getRateLimitCooldownMinutes();
      const previousCountRaw = await store.get(keys.rateLimitCount, { type: "text" });
      const previousCount = Number.parseInt(previousCountRaw || "0", 10);
      const nextCount = Number.isNaN(previousCount) || previousCount < 0 ? 1 : previousCount + 1;

      const retryAfterMinutes =
        Number.isFinite(error.retryAfterSeconds) && error.retryAfterSeconds >= 0
          ? Math.ceil(error.retryAfterSeconds / 60)
          : 0;
      const exponentialMinutes = Math.min(baseCooldownMinutes * 2 ** (nextCount - 1), 24 * 60);
      const cooldownMinutes = Math.max(baseCooldownMinutes, retryAfterMinutes, exponentialMinutes);
      const rateLimitedUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString();

      await store.set(keys.rateLimitedUntil, rateLimitedUntil);
      await store.set(keys.rateLimitCount, String(nextCount));
      await store.set(keys.lastResult, `Instagram con rate limit (429). Reintento en ${cooldownMinutes} min`);
      await store.set(keys.lastCheckedAt, new Date().toISOString());
      return {
        statusCode: 200,
        payload: {
          ok: false,
          state: "rate_limited",
          message: `Instagram con rate limit (429). Reintento en ${cooldownMinutes} min`,
          rateLimitedUntil
        }
      };
    }

    await store.set(keys.lastResult, `Error: ${error.message}`);
    await store.set(keys.lastCheckedAt, new Date().toISOString());

    return {
      statusCode: 500,
      payload: { ok: false, error: `Error: ${error.message}` }
    };
  }
}

async function getStatus() {
  const config = getConfig();
  const base = {
    ok: config.missing.length === 0,
    configured: {
      TELEGRAM_BOT_TOKEN: !config.missing.includes("TELEGRAM_BOT_TOKEN"),
      TELEGRAM_CHAT_ID: !config.missing.includes("TELEGRAM_CHAT_ID"),
      INSTAGRAM_USERNAME: !config.missing.includes("INSTAGRAM_USERNAME")
    },
    instagramUsername: config.instagramUsername || null,
    sendOnFirstRun: config.sendOnFirstRun,
    missing: config.missing
  };

  if (config.missing.length) {
    return {
      statusCode: 200,
      payload: base
    };
  }

  let store;
  try {
    store = getStateStore();
  } catch (error) {
    return {
      statusCode: 200,
      payload: {
        ...base,
        ok: false,
        storageError: error.message,
        lastShortcode: null,
        lastResult: null,
        lastCheckedAt: null
      }
    };
  }
  const keys = getStoreKeys(config.instagramUsername);
  const [lastShortcode, lastResult, lastCheckedAt] = await Promise.all([
    store.get(keys.lastShortcode, { type: "text" }),
    store.get(keys.lastResult, { type: "text" }),
    store.get(keys.lastCheckedAt, { type: "text" })
  ]);

  const rateLimitedUntil = await store.get(keys.rateLimitedUntil, { type: "text" });

  return {
    statusCode: 200,
    payload: {
      ...base,
      lastShortcode: lastShortcode || null,
      lastResult: lastResult || null,
      lastCheckedAt: lastCheckedAt || null,
      rateLimitedUntil: rateLimitedUntil || null
    }
  };
}

async function runTestMessage() {
  const config = getConfig();
  if (config.missing.length) {
    return {
      statusCode: 500,
      payload: { ok: false, error: `Faltan variables: ${config.missing.join(", ")}` }
    };
  }

  const now = new Date().toISOString();
  const message = [
    "✅ Mensaje de prueba del bot Instagram → Telegram",
    `Cuenta monitoreada: @${config.instagramUsername}`,
    `Fecha: ${now}`
  ].join("\n");

  try {
    await sendTelegramMessage({ token: config.token, chatId: config.chatId, text: message });
    return {
      statusCode: 200,
      payload: {
        ok: true,
        state: "test_sent",
        message: "Mensaje de prueba enviado correctamente"
      }
    };
  } catch (error) {
    return {
      statusCode: 500,
      payload: { ok: false, error: `Error: ${error.message}` }
    };
  }
}

module.exports = {
  getConfig,
  getInviteTemplates,
  getStatus,
  runTestMessage,
  runSendTemplateMessage,
  runCheck,
  validateDashboardAuth
};
