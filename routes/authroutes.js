/**
 * ========================================
 * AUTH ROUTES (UPDATED)
 * ========================================
 * Menambahkan GET /auth/profile endpoint
 */

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { requireAuth } = require("../middleware/authMiddleware");

/**
 * POST /auth/login
 * Login with email & password
 *
 * Body:
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Login successful",
 *   "token": "jwt_token_here",
 *   "user": {
 *     "uid": "...",
 *     "email": "...",
 *     "username": "...",
 *     "role": "..."
 *   }
 * }
 */
router.post("/login", authController.login);

/**
 * POST /auth/logout
 * Logout user
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Logout successful"
 * }
 */
router.post("/logout", authController.logout);

/**
 * POST /auth/check-email
 * Check if email exists in the system
 * Used for forgot password validation
 *
 * Body:
 * {
 *   "email": "user@example.com"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "exists": true/false,
 *   "message": "..."
 * }
 */
router.post("/check-email", authController.checkEmail);

module.exports = router;

console.log("📦 authRoutes loaded");
