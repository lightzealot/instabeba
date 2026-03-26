const { runTestMessage, validateDashboardAuth } = require("./_shared/instagram-bot");

exports.handler = async (event) => {
  const auth = validateDashboardAuth(event);
  if (!auth.ok) {
    return auth.response;
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Method Not Allowed" })
    };
  }

  const { statusCode, payload } = await runTestMessage();
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  };
};
