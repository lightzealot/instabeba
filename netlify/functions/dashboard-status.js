const { getStatus, validateDashboardAuth } = require("./_shared/instagram-bot");

exports.handler = async (event) => {
  const auth = validateDashboardAuth(event);
  if (!auth.ok) {
    return auth.response;
  }

  const { statusCode, payload } = await getStatus();
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  };
};
