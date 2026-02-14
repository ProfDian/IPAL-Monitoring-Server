/**
 * ========================================
 * SENSOR MANAGEMENT ROUTES (EXTENDED)
 * ========================================
 * Complete CRUD operations for sensors
 * - GET: All authenticated users
 * - POST/PUT: superadmin + admin
 * - DELETE: superadmin only
 */

const express = require("express");
const router = express.Router();
const sensorController = require("../controllers/sensorController");
const { cacheMiddleware } = require("../middleware/cacheMiddleware");
const {
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
} = require("../middleware/authMiddleware");

// ========================================
// SENSOR READINGS (Existing - dari ESP32)
// ========================================

/**
 * GET /api/sensors/readings
 * Get all readings with filters (AUTH required)
 * Cache: 45 seconds
 */
router.get(
  "/readings",
  requireAuth,
  cacheMiddleware(45),
  sensorController.getReadings,
);

/**
 * GET /api/sensors/readings/latest/:ipal_id
 * Get latest reading per IPAL (AUTH required)
 * Cache: 20 seconds (latest data needs to be fresh)
 */
router.get(
  "/readings/latest/:ipal_id",
  requireAuth,
  cacheMiddleware(20),
  sensorController.getLatestReading,
);

// ========================================
// SENSOR MANAGEMENT (NEW - CRUD Sensors)
// ========================================

/**
 * GET /api/sensors
 * Get all sensors with filters & pagination
 * Cache: 60 seconds (sensor list doesn't change often)
 *
 * Query params:
 *   - ipal_id: number (optional)
 *   - sensor_type: string (optional, e.g., 'ph', 'tds', 'temperature')
 *   - status: 'active' | 'inactive' | 'maintenance' (optional)
 *   - limit: number (default: 50)
 */
router.get(
  "/",
  requireAuth,
  cacheMiddleware(60),
  sensorController.getAllSensors,
);

/**
 * GET /api/sensors/:id
 * Get sensor by ID
 * Cache: 90 seconds (individual sensor details rarely change)
 */
router.get(
  "/:id",
  requireAuth,
  cacheMiddleware(90),
  sensorController.getSensorById,
);

/**
 * POST /api/sensors
 * Create new sensor (SuperAdmin & Admin)
 * Body: { ipal_id, sensor_type, sensor_location, sensor_description? }
 */
router.post("/", requireAuth, requireAdmin, sensorController.createSensor);

/**
 * PUT /api/sensors/:id
 * Update sensor (SuperAdmin & Admin)
 *
 * Body (all optional):
 * {
 *   "sensor_type": "ph",
 *   "sensor_location": "outlet",
 *   "sensor_description": "Updated description",
 *   "status": "maintenance"
 * }
 */
router.put("/:id", requireAuth, requireAdmin, sensorController.updateSensor);

/**
 * DELETE /api/sensors/:id
 * Delete sensor (SuperAdmin ONLY)
 */
router.delete(
  "/:id",
  requireAuth,
  requireSuperAdmin,
  sensorController.deleteSensor,
);

/**
 * GET /api/sensors/:id/status
 * Get sensor status (online/offline) based on last reading
 * Cache: 30 seconds
 */
router.get(
  "/:id/status",
  requireAuth,
  cacheMiddleware(30),
  sensorController.getSensorStatus,
);

/**
 * GET /api/sensors/ipal/:ipal_id
 * Get all sensors for specific IPAL
 * Cache: 60 seconds
 */
router.get(
  "/ipal/:ipal_id",
  requireAuth,
  cacheMiddleware(60),
  sensorController.getSensorsByIpal,
);

/**
 * GET /api/sensors/:id/latest
 * Get latest reading for specific sensor
 * Cache: 25 seconds
 */
router.get(
  "/:id/latest",
  requireAuth,
  cacheMiddleware(25),
  sensorController.getLatestReadingBySensor,
);

/**
 * GET /api/sensors/:id/history
 * Get historical data for specific sensor
 * Query params:
 *   - limit: number (default: 100)
 *   - start_date: YYYY-MM-DD (optional)
 *   - end_date: YYYY-MM-DD (optional)
 */
router.get("/:id/history", requireAuth, sensorController.getSensorHistory);

module.exports = router;

console.log("📦 sensorRoutes (full CRUD) loaded");
