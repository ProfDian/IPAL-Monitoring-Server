/**
 * ========================================
 * DASHBOARD CONTROLLER (REFACTORED)
 * ========================================
 * Thin controller layer - delegates business logic to dashboardService
 */

const dashboardService = require("../services/dashboardService");

/**
 * GET DASHBOARD SUMMARY untuk specific IPAL
 * Endpoint: GET /api/dashboard/summary/:ipal_id
 */
exports.getSummary = async (req, res) => {
  try {
    const { ipal_id } = req.params;
    const summary = await dashboardService.getSummary(parseInt(ipal_id));

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("💥 Error fetching dashboard summary:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status
        ? error.message
        : "Failed to fetch dashboard summary",
      error: error.message,
    });
  }
};

/**
 * GET ALL IPALS SUMMARY (untuk homepage/overview)
 * Endpoint: GET /api/dashboard/overview
 */
exports.getOverview = async (req, res) => {
  try {
    const overviewData = await dashboardService.getOverview();

    if (overviewData.statistics.total_ipals === 0) {
      return res.status(200).json({
        success: true,
        message: "No IPALs found",
        data: {
          total_ipals: 0,
          ipals: [],
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: overviewData,
    });
  } catch (error) {
    console.error("💥 Error fetching dashboard overview:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status
        ? error.message
        : "Failed to fetch dashboard overview",
      error: error.message,
    });
  }
};

/**
 * GET READINGS FOR CHARTS (optimized untuk Recharts)
 * Endpoint: GET /api/dashboard/readings/:ipal_id
 */
exports.getReadingsForChart = async (req, res) => {
  try {
    const { ipal_id } = req.params;
    const { period = "today", start, end, limit = 100 } = req.query;

    const result = await dashboardService.getReadingsForChart(ipal_id, {
      period,
      start,
      end,
      limit,
    });

    if (result.count === 0) {
      return res.status(200).json({
        success: true,
        message: "No readings found for the specified period",
        data: [],
        period: result.period,
        date_range: result.date_range,
      });
    }

    return res.status(200).json({
      success: true,
      count: result.count,
      period: result.period,
      date_range: result.date_range,
      summary: result.summary,
      data: result.readings,
    });
  } catch (error) {
    console.error("💥 Error fetching readings for chart:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to fetch readings for chart",
      error: error.message,
    });
  }
};

// Debug
console.log("📦 dashboardController exports:", Object.keys(module.exports));
