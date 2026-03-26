const { schedule } = require("@netlify/functions");
const { runCheck } = require("./_shared/instagram-bot");

exports.handler = schedule("*/5 * * * *", async () => {
  const { statusCode, payload } = await runCheck();
  return {
    statusCode,
    body: JSON.stringify(payload)
  };
});
