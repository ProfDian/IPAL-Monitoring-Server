/**
 * ========================================
 * AUTH CONTROLLER (UPDATED)
 * ========================================
 * Menambahkan getProfile function
 * This extends your existing authController.js
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
  FIREBASE_API_KEY ? "✅ Yes" : "❌ No"
);
console.log("🔑 JWT Secret loaded:", JWT_SECRET ? "✅ Yes" : "❌ No");

/**
 * LOGIN (EXISTING - keep as is)
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("📥 Login attempt for:", email);

    // Validasi input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Cek API Key tersedia
    if (!FIREBASE_API_KEY) {
      console.error("❌ FIREBASE_API_KEY not set in .env file!");
      return res.status(500).json({
        success: false,
        message: "Server configuration error: Firebase API key missing",
      });
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
        authError.response?.data || authError.message
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
          errorMessage =
            "Too many failed login attempts. Please try again later";
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

      return res.status(401).json({
        success: false,
        message: errorMessage,
      });
    }

    // Ambil user data dari Firestore
    const userDoc = await db
      .collection("users")
      .doc(firebaseUser.localId)
      .get();

    let userData;

    if (!userDoc.exists) {
      console.log("⚠️  User authenticated but no Firestore data. Creating...");

      // Buat user baru di Firestore
      userData = {
        email: firebaseUser.email,
        username: firebaseUser.email.split("@")[0],
        role: "guest",
        created_at: new Date().toISOString(),
      };

      await db.collection("users").doc(firebaseUser.localId).set(userData);
    } else {
      userData = userDoc.data();
    }

    // Generate custom JWT token
    const token = jwt.sign(
      {
        uid: firebaseUser.localId,
        email: userData.email,
        role: userData.role,
      },
      JWT_SECRET,
      { expiresIn: "6h" }
    );

    console.log("✅ Login successful for:", userData.email);

    // Set token di cookie (optional)
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 6 * 60 * 60 * 1000, // 6 hours
    });

    // Response
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token: token,
      user: {
        uid: firebaseUser.localId,
        email: userData.email,
        username: userData.username,
        role: userData.role,
      },
    });
  } catch (error) {
    console.error("💥 Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
};

/**
 * LOGOUT (EXISTING - keep as is)
 */
exports.logout = async (req, res) => {
  try {
    // Clear token cookie
    res.clearCookie("token");

    console.log("✅ Logout successful");

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    console.error("💥 Logout error:", error);
    return res.status(500).json({
      success: false,
      message: "Logout failed",
      error: error.message,
    });
  }
};

/**
 * GET PROFILE (NEW)
 * Endpoint: GET /auth/profile
 * Protected route - requires authentication
 */
exports.getProfile = async (req, res) => {
  try {
    const user = req.user; // From authMiddleware

    console.log("👤 Getting profile for:", user.email);

    // Get full user data from Firestore
    const userDoc = await db.collection("users").doc(user.uid).get();

    if (!userDoc.exists) {
      console.error("❌ User not found in Firestore:", user.uid);
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    const userData = userDoc.data();

    // Prepare response data
    const profileData = {
      uid: user.uid,
      email: userData.email,
      username: userData.username || userData.email.split("@")[0],
      role: userData.role,
      created_at: userData.created_at,
      fcm_token: userData.fcm_token || null,
      fcm_token_updated_at: userData.fcm_token_updated_at || null,
    };

    console.log("✅ Profile retrieved for:", user.email);

    return res.status(200).json({
      success: true,
      user: profileData,
    });
  } catch (error) {
    console.error("💥 Error getting profile:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get profile",
      error: error.message,
    });
  }
};

/**
 * CHECK EMAIL EXISTS
 * Endpoint: POST /auth/check-email
 * Check if email exists in the system (for forgot password validation)
 */
exports.checkEmail = async (req, res) => {
  try {
    const { email } = req.body;

    console.log("� Checking if email exists:", email);

    // Validasi input
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address format",
        exists: false,
      });
    }

    // Check in Firebase Authentication (NOT Firestore!)
    let exists = false;
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      exists = !!userRecord; // User exists in Firebase Auth
      console.log("✅ Email found in Firebase Auth:", userRecord.uid);
    } catch (authError) {
      if (authError.code === "auth/user-not-found") {
        console.log("❌ Email not found in Firebase Auth");
        exists = false;
      } else {
        // Other errors (e.g., network issues)
        throw authError;
      }
    }

    return res.status(200).json({
      success: true,
      exists: exists,
      message: exists
        ? "Email exists in the system"
        : "No account found with this email address",
    });
  } catch (error) {
    console.error("💥 Error checking email:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check email",
      error: error.message,
      exists: false,
    });
  }
};

console.log("�📦 authController (with getProfile and checkEmail) loaded");
