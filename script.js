// ================================
// SUPABASE CONFIG
// ================================

const SUPABASE_URL = "https://rvprrulkjegvicbnjuft.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_IdI5j4Q4qcd-1knRMVeGKw_O3Ek42ZJ";

// Supabase client
const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);


// ================================
// PROFILE LOAD
// ================================

async function loadProfile() {
  try {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      console.log("User not logged in");
      return;
    }

    const { data, error } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.log("Profile load error:", error);
      return;
    }

    if (data) {
      document.getElementById("name").value = data.full_name || "";
      document.getElementById("email").value = data.email || "";
      document.getElementById("mobile").value = data.mobile || "";
      document.getElementById("referralId").value = data.referral_id || "";
    }

  } catch (error) {
    console.log("Load error:", error);
  }
}


// ================================
// SAVE PROFILE
// ================================

document.getElementById("profileForm")?.addEventListener(
  "submit",
  async function (e) {

    e.preventDefault();

    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      alert("Please login first");
      return;
    }

    const fullName =
      document.getElementById("name").value.trim();

    const email =
      document.getElementById("email").value.trim();

    const mobile =
      document.getElementById("mobile").value.trim();

    const referralId =
      document.getElementById("referralId").value.trim();

    // Check if profile already exists
    const { data: existingProfile, error: checkError } =
      await supabaseClient
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (checkError) {
      console.log(checkError);
      alert("Profile check error: " + checkError.message);
      return;
    }

    let result;

    // Update existing profile
    if (existingProfile) {
      result = await supabaseClient
        .from("profiles")
        .update({
          full_name: fullName,
          email: email,
          mobile: mobile
        })
        .eq("user_id", user.id);

    } else {

      // Create new profile
      result = await supabaseClient
        .from("profiles")
        .insert({
          user_id: user.id,
          full_name: fullName,
          email: email,
          mobile: mobile,
          referral_id: referralId
        });
    }

    if (result.error) {
      console.log(result.error);
      alert("Profile save nahi hua: " + result.error.message);
    } else {
      alert("Profile successfully saved!");
    }

  }
);


// ================================
// CHANGE PASSWORD
// ================================

document.getElementById("passwordForm")?.addEventListener(
  "submit",
  async function (e) {

    e.preventDefault();

    const newPassword =
      document.getElementById("newPassword").value;

    const confirmPassword =
      document.getElementById("confirmNewPassword").value;

    if (newPassword !== confirmPassword) {
      alert("New passwords match nahi kar rahe");
      return;
    }

    if (newPassword.length < 6) {
      alert("Password kam se kam 6 characters ka hona chahiye");
      return;
    }

    const { error } =
      await supabaseClient.auth.updateUser({
        password: newPassword
      });

    if (error) {
      alert("Password change error: " + error.message);
    } else {
      alert("Password successfully changed!");
      document.getElementById("passwordForm").reset();
    }

  }
);


// ================================
// LOAD PROFILE WHEN PAGE OPENS
// ================================

document.addEventListener(
  "DOMContentLoaded",
  function () {
    loadProfile();
  }
);