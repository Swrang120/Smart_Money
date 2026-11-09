const crypto = require("crypto");

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
      "Basic": 299, "Basic Package": 299,
      "Max Pro": 4499, "Max Pro Package": 4499,
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
        String(event.currency || event.data?.currency || "INR").toUpperCase() !== "INR" ||\n        String(event.currency || event.data?.currency || "INR").toUpperCase() !== "INR" ||
        fullName.length < 2 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) ||
        !/^[0-9]{10}$/.test(mobile) || !/^SM-smart[a-zA-Z0-9]+$/i.test(referral)) {
      return res.status(400).json({ ok: false, error: "Reconciled event details failed validation." });
    }

    const dbHeaders = { apikey: serviceRoleKey, Authorization: "Bearer " + serviceRoleKey, "Content-Type": "application/json" };
    const dbUrl = supabaseUrl.replace(/\\/+$/, "") + "/rest/v1/";
    async function dbGet(path) {
      const response = await fetch(dbUrl + path, { headers: { ...dbHeaders, Prefer: "return=representation" } });
      const payload = await response.json().catch(() => []);
      if (!response.ok) throw new Error("Supabase query failed: " + response.status);
      return payload;
    }

    const existing = await dbGet("payment_requests?select=id&gateway_payment_id=eq." + encodeURIComponent(paymentId) + "&limit=1");
    if (existing.length) return res.status(200).json({ received: true, duplicate: true });

    const refRows = await dbGet("profiles?select=user_id,referral_code,referral_id&or=" + encodeURIComponent("(referral_code.eq." + referral + ",referral_id.eq." + referral + ")") + "&limit=1");
    if (!refRows.length) return res.status(400).json({ ok: false, error: "Referral code was not found." });

    const profiles = await dbGet("profiles?select=user_id&email=ilike." + encodeURIComponent(email) + "&limit=1");
    if (profiles.length) return res.status(200).json({ received: true, held: true, reason: "Buyer already has an account." });

    const pendingRows = await dbGet("payment_requests?select=id&email=ilike." + encodeURIComponent(email) + "&or=" + encodeURIComponent("(status.eq.Pending,payment_status.eq.Pending,status.eq.Approved,payment_status.eq.Approved)") + "&limit=1");
    if (pendingRows.length) return res.status(200).json({ received: true, held: true, reason: "Existing payment request requires review." });

    const insertResponse = await fetch(dbUrl + "payment_requests", {
      method: "POST", headers: { ...dbHeaders, Prefer: "return=minimal" }, body: JSON.stringify({
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
      })
    });
    if (!insertResponse.ok) throw new Error("Supabase insert failed: " + insertResponse.status);

    return res.status(200).json({ received: true, pending_admin_approval: true });
  } catch (error) {
    console.error("Smart Gateway webhook error:", error.message);
    return res.status(500).json({ ok: false, error: "Webhook processing failed." });
  }
};
