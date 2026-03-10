/**
 * ========================================
 * ALERT SERVICE
 * ========================================
 * Business logic for alert operations
 * Extracted from alertController for clean architecture
 */

const { db, admin } = require("../config/firebase-config");

/**
 * Get all alerts with filters and pagination
 * @param {object} filters - Query filters
 * @returns {Promise<{alerts: Array, count: number, pagination: object}>}
 */
async function getAlerts({
  ipal_id,
  status,
  severity,
  parameter,
  location,
  limit = 200,
  start_after,
}) {
  console.log("📊 Fetching alerts with filters:", {
    ipal_id,
    status,
    severity,
    parameter,
    location,
    limit,
  });

  let query = db.collection("alerts");

  // Filter by IPAL ID
  if (ipal_id) {
    query = query.where("ipal_id", "==", parseInt(ipal_id));
  }

  // Filter by status (active/acknowledged/resolved)
  if (status) {
    query = query.where("status", "==", status);
  }

  // Filter by severity (low/medium/high/critical)
  if (severity) {
    query = query.where("severity", "==", severity);
  }

  // Filter by parameter (ph/tds/temperature)
  if (parameter) {
    query = query.where("parameter", "==", parameter);
  }

  // Filter by location (inlet/outlet/efficiency/anomaly)
  if (location) {
    query = query.where("location", "==", location);
  }

  // Order by timestamp descending (newest first)
  query = query.orderBy("timestamp", "desc");

  // Pagination - start after a specific document
  if (start_after) {
    const startAfterDoc = await db.collection("alerts").doc(start_after).get();
    if (startAfterDoc.exists) {
      query = query.startAfter(startAfterDoc);
    }
  }

  // Limit results
  query = query.limit(parseInt(limit));

  // Execute query
  const snapshot = await query.get();

  if (snapshot.empty) {
    return {
      alerts: [],
      count: 0,
      pagination: { limit: parseInt(limit), last_doc_id: null },
    };
  }

  // Map results
  const alerts = [];
  snapshot.forEach((doc) => {
    alerts.push({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate
        ? doc.data().timestamp.toDate().toISOString()
        : null,
      created_at: doc.data().created_at?.toDate
        ? doc.data().created_at.toDate().toISOString()
        : null,
    });
  });

  console.log(`✅ Found ${alerts.length} alerts`);

  return {
    alerts,
    count: alerts.length,
    pagination: {
      limit: parseInt(limit),
      last_doc_id: alerts[alerts.length - 1]?.id || null,
    },
  };
}

/**
 * Update alert status
 * @param {string} id - Alert document ID
 * @param {string} status - New status
 * @param {object} user - User object with uid and email
 * @returns {Promise<{alert_id: string, status: string, updated_by: string}>}
 * @throws {Error} with status 400/404
 */
async function updateAlertStatus(id, status, user) {
  // Validate status
  const validStatuses = ["active", "acknowledged", "resolved"];
  if (!validStatuses.includes(status)) {
    const error = new Error(
      `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
    );
    error.status = 400;
    throw error;
  }

  console.log(`🔄 Updating alert status: ${id} → ${status}`);

  const alertRef = db.collection("alerts").doc(id);
  const alertDoc = await alertRef.get();

  if (!alertDoc.exists) {
    const error = new Error(`Alert with ID ${id} not found`);
    error.status = 404;
    throw error;
  }

  // Update data
  const updateData = {
    status: status,
    updated_by: user.uid,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  // If status is acknowledged
  if (status === "acknowledged") {
    updateData.acknowledged_by = user.uid;
    updateData.acknowledged_at = admin.firestore.FieldValue.serverTimestamp();
  }

  // If status is resolved
  if (status === "resolved") {
    updateData.resolved_by = user.uid;
    updateData.resolved_at = admin.firestore.FieldValue.serverTimestamp();
  }

  await alertRef.update(updateData);

  console.log(`✅ Alert status updated: ${id} → ${status}`);
  return { alert_id: id, status: status, updated_by: user.email };
}

/**
 * Delete alert
 * @param {string} id - Alert document ID
 * @param {object} user - User object with uid, email, role
 * @returns {Promise<{alert_id: string, deleted_by: string}>}
 * @throws {Error} with status 403/404
 */
async function deleteAlert(id, user) {
  // Check if user is admin
  if (user.role !== "admin") {
    const error = new Error("Only admins can delete alerts");
    error.status = 403;
    throw error;
  }

  console.log(`🗑️ Deleting alert: ${id}`);

  const alertRef = db.collection("alerts").doc(id);
  const alertDoc = await alertRef.get();

  if (!alertDoc.exists) {
    const error = new Error(`Alert with ID ${id} not found`);
    error.status = 404;
    throw error;
  }

  // Delete alert
  await alertRef.delete();

  console.log(`✅ Alert deleted: ${id}`);
  return { alert_id: id, deleted_by: user.email };
}

/**
 * Get alert statistics
 * @param {number|string} ipal_id - Optional IPAL ID filter
 * @returns {Promise<object>} Statistics breakdown
 */
async function getAlertStats(ipal_id) {
  console.log(`📊 Fetching alert statistics for IPAL: ${ipal_id || "all"}`);

  let query = db.collection("alerts");

  if (ipal_id) {
    query = query.where("ipal_id", "==", parseInt(ipal_id));
  }

  const snapshot = await query.get();

  // Calculate statistics
  const stats = {
    total: snapshot.size,
    by_status: {
      active: 0,
      acknowledged: 0,
      resolved: 0,
    },
    by_severity: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
    by_parameter: {
      ph: 0,
      tds: 0,
      temperature: 0,
    },
    by_location: {
      inlet: 0,
      outlet: 0,
      efficiency: 0,
      anomaly: 0,
    },
  };

  snapshot.forEach((doc) => {
    const data = doc.data();

    // Count by status
    if (data.status) {
      stats.by_status[data.status] = (stats.by_status[data.status] || 0) + 1;
    }

    // Count by severity
    if (data.severity) {
      stats.by_severity[data.severity] =
        (stats.by_severity[data.severity] || 0) + 1;
    }

    // Count by parameter
    if (data.parameter) {
      stats.by_parameter[data.parameter] =
        (stats.by_parameter[data.parameter] || 0) + 1;
    }

    // Count by location
    if (data.location) {
      stats.by_location[data.location] =
        (stats.by_location[data.location] || 0) + 1;
    }
  });

  console.log(`✅ Alert statistics calculated: ${stats.total} total alerts`);
  return stats;
}

module.exports = {
  getAlerts,
  updateAlertStatus,
  deleteAlert,
  getAlertStats,
};

console.log("📦 alertService loaded");
