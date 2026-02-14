/**
 * ========================================
 * WATER QUALITY ROUTES
 * ========================================
 * Express routes for water quality monitoring system
 * Handles ESP32 data submission with buffer/merge system
 *
 * Route Groups:
 * 1. ESP32 Endpoints (NO AUTH)
 * 2. Data Retrieval (WITH AUTH)
 * 3. Monitoring (WITH AUTH)
 * 4. Maintenance (ADMIN ONLY)
 */

const express = require("express");
const router = express.Router();
const waterQualityController = require("../controllers/waterQualityController");
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");

/**
 * ========================================
 * ESP32 ENDPOINTS (NO AUTH)
 * ========================================
 * These endpoints are called by ESP32 devices
 * NO authentication required for device communication
 */

/**
 * POST /api/water-quality/submit
 * Main endpoint for ESP32 to submit sensor readings
 *
 * Body:
 * {
 *   "ipal_id": 1,
 *   "location": "inlet",  // or "outlet"
 *   "device_id": "ESP32-INLET-001",
 *   "data": {
 *     "ph": 7.2,
 *     "tds": 150,
 *     "temperature": 28.5
 *   },
 *   "sensor_mapping": {
 *     "inlet_ph": "sensor-ph-inlet-001",
 *     "inlet_tds": "sensor-tds-inlet-002",
 *     "inlet_temperature": "sensor-temp-inlet-004"
 *   }
 * }
 *
 * Response (merged):
 * {
 *   "success": true,
 *   "merged": true,
 *   "message": "Data merged and processed successfully",
 *   "data": {
 *     "reading_id": "...",
 *     "fuzzy_analysis": {...}
 *   }
 * }
 *
 * Response (waiting):
 * {
 *   "success": true,
 *   "merged": false,
 *   "message": "Data buffered, waiting for outlet pair",
 *   "data": {
 *     "buffer_id": "...",
 *     "waiting_for": "outlet"
 *   }
 * }
 */
router.post("/submit", waterQualityController.submitReading);

/**
 * GET /api/water-quality/health
 * Health check endpoint
 * Used to verify service is running
 */
router.get("/health", waterQualityController.healthCheck);

/**
 * ========================================
 * DATA RETRIEVAL ENDPOINTS (WITH AUTH)
 * ========================================
 * ⚠️ DEPRECATED ENDPOINTS REMOVED (2025-01-25)
 *
 * The following endpoints were redundant and have been removed:
 * ❌ GET /readings - Use /api/sensors/readings instead
 * ❌ GET /readings/latest/:ipal_id - Use /api/dashboard/summary/:ipal_id instead
 * ❌ GET /stats - Use /api/dashboard/summary/:ipal_id instead
 *
 * Reason: Reduces API complexity and improves maintainability.
 * Migration: Update frontend to use consolidated dashboard/sensor endpoints.
 */

/**
 * GET /api/water-quality/readings/:id
 * Get specific reading by ID (merged inlet+outlet data)
 *
 * ⚠️ Note: This is the ONLY reading endpoint in water-quality routes
 * It's kept because it returns MERGED data specific to water quality system
 *
 * Example: GET /api/water-quality/readings/reading_abc123
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "reading_abc123",
 *     "inlet": {...},
 *     "outlet": {...},
 *     "fuzzy_analysis": {...}
 *   }
 * }
 */
router.get("/readings/:id", requireAuth, waterQualityController.getReadingById);

/**
 * ========================================
 * MONITORING ENDPOINTS (WITH AUTH)
 * ========================================
 * For system monitoring and debugging
 */

/**
 * GET /api/water-quality/buffer-status
 * Get current buffer status
 * Used for monitoring/debugging buffer system
 *
 * Query params:
 *   - ipal_id: number (optional, filter by IPAL)
 *
 * Example: GET /api/water-quality/buffer-status?ipal_id=1
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "total": 2,
 *     "unmerged": 0,
 *     "merged": 2,
 *     "inlet": 1,
 *     "outlet": 1,
 *     "documents": [...]
 *   }
 * }
 */
router.get(
  "/buffer-status",
  requireAuth,
  waterQualityController.getBufferStatus,
);

/**
 * GET /api/water-quality/incomplete
 * Check for incomplete readings
 * Detects if ESP32 devices are not sending data properly
 *
 * Query params:
 *   - ipal_id: number (optional, filter by IPAL)
 *
 * Example: GET /api/water-quality/incomplete?ipal_id=1
 *
 * Response:
 * {
 *   "success": true,
 *   "warning": true,
 *   "message": "Found 2 incomplete reading(s)",
 *   "data": {
 *     "hasIncomplete": true,
 *     "count": 2,
 *     "readings": [...]
 *   }
 * }
 */
router.get(
  "/incomplete",
  requireAuth,
  waterQualityController.checkIncompleteReadings,
);

/**
 * ========================================
 * MAINTENANCE ENDPOINTS (ADMIN ONLY)
 * ========================================
 * Restricted to admin users only
 */

/**
 * DELETE /api/water-quality/cleanup-buffer
 * Manual cleanup of expired buffer documents
 * Removes old buffer data (>24 hours or already merged)
 *
 * Example: DELETE /api/water-quality/cleanup-buffer
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Cleaned up 5 expired buffer document(s)",
 *   "data": {
 *     "deleted": 5
 *   }
 * }
 */
router.delete(
  "/cleanup-buffer",
  requireAuth,
  requireAdmin,
  waterQualityController.cleanupBuffer,
);

/**
 * ========================================
 * EXPORT
 * ========================================
 */

module.exports = router;

// ⚠️ PENTING: Log saat routes loaded
console.log("📦 waterQualityRoutes loaded");
