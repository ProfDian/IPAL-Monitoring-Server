/**
 * ========================================
 * USER MANAGEMENT CONTROLLER
 * ========================================
 * Handle CRUD operations for users (SuperAdmin only)
 * - Create user with role (Firebase Auth + Firestore)
 * - Get all users
 * - Update user (role, username)
 * - Delete user
 */

const { admin, db } = require("../config/firebase-config");

/**
 * CREATE NEW USER
 * POST /api/users
 * Body: { email, password, role, username }
 * SuperAdmin creates new admin user
 * Note: SuperAdmin can only be created via Firebase Console (security measure)
 */
exports.createUser = async (req, res) => {
  try {
    const { email, password, role = "admin", username } = req.body;

    // Only superadmin can create users
    if (req.user.role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can create users",
      });
    }

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Only allow creating admin role (superadmin cannot be created via API)
    const validRoles = ["admin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid role. Can only create 'admin' users. SuperAdmin can only be added via Firebase Console.",
      });
    }

    console.log(`👤 Creating new user: ${email} with role: ${role}`);

    // 1. Create user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
      emailVerified: true, // Auto-verify for admin-created accounts
    });

    console.log(`✅ Firebase Auth user created: ${userRecord.uid}`);

    // 2. Create user document in Firestore
    const userData = {
      email,
      username: username || email.split("@")[0],
      role,
      created_at: new Date().toISOString(),
      created_by: req.user.uid, // Track who created this user
      updated_at: new Date().toISOString(),
    };

    await db.collection("users").doc(userRecord.uid).set(userData);

    console.log(`✅ Firestore user document created for: ${email}`);

    // 3. Return response
    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        uid: userRecord.uid,
        email: userData.email,
        username: userData.username,
        role: userData.role,
        created_at: userData.created_at,
      },
    });
  } catch (error) {
    console.error("💥 Error creating user:", error);

    // Handle specific Firebase errors
    if (error.code === "auth/email-already-exists") {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    if (error.code === "auth/invalid-email") {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    if (error.code === "auth/weak-password") {
      return res.status(400).json({
        success: false,
        message: "Password should be at least 6 characters",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: error.message,
    });
  }
};

/**
 * GET ALL USERS
 * GET /api/users
 * SuperAdmin/Admin can view all users
 */
exports.getAllUsers = async (req, res) => {
  try {
    // Check permission
    if (!["superadmin", "admin"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view users",
      });
    }

    console.log(`📋 Fetching all users (requested by: ${req.user.email})`);

    // Get all users from Firestore
    const usersSnapshot = await db.collection("users").get();

    const users = [];
    usersSnapshot.forEach((doc) => {
      const userData = doc.data();
      users.push({
        uid: doc.id,
        email: userData.email,
        username: userData.username,
        role: userData.role,
        created_at: userData.created_at,
        fcm_token: userData.fcm_token ? "✓" : null, // Don't expose actual token
      });
    });

    // Sort by role: superadmin > admin
    const roleOrder = { superadmin: 1, admin: 2 };
    users.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

    console.log(`✅ Found ${users.length} users`);

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("💥 Error fetching users:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
};

/**
 * GET USER BY ID
 * GET /api/users/:uid
 * SuperAdmin/Admin can view user details
 */
exports.getUserById = async (req, res) => {
  try {
    const { uid } = req.params;

    // Check permission
    if (!["superadmin", "admin"].includes(req.user.role)) {
      // Other users can only view their own profile
      if (req.user.uid !== uid) {
        return res.status(403).json({
          success: false,
          message: "You can only view your own profile",
        });
      }
    }

    console.log(`👤 Fetching user: ${uid}`);

    // Get user from Firestore
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userData = userDoc.data();

    console.log(`✅ User found: ${userData.email}`);

    return res.status(200).json({
      success: true,
      user: {
        uid: userDoc.id,
        email: userData.email,
        username: userData.username,
        role: userData.role,
        created_at: userData.created_at,
        updated_at: userData.updated_at,
      },
    });
  } catch (error) {
    console.error("💥 Error fetching user:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user",
      error: error.message,
    });
  }
};

/**
 * UPDATE USER
 * PUT /api/users/:uid
 * SuperAdmin can update role, username
 */
exports.updateUser = async (req, res) => {
  try {
    const { uid } = req.params;
    const { username, role } = req.body;

    // Only superadmin can update users
    if (req.user.role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can update users",
      });
    }

    // Validate role if provided (cannot assign superadmin via API)
    if (role) {
      const validRoles = ["admin"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid role. Can only assign 'admin' role. SuperAdmin can only be assigned via Firebase Console.",
        });
      }
    }

    console.log(`✏️  Updating user: ${uid}`);

    // Check if user exists
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prepare update data
    const updateData = {
      updated_at: new Date().toISOString(),
    };

    if (username) updateData.username = username;
    if (role) updateData.role = role;

    // Update in Firestore
    await db.collection("users").doc(uid).update(updateData);

    console.log(`✅ User updated: ${uid}`);

    // Get updated user data
    const updatedDoc = await db.collection("users").doc(uid).get();
    const updatedData = updatedDoc.data();

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: {
        uid: updatedDoc.id,
        email: updatedData.email,
        username: updatedData.username,
        role: updatedData.role,
        updated_at: updatedData.updated_at,
      },
    });
  } catch (error) {
    console.error("💥 Error updating user:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: error.message,
    });
  }
};

/**
 * Helper: find user doc by UID, email doc ID, or email field query
 */
async function findUserDoc(uid, email) {
  // 1. Try by UID
  let ref = db.collection("users").doc(uid);
  let snap = await ref.get();
  if (snap.exists) return { ref, snap };

  // 2. Try by email as doc ID
  console.log(`⚠️  Doc not found by UID ${uid}, trying email lookup...`);
  ref = db.collection("users").doc(email);
  snap = await ref.get();
  if (snap.exists) {
    console.log(`✅ Found user doc by email doc ID: ${email}`);
    return { ref, snap };
  }

  // 3. Query by email field
  const q = await db
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();
  if (!q.empty) {
    const doc = q.docs[0];
    console.log(`✅ Found user doc by email query: ${doc.id}`);
    return { ref: doc.ref, snap: doc };
  }

  return null;
}

/**
 * GET OWN PROFILE
 * GET /api/users/profile
 * Any authenticated user can view their full profile
 */
exports.getProfile = async (req, res) => {
  try {
    const result = await findUserDoc(req.user.uid, req.user.email);

    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const data = result.snap.data();
    return res.status(200).json({
      success: true,
      user: {
        uid: result.snap.id,
        email: data.email,
        username: data.username,
        role: data.role,
        created_at: data.created_at || null,
        updated_at: data.updated_at || null,
      },
    });
  } catch (error) {
    console.error("💥 Error getting profile:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to get profile",
        error: error.message,
      });
  }
};

/**
 * UPDATE OWN PROFILE
 * PUT /api/users/profile
 * Any authenticated user can update their own username
 */
exports.updateProfile = async (req, res) => {
  try {
    const uid = req.user.uid;
    const email = req.user.email;
    const { username } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({
        success: false,
        message: "Username is required",
      });
    }

    console.log(`✏️  User updating own profile: ${uid} (${email})`);

    const result = await findUserDoc(uid, email);
    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const userDocRef = result.ref;

    const updateData = {
      username: username.trim(),
      updated_at: new Date().toISOString(),
    };

    await userDocRef.update(updateData);

    const updatedDoc = await userDocRef.get();
    const updatedData = updatedDoc.data();

    console.log(`✅ Profile updated: ${updatedDoc.id}`);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        uid: updatedDoc.id,
        email: updatedData.email,
        username: updatedData.username,
        role: updatedData.role,
        created_at: updatedData.created_at,
        updated_at: updatedData.updated_at,
      },
    });
  } catch (error) {
    console.error("💥 Error updating profile:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

/**
 * DELETE USER
 * DELETE /api/users/:uid
 * Admin can delete users
 */
exports.deleteUser = async (req, res) => {
  try {
    const { uid } = req.params;

    // Only superadmin can delete users
    if (req.user.role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can delete users",
      });
    }

    // Prevent admin from deleting themselves
    if (uid === req.user.uid) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    console.log(`🗑️  Deleting user: ${uid}`);

    // Check if user exists
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userData = userDoc.data();

    // 1. Delete from Firebase Authentication
    await admin.auth().deleteUser(uid);
    console.log(`✅ User deleted from Firebase Auth: ${uid}`);

    // 2. Delete from Firestore
    await db.collection("users").doc(uid).delete();
    console.log(`✅ User deleted from Firestore: ${uid}`);

    return res.status(200).json({
      success: true,
      message: `User ${userData.email} deleted successfully`,
    });
  } catch (error) {
    console.error("💥 Error deleting user:", error);

    if (error.code === "auth/user-not-found") {
      return res.status(404).json({
        success: false,
        message: "User not found in Firebase Authentication",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: error.message,
    });
  }
};

/**
 * RESET USER PASSWORD
 * POST /api/users/:uid/reset-password
 * Admin can reset user password
 */
exports.resetPassword = async (req, res) => {
  try {
    const { uid } = req.params;
    const { newPassword } = req.body;

    // Only superadmin can reset passwords
    if (req.user.role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can reset passwords",
      });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    console.log(`🔐 Resetting password for user: ${uid}`);

    // Update password in Firebase Auth
    await admin.auth().updateUser(uid, {
      password: newPassword,
    });

    // Update timestamp in Firestore
    await db.collection("users").doc(uid).update({
      password_reset_at: new Date().toISOString(),
      password_reset_by: req.user.uid,
    });

    console.log(`✅ Password reset successful for: ${uid}`);

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("💥 Error resetting password:", error);

    if (error.code === "auth/user-not-found") {
      return res.status(404).json({
        success: false,
        message: "User not found",
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
