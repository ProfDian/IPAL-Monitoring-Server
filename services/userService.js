/**
 * ========================================
 * USER SERVICE
 * ========================================
 * Business logic for user management operations
 * Extracted from userController for clean architecture
 */

const { admin, db } = require("../config/firebase-config");

/**
 * Find user document by UID or email (fallback lookup)
 * @param {string} uid
 * @param {string} email
 * @returns {Promise<{ref, snap}|null>}
 */
async function findUserDoc(uid, email) {
  let ref = db.collection("users").doc(uid);
  let snap = await ref.get();
  if (snap.exists) return { ref, snap };

  console.log(`⚠️  Doc not found by UID ${uid}, trying email lookup...`);
  ref = db.collection("users").doc(email);
  snap = await ref.get();
  if (snap.exists) {
    console.log(`✅ Found user doc by email doc ID: ${email}`);
    return { ref, snap };
  }

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
 * Create new user (SuperAdmin only)
 * @param {object} data - { email, password, role, username }
 * @param {object} requestingUser - The user making the request
 * @returns {Promise<object>} Created user data
 * @throws {Error} with status codes for various error conditions
 */
async function createUser(data, requestingUser) {
  const { email, password, role = "admin", username } = data;

  if (requestingUser.role !== "superadmin") {
    const error = new Error("Only Super Admin can create users");
    error.status = 403;
    throw error;
  }

  if (!email || !password) {
    const error = new Error("Email and password are required");
    error.status = 400;
    throw error;
  }

  const validRoles = ["admin"];
  if (!validRoles.includes(role)) {
    const error = new Error(
      "Invalid role. Can only create 'admin' users. SuperAdmin can only be added via Firebase Console.",
    );
    error.status = 400;
    throw error;
  }

  console.log(`👤 Creating new user: ${email} with role: ${role}`);

  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email,
      password,
      emailVerified: true,
    });
    console.log(`✅ Firebase Auth user created: ${userRecord.uid}`);
  } catch (authError) {
    if (authError.code === "auth/email-already-exists") {
      const error = new Error("Email already exists");
      error.status = 400;
      throw error;
    }
    if (authError.code === "auth/invalid-email") {
      const error = new Error("Invalid email format");
      error.status = 400;
      throw error;
    }
    if (authError.code === "auth/weak-password") {
      const error = new Error("Password should be at least 6 characters");
      error.status = 400;
      throw error;
    }
    throw authError;
  }

  const userData = {
    email,
    username: username || email.split("@")[0],
    role,
    created_at: new Date().toISOString(),
    created_by: requestingUser.uid,
    updated_at: new Date().toISOString(),
  };

  await db.collection("users").doc(userRecord.uid).set(userData);

  console.log(`✅ Firestore user document created for: ${email}`);

  return {
    uid: userRecord.uid,
    email: userData.email,
    username: userData.username,
    role: userData.role,
    created_at: userData.created_at,
  };
}

/**
 * Get all users (SuperAdmin + Admin)
 * @param {object} requestingUser - The user making the request
 * @returns {Promise<Array>} List of users
 * @throws {Error} with status 403 if unauthorized
 */
async function getAllUsers(requestingUser) {
  if (!["superadmin", "admin"].includes(requestingUser.role)) {
    const error = new Error("You don't have permission to view users");
    error.status = 403;
    throw error;
  }

  console.log(`📋 Fetching all users (requested by: ${requestingUser.email})`);

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
      fcm_token: userData.fcm_token ? "✓" : null,
    });
  });

  const roleOrder = { superadmin: 1, admin: 2 };
  users.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

  console.log(`✅ Found ${users.length} users`);
  return users;
}

/**
 * Get user by UID
 * @param {string} uid
 * @param {object} requestingUser - The user making the request
 * @returns {Promise<object>} User data
 * @throws {Error} with status 403/404
 */
async function getUserById(uid, requestingUser) {
  if (!["superadmin", "admin"].includes(requestingUser.role)) {
    if (requestingUser.uid !== uid) {
      const error = new Error("You can only view your own profile");
      error.status = 403;
      throw error;
    }
  }

  console.log(`👤 Fetching user: ${uid}`);

  const userDoc = await db.collection("users").doc(uid).get();

  if (!userDoc.exists) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  const userData = userDoc.data();

  console.log(`✅ User found: ${userData.email}`);

  return {
    uid: userDoc.id,
    email: userData.email,
    username: userData.username,
    role: userData.role,
    created_at: userData.created_at,
    updated_at: userData.updated_at,
  };
}

/**
 * Update user (SuperAdmin only)
 * @param {string} uid
 * @param {object} data - { username, role }
 * @param {object} requestingUser
 * @returns {Promise<object>} Updated user data
 * @throws {Error} with status 400/403/404
 */
async function updateUser(uid, data, requestingUser) {
  const { username, role } = data;

  if (requestingUser.role !== "superadmin") {
    const error = new Error("Only Super Admin can update users");
    error.status = 403;
    throw error;
  }

  if (role) {
    const validRoles = ["admin"];
    if (!validRoles.includes(role)) {
      const error = new Error(
        "Invalid role. Can only assign 'admin' role. SuperAdmin can only be assigned via Firebase Console.",
      );
      error.status = 400;
      throw error;
    }
  }

  console.log(`✏️  Updating user: ${uid}`);

  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  const updateData = {
    updated_at: new Date().toISOString(),
  };

  if (username) updateData.username = username;
  if (role) updateData.role = role;

  await db.collection("users").doc(uid).update(updateData);

  console.log(`✅ User updated: ${uid}`);

  const updatedDoc = await db.collection("users").doc(uid).get();
  const updatedData = updatedDoc.data();

  return {
    uid: updatedDoc.id,
    email: updatedData.email,
    username: updatedData.username,
    role: updatedData.role,
    updated_at: updatedData.updated_at,
  };
}

/**
 * Get own profile (any authenticated user)
 * @param {string} uid
 * @param {string} email
 * @returns {Promise<object>} Profile data
 * @throws {Error} with status 404 if not found
 */
async function getProfile(uid, email) {
  const result = await findUserDoc(uid, email);

  if (!result) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  const data = result.snap.data();
  return {
    uid: result.snap.id,
    email: data.email,
    username: data.username,
    role: data.role,
    created_at: data.created_at || null,
    updated_at: data.updated_at || null,
  };
}

/**
 * Update own profile (any authenticated user)
 * @param {string} uid
 * @param {string} email
 * @param {string} username
 * @returns {Promise<object>} Updated profile data
 * @throws {Error} with status 400/404
 */
async function updateProfile(uid, email, username) {
  if (!username || !username.trim()) {
    const error = new Error("Username is required");
    error.status = 400;
    throw error;
  }

  console.log(`✏️  User updating own profile: ${uid} (${email})`);

  const result = await findUserDoc(uid, email);
  if (!result) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
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

  return {
    uid: updatedDoc.id,
    email: updatedData.email,
    username: updatedData.username,
    role: updatedData.role,
    created_at: updatedData.created_at,
    updated_at: updatedData.updated_at,
  };
}

/**
 * Delete user (SuperAdmin only)
 * @param {string} uid
 * @param {object} requestingUser
 * @returns {Promise<{email: string}>}
 * @throws {Error} with status 400/403/404
 */
async function deleteUser(uid, requestingUser) {
  if (requestingUser.role !== "superadmin") {
    const error = new Error("Only Super Admin can delete users");
    error.status = 403;
    throw error;
  }

  if (uid === requestingUser.uid) {
    const error = new Error("You cannot delete your own account");
    error.status = 400;
    throw error;
  }

  console.log(`🗑️  Deleting user: ${uid}`);

  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  const userData = userDoc.data();

  try {
    await admin.auth().deleteUser(uid);
    console.log(`✅ User deleted from Firebase Auth: ${uid}`);
  } catch (authError) {
    if (authError.code === "auth/user-not-found") {
      const error = new Error("User not found in Firebase Authentication");
      error.status = 404;
      throw error;
    }
    throw authError;
  }

  await db.collection("users").doc(uid).delete();
  console.log(`✅ User deleted from Firestore: ${uid}`);

  return { email: userData.email };
}

/**
 * Reset user password (SuperAdmin only)
 * @param {string} uid
 * @param {string} newPassword
 * @param {object} requestingUser
 * @throws {Error} with status 400/403/404
 */
async function resetPassword(uid, newPassword, requestingUser) {
  if (requestingUser.role !== "superadmin") {
    const error = new Error("Only Super Admin can reset passwords");
    error.status = 403;
    throw error;
  }

  if (!newPassword || newPassword.length < 6) {
    const error = new Error("Password must be at least 6 characters");
    error.status = 400;
    throw error;
  }

  console.log(`🔐 Resetting password for user: ${uid}`);

  try {
    await admin.auth().updateUser(uid, {
      password: newPassword,
    });
  } catch (authError) {
    if (authError.code === "auth/user-not-found") {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }
    throw authError;
  }

  await db.collection("users").doc(uid).update({
    password_reset_at: new Date().toISOString(),
    password_reset_by: requestingUser.uid,
  });

  console.log(`✅ Password reset successful for: ${uid}`);
}

module.exports = {
  findUserDoc,
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  getProfile,
  updateProfile,
  deleteUser,
  resetPassword,
};

console.log("📦 userService loaded");
