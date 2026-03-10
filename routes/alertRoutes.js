/**
 * ========================================
 * ALERT ROUTES
 * ========================================
 * Routes untuk alert management
 */

const express = require("express");
const router = express.Router();
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");
const { cacheMiddleware } = require("../middleware/cacheMiddleware");
const alertController = require("../controllers/alertController");

// ========================================
// PUBLIC/PROTECTED ROUTES (WITH CACHING)
// ========================================

/**
 * GET /api/alerts
 * Get all alerts with filters
 * Cache: 30 seconds (alerts need to be relatively fresh)
 * Query params:
 *   - ipal_id: number
 *   - status: active|acknowledged|resolved
 *   - severity: low|medium|high|critical
 *   - parameter: ph|tds|temperature
 *   - location: inlet|outlet|efficiency|anomaly
 *   - limit: number (default: 50)
 *   - start_after: doc_id (for pagination)
 */
router.get("/", requireAuth, cacheMiddleware(30), alertController.getAlerts);

/**
 * GET /api/alerts/stats
 * Get alert statistics
 * Cache: 45 seconds (stats don't need to be super fresh)
 * Query params:
 *   - ipal_id: number (optional)
 */
router.get(
  "/stats",
  requireAuth,
  cacheMiddleware(45),
  alertController.getAlertStats,
);

/**
 * PUT /api/alerts/:id/status
 * Update alert status
 * Body: { status: "acknowledged" | "resolved" }
 */
router.put("/:id/status", requireAuth, alertController.updateAlertStatus);

/**
 * DELETE /api/alerts/:id
 * Delete alert (Admin only)
 */
router.delete("/:id", requireAuth, requireAdmin, alertController.deleteAlert);

module.exports = router;

console.log("📦 alertRoutes loaded");
