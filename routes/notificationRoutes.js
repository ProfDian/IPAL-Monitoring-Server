/**
 * ========================================
 * NOTIFICATION ROUTES
 * ========================================
 * Routes untuk notification endpoints
 */

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const notificationController = require("../controllers/notificationController");

// ========================================
// PROTECTED ROUTES (require authentication)
// ========================================

/**
 * POST /api/notifications/register-device
 * Register user's device FCM token
 * Body: { fcm_token: "..." }
 */
router.post(
  "/register-device",
  requireAuth,
  notificationController.registerDevice,
);

module.exports = router;

console.log("📦 notificationRoutes loaded");
