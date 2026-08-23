// ================================
// SUPABASE CONFIG
// ================================

const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";

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
      .single();

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
    console.log(error);
  }
}


// ================================
// SAVE PROFILE
// ================================

document.getElementById("profileForm")?.addEventListener("submit", async function (e) {

  e.preventDefault();

  const {
    data: { user },
    error: userError
  } = await supabaseClient.auth.getUser();

  if (userError || !user) {
    alert("Please login first");
    return;
  }

  const fullName = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const mobile = document.getElementById("mobile").value.trim();

  const { error } = await supabaseClient
    .from("profiles")
    .upsert({
      user_id: user.id,
      full_name: fullName,
      email: email,
      mobile: mobile
    });

  if (error) {
    console.log(error);
    alert("Profile save nahi hua: " + error.message);
  } else {
    alert("Profile successfully saved!");
  }

});


// ================================
// CHANGE PASSWORD
// ================================

document.getElementById("passwordForm")?.addEventListener("submit", async function (e) {

  e.preventDefault();

  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmNewPassword").value;

  if (newPassword !== confirmPassword) {
    alert("New passwords match nahi kar rahe");
    return;
  }

  if (newPassword.length < 6) {
    alert("Password kam se kam 6 characters ka hona chahiye");
    return;
  }

  const { error } = await supabaseClient.auth.updateUser({
    password: newPassword
  });

  if (error) {
    alert("Password change error: " + error.message);
  } else {
    alert("Password successfully changed!");

    document.getElementById("passwordForm").reset();
  }

});


// ================================
// LOAD PROFILE WHEN PAGE OPENS
// ================================

document.addEventListener("DOMContentLoaded", function () {
  loadProfile();
});