/**
 * ========================================
 * USER MANAGEMENT CONTROLLER (REFACTORED)
 * ========================================
 * Thin controller layer - delegates business logic to userService
 */

const userService = require("../services/userService");

exports.createUser = async (req, res) => {
  try {
    const user = await userService.createUser(req.body, req.user);

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user: user,
    });
  } catch (error) {
    console.error("💥 Error creating user:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: error.message,
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers(req.user);

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("💥 Error fetching users:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { uid } = req.params;
    const user = await userService.getUserById(uid, req.user);

    return res.status(200).json({
      success: true,
      user: user,
    });
  } catch (error) {
    console.error("💥 Error fetching user:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user",
      error: error.message,
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { uid } = req.params;
    const user = await userService.updateUser(uid, req.body, req.user);

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: user,
    });
  } catch (error) {
    console.error("💥 Error updating user:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: error.message,
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const profile = await userService.getProfile(req.user.uid, req.user.email);

    return res.status(200).json({
      success: true,
      user: profile,
    });
  } catch (error) {
    console.error("💥 Error getting profile:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to get profile",
      error: error.message,
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { username } = req.body;
    const profile = await userService.updateProfile(
      req.user.uid,
      req.user.email,
      username,
    );

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: profile,
    });
  } catch (error) {
    console.error("💥 Error updating profile:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { uid } = req.params;
    const result = await userService.deleteUser(uid, req.user);

    return res.status(200).json({
      success: true,
      message: `User ${result.email} deleted successfully`,
    });
  } catch (error) {
    console.error("💥 Error deleting user:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: error.message,
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { uid } = req.params;
    const { newPassword } = req.body;
    await userService.resetPassword(uid, newPassword, req.user);

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("💥 Error resetting password:", error);
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to reset password",
      error: error.message,
    });
  }
};

console.log("📦 userController loaded");
