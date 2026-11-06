const PACKAGE_PRICES = {
  "Basic": 299, "Basic Package": 299,
  "Max Pro": 4499, "Max Pro Package": 4499,
  "Starter": 289, "Starter Package": 289,
  "Intermediate": 560, "Intermediate Package": 560,
  "Expert": 1149, "Expert Package": 1149,
  "Master": 2499, "Master Package": 2499,
  "Brahmastra": 5499, "Brahmastra Package": 5499,
  "Premium Pro": 10997, "Premium Pro Package": 10997
};

function json(res, status, body) {
  res.status(status).setHeader("Cache-Control", "no-store").json(body);
}

function config() {
  return {
    apiUrl: (process.env.SMART_GATEWAY_API_URL || "").replace(/\\/+$/, ""),
    merchantId: process.env.SMART_GATEWAY_MERCHANT_ID || "",
    apiKey: process.env.SMART_GATEWAY_API_KEY || "",
    supabaseUrl: (process.env.SUPABASE_URL || "").replace(/\\/+$/, ""),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const c = config();
    return json(res, 200, { enabled: Boolean(c.apiUrl && c.merchantId && c.apiKey) });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, error: "Method not allowed." });
  }

  const c = config();
  if (!c.apiUrl || !c.merchantId || !c.apiKey || !c.supabaseUrl || !c.serviceRoleKey) {
    return json(res, 503, { ok: false, error: "Smart Gateway is not configured yet." });
  }

  try {
    const body = req.body || {};
    const buyer = body.buyer || {};
    const packageName = String(body.package_name || "").trim();
    const amount = PACKAGE_PRICES[packageName];
    const fullName = String(buyer.full_name || "").trim();
    const email = String(buyer.email || "").trim().toLowerCase();
    const mobile = String(buyer.mobile || "").trim();
    const referral = String(buyer.referral_id || "").trim();

    if (!amount || Number(body.amount) !== amount) {
      return json(res, 400, { ok: false, error: "Package amount does not match the approved package price." });
    }
    if (fullName.length < 2 || fullName.length > 80 ||
        !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) ||
        !/^[0-9]{10}$/.test(mobile) ||
        !/^SM-smart[a-zA-Z0-9]+$/i.test(referral)) {
      return json(res, 400, { ok: false, error: "Buyer details or referral code are invalid." });
    }

    const dbHeaders = { apikey: c.serviceRoleKey, Authorization: "Bearer " + c.serviceRoleKey };
    const dbBase = c.supabaseUrl + "/rest/v1/";
    async function dbGet(path) {
      const response = await fetch(dbBase + path, { headers: dbHeaders, signal: AbortSignal.timeout(10000) });
      const rows = await response.json().catch(() => []);
      if (!response.ok) throw new Error("Buyer preflight verification failed.");
      return rows;
    }
    const referralRows = await dbGet("profiles?select=user_id&or=" + encodeURIComponent("(referral_code.eq." + referral + ",referral_id.eq." + referral + ")") + "&limit=1");
    if (!referralRows.length) return json(res, 400, { ok: false, error: "Referral code was not found." });
    const emailRows = await dbGet("profiles?select=user_id&email=ilike." + encodeURIComponent(email) + "&limit=1");
    if (emailRows.length) return json(res, 409, { ok: false, error: "An account already exists for this email." });
    const mobileRows = await dbGet("profiles?select=user_id&mobile=eq." + encodeURIComponent(mobile) + "&limit=1");
    if (mobileRows.length) return json(res, 409, { ok: false, error: "An account already exists for this mobile number." });
    const pendingRows = await dbGet("payment_requests?select=id&email=ilike." + encodeURIComponent(email) + "&or=" + encodeURIComponent("(status.eq.Pending,payment_status.eq.Pending,status.eq.Approved,payment_status.eq.Approved)") + "&limit=1");
    if (pendingRows.length) return json(res, 409, { ok: false, error: "A payment request for this email is already pending or approved." });

    const origin = "https://smart-money-navy.vercel.app";
    const orderId = "SM-" + require("crypto").randomUUID();
    const response = await fetch(c.apiUrl + "/api/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Merchant-Id": c.merchantId,
        "X-Merchant-Key": c.apiKey,
        "Idempotency-Key": orderId
      },
      body: JSON.stringify({
        orderId,
        amount: amount.toFixed(2),
        currency: "INR",
        returnUrl: origin + "/payment.html?gateway_return=1&orderId=" + encodeURIComponent(orderId),
        customer: { fullName, phoneNumber: mobile },
        metadata: {
          merchant: "SMART_MONEY",
          packageName,
          packagePrice: amount,
          fullName,
          email,
          mobile,
          referralId: referral
        }
      }),
      signal: AbortSignal.timeout(15000)
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.checkoutUrl || !result.paymentId) {
      console.error("Smart Gateway create payment failed:", response.status, result.code || result.error || "unknown");
      return json(res, 502, { ok: false, error: "Smart Gateway could not create the checkout session." });
    }

    return json(res, 200, {
      ok: true,
      orderId,
      paymentId: result.paymentId,
      checkoutUrl: result.checkoutUrl
    });
  } catch (error) {
    console.error("Smart Gateway create payment error:", error.message);
    return json(res, 502, { ok: false, error: "Unable to connect to Smart Gateway. Please try again later." });
  }
};
