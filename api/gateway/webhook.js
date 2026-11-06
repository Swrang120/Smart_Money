const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

function safeEqualHex(expected, received) {
  if (!/^[a-f0-9]{64}$/i.test(received || "")) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false });
  }

  const secret = process.env.SMART_GATEWAY_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({ ok: false, error: "Webhook is not configured." });
  }

  try {
    const raw = await rawBody(req);
    const signatureHeader = String(req.headers["x-gateway-signature"] || "");
    const signature = signatureHeader.replace(/^sha256=/, "").trim();
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    if (!safeEqualHex(expected, signature)) {
      return res.status(401).json({ ok: false, error: "Invalid signature." });
    }

    const event = JSON.parse(raw.toString("utf8"));
    const eventType = String(event.event || event.type || "").toUpperCase();
    // UPI is fulfilled only after a bank-statement reconciliation event.
    if (eventType !== "RECONCILED" ||
        String(event.method || "").toUpperCase() !== "UPI" ||
        String(event.settlementState || "").toUpperCase() !== "RECONCILED") {
      return res.status(200).json({ received: true, fulfilled: false });
    }

    const metadata = event.metadata || event.data?.metadata || {};
    if (metadata.merchant !== "SMART_MONEY") {
      return res.status(200).json({ received: true, ignored: true });
    }

    const orderId = String(event.orderId || event.data?.orderId || "");
    const paymentId = String(event.paymentId || event.data?.paymentId || "");
    const packageName = String(metadata.packageName || "");
    const packagePrice = Number(metadata.packagePrice);
    const fullName = String(metadata.fullName || "").trim();
    const email = String(metadata.email || "").trim().toLowerCase();
    const mobile = String(metadata.mobile || "").trim();
    const referral = String(metadata.referralId || "").trim();
    const prices = {
      "Starter": 289, "Starter Package": 289,
      "Intermediate": 560, "Intermediate Package": 560,
      "Expert": 1149, "Expert Package": 1149,
      "Master": 2499, "Master Package": 2499,
      "Brahmastra": 5499, "Brahmastra Package": 5499,
      "Premium Pro": 10997, "Premium Pro Package": 10997
    };
    const amountPaise = String(event.amountPaise || event.data?.amountPaise || "");
    if (!orderId.startsWith("SM-") || !paymentId || !prices[packageName] ||
        packagePrice !== prices[packageName] ||
        amountPaise !== String(packagePrice * 100) ||
        fullName.length < 2 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) ||
        !/^[0-9]{10}$/.test(mobile) || !/^SM-smart[a-zA-Z0-9]+$/i.test(referral)) {
      return res.status(400).json({ ok: false, error: "Reconciled event details failed validation." });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: existing, error: lookupError } = await supabase
      .from("payment_requests")
      .select("id")
      .eq("gateway_payment_id", paymentId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return res.status(200).json({ received: true, duplicate: true });

    const { data: referrer, error: refError } = await supabase
      .from("profiles")
      .select("user_id,referral_code,referral_id")
      .or("referral_code.eq." + referral + ",referral_id.eq." + referral)
      .limit(1)
      .maybeSingle();
    if (refError) throw refError;
    if (!referrer) return res.status(400).json({ ok: false, error: "Referral code was not found." });

    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("user_id").ilike("email", email).limit(1).maybeSingle();
    if (profileError) throw profileError;
    if (profile) return res.status(200).json({ received: true, held: true, reason: "Buyer already has an account." });

    const { data: pending, error: pendingError } = await supabase
      .from("payment_requests").select("id")
      .ilike("email", email)
      .or("status.eq.Pending,payment_status.eq.Pending,status.eq.Approved,payment_status.eq.Approved")
      .limit(1).maybeSingle();
    if (pendingError) throw pendingError;
    if (pending) return res.status(200).json({ received: true, held: true, reason: "Existing payment request requires review." });

    const { error: insertError } = await supabase.from("payment_requests").insert({
      user_id: null,
      full_name: fullName,
      email,
      mobile,
      referral_id: referral,
      package_name: packageName,
      package_type: packageName,
      package_price: packagePrice,
      amount: packagePrice,
      transaction_id: null,
      gateway_order_id: orderId,
      gateway_payment_id: paymentId,
      payment_status: "Pending",
      status: "Pending",
      admin_note: "Smart Gateway UPI payment bank-statement reconciled; awaiting admin package approval.",
      screenshot_name: null,
      screenshot_url: null,
      is_deleted: false,
      payment_method: "Smart Gateway"
    });
    if (insertError) throw insertError;

    return res.status(200).json({ received: true, pending_admin_approval: true });
  } catch (error) {
    console.error("Smart Gateway webhook error:", error.message);
    return res.status(500).json({ ok: false, error: "Webhook processing failed." });
  }
};
