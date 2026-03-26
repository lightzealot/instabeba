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
  const response = await fetch(
    `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    {
      headers: {
        "x-ig-app-id": INSTAGRAM_APP_ID,
        "user-agent": "Mozilla/5.0"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Instagram HTTP ${response.status}`);
  }

  const data = await response.json();
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
    lastCheckedAt: `${username}:last_checked_at`
  };
}

async function runCheck() {
  const config = getConfig();
  if (config.missing.length) {
    return {
      statusCode: 500,
      payload: { ok: false, error: `Faltan variables: ${config.missing.join(", ")}` }
    };
  }

  const store = getStore("instagram-bot-state");
  const keys = getStoreKeys(config.instagramUsername);

  try {
    const latestPost = await fetchLatestPost(config.instagramUsername);
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

  const store = getStore("instagram-bot-state");
  const keys = getStoreKeys(config.instagramUsername);
  const [lastShortcode, lastResult, lastCheckedAt] = await Promise.all([
    store.get(keys.lastShortcode, { type: "text" }),
    store.get(keys.lastResult, { type: "text" }),
    store.get(keys.lastCheckedAt, { type: "text" })
  ]);

  return {
    statusCode: 200,
    payload: {
      ...base,
      lastShortcode: lastShortcode || null,
      lastResult: lastResult || null,
      lastCheckedAt: lastCheckedAt || null
    }
  };
}

module.exports = {
  getConfig,
  getStatus,
  runCheck,
  validateDashboardAuth
};
