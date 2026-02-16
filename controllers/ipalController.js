/**
 * ========================================
 * IPAL CONTROLLER (REFACTORED)
 * ========================================
 * Thin controller layer - delegates business logic to ipalService
 */

const ipalService = require("../services/ipalService");

exports.getAllIpals = async (req, res) => {
  try {
    const { status, limit } = req.query;
    const ipals = await ipalService.getAllIpals({ status, limit });

    return res.status(200).json({
      success: true,
      count: ipals.length,
      data: ipals,
    });
  } catch (error) {
    console.error("💥 Error fetching IPALs:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Failed to fetch IPALs",
      error: error.message,
    });
  }
};

exports.getIpalById = async (req, res) => {
  try {
    const { ipal_id } = req.params;
    const result = await ipalService.getIpalById(ipal_id);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("💥 Error fetching IPAL:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to fetch IPAL",
      error: error.message,
    });
  }
};

exports.getIpalStats = async (req, res) => {
  try {
    const { ipal_id } = req.params;
    const stats = await ipalService.getIpalStats(ipal_id);

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("💥 Error fetching IPAL stats:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Failed to fetch IPAL statistics",
      error: error.message,
    });
  }
};

exports.createIpal = async (req, res) => {
  try {
    const result = await ipalService.createIpal(req.body, req.user);

    return res.status(201).json({
      success: true,
      message: "IPAL created successfully",
      data: result,
    });
  } catch (error) {
    console.error("💥 Error creating IPAL:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to create IPAL",
      error: error.message,
    });
  }
};

exports.updateIpal = async (req, res) => {
  try {
    const { ipal_id } = req.params;
    const result = await ipalService.updateIpal(ipal_id, req.body, req.user);

    return res.status(200).json({
      success: true,
      message: "IPAL updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("💥 Error updating IPAL:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to update IPAL",
      error: error.message,
    });
  }
};

exports.deleteIpal = async (req, res) => {
  try {
    const { ipal_id } = req.params;
    const result = await ipalService.deleteIpal(ipal_id, req.user);

    return res.status(200).json({
      success: true,
      message: `IPAL "${result.ipal_location}" deleted successfully`,
      data: result,
    });
  } catch (error) {
    console.error("💥 Error deleting IPAL:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to delete IPAL",
      error: error.message,
    });
  }
};

console.log("📦 ipalController (full CRUD) loaded");
