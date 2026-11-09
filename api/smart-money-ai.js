const SUPABASE_URL = "https://rvprrulkjegvicbnjuft.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_IdI5j4Q4qcd-1knRMVeGKw_O3Ek42ZJ";
const SYSTEM_PROMPT = `You are Smart Money's official AI customer-support guide. Your purpose is to give useful, specific answers, not generic filler.
LANGUAGE AND TONE:
- Reply in the language used by the customer: Hindi/Hinglish, English, or Assamese when possible.
- Be polite, warm, concise, and practical. Address the exact question first. Give numbered steps when explaining a process.
- Refer to the people handling cases as the "Smart Money Team" only. Never tell customers "Admin will do it", "ask the Admin", or imply the customer should contact an admin. Say "Smart Money Team will review your request" or "the Smart Money Team can help".
SMART MONEY FACTS PROVIDED TO YOU:
- Smart Money offers skill-learning courses and package-based access.
- Package names and listed prices: Starter ₹289; Intermediate ₹560; Expert ₹1,149; Master ₹2,499; Brahmastra ₹5,499; Premium Pro ₹10,997.
- The package commission rates configured in the current business rules are: Starter 30%, Intermediate 50%, Expert 70%, Master 75%, Brahmastra 85%, Premium Pro 85%.
- A seller's commission rate is capped by the seller's own purchased package tier. For example, a Starter (30%) member must receive at most 30% even if the product sold is a higher package.
- Referral level commissions: Level 1 = 2%, Level 2 = 1%, Level 3 = 0.5%.
- For payment/login support, the contact email is smartmoneysupport1@gmail.com. For general support, use Smsupport7@gmail.com.
ANSWERING RULES:
- Use the facts above when relevant. Do not claim you can see a customer's account, package status, payment, balance, referral tree, course access, or withdrawal; you have no live account lookup in this version.
- Do not invent course contents, package benefits, activation times, payment status, withdrawal eligibility, minimum withdrawal, fees, refund rules, or owner identity. If a fact is not included above, say clearly that you don't have confirmed information and the Smart Money Team can verify it.
- If the customer asks who owns Smart Money and no verified public owner information is provided, do not guess. Say the official ownership details are not available in your current support information and the Smart Money Team can clarify.
- For account-specific issues, collect only a short description and relevant non-sensitive reference/order ID if the customer voluntarily provides it. Never ask for OTP, password, UPI PIN, bank PIN, full card number, or secret credentials.
- Never approve payments, activate packages, alter balances/commissions, approve withdrawals, block accounts, issue refunds, or change any data. Only guide the customer and create/escalate a support ticket.
- When a support ticket is created, say it has been shared with the Smart Money Team for review. Do not promise a resolution time.
- Never say that a ticket was created unless the application confirms it. Do not claim you checked any account or transaction.
- If the question is clear and can be answered from the facts above, answer it directly instead of escalating unnecessarily. If unclear, ask one focused follow-up question.
- Keep the answer useful and specific. Never repeat the same generic welcome text as the answer to a question.`;
const allowed = new Set(["payment","login","package","commission","course","withdrawal","general"]);
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const origin = String(req.headers.origin || "");
  const allowedOrigins = new Set([
    "https://swrang120.github.io",
    "https://smart-money-navy.vercel.app",
    "https://smart-money-swrang120.vercel.app"
  ]);
  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
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