const crypto = require("crypto");

const PACKAGES = {
  "Basic": 299, "Basic Package": 299,\n  "Max Pro": 4499, "Max Pro Package": 4499,\n  "Starter": 289, "Starter Package": 289,
  "Intermediate": 560, "Intermediate Package": 560,
  "Expert": 1149, "Expert Package": 1149,
  "Master": 2499, "Master Package": 2499,
  "Brahmastra": 5499, "Brahmastra Package": 5499,
  "Premium Pro": 10997, "Premium Pro Package": 10997
};

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.LIVE_KEY_ID || process.env.LIVE_API_KEY;
  const keySecret = process.env.RAZORPAY_KEY_SECRET || process.env.LIVE_SECRET_API || process.env.LIVE_SECRET_KEY;
  if (!keyId || !keySecret) return res.status(503).json({ error: "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Vercel." });

  try {
    const { packageName, amount, fullName, email, mobile, referralCode } = req.body || {};
    const expected = PACKAGES[String(packageName || "").trim()];
    if (!expected || Number(amount) !== expected) return res.status(400).json({ error: "Invalid package or amount." });
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanName = String(fullName || "").trim();
    const cleanMobile = String(mobile || "").trim();
    const cleanReferral = String(referralCode || "").trim();
    if (cleanName.length < 2 || cleanName.length > 80) return res.status(400).json({ error: "Enter a valid full name." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: "Enter a valid email address." });
    if (!/^[0-9]{10}$/.test(cleanMobile)) return res.status(400).json({ error: "Enter a valid 10-digit mobile number." });
    if (!/^SM-smart[a-zA-Z0-9]+$/i.test(cleanReferral)) return res.status(400).json({ error: "Enter a valid referral ID." });

    const receipt = "sm_" + crypto.randomBytes(10).toString("hex");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(keyId + ":" + keySecret).toString("base64"),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: expected * 100,
        currency: "INR",
        receipt,
        notes: {
          package_name: String(packageName).slice(0, 80),
          full_name: cleanName,
          email: cleanEmail,
          mobile: cleanMobile,
          referral_id: cleanReferral
        }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Razorpay order creation failed:", data.error && data.error.code);
      return res.status(502).json({ error: "Razorpay could not create the order. Check your API key mode and account status." });
    }
    return res.status(200).json({ orderId: data.id, amount: data.amount, currency: data.currency, keyId });
  } catch (e) {
    console.error("Razorpay order error:", e.message);
    return res.status(500).json({ error: "Unable to start payment. Please try again." });
  }
};
