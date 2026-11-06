import { withSupabase } from "npm:@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const ADMIN_EMAILS = new Set([
  "sboro3235@gmail.com",
  "phwilawswargiary6900@gmail.com"
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
      const callerEmail = String(ctx.userClaims?.email || "").trim().toLowerCase();
      if (!ADMIN_EMAILS.has(callerEmail)) {
        return json({ error: "Admin access required." }, 403);
      }

      const body = await req.json().catch(() => ({}));
      const paymentId = Number(body.payment_id);
      if (!Number.isInteger(paymentId) || paymentId <= 0) {
        return json({ error: "Invalid payment_id." }, 400);
      }

      const admin = ctx.supabaseAdmin;

      let { data: payment, error: paymentError } = await admin
        .from("payment_requests")
        .select("*")
        .eq("id", paymentId)
        .maybeSingle();

      if (paymentError) throw paymentError;
      if (!payment) throw new Error("Payment request not found.");

      // Admin approval must be committed before activation logic checks status.
      // The admin-only function performs both operations to avoid the old ordering bug.
      if (body.approve === true) {
        // Defer the database status change until account/profile creation succeeds.
        payment = { ...payment, status: "Approved", payment_status: "Approved" };
      }

      const paymentStatus = String(
        payment.status || payment.payment_status || ""
      ).toLowerCase();

      if (paymentStatus === "rejected") {
        throw new Error("Rejected payment cannot activate an account.");
      }

      const oldUserId = String(payment.user_id || "").trim();

      // Recover missing legacy buyer email from the linked profile server-side.
      // Persist it so later approvals do not fail for the same reason.
      let email = String(payment.email || "").trim().toLowerCase();
      if (!email && oldUserId) {
        const { data: linkedProfile, error: linkedProfileError } = await admin
          .from("profiles")
          .select("email")
          .eq("user_id", oldUserId)
          .maybeSingle();

        if (linkedProfileError) throw linkedProfileError;
        email = String(linkedProfile?.email || "").trim().toLowerCase();

        if (email) {
          const { error: saveEmailError } = await admin
            .from("payment_requests")
            .update({ email })
            .eq("id", paymentId);
          if (saveEmailError) throw saveEmailError;
          payment = { ...payment, email };
        }
      }

      if (!email) {
        throw new Error("Buyer email is missing. Add the buyer email to the payment request or linked profile, then retry approval.");
      }

      let authUser: any = null;
      let page = 1;

      while (!authUser && page <= 10) {
        const { data: usersData, error: usersError } =
          await admin.auth.admin.listUsers({ page, perPage: 1000 });

        if (usersError) throw usersError;

        const users = usersData?.users || [];
        authUser =
          users.find(
            (u: any) =>
              String(u.email || "").trim().toLowerCase() === email
          ) || null;

        if (users.length < 1000) break;
        page++;
      }

      let invited = false;

      if (!authUser) {
        const { data: invitedData, error: inviteError } =
          await admin.auth.admin.inviteUserByEmail(email, {
            data: {
              full_name: payment.full_name || ""
            },
            redirectTo:
              "https://smart-money-navy.vercel.app/update-password.html"
          });

        if (inviteError) throw inviteError;
        authUser = invitedData?.user || null;
        invited = true;
      }

      if (!authUser?.id) {
        throw new Error("Auth account could not be created or found.");
      }

      const newUserId = String(authUser.id);
      const approved = paymentStatus === "approved";

      // The email-matched Auth account is canonical.
      // If the payment still points at an old/mismatched Auth ID,
      // find the source profile and merge it into the canonical profile.
      let sourceProfile: any = null;

      if (oldUserId) {
        const { data, error } = await admin
          .from("profiles")
          .select("*")
          .eq("user_id", oldUserId)
          .maybeSingle();

        if (error) throw error;
        sourceProfile = data || null;
      }

      const { data: canonicalProfile, error: canonicalError } = await admin
        .from("profiles")
        .select("*")
        .eq("user_id", newUserId)
        .maybeSingle();

      if (canonicalError) throw canonicalError;

      if (sourceProfile && newUserId !== oldUserId) {
        const merged: Record<string, any> = {
          full_name: sourceProfile.full_name || canonicalProfile?.full_name || payment.full_name || "",
          email,
          mobile: sourceProfile.mobile || canonicalProfile?.mobile || payment.mobile || null,
          referral_code: sourceProfile.referral_code || canonicalProfile?.referral_code || null,
          referral_id: sourceProfile.referral_id || canonicalProfile?.referral_id || payment.referral_id || null,
          referred_by: sourceProfile.referred_by || canonicalProfile?.referred_by || payment.referral_id || null,
          package_name: (approved ? (payment.package_name || payment.package_type || sourceProfile.package_name || canonicalProfile?.package_name || "Free") : (sourceProfile.package_name || canonicalProfile?.package_name || payment.package_name || payment.package_type || "Free")),
          balance: sourceProfile.balance ?? canonicalProfile?.balance ?? 0,
          profile_photo: sourceProfile.profile_photo || canonicalProfile?.profile_photo || null,
          upi_id: sourceProfile.upi_id || canonicalProfile?.upi_id || null,
          account_holder_name: sourceProfile.account_holder_name || canonicalProfile?.account_holder_name || null,
          bank_name: sourceProfile.bank_name || canonicalProfile?.bank_name || null,
          account_number: sourceProfile.account_number || canonicalProfile?.account_number || null,
          ifsc_code: sourceProfile.ifsc_code || canonicalProfile?.ifsc_code || null,
          profile_pic: sourceProfile.profile_pic || canonicalProfile?.profile_pic || null,
          bank_account_number: sourceProfile.bank_account_number || canonicalProfile?.bank_account_number || null,
          date_of_birth: sourceProfile.date_of_birth || canonicalProfile?.date_of_birth || null,
          payout_type: sourceProfile.payout_type || canonicalProfile?.payout_type || null,
          mobile: sourceProfile.mobile || canonicalProfile?.mobile || payment.mobile || null,
          is_deleted: false,
          is_active: approved ? true : (sourceProfile.is_active ?? canonicalProfile?.is_active ?? true),
          status: approved ? "ACTIVE" : (sourceProfile.status || canonicalProfile?.status || "PENDING")
        };

        if (canonicalProfile) {
          const { error } = await admin
            .from("profiles")
            .update(merged)
            .eq("user_id", newUserId);
          if (error) throw error;
        } else {
          const { error } = await admin
            .from("profiles")
            .insert({ user_id: newUserId, ...merged });
          if (error) throw error;
        }

        // Preserve related records while moving them to the canonical Auth ID.
        const dependentTables = [
          "withdrawal_requests",
          "withdrawals",
          "earnings",
          "payments",
          "Smart Money",
          "certificates"
        ];

        for (const table of dependentTables) {
          const { error } = await admin
            .from(table)
            .update({ user_id: newUserId })
            .eq("user_id", oldUserId);

          if (error && !/relation .* does not exist|Could not find the table/i.test(error.message || "")) {
            throw error;
          }
        }

        const { error: oldProfileError } = await admin
          .from("profiles")
          .update({
            is_deleted: true,
            is_active: false,
            status: "MERGED"
          })
          .eq("user_id", oldUserId);

        if (oldProfileError) throw oldProfileError;
      } else {
        // Always ensure a canonical profile exists. Approval must also set the
        // purchased package; update-only silently fails when no profile exists.
        const packageName = String(
          payment.package_name || payment.package_type ||
          canonicalProfile?.package_name || "Free"
        ).trim() || "Free";

        let generatedReferralCode = canonicalProfile?.referral_code || canonicalProfile?.referral_id || null;
        if (!generatedReferralCode) {
          const { data: generatedCode, error: generatedCodeError } =
            await admin.rpc("generate_unique_referral_code");
          if (generatedCodeError) throw generatedCodeError;
          if (typeof generatedCode !== "string" || !/^SM-smart\\d{5}$/.test(generatedCode)) {
            throw new Error("A unique referral ID could not be generated for the approved buyer.");
          }
          generatedReferralCode = generatedCode;
        }

        const profilePayload: Record<string, any> = {
          user_id: newUserId,
          full_name: canonicalProfile?.full_name || payment.full_name || "",
          email,
          mobile: canonicalProfile?.mobile || payment.mobile || null,
          referral_code: generatedReferralCode,
          referral_id: generatedReferralCode,
          referred_by: canonicalProfile?.referred_by || payment.referral_id || null,
          package_name: packageName,
          balance: canonicalProfile?.balance ?? 0,
          is_deleted: false,
          is_active: approved ? true : (canonicalProfile?.is_active ?? true),
          status: approved ? "ACTIVE" : (canonicalProfile?.status || "PENDING")
        };

        const { error: profileWriteError } = await admin
          .from("profiles")
          .upsert(profilePayload, { onConflict: "user_id" });

        if (profileWriteError) throw profileWriteError;
      }

      const paymentUpdatePayload: Record<string, unknown> = { user_id: newUserId };
      if (body.approve === true) {
        paymentUpdatePayload.status = "Approved";
        paymentUpdatePayload.payment_status = "Approved";
      }
      const { error: paymentUpdateError } = await admin
        .from("payment_requests")
        .update(paymentUpdatePayload)
        .eq("id", paymentId);

      if (paymentUpdateError) throw paymentUpdateError;

      // The account was created/managed server-side, so confirm the
      // known buyer email. Password is intentionally not created or exposed here;
      // the buyer can use the existing password-reset flow to set one.
      if (approved) {
        const { error: authUpdateError } =
          await admin.auth.admin.updateUserById(newUserId, {
            email_confirm: true
          });

        if (authUpdateError) throw authUpdateError;
      }

      return json({
        ok: true,
        payment_id: paymentId,
        user_id: newUserId,
        email,
        invited,
        approved,
        password_reset_required: true
      });
    } catch (error) {
      console.error("ensure-buyer-auth error:", error);
      return json(
        { error: error?.message || "Account activation failed." },
        400
      );
    }
  })
};
