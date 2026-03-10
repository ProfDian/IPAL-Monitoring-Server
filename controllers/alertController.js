/**
 * ========================================
 * ALERT CONTROLLER - REFACTORED
 * ========================================
 * Thin controller layer - delegates to alertService
 * Created by fuzzy logic dari water_quality_readings
 */

const alertService = require("../services/alertService");

/**
 * GET ALL ALERTS dengan filter
 * Endpoint: GET /api/alerts?ipal_id=1&status=active&severity=high&limit=20
 */
exports.getAlerts = async (req, res) => {
  try {
    const result = await alertService.getAlerts(req.query);

    if (result.count === 0) {
      return res.status(200).json({
        success: true,
        message: "No alerts found",
        count: 0,
        data: [],
      });
    }

    return res.status(200).json({
      success: true,
      count: result.count,
      data: result.alerts,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("💥 Error fetching alerts:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Failed to fetch alerts",
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
    const result = await alertService.updateAlertStatus(id, status, user);

    return res.status(200).json({
      success: true,
      message: `Alert ${result.status}`,
      data: result,
    });
  } catch (error) {
    console.error("💥 Error updating alert status:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Failed to update alert status",
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
    const result = await alertService.deleteAlert(id, user);

    return res.status(200).json({
      success: true,
      message: "Alert deleted successfully",
      data: result,
    });
  } catch (error) {
    console.error("💥 Error deleting alert:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Failed to delete alert",
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
    const stats = await alertService.getAlertStats(ipal_id);

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("💥 Error fetching alert statistics:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status
        ? error.message
        : "Failed to fetch alert statistics",
      error: error.message,
    });
  }
};

// Debug
console.log("📦 alertController exports:", Object.keys(module.exports));
