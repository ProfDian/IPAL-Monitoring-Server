/**
 * ========================================
 * NOTIFICATION SERVICE (ORCHESTRATOR)
 * ========================================
 * Central notification service yang koordinasi:
 * - Email notifications (via emailService)
 * - FCM push notifications (via fcmService)
 * - Get recipients from Firestore users
 *
 * Called by waterQualityService after alerts created
 */

const { db } = require("../config/firebase-config");
const emailService = require("./emailService");
const fcmService = require("./fcmService");

/**
 * ========================================
 * MAIN ORCHESTRATOR FUNCTION
 * ========================================
 */

/**
 * Send notifications for multiple alerts (1 email with all violations)
 * @param {Array} alerts - Array of alert objects
 * @returns {Promise<Object>} Notification results
 */
async function sendAlerts(alerts) {
  try {
    if (!alerts || alerts.length === 0) {
      console.log("⚠️  No alerts to send");
      return {
        success: false,
        message: "No alerts provided",
      };
    }

    console.log(`📤 Sending notifications for ${alerts.length} alert(s)...`);

    // Step 1: Get recipients (admin & manager)
    console.log("👥 Getting recipients from Firestore...");
    const recipients = await getNotificationRecipients();

    if (!recipients.emails || recipients.emails.length === 0) {
      console.log("⚠️  No email recipients found");
      return {
        success: false,
        message: "No recipients found",
      };
    }

    console.log(`   Found ${recipients.emails.length} email recipient(s)`);
    console.log(`   Found ${recipients.fcmTokens.length} FCM token(s)`);

    const results = {
      email: null,
      fcm: null,
      timestamp: new Date().toISOString(),
    };

    // Step 2: Send Email (all violations in 1 email)
    try {
      console.log("📧 Sending email notification...");
      results.email = await sendEmailForAlerts(alerts, recipients.emails);

      if (results.email.success) {
        console.log("✅ Email sent successfully!");
      } else {
        console.log("⚠️  Email failed:", results.email.error);
      }
    } catch (emailError) {
      console.error("❌ Email error:", emailError.message);
      results.email = {
        success: false,
        error: emailError.message,
      };
    }

    // Step 3: Send FCM (if tokens available)
    if (recipients.fcmTokens.length > 0) {
      try {
        console.log("🔔 Sending FCM notifications...");
        results.fcm = await sendFCMForAlerts(alerts, recipients.fcmTokens);

        if (results.fcm.success) {
          console.log("✅ FCM sent successfully!");
        } else {
          console.log("⚠️  FCM failed:", results.fcm.error);
        }
      } catch (fcmError) {
        console.error("❌ FCM error:", fcmError.message);
        results.fcm = {
          success: false,
          error: fcmError.message,
        };
      }
    } else {
      console.log("⏭️  Skipping FCM (no tokens registered)");
      results.fcm = {
        success: false,
        message: "No FCM tokens available",
      };
    }

    // Overall success if at least email sent
    const overallSuccess = results.email?.success || false;

    console.log(
      `📊 Notification summary: Email=${
        results.email?.success ? "✅" : "❌"
      }, FCM=${results.fcm?.success ? "✅" : "❌"}`,
    );

    return {
      success: overallSuccess,
      message: overallSuccess
        ? "Notifications sent successfully"
        : "All notification methods failed",
      results: results,
    };
  } catch (error) {
    console.error("💥 Error in sendAlerts orchestrator:", error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * ========================================
 * GET RECIPIENTS FROM FIRESTORE
 * ========================================
 */

/**
 * Get notification recipients (superadmin & admin users)
 * @returns {Promise<Object>} Recipients { emails: [], fcmTokens: [] }
 */
async function getNotificationRecipients() {
  try {
    // Query users with role superadmin or admin
    const usersSnapshot = await db
      .collection("users")
      .where("role", "in", ["superadmin", "admin"])
      .get();

    if (usersSnapshot.empty) {
      console.log("⚠️  No superadmin/admin users found in Firestore");
      return {
        emails: [],
        fcmTokens: [],
      };
    }

    const emails = [];
    const fcmTokens = [];

    usersSnapshot.forEach((doc) => {
      const userData = doc.data();

      // Collect emails (REQUIRED)
      if (userData.email) {
        emails.push(userData.email);
      }

      // Collect FCM tokens (OPTIONAL - for mobile push notifications)
      if (userData.fcm_token) {
        fcmTokens.push(userData.fcm_token);
      }
    });

    console.log(
      `✅ Recipients loaded: ${emails.length} emails, ${fcmTokens.length} FCM tokens`,
    );

    return {
      emails: emails,
      fcmTokens: fcmTokens,
    };
  } catch (error) {
    console.error("❌ Error getting recipients:", error);
    return {
      emails: [],
      fcmTokens: [],
    };
  }
}

/**
 * ========================================
 * EMAIL NOTIFICATION (Multiple Alerts)
 * ========================================
 */

/**
 * Send email with all violations in 1 email
 * @param {Array} alerts - Array of alert objects
 * @param {Array} emails - Array of recipient emails
 * @returns {Promise<Object>} Email send result
 */
async function sendEmailForAlerts(alerts, emails) {
  try {
    // Prepare combined alert data for email
    const emailData = prepareEmailData(alerts);

    // Send via emailService
    const result = await emailService.sendWaterQualityAlert(emailData, emails);

    return result;
  } catch (error) {
    console.error("❌ Error sending email:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Prepare email data from multiple alerts
 * Format: 1 email with all violations
 */
function prepareEmailData(alerts) {
  // Get highest severity
  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
  const highestSeverity = alerts.reduce((max, alert) => {
    const currentLevel = severityOrder[alert.severity] || 0;
    const maxLevel = severityOrder[max] || 0;
    return currentLevel > maxLevel ? alert.severity : max;
  }, "low");

  // Get first alert for basic info
  const firstAlert = alerts[0];

  // Combine all violations
  const allViolations = alerts.map((alert) => ({
    parameter: alert.parameter,
    value: alert.value,
    threshold: alert.threshold,
    severity: alert.severity,
    message: alert.message,
    location: alert.location,
  }));

  // Email data structure (compatible with emailService)
  return {
    ipal_id: firstAlert.ipal_id,
    reading_id: firstAlert.reading_id,
    rule: `${alerts.length} Parameter Violations Detected`,
    message: `Terdapat ${alerts.length} parameter yang melebihi baku mutu air limbah`,
    severity: highestSeverity,
    parameter: "multiple", // Indicates multiple parameters
    location: "outlet",
    violations: allViolations, // ← Array of all violations
    timestamp: firstAlert.timestamp || new Date(),

    // Additional data for email template
    violation_count: alerts.length,
    parameters_affected: alerts.map((a) => a.parameter).join(", "),
  };
}

/**
 * ========================================
 * FCM NOTIFICATION (Multiple Alerts)
 * ========================================
 */

/**
 * Send FCM push notifications for alerts
 * @param {Array} alerts - Array of alert objects
 * @param {Array} fcmTokens - Array of FCM tokens
 * @returns {Promise<Object>} FCM send result
 */
async function sendFCMForAlerts(alerts, fcmTokens) {
  try {
    // Prepare FCM data
    const fcmData = prepareFCMData(alerts);

    // Send to multiple devices
    const result = await fcmService.sendPushNotificationToMultiple(
      fcmTokens,
      fcmData,
    );

    return result;
  } catch (error) {
    console.error("❌ Error sending FCM:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Prepare FCM data from multiple alerts
 */
function prepareFCMData(alerts) {
  const firstAlert = alerts[0];

  return {
    id: firstAlert.alert_id || "multiple-alerts",
    ipal_id: firstAlert.ipal_id,
    rule: `${alerts.length} Violations Detected`,
    message: `${alerts.length} parameter melebihi baku mutu: ${alerts
      .map((a) => a.parameter.toUpperCase())
      .join(", ")}`,
    severity: alerts.reduce((max, alert) => {
      const levels = { critical: 4, high: 3, medium: 2, low: 1 };
      return (levels[alert.severity] || 0) > (levels[max] || 0)
        ? alert.severity
        : max;
    }, "low"),
    parameter: "multiple",
    location: "outlet",
    timestamp: new Date(),
  };
}

/**
 * ========================================
 * COMPATIBILITY FUNCTIONS
 * ========================================
 * For waterQualityService compatibility
 */

/**
 * Send email alert (single alert - legacy compatibility)
 * @param {Object} alertData - Single alert data
 * @returns {Promise<Object>} Send result
 */
async function sendEmailAlert(alertData) {
  try {
    console.log("📧 sendEmailAlert called (single alert)");

    // Get recipients
    const recipients = await getNotificationRecipients();

    if (recipients.emails.length === 0) {
      return {
        success: false,
        message: "No email recipients",
      };
    }

    // Send email
    return await emailService.sendWaterQualityAlert(
      alertData,
      recipients.emails,
    );
  } catch (error) {
    console.error("❌ Error in sendEmailAlert:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send FCM notification (single alert - legacy compatibility)
 * @param {Object} alertData - Single alert data
 * @returns {Promise<Object>} Send result
 */
async function sendFCMNotification(alertData) {
  try {
    console.log("🔔 sendFCMNotification called (single alert)");

    // Get recipients
    const recipients = await getNotificationRecipients();

    if (recipients.fcmTokens.length === 0) {
      return {
        success: false,
        message: "No FCM tokens",
      };
    }

    // Send FCM
    return await fcmService.sendPushNotificationToMultiple(
      recipients.fcmTokens,
      alertData,
    );
  } catch (error) {
    console.error("❌ Error in sendFCMNotification:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * ========================================
 * LEGACY FUNCTION (Keep for backward compatibility)
 * ========================================
 */

/**
 * Old sendNotification function (deprecated, use sendAlerts instead)
 */
async function sendNotification(token, message) {
  console.log(
    "⚠️  sendNotification (legacy) called - consider using sendAlerts()",
  );

  const payload = {
    notification: {
      title: "Alert: Kualitas Air Tidak Normal",
      body: message,
    },
  };

  try {
    if (!token) {
      console.log("⚠️  No FCM token provided");
      return { success: false };
    }

    const admin = require("../config/firebase-config").admin;
    await admin.messaging().sendToDevice(token, payload);
    console.log("Notifikasi berhasil dikirim");
    return { success: true };
  } catch (error) {
    console.error("Gagal mengirim notifikasi:", error);
    return { success: false, error: error.message };
  }
}

/**
 * ========================================
 * EXPORTS
 * ========================================
 */

module.exports = {
  // Main orchestrator (NEW)
  sendAlerts,

  // Compatibility functions (for waterQualityService)
  sendEmailAlert,
  sendFCMNotification,

  // Helper functions
  getNotificationRecipients,

  // Legacy (backward compatibility)
  sendNotification,
};

console.log("📦 notificationService (orchestrator) loaded");
