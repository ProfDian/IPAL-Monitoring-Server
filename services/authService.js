/**
 * ========================================
 * AUTH SERVICE
 * ========================================
 * Business logic for authentication operations
 * Extracted from authController for clean architecture
 */

const { admin, db } = require("../config/firebase-config");
const jwt = require("jsonwebtoken");
const axios = require("axios");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

// Debug
console.log(
  "🔑 Firebase API Key loaded:",
  FIREBASE_API_KEY ? "✅ Yes" : "❌ No",
);
console.log("🔑 JWT Secret loaded:", JWT_SECRET ? "✅ Yes" : "❌ No");

/**
 * Authenticate user via Firebase REST API and generate JWT token
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{token: string, user: object}>}
 * @throws {Error} with status property for known error conditions
 */
async function authenticateUser(email, password) {
  // Cek API Key tersedia
  if (!FIREBASE_API_KEY) {
    console.error("❌ FIREBASE_API_KEY not set in .env file!");
    const error = new Error(
      "Server configuration error: Firebase API key missing",
    );
    error.status = 500;
    throw error;
  }

  // Verifikasi dengan Firebase REST API
  let firebaseUser;
  try {
    const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;

    console.log("🔗 Calling Firebase Auth API...");

    const response = await axios.post(signInUrl, {
      email,
      password,
      returnSecureToken: true,
    });

    firebaseUser = response.data;
    console.log("✅ Firebase Auth successful for UID:", firebaseUser.localId);
  } catch (authError) {
    console.error(
      "❌ Firebase Auth failed:",
      authError.response?.data || authError.message,
    );

    // Map Firebase error codes to user-friendly messages
    const firebaseErrorCode = authError.response?.data?.error?.message;
    let errorMessage = "Invalid email or password";

    switch (firebaseErrorCode) {
      case "EMAIL_NOT_FOUND":
        errorMessage = "No account found with this email address";
        break;
      case "INVALID_PASSWORD":
        errorMessage = "Incorrect password. Please try again";
        break;
      case "USER_DISABLED":
        errorMessage = "This account has been disabled";
        break;
      case "TOO_MANY_ATTEMPTS_TRY_LATER":
        errorMessage = "Too many failed login attempts. Please try again later";
        break;
      case "INVALID_LOGIN_CREDENTIALS":
        errorMessage =
          "Invalid email or password. Please check your credentials";
        break;
      case "INVALID_EMAIL":
        errorMessage = "Invalid email address format";
        break;
      default:
        errorMessage =
          "Login failed. Please check your credentials and try again";
    }

    const error = new Error(errorMessage);
    error.status = 401;
    throw error;
  }

  // Ambil user data dari Firestore
  console.log(
    "🔍 Looking for user in Firestore with UID:",
    firebaseUser.localId,
  );

  const userDoc = await db.collection("users").doc(firebaseUser.localId).get();

  console.log("📄 Document exists:", userDoc.exists);

  if (!userDoc.exists) {
    console.error("❌ User authenticated but not found in Firestore!");
    console.error("   UID:", firebaseUser.localId);
    console.error("   Email:", firebaseUser.email);

    const error = new Error(
      "Account not authorized. Please contact administrator.",
    );
    error.status = 403;
    error.details =
      "User exists in Authentication but not in user database. Administrator must create your account first.";
    throw error;
  }

  const userData = userDoc.data();
  console.log("✅ User data found:", {
    email: userData.email,
    role: userData.role,
    username: userData.username,
  });

  // Generate custom JWT token
  const token = jwt.sign(
    {
      uid: firebaseUser.localId,
      email: userData.email,
      role: userData.role,
    },
    JWT_SECRET,
    { expiresIn: "6h" },
  );

  console.log("✅ Login successful for:", userData.email);

  return {
    token,
    user: {
      uid: firebaseUser.localId,
      email: userData.email,
      username: userData.username,
      role: userData.role,
      created_at: userData.created_at,
      updated_at: userData.updated_at,
    },
  };
}

/**
 * Get user profile from Firestore
 * @param {string} uid - User ID
 * @returns {Promise<object>} Profile data
 * @throws {Error} with status 404 if not found
 */
async function getUserProfile(uid) {
  const userDoc = await db.collection("users").doc(uid).get();

  if (!userDoc.exists) {
    console.error("❌ User not found in Firestore:", uid);
    const error = new Error("User profile not found");
    error.status = 404;
    throw error;
  }

  const userData = userDoc.data();

  return {
    uid,
    email: userData.email,
    username: userData.username || userData.email.split("@")[0],
    role: userData.role,
    created_at: userData.created_at,
    fcm_token: userData.fcm_token || null,
    fcm_token_updated_at: userData.fcm_token_updated_at || null,
  };
}

/**
 * Check if email exists in Firebase Authentication
 * @param {string} email
 * @returns {Promise<boolean>}
 */
async function checkEmailExists(email) {
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log("✅ Email found in Firebase Auth:", userRecord.uid);
    return true;
  } catch (authError) {
    if (authError.code === "auth/user-not-found") {
      console.log("❌ Email not found in Firebase Auth");
      return false;
    }
    // Other errors (e.g., network issues)
    throw authError;
  }
}

module.exports = {
  authenticateUser,
  getUserProfile,
  checkEmailExists,
  JWT_SECRET,
};

console.log("📦 authService loaded");
