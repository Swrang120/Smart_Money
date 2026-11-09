const SUPABASE_URL = "https://rvprrulkjegvicbnjuft.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_IdI5j4Q4qcd-1knRMVeGKw_O3Ek42ZJ";
const SYSTEM_PROMPT = `You are Smart Money AI Help Desk, the official customer-support guide for Smart Money.
Reply in the user's language (Hindi/Hinglish/English/Assamese when possible), politely and clearly.
Help with payment, login, package activation, commission/referral, courses and withdrawal questions.
Never claim you checked an account, payment, commission, withdrawal or database record; this first release has no live account investigation tools.
Never ask for OTP, password, UPI PIN, bank PIN, full card number or secret credentials.
Never approve payments, activate packages, alter balances/commissions, approve withdrawals, block accounts, issue refunds or change any data.
If an issue needs account-specific checking, explain that a support ticket has been created for the human team. Do not promise a resolution time.
Keep answers concise and practical. Do not invent Smart Money policy, package rules, or transaction facts. If unsure, say so and escalate.`;
const allowed = new Set(["payment","login","package","commission","course","withdrawal","general"]);
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const apiKey = process.env.OPEN_AI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "AI service is not configured yet. Please try again later or contact support." });
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "Please log in to use Smart Money AI Support." });
  const token = auth.slice(7).trim();
  if (!token || token.length > 5000) return res.status(401).json({ error: "Your login session is invalid. Please log in again." });
  const issue = String(req.body?.message || "").trim();
  const rawCategory = String(req.body?.category || "general").toLowerCase();
  const category = allowed.has(rawCategory) ? rawCategory : "general";
  if (issue.length < 3 || issue.length > 1200) return res.status(400).json({ error: "Please enter a message between 3 and 1200 characters." });
  try {
    const userResp = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + token } });
    if (!userResp.ok) return res.status(401).json({ error: "Login session expired. Please log in again." });
    const user = await userResp.json();
    if (!user?.id) return res.status(401).json({ error: "Please log in to continue." });
    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.25, max_tokens: 450, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: issue }] })
    });
    const aiData = await aiResp.json();
    if (!aiResp.ok) {
      console.error("Smart Money AI provider error:", aiResp.status, aiData?.error?.code || "unknown");
      return res.status(502).json({ error: "AI is temporarily unavailable. Please try again or contact support." });
    }
    const reply = String(aiData?.choices?.[0]?.message?.content || "").trim();
    if (!reply) return res.status(502).json({ error: "AI did not return a response. Please try again." });
    const ticketResp = await fetch(SUPABASE_URL + "/rest/v1/sm_support_tickets", {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ user_id: user.id, category, subject: issue.slice(0, 120), description: issue, ai_summary: issue.slice(0, 500), ai_reply: reply })
    });
    const ticketText = await ticketResp.text();
    if (!ticketResp.ok) {
      console.error("Smart Money ticket insert failed:", ticketResp.status, ticketText.slice(0, 300));
      return res.status(502).json({ error: "AI replied, but the support ticket could not be saved. Please contact support." });
    }
    let tickets = [];
    try { tickets = JSON.parse(ticketText); } catch (_) {}
    return res.status(200).json({ reply, ticketId: tickets?.[0]?.id || null, ticketSaved: !!tickets?.[0]?.id });
  } catch (error) {
    console.error("Smart Money AI request failed:", error.message);
    return res.status(500).json({ error: "Something went wrong. Please try again later." });
  }
};