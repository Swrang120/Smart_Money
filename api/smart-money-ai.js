// Legacy endpoint intentionally disabled.
// The Smart Money private support page now performs read-only, customer-scoped
// guidance directly against Supabase RLS and never forwards customer data to
// Gemini, OpenAI, or another external AI provider.
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return res.status(410).json({
    error: "This legacy external-AI endpoint is disabled. Open Smart Money Support for private account guidance and ticket creation."
  });
};
