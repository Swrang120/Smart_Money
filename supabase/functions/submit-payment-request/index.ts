import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_URL = "https://smart-money-navy.vercel.app/api/razorpay/verify-payment";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://smart-money-navy.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};

const PACKAGE_PRICES: Record<string, number> = {
  "Starter": 289, "Starter Package": 289,
  "Intermediate": 560, "Intermediate Package": 560,
  "Expert": 1149, "Expert Package": 1149,
  "Master": 2499, "Master Package": 2499,
  "Brahmastra": 5499, "Brahmastra Package": 5499,
  "Premium Pro": 10997, "Premium Pro Package": 10997
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

function validBuyer(data: Record<string, unknown>) {
  const name = String(data.full_name || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  const mobile = String(data.mobile || "").trim();
  const referral = String(data.referral_id || "").trim();
  return name.length >= 2 && name.length <= 80 &&
    /^[^\s@]+@[^\s@]+\\.[^\s@]+$/.test(email) &&
    /^[0-9]{10}$/.test(mobile) &&
    /^SM-smart[a-zA-Z0-9]+$/i.test(referral);
}

async function findReferrer(referral: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("user_id,referral_code,referral_id")
    .or("referral_code.eq." + referral + ",referral_id.eq." + referral)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  try {
    const body = await req.json();
    const method = String(body.payment_method || "").trim().toLowerCase();
    let buyer: Record<string, unknown>;
    let packageName: string;
    let packagePrice: number;
    let transactionId: string | null = null;
    let screenshotUrl: string | null = null;
    let razorpayOrderId: string | null = null;
    let razorpayPaymentId: string | null = null;

    if (method === "razorpay") {
      razorpayOrderId = String(body.razorpay_order_id || "").trim();
      razorpayPaymentId = String(body.razorpay_payment_id || "").trim();
      const razorpaySignature = String(body.razorpay_signature || "").trim();
      if (!razorpayOrderId.startsWith("order_") || !razorpayPaymentId.startsWith("pay_") || !razorpaySignature) {
        return json({ ok: false, error: "Missing valid Razorpay verification details." }, 400);
      }

      const verifyResponse = await fetch(VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: razorpaySignature
        })
      });
      const verification = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok || verification.verified !== true || !verification.checkout) {
        return json({ ok: false, error: verification.error || "Razorpay did not confirm a captured payment." }, 400);
      }
      buyer = {
        full_name: verification.checkout.full_name,
        email: verification.checkout.email,
        mobile: verification.checkout.mobile,
        referral_id: verification.checkout.referral_id
      };
      packageName = String(verification.checkout.package_name || "").trim();
      packagePrice = Number(verification.checkout.package_price);
    } else if (method === "upi") {
      buyer = {
        full_name: body.full_name,
        email: body.email,
        mobile: body.mobile,
        referral_id: body.referral_id
      };
      packageName = String(body.package_name || "").trim();
      packagePrice = Number(body.package_price ?? body.amount);
      transactionId = String(body.transaction_id || "").replace(/\\D/g, "");
      screenshotUrl = String(body.screenshot_url || body.screenshot_name || "").trim();

      if (!/^[0-9]{12}$/.test(transactionId)) {
        return json({ ok: false, error: "Enter the exact 12-digit UPI UTR." }, 400);
      }
      const expectedPrefix = SUPABASE_URL + "/storage/v1/object/public/payment-proofs/";
      if (!screenshotUrl.startsWith(expectedPrefix)) {
        return json({ ok: false, error: "Upload the original payment screenshot before submitting." }, 400);
      }
    } else {
      return json({ ok: false, error: "Unsupported payment method." }, 400);
    }

    if (!validBuyer(buyer)) return json({ ok: false, error: "Buyer details or referral ID are invalid." }, 400);
    const expectedPrice = PACKAGE_PRICES[packageName];
    if (!expectedPrice || packagePrice !== expectedPrice) {
      return json({ ok: false, error: "Package amount does not match the approved package price." }, 400);
    }

    const email = String(buyer.email).trim().toLowerCase();
    const mobile = String(buyer.mobile).trim();
    const referral = String(buyer.referral_id).trim();
    const fullName = String(buyer.full_name).trim();

    const referrer = await findReferrer(referral);
    if (!referrer) return json({ ok: false, error: "Referral ID does not exist." }, 400);

    const { data: existingProfile, error: profileError } = await admin
      .from("profiles").select("user_id").ilike("email", email).limit(1).maybeSingle();
    if (profileError) throw profileError;
    if (existingProfile) return json({ ok: false, error: "An account already exists for this email. Please use the login page." }, 409);

    if (method === "upi" && transactionId) {
      const { data: duplicateUtr, error: duplicateError } = await admin
        .from("payment_requests").select("id").eq("transaction_id", transactionId).limit(1).maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicateUtr) return json({ ok: false, error: "This UPI UTR has already been submitted." }, 409);
    }
    if (method === "razorpay" && razorpayPaymentId) {
      const { data: duplicatePayment, error: duplicateError } = await admin
        .from("payment_requests").select("id").eq("razorpay_payment_id", razorpayPaymentId).limit(1).maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicatePayment) return json({ ok: true, already_submitted: true, payment_request_id: duplicatePayment.id, pending: true });
    }

    const record = {
      user_id: null,
      full_name: fullName,
      email,
      mobile,
      referral_id: referral,
      package_name: packageName,
      package_type: packageName,
      package_price: packagePrice,
      amount: packagePrice,
      transaction_id: transactionId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      payment_status: "Pending",
      status: "Pending",
      admin_note: method === "razorpay"
        ? "Razorpay captured payment verified server-side; awaiting admin package approval."
        : "UPI proof submitted; awaiting manual bank/UTR verification.",
      screenshot_name: screenshotUrl,
      screenshot_url: screenshotUrl,
      is_deleted: false,
      payment_method: method === "razorpay" ? "Razorpay" : String(body.payment_method || "UPI")
    };

    const { data: created, error: insertError } = await admin
      .from("payment_requests")
      .insert(record)
      .select("id")
      .single();
    if (insertError) {
      if (insertError.code === "23505") return json({ ok: false, error: "This payment has already been submitted." }, 409);
      throw insertError;
    }

    return json({
      ok: true,
      payment_request_id: created.id,
      pending: true,
      account_created: false,
      message: "Payment request submitted. The member account will be created only after admin approval."
    }, 201);
  } catch (error) {
    console.error("submit-payment-request error:", error?.message || error);
    return json({ ok: false, error: error?.message || "Could not submit payment request." }, 500);
  }
});
