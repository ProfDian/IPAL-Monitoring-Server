/**
 * ========================================
 * NOTIFICATION CONTROLLER
 * ========================================
 * Controller untuk mengelola notification endpoints
 */

const { db } = require("../config/firebase-config");
const {
  sendWaterQualityAlert,
  sendTestEmail,
} = require("../services/emailService");
const {
  sendPushNotification,
  sendPushNotificationToMultiple,
  sendPushNotificationToTopic,
  subscribeToTopic,
  unsubscribeFromTopic,
} = require("../services/fcmService");

// ========================================
// SEND NOTIFICATION (Manual Trigger)
// ========================================

/**
 * Manual trigger untuk kirim notification
 * Endpoint: POST /api/notifications/send
 */
exports.sendNotification = async (req, res) => {
  try {
    const { alert_id, recipients, fcm_tokens } = req.body;

    // Validasi input
    if (!alert_id) {
      return res.status(400).json({
        success: false,
        message: "alert_id is required",
      });
    }

    // Get alert data from Firestore
    const alertDoc = await db.collection("alerts").doc(alert_id).get();

    if (!alertDoc.exists) {
      return res.status(404).json({
        success: false,
        message: `Alert ${alert_id} not found`,
      });
    }

    const alertData = { id: alertDoc.id, ...alertDoc.data() };

    console.log(`📤 Sending notification for alert: ${alert_id}`);

    const results = {
      email: null,
      push: null,
    };

    // 1. Send Email (if recipients provided)
    if (recipients && recipients.length > 0) {
      console.log("📧 Sending email notifications...");
      results.email = await sendWaterQualityAlert(alertData, recipients);
    }

    // 2. Send Push Notification (if FCM tokens provided)
    if (fcm_tokens && fcm_tokens.length > 0) {
      console.log("🔔 Sending push notifications...");
      results.push = await sendPushNotificationToMultiple(
        fcm_tokens,
        alertData,
      );
    }

    // Update alert document with notification status
    await db.collection("alerts").doc(alert_id).update({
      notification_sent: true,
      notification_sent_at: new Date().toISOString(),
      notification_results: results,
    });

    return res.status(200).json({
      success: true,
      message: "Notifications sent successfully",
      results: results,
    });
  } catch (error) {
    console.error("💥 Error sending notification:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send notification",
      error: error.message,
    });
  }
};

// ========================================
// SEND TEST EMAIL
// ========================================

/**
 * Test email service
 * Endpoint: POST /api/notifications/test-email
 */
exports.sendTestEmailHandler = async (req, res) => {
  try {
    const { recipient } = req.body;

    if (!recipient) {
      return res.status(400).json({
        success: false,
        message: "recipient email is required",
      });
    }

    console.log(`📧 Sending test email to: ${recipient}`);

    const result = await sendTestEmail(recipient);

    return res.status(200).json({
      success: result.success,
      message: result.success
        ? "Test email sent successfully"
        : "Failed to send test email",
      result: result,
    });
  } catch (error) {
    console.error("💥 Error sending test email:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send test email",
      error: error.message,
    });
  }
};

// ========================================
// SEND TEST PUSH NOTIFICATION
// ========================================

/**
 * Test push notification service
 * Endpoint: POST /api/notifications/test-push
 */
exports.sendTestPushHandler = async (req, res) => {
  try {
    const { fcm_token } = req.body;

    if (!fcm_token) {
      return res.status(400).json({
        success: false,
        message: "fcm_token is required",
      });
    }

    console.log(`🔔 Sending test push notification...`);

    const testAlert = {
      id: "test-alert-123",
      ipal_id: 1,
      parameter: "ph",
      location: "outlet",
      rule: "Test Notification",
      message: "This is a test push notification from IPAL Monitoring System",
      severity: "medium",
      inlet_value: 7.2,
      outlet_value: 8.5,
    };

    const result = await sendPushNotification(fcm_token, testAlert);

    return res.status(200).json({
      success: result.success,
      message: result.success
        ? "Test push notification sent successfully"
        : "Failed to send test push notification",
      result: result,
    });
  } catch (error) {
    console.error("💥 Error sending test push:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send test push notification",
      error: error.message,
    });
  }
};

// ========================================
// SUBSCRIBE TO TOPIC
// ========================================

/**
 * Subscribe user device to notification topic
 * Endpoint: POST /api/notifications/subscribe
 */
exports.subscribeToTopicHandler = async (req, res) => {
  try {
    const { fcm_token, topic } = req.body;

    if (!fcm_token || !topic) {
      return res.status(400).json({
        success: false,
        message: "fcm_token and topic are required",
      });
    }

    const result = await subscribeToTopic(fcm_token, topic);

    return res.status(200).json({
      success: result.success,
      message: result.success
        ? `Subscribed to topic: ${topic}`
        : "Failed to subscribe",
      result: result,
    });
  } catch (error) {
    console.error("💥 Error subscribing to topic:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to subscribe to topic",
      error: error.message,
    });
  }
};

// ========================================
// UNSUBSCRIBE FROM TOPIC
// ========================================

/**
 * Unsubscribe user device from notification topic
 * Endpoint: POST /api/notifications/unsubscribe
 */
exports.unsubscribeFromTopicHandler = async (req, res) => {
  try {
    const { fcm_token, topic } = req.body;

    if (!fcm_token || !topic) {
      return res.status(400).json({
        success: false,
        message: "fcm_token and topic are required",
      });
    }

    const result = await unsubscribeFromTopic(fcm_token, topic);

    return res.status(200).json({
      success: result.success,
      message: result.success
        ? `Unsubscribed from topic: ${topic}`
        : "Failed to unsubscribe",
      result: result,
    });
  } catch (error) {
    console.error("💥 Error unsubscribing from topic:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to unsubscribe from topic",
      error: error.message,
    });
  }
};

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

// ========================================
// END OF FILE
// ========================================
