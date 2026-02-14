/**
 * ========================================
 * ALERT CONTROLLER
 * ========================================
 * Controller untuk mengelola alerts
 * Created by fuzzy logic dari water_quality_readings
 */

const { db, admin } = require("../config/firebase-config");

/**
 * GET ALL ALERTS dengan filter
 * Endpoint: GET /api/alerts?ipal_id=1&status=active&severity=high&limit=20
 */
exports.getAlerts = async (req, res) => {
  try {
    const {
      ipal_id,
      status,
      severity,
      parameter,
      location,
      limit = 200,
      start_after,
    } = req.query;

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
      const startAfterDoc = await db
        .collection("alerts")
        .doc(start_after)
        .get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }

    // Limit results
    query = query.limit(parseInt(limit));

    // Execute query
    const snapshot = await query.get();

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        message: "No alerts found",
        count: 0,
        data: [],
      });
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

    return res.status(200).json({
      success: true,
      count: alerts.length,
      data: alerts,
      pagination: {
        limit: parseInt(limit),
        last_doc_id: alerts[alerts.length - 1]?.id || null,
      },
    });
  } catch (error) {
    console.error("💥 Error fetching alerts:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch alerts",
      error: error.message,
    });
  }
};

/**
 * GET ALERT BY ID
 * Endpoint: GET /api/alerts/:id
 */
exports.getAlertById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📋 Fetching alert: ${id}`);

    const alertDoc = await db.collection("alerts").doc(id).get();

    if (!alertDoc.exists) {
      return res.status(404).json({
        success: false,
        message: `Alert with ID ${id} not found`,
      });
    }

    const alertData = {
      id: alertDoc.id,
      ...alertDoc.data(),
      timestamp: alertDoc.data().timestamp?.toDate
        ? alertDoc.data().timestamp.toDate().toISOString()
        : null,
      created_at: alertDoc.data().created_at?.toDate
        ? alertDoc.data().created_at.toDate().toISOString()
        : null,
    };

    // Optional: Get related reading data
    if (alertData.reading_id) {
      const readingDoc = await db
        .collection("water_quality_readings")
        .doc(alertData.reading_id)
        .get();

      if (readingDoc.exists) {
        alertData.reading_data = readingDoc.data();
      }
    }

    console.log(`✅ Alert found: ${id}`);

    return res.status(200).json({
      success: true,
      data: alertData,
    });
  } catch (error) {
    console.error("💥 Error fetching alert:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch alert",
      error: error.message,
    });
  }
};

/**
 * MARK ALERT AS READ
 * Endpoint: PUT /api/alerts/:id/read
 */
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user; // From auth middleware

    console.log(`👁️ Marking alert as read: ${id}`);

    const alertRef = db.collection("alerts").doc(id);
    const alertDoc = await alertRef.get();

    if (!alertDoc.exists) {
      return res.status(404).json({
        success: false,
        message: `Alert with ID ${id} not found`,
      });
    }

    // Update alert
    await alertRef.update({
      read: true,
      read_by: user.uid,
      read_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Alert marked as read: ${id}`);

    return res.status(200).json({
      success: true,
      message: "Alert marked as read",
      data: {
        alert_id: id,
        read_by: user.email,
      },
    });
  } catch (error) {
    console.error("💥 Error marking alert as read:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark alert as read",
      error: error.message,
    });
  }
};

/**
 * UPDATE ALERT STATUS
 * Endpoint: PUT /api/alerts/:id/status
 * Body: { status: "acknowledged" | "resolved" }
 */
exports.updateAlertStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const user = req.user;

    // Validate status
    const validStatuses = ["active", "acknowledged", "resolved"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    console.log(`🔄 Updating alert status: ${id} → ${status}`);

    const alertRef = db.collection("alerts").doc(id);
    const alertDoc = await alertRef.get();

    if (!alertDoc.exists) {
      return res.status(404).json({
        success: false,
        message: `Alert with ID ${id} not found`,
      });
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

    return res.status(200).json({
      success: true,
      message: `Alert ${status}`,
      data: {
        alert_id: id,
        status: status,
        updated_by: user.email,
      },
    });
  } catch (error) {
    console.error("💥 Error updating alert status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update alert status",
      error: error.message,
    });
  }
};

/**
 * DELETE ALERT
 * Endpoint: DELETE /api/alerts/:id
 * Only for Admin
 */
exports.deleteAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Check if user is admin
    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can delete alerts",
      });
    }

    console.log(`🗑️ Deleting alert: ${id}`);

    const alertRef = db.collection("alerts").doc(id);
    const alertDoc = await alertRef.get();

    if (!alertDoc.exists) {
      return res.status(404).json({
        success: false,
        message: `Alert with ID ${id} not found`,
      });
    }

    // Delete alert
    await alertRef.delete();

    console.log(`✅ Alert deleted: ${id}`);

    return res.status(200).json({
      success: true,
      message: "Alert deleted successfully",
      data: {
        alert_id: id,
        deleted_by: user.email,
      },
    });
  } catch (error) {
    console.error("💥 Error deleting alert:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete alert",
      error: error.message,
    });
  }
};

/**
 * GET ALERT STATISTICS
 * Endpoint: GET /api/alerts/stats?ipal_id=1
 */
exports.getAlertStats = async (req, res) => {
  try {
    const { ipal_id } = req.query;

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

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("💥 Error fetching alert statistics:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch alert statistics",
      error: error.message,
    });
  }
};

// Debug
console.log("📦 alertController exports:", Object.keys(module.exports));
