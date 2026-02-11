/**
 * ========================================
 * USER MANAGEMENT ROUTES
 * ========================================
 * Protected routes for user CRUD operations
 * - GET: superadmin + admin
 * - POST/PUT/DELETE: superadmin only
 */

const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { verifyToken } = require("../middleware/authMiddleware");

// All routes require authentication
router.use(verifyToken);

/**
 * @route   POST /api/users
 * @desc    Create new admin user (SuperAdmin only)
 * @access  SuperAdmin
 * @body    { email, password, role, username }
 */
router.post("/", userController.createUser);

/**
 * @route   GET /api/users
 * @desc    Get all users
 * @access  SuperAdmin, Admin
 */
router.get("/", userController.getAllUsers);

/**
 * @route   GET /api/users/profile
 * @desc    Get own profile (full data including created_at, updated_at)
 * @access  Any authenticated user
 */
router.get("/profile", userController.getProfile);

/**
 * @route   PUT /api/users/profile
 * @desc    Update own profile (username)
 * @access  Any authenticated user
 * @body    { username }
 */
router.put("/profile", userController.updateProfile);

/**
 * @route   GET /api/users/:uid
 * @desc    Get user by ID
 * @access  SuperAdmin, Admin, Own profile
 */
router.get("/:uid", userController.getUserById);

/**
 * @route   PUT /api/users/:uid
 * @desc    Update user (role, username)
 * @access  SuperAdmin
 * @body    { username?, role? }
 */
router.put("/:uid", userController.updateUser);

/**
 * @route   DELETE /api/users/:uid
 * @desc    Delete user
 * @access  SuperAdmin
 */
router.delete("/:uid", userController.deleteUser);

/**
 * @route   POST /api/users/:uid/reset-password
 * @desc    Reset user password
 * @access  SuperAdmin
 * @body    { newPassword }
 */
router.post("/:uid/reset-password", userController.resetPassword);

console.log("📦 userRoutes loaded");
module.exports = router;
