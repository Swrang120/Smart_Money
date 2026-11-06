const crypto = require("crypto");

const PACKAGES = {
  "Basic": 299, "Basic Package": 299,
  "Max Pro": 4499, "Max Pro Package": 4499,
  "Starter": 289, "Starter Package": 289,
  "Intermediate": 560, "Intermediate Package": 560,
  "Expert": 1149, "Expert Package": 1149,
  "Master": 2499, "Master Package": 2499,
  "Brahmastra": 5499, "Brahmastra Package": 5499,
  "Premium Pro": 10997, "Premium Pro Package": 10997
};

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = process.env.RAZORPAY_KEY_SECRET || process.env.LIVE_SECRET_API || process.env.LIVE_SECRET_KEY;
  if (!secret) return res.status(503).json({ error: "Razorpay secret is not configured on the server." });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (![razorpay_order_id, razorpay_payment_id, razorpay_signature].every(v => typeof v === "string" && v.length > 5)) {
    return res.status(400).json({ verified: false, error: "Missing Razorpay payment verification fields." });
  }
  try {
    const expected = crypto.createHmac("sha256", secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(razorpay_signature, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(400).json({ verified: false, error: "Payment signature verification failed." });
    }

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.LIVE_KEY_ID || process.env.LIVE_API_KEY;
    if (!keyId) return res.status(503).json({ verified: false, error: "Razorpay key ID is not configured." });
    const auth = "Basic " + Buffer.from(keyId + ":" + secret).toString("base64");

    const [orderResponse, paymentResponse] = await Promise.all([
      fetch("https://api.razorpay.com/v1/orders/" + encodeURIComponent(razorpay_order_id), { headers: { Authorization: auth } }),
      fetch("https://api.razorpay.com/v1/payments/" + encodeURIComponent(razorpay_payment_id), { headers: { Authorization: auth } })
    ]);
    if (!orderResponse.ok || !paymentResponse.ok) {
      return res.status(502).json({ verified: false, error: "Could not confirm payment status with Razorpay." });
    }
    const [order, payment] = await Promise.all([orderResponse.json(), paymentResponse.json()]);
    const notes = order.notes || {};
    const packageName = String(notes.package_name || "").trim();
    const expectedAmount = PACKAGES[packageName];
    const amountOk = Number.isFinite(expectedAmount) &&
      Number(order.amount) === expectedAmount * 100 &&
      Number(payment.amount) === expectedAmount * 100 &&
      String(order.currency) === "INR" &&
      String(payment.currency) === "INR";
    const paymentOk = payment.status === "captured" &&
      payment.order_id === order.id &&
      order.id === razorpay_order_id &&
      (order.status === "paid" || Number(order.amount_paid) >= Number(order.amount));
    const buyerOk = String(notes.full_name || "").trim().length >= 2 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(notes.email || "")) &&
      /^[0-9]{10}$/.test(String(notes.mobile || "")) &&
      /^SM-smart[a-zA-Z0-9]+$/i.test(String(notes.referral_id || ""));
    if (!amountOk || !paymentOk || !buyerOk) {
      return res.status(400).json({ verified: false, error: "Razorpay payment is not captured for the exact selected package." });
    }

    return res.status(200).json({
      verified: true,
      orderId: order.id,
      paymentId: payment.id,
      checkout: {
        package_name: packageName,
        package_price: expectedAmount,
        full_name: String(notes.full_name).trim(),
        email: String(notes.email).trim().toLowerCase(),
        mobile: String(notes.mobile).trim(),
        referral_id: String(notes.referral_id).trim()
      }
    });
  } catch (error) {
    console.error("Razorpay verification API error:", error.message);
    return res.status(500).json({ verified: false, error: "Unable to verify Razorpay payment right now." });
  }
};
