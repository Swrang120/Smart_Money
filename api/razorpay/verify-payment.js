const crypto = require("crypto");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = process.env.RAZORPAY_KEY_SECRET || process.env.LIVE_SECRET_API;
  if (!secret) return res.status(503).json({ error: "Razorpay secret is not configured on the server." });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (![razorpay_order_id, razorpay_payment_id, razorpay_signature].every(v => typeof v === "string" && v.length > 5)) {
    return res.status(400).json({ verified: false, error: "Missing Razorpay payment verification fields." });
  }
  const expected = crypto.createHmac("sha256", secret)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(razorpay_signature, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(400).json({ verified: false, error: "Payment signature verification failed." });
  }
  return res.status(200).json({ verified: true, orderId: razorpay_order_id, paymentId: razorpay_payment_id });
};
