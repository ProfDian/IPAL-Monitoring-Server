/**
 * ========================================
 * AUTH CONTROLLER (REFACTORED)
 * ========================================
 * Thin controller layer - delegates business logic to authService
 */

const authService = require("../services/authService");

/**
 * LOGIN
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("🚀 TA-Server: Processing login request");
    console.log("📥 Login attempt for:", email);

    // Validasi input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const { token, user } = await authService.authenticateUser(email, password);

    // Set token di cookie (optional)
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 1 * 60 * 60 * 1000, // 1 hour
    });

    // Response
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token: token,
      user: user,
    });
  } catch (error) {
    if (error.status) {
      const response = { success: false, message: error.message };
      if (error.details) response.details = error.details;
      return res.status(error.status).json(response);
    }
    console.error("💥 Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
};

/**
 * GET PROFILE
 * Endpoint: GET /auth/profile
 * Protected route - requires authentication
 */
exports.getProfile = async (req, res) => {
  try {
    const user = req.user; // From authMiddleware

    console.log("👤 Getting profile for:", user.email);

    const profileData = await authService.getUserProfile(user.uid);

    console.log("✅ Profile retrieved for:", user.email);

    return res.status(200).json({
      success: true,
      user: profileData,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    console.error("💥 Error getting profile:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get profile",
      error: error.message,
    });
  }
};

/**
 * CHECK EMAIL EXISTS
 * Endpoint: POST /auth/check-email
 * Check if email exists in the system (for forgot password validation)
 */
exports.checkEmail = async (req, res) => {
  try {
    const { email } = req.body;

    console.log("📧 Checking if email exists:", email);

    // Validasi input
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address format",
        exists: false,
      });
    }

    const exists = await authService.checkEmailExists(email);

    return res.status(200).json({
      success: true,
      exists: exists,
      message: exists
        ? "Email exists in the system"
        : "No account found with this email address",
    });
  } catch (error) {
    console.error("💥 Error checking email:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check email",
      error: error.message,
      exists: false,
    });
  }
};

console.log("📦 authController (refactored) loaded");
