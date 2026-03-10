/**
 * ========================================
 * NOTIFICATION CONTROLLER
 * ========================================
 * Controller untuk mengelola notification endpoints
 */

const { db } = require("../config/firebase-config");
const { subscribeToTopic } = require("../services/fcmService");

// ========================================
// SAVE FCM TOKEN
// ========================================

/**
 * Save user's FCM token to database
 * Endpoint: POST /api/notifications/register-device
 */
exports.registerDevice = async (req, res) => {
  try {
    const { fcm_token } = req.body;
    const user = req.user; // From auth middleware

    if (!fcm_token) {
      return res.status(400).json({
        success: false,
        message: "fcm_token is required",
      });
    }

    // Save FCM token to user document
    await db.collection("users").doc(user.uid).update({
      fcm_token: fcm_token,
      fcm_token_updated_at: new Date().toISOString(),
    });

    console.log(`✅ FCM token registered for user: ${user.email}`);

    // Auto-subscribe to topic based on role
    const userDoc = await db.collection("users").doc(user.uid).get();
    const userData = userDoc.data();

    if (userData.role === "superadmin") {
      await subscribeToTopic(fcm_token, "superadmins");
    } else if (userData.role === "admin") {
      await subscribeToTopic(fcm_token, "admins");
    }
    await subscribeToTopic(fcm_token, "all-users");

    return res.status(200).json({
      success: true,
      message: "Device registered successfully",
    });
  } catch (error) {
    console.error("💥 Error registering device:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to register device",
      error: error.message,
    });
  }
};

// Debug
console.log("📦 notificationController exports:", Object.keys(module.exports));
