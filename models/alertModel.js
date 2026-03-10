/**
 * ========================================
 * ALERT MODEL
 * ========================================
 * Firestore operations for alerts collection
 * Supports both addAlert (legacy) and createAlert (new)
 */

const { admin } = require("../config/firebase-config");

/**
 * ========================================
 * CREATE ALERT
 * ========================================
 */

/**
 * Add alert to Firestore
 * @param {Object} alertData - Alert data to save
 * @returns {String} alertId - ID of created alert
 */
const addAlert = async (alertData) => {
  try {
    // Prepare alert document with timestamps
    const alertDoc = {
      ...alertData,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      read: false, // Default: unread
    };

    // Add to Firestore
    const alertsRef = admin.firestore().collection("alerts");
    const newAlertRef = await alertsRef.add(alertDoc);

    console.log(`✅ Alert created: ${newAlertRef.id} (${alertData.severity})`);

    return newAlertRef.id;
  } catch (error) {
    console.error("❌ Error adding alert:", error);
    throw new Error("Error adding alert: " + error.message);
  }
};

/**
 * Alias for addAlert (for compatibility with waterQualityService)
 */
const createAlert = addAlert;

/**
 * ========================================
 * READ ALERTS
 * ========================================
 */

/**
 * Get all alerts (without filters)
 * Note: For filtered queries, use alertController.getAlerts()
 * @returns {Array} alerts - Array of alert documents
 */
const getAlerts = async () => {
  try {
    const alertsRef = admin.firestore().collection("alerts");
    const snapshot = await alertsRef
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();

    if (snapshot.empty) {
      return [];
    }

    const alerts = [];
    snapshot.docs.forEach((doc) => {
      alerts.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    console.log(`📊 Retrieved ${alerts.length} alerts`);

    return alerts;
  } catch (error) {
    console.error("❌ Error fetching alerts:", error);
    throw new Error("Error fetching alerts: " + error.message);
  }
};

/**
 * Get alerts by reading ID
 * @param {String} readingId - Water quality reading ID
 * @returns {Array} alerts - Array of alerts for this reading
 */
const getAlertsByReadingId = async (readingId) => {
  try {
    const alertsRef = admin.firestore().collection("alerts");
    const snapshot = await alertsRef.where("reading_id", "==", readingId).get();

    if (snapshot.empty) {
      return [];
    }

    const alerts = [];
    snapshot.docs.forEach((doc) => {
      alerts.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    console.log(`📊 Found ${alerts.length} alert(s) for reading: ${readingId}`);

    return alerts;
  } catch (error) {
    console.error("❌ Error fetching alerts by reading ID:", error);
    throw new Error("Error fetching alerts by reading ID: " + error.message);
  }
};

/**
 * Get active alerts for IPAL
 * @param {Number} ipalId - IPAL ID
 * @returns {Array} alerts - Array of active alerts
 */
const getActiveAlerts = async (ipalId) => {
  try {
    const alertsRef = admin.firestore().collection("alerts");
    const snapshot = await alertsRef
      .where("ipal_id", "==", ipalId)
      .where("status", "==", "active")
      .orderBy("timestamp", "desc")
      .limit(50)
      .get();

    if (snapshot.empty) {
      return [];
    }

    const alerts = [];
    snapshot.docs.forEach((doc) => {
      alerts.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    console.log(`🚨 Found ${alerts.length} active alert(s) for IPAL ${ipalId}`);

    return alerts;
  } catch (error) {
    console.error("❌ Error fetching active alerts:", error);
    throw new Error("Error fetching active alerts: " + error.message);
  }
};

/**
 * ========================================
 * UPDATE ALERT
 * ========================================
 */

/**
 * Update alert status
 * @param {String} alertId - Alert document ID
 * @param {String} status - New status (active/acknowledged/resolved)
 * @param {String} userId - User ID who updated
 * @returns {Boolean} success
 */
const updateAlertStatus = async (alertId, status, userId = null) => {
  try {
    const alertRef = admin.firestore().collection("alerts").doc(alertId);
    const doc = await alertRef.get();

    if (!doc.exists) {
      throw new Error("Alert not found");
    }

    const updateData = {
      status: status,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (userId) {
      updateData.updated_by = userId;
    }

    // Add specific timestamps for status changes
    if (status === "acknowledged") {
      updateData.acknowledged_at = admin.firestore.FieldValue.serverTimestamp();
      if (userId) updateData.acknowledged_by = userId;
    }

    if (status === "resolved") {
      updateData.resolved_at = admin.firestore.FieldValue.serverTimestamp();
      if (userId) updateData.resolved_by = userId;
    }

    await alertRef.update(updateData);

    console.log(`✅ Alert ${alertId} status updated to: ${status}`);

    return true;
  } catch (error) {
    console.error("❌ Error updating alert status:", error);
    throw new Error("Error updating alert status: " + error.message);
  }
};

/**
 * Mark alert as read
 * @param {String} alertId - Alert document ID
 * @param {String} userId - User ID who read the alert
 * @returns {Boolean} success
 */
const markAlertAsRead = async (alertId, userId) => {
  try {
    const alertRef = admin.firestore().collection("alerts").doc(alertId);
    const doc = await alertRef.get();

    if (!doc.exists) {
      throw new Error("Alert not found");
    }

    await alertRef.update({
      read: true,
      read_by: userId,
      read_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Alert ${alertId} marked as read`);

    return true;
  } catch (error) {
    console.error("❌ Error marking alert as read:", error);
    throw new Error("Error marking alert as read: " + error.message);
  }
};

/**
 * ========================================
 * DELETE ALERT
 * ========================================
 */

/**
 * Delete alert by ID
 * @param {String} alertId - Alert document ID
 * @returns {Boolean} success
 */
const deleteAlert = async (alertId) => {
  try {
    const alertRef = admin.firestore().collection("alerts").doc(alertId);
    const doc = await alertRef.get();

    if (!doc.exists) {
      throw new Error("Alert not found");
    }

    await alertRef.delete();

    console.log(`🗑️ Alert deleted: ${alertId}`);

    return true;
  } catch (error) {
    console.error("❌ Error deleting alert:", error);
    throw new Error("Error deleting alert: " + error.message);
  }
};

/**
 * ========================================
 * BULK OPERATIONS
 * ========================================
 */

/**
 * Create multiple alerts (batch)
 * @param {Array} alertsData - Array of alert data objects
 * @returns {Array} alertIds - Array of created alert IDs
 */
const createAlertsInBatch = async (alertsData) => {
  try {
    const batch = admin.firestore().batch();
    const alertsRef = admin.firestore().collection("alerts");
    const alertIds = [];

    alertsData.forEach((alertData) => {
      const newAlertRef = alertsRef.doc(); // Generate ID
      batch.set(newAlertRef, {
        ...alertData,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });
      alertIds.push(newAlertRef.id);
    });

    await batch.commit();

    console.log(`✅ Batch created ${alertIds.length} alerts`);

    return alertIds;
  } catch (error) {
    console.error("❌ Error creating alerts in batch:", error);
    throw new Error("Error creating alerts in batch: " + error.message);
  }
};

/**
 * ========================================
 * EXPORTS
 * ========================================
 */

module.exports = {
  // Create operations
  addAlert,
  createAlert, // ⭐ Alias for compatibility
  createAlertsInBatch,

  // Read operations
  getAlerts,
  getAlertsByReadingId,
  getActiveAlerts,

  // Update operations
  updateAlertStatus,
  markAlertAsRead,

  // Delete operations
  deleteAlert,
};

console.log("📦 alertModel loaded");
