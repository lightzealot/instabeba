const {
  getInviteTemplates,
  runSendTemplateMessage,
  validateDashboardAuth
} = require("./_shared/instagram-bot");

exports.handler = async (event) => {
  const auth = validateDashboardAuth(event);
  if (!auth.ok) {
    return auth.response;
  }

  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, templates: getInviteTemplates() })
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Method Not Allowed" })
    };
  }

  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch (_) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "JSON inválido" })
      };
    }
  }

  const { statusCode, payload } = await runSendTemplateMessage(body);
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  };
};
