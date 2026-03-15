/**
 * ========================================
 * WATER QUALITY CONTROLLER
 * ========================================
 * HTTP request handlers for water quality monitoring
 * Handles ESP32 data submission with buffer/merge system
 *
 * Active Routes:
 * - POST   /api/water-quality/submit          (ESP32 endpoint)
 * - GET    /api/water-quality/health          (health check)
 * - GET    /api/water-quality/buffer-status   (monitoring)
 * - GET    /api/water-quality/incomplete      (monitoring)
 * - DELETE /api/water-quality/cleanup-buffer  (maintenance)
 * - GET    /api/water-quality/readings/:id    (get by ID)
 *
 * Deprecated/Removed:
 * - /api/water-quality/readings → Use /api/sensors/readings
 * - /api/water-quality/stats → Use /api/dashboard/summary/:ipal_id
 */

// ⚡ Lazy load services to reduce cold start
let waterQualityService;
let waterQualityModel;
let invalidateCache;

const getWaterQualityService = () => {
  if (!waterQualityService) {
    waterQualityService = require("../services/waterQualityService");
  }
  return waterQualityService;
};

const getWaterQualityModel = () => {
  if (!waterQualityModel) {
    waterQualityModel = require("../models/waterQualityModel");
  }
  return waterQualityModel;
};

const getCacheInvalidator = () => {
  if (!invalidateCache) {
    ({ invalidateCache } = require("../middleware/cacheMiddleware"));
  }
  return invalidateCache;
};

/**
 * ========================================
 * ESP32 ENDPOINTS
 * ========================================
 */

/**
 * POST /api/water-quality/submit
 * Main endpoint for ESP32 to submit sensor readings
 * NO AUTH required (device endpoint)
 */
exports.submitReading = async (req, res) => {
  try {
    const { ipal_id, location, device_id, data, sensor_mapping } = req.body;

    console.log("📥 Received reading from ESP32");
    console.log(
      `   IPAL: ${ipal_id}, Location: ${location}, Device: ${device_id}`,
    );

    // Validate required fields
    if (
      ipal_id === undefined ||
      ipal_id === null ||
      !location ||
      !device_id ||
      !data
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        required: ["ipal_id", "location", "device_id", "data"],
      });
    }

    // Validate location
    if (!["inlet", "outlet"].includes(location)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid location. Must be "inlet" or "outlet"',
      });
    }

    // Validate data structure
    if (
      typeof data.ph === "undefined" ||
      typeof data.tds === "undefined" ||
      typeof data.temperature === "undefined"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid data structure",
        required_fields: ["ph", "tds", "temperature"],
      });
    }

    if (!Number.isInteger(ipal_id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ipal_id",
        errors: [
          {
            field: "ipal_id",
            code: "TYPE_MISMATCH",
            expected: "integer",
            received: typeof ipal_id,
          },
        ],
      });
    }

    if (typeof device_id !== "string" || device_id.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Invalid device_id",
        errors: [
          {
            field: "device_id",
            code: "TYPE_MISMATCH",
            expected: "non-empty string",
            received: typeof device_id,
          },
        ],
      });
    }

    const sensorFields = ["ph", "tds", "temperature"];
    const sensorErrors = sensorFields
      .map((field) => {
        const value = data[field];
        const isFiniteNumber =
          typeof value === "number" && Number.isFinite(value);

        if (!isFiniteNumber) {
          return {
            field: `data.${field}`,
            code: "TYPE_MISMATCH",
            expected: "finite number",
            received:
              value === null
                ? "null"
                : Array.isArray(value)
                  ? "array"
                  : typeof value,
          };
        }

        return null;
      })
      .filter(Boolean);

    if (sensorErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid sensor payload",
        errors: sensorErrors,
      });
    }

    // Call service to process reading
    const result = await getWaterQualityService().submitReading({
      ipal_id,
      location,
      device_id,
      data,
      sensor_mapping: sensor_mapping || {},
    });

    console.log(`✅ Reading processed: merged=${result.merged}`);

    // ♻️ Invalidate related caches when data is merged
    if (result.merged) {
      getCacheInvalidator()([
        "/api/dashboard",
        "/api/sensors/readings",
        "/api/alerts",
      ]);
      console.log("♻️  Cache invalidated for new reading");
    }

    // Return appropriate response
    if (result.merged) {
      // Data was merged and processed
      return res.status(200).json({
        success: true,
        merged: true,
        message: "Data merged and processed successfully",
        data: {
          buffer_id: result.buffer_id,
          reading_id: result.reading_id,
          fuzzy_analysis: {
            quality_score: result.fuzzy_analysis.quality_score,
            status: result.fuzzy_analysis.status,
            alert_count: result.fuzzy_analysis.alert_count,
          },
        },
      });
    } else {
      // Data buffered, waiting for pair
      return res.status(200).json({
        success: true,
        merged: false,
        message: result.message,
        data: {
          buffer_id: result.buffer_id,
          waiting_for: result.waiting_for,
        },
      });
    }
  } catch (error) {
    console.error("❌ Error in submitReading:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * ========================================
 * MONITORING & DEBUGGING ENDPOINTS
 * ========================================
 */

/**
 * GET /api/water-quality/buffer-status
 * Get current buffer status (for monitoring/debugging)
 * AUTH required
 */
exports.getBufferStatus = async (req, res) => {
  try {
    const { ipal_id } = req.query;

    console.log("📊 Getting buffer status...");

    const status = await getWaterQualityService().getBufferStatus(
      ipal_id ? parseInt(ipal_id) : null,
    );

    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("❌ Error getting buffer status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get buffer status",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/water-quality/cleanup-buffer
 * Manual cleanup of expired buffer documents
 * AUTH required (admin only)
 */
exports.cleanupBuffer = async (req, res) => {
  try {
    console.log("🧹 Starting manual buffer cleanup...");

    const result = await getWaterQualityService().cleanupExpiredBuffer();

    return res.status(200).json({
      success: true,
      message: `Cleaned up ${result.deleted} expired buffer document(s)`,
      data: result,
    });
  } catch (error) {
    console.error("❌ Error cleaning buffer:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to cleanup buffer",
      error: error.message,
    });
  }
};

/**
 * GET /api/water-quality/incomplete
 * Check for incomplete readings (monitoring)
 * AUTH required
 */
exports.checkIncompleteReadings = async (req, res) => {
  try {
    const { ipal_id } = req.query;

    console.log("🔍 Checking for incomplete readings...");

    const result = await getWaterQualityService().checkIncompleteReadings(
      ipal_id ? parseInt(ipal_id) : 1,
    );

    if (result.hasIncomplete) {
      return res.status(200).json({
        success: true,
        warning: true,
        message: `Found ${result.count} incomplete reading(s)`,
        data: result,
      });
    } else {
      return res.status(200).json({
        success: true,
        message: "No incomplete readings found",
        data: result,
      });
    }
  } catch (error) {
    console.error("❌ Error checking incomplete readings:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check incomplete readings",
      error: error.message,
    });
  }
};

/**
 * ========================================
 * DATA RETRIEVAL ENDPOINTS
 * ========================================
 * Note: getReadings, getLatestReading, getStats removed (unused)
 * Use /api/sensors/readings and /api/dashboard endpoints instead
 */

/**
 * GET /api/water-quality/readings/:id
 * Get specific reading by ID
 * AUTH required
 */
exports.getReadingById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📖 Getting reading: ${id}`);

    const reading = await getWaterQualityModel().getReadingById(id);

    if (!reading) {
      return res.status(404).json({
        success: false,
        message: "Reading not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: reading,
    });
  } catch (error) {
    console.error("❌ Error getting reading:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get reading",
      error: error.message,
    });
  }
};

/**
 * ========================================
 * HEALTH CHECK
 * ========================================
 */

/**
 * GET /api/water-quality/health
 * Health check endpoint
 * NO AUTH required
 */
exports.healthCheck = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Water Quality Service is running",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Service unhealthy",
      error: error.message,
    });
  }
};

// ⚠️ PENTING: Log saat controller loaded
console.log("📦 waterQualityController loaded");
