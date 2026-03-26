const { schedule } = require("@netlify/functions");
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

exports.handler = schedule("*/5 * * * *", async () => {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  const instagramUsername = (process.env.INSTAGRAM_USERNAME || "").trim().replace(/^@/, "");
  const sendOnFirstRun = toBool(process.env.SEND_ON_FIRST_RUN, false);

  const missing = [];
  if (!token) missing.push("TELEGRAM_BOT_TOKEN");
  if (!chatId) missing.push("TELEGRAM_CHAT_ID");
  if (!instagramUsername) missing.push("INSTAGRAM_USERNAME");

  if (missing.length) {
    return {
      statusCode: 500,
      body: `Faltan variables: ${missing.join(", ")}`
    };
  }

  try {
    const latestPost = await fetchLatestPost(instagramUsername);
    if (!latestPost) {
      return {
        statusCode: 200,
        body: "Sin publicaciones para procesar"
      };
    }

    const store = getStore("instagram-bot-state");
    const stateKey = `${instagramUsername}:last_shortcode`;
    const lastShortcode = await store.get(stateKey, { type: "text" });

    if (!lastShortcode) {
      await store.set(stateKey, latestPost.shortcode);

      if (!sendOnFirstRun) {
        return {
          statusCode: 200,
          body: "Primera ejecución: estado inicial guardado sin enviar"
        };
      }
    }

    if (lastShortcode === latestPost.shortcode) {
      return {
        statusCode: 200,
        body: "Sin publicaciones nuevas"
      };
    }

    const message = [
      `Nueva publicación de @${instagramUsername}`,
      latestPost.caption || "(Sin texto)",
      latestPost.postUrl
    ].join("\n");

    await sendTelegramMessage({ token, chatId, text: message });
    await store.set(stateKey, latestPost.shortcode);

    return {
      statusCode: 200,
      body: `Enviado post ${latestPost.shortcode}`
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: `Error: ${error.message}`
    };
  }
});
