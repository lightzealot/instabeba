const { getTelegramConfigStatus, validateDashboardAuth } = require("./_shared/instagram-bot");

exports.handler = async (event) => {
  const auth = validateDashboardAuth(event);
  if (!auth.ok) {
    return auth.response;
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Method Not Allowed" })
    };
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(getTelegramConfigStatus())
  };
};
