// External AI providers are intentionally disabled for Smart Money customer support.
// The private support portal now uses authenticated, read-only Supabase queries and
// local deterministic guidance. Customer data must never be forwarded to Gemini,
// OpenAI, or any third-party AI inference API from this route.
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  return res.status(410).json({
    error: "This external AI endpoint is disabled. Please use the private Smart Money Support portal."
  });
};
