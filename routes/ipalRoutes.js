/**
 * ========================================
 * IPAL ROUTES
 * ========================================
 * Full CRUD operations for IPAL facilities
 * - GET: All authenticated users
 * - POST/PUT: superadmin + admin
 * - DELETE: superadmin only
 */

const express = require("express");
const router = express.Router();
const ipalController = require("../controllers/ipalController");
const {
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
} = require("../middleware/authMiddleware");
const { cacheMiddleware } = require("../middleware/cacheMiddleware");

// ========================================
// READ OPERATIONS (All authenticated users)
// ========================================

/**
 * GET /api/ipals
 * Get all IPAL facilities
 * Cache: 10 minutes
 */
router.get("/", requireAuth, cacheMiddleware(600), ipalController.getAllIpals);

/**
 * GET /api/ipals/:ipal_id
 * Get IPAL by ID (includes sensor count & latest reading)
 * Cache: 5 minutes
 */
router.get(
  "/:ipal_id",
  requireAuth,
  cacheMiddleware(300),
  ipalController.getIpalById,
);

// ========================================
// WRITE OPERATIONS (Admin+)
// ========================================

/**
 * POST /api/ipals
 * Create new IPAL (SuperAdmin & Admin)
 * Body: { ipal_location, ipal_description, address?, capacity?, ... }
 */
router.post("/", requireAuth, requireAdmin, ipalController.createIpal);

/**
 * PUT /api/ipals/:ipal_id
 * Update IPAL info (SuperAdmin & Admin)
 * Body: { ipal_location?, ipal_description?, address?, status?, ... }
 */
router.put("/:ipal_id", requireAuth, requireAdmin, ipalController.updateIpal);

/**
 * DELETE /api/ipals/:ipal_id
 * Delete IPAL (SuperAdmin ONLY)
 * WARNING: Deactivates all associated sensors
 */
router.delete(
  "/:ipal_id",
  requireAuth,
  requireSuperAdmin,
  ipalController.deleteIpal,
);

module.exports = router;

console.log("📦 ipalRoutes (full CRUD) loaded");
