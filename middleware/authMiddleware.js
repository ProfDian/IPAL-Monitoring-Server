/**
 * ========================================
 * AUTH MIDDLEWARE (With Token Caching)
 * ========================================
 * Verify custom JWT token with in-memory cache
 * Reduces Firestore reads by ~95%!
 */

const jwt = require("jsonwebtoken");
const { db } = require("../config/firebase-config");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

// ========================================
// TOKEN CACHE (In-Memory)
// ========================================
const tokenCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour (adjust as needed)

/**
 * Get user from cache
 */
function getCachedUser(token) {
  const cached = tokenCache.get(token);

  if (!cached) {
    return null;
  }

  // Check if cache expired
  if (Date.now() - cached.timestamp > CACHE_DURATION) {
    tokenCache.delete(token);
    return null;
  }

  return cached.user;
}

/**
 * Save user to cache
 */
function cacheUser(token, user) {
  tokenCache.set(token, {
    user: user,
    timestamp: Date.now(),
  });
}

/**
 * Clear token from cache
 */
function clearCache(token) {
  tokenCache.delete(token);
}

/**
 * Auto-cleanup expired cache entries (runs every 10 minutes)
 */
setInterval(
  () => {
    const now = Date.now();
    let cleaned = 0;

    for (const [token, data] of tokenCache.entries()) {
      if (now - data.timestamp > CACHE_DURATION) {
        tokenCache.delete(token);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(
        `🧹 Cache cleanup: removed ${cleaned} expired token(s), ${tokenCache.size} remaining`,
      );
    }
  },
  10 * 60 * 1000,
); // 10 minutes

// ========================================
// AUTH MIDDLEWARE
// ========================================

/**
 * Require authentication - Verify custom JWT token
 */
exports.requireAuth = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided. Please login first.",
      });
    }

    // Extract token (format: "Bearer <token>")
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Invalid token format",
      });
    }

    // ⭐ CHECK CACHE FIRST
    const cachedUser = getCachedUser(token);
    if (cachedUser) {
      console.log("✅ Auth from cache (no DB call!):", cachedUser.email);
      req.user = cachedUser;
      return next();
    }

    // ⭐ CACHE MISS - Verify JWT
    console.log("🔐 Verifying JWT token (cache miss)...");

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);

    console.log("✅ Token verified for user:", decoded.email);

    // Get latest user data from Firestore
    const userDoc = await db.collection("users").doc(decoded.uid).get();

    let role = decoded.role || "user"; // Default from token
    if (userDoc.exists) {
      role = userDoc.data().role || role; // Update from Firestore
    }

    // Prepare user object
    const user = {
      uid: decoded.uid,
      email: decoded.email,
      role: role,
    };

    // ⭐ SAVE TO CACHE
    cacheUser(token, user);

    // Attach user info to request
    req.user = user;

    console.log(
      "✅ Auth success:",
      req.user.email,
      "| Role:",
      req.user.role,
      "| Cached for 1 hour",
    );

    next();
  } catch (error) {
    console.error("❌ Auth middleware error:", error.message);

    // ⭐ CLEAR INVALID TOKEN FROM CACHE
    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
      clearCache(token);
    }

    // Handle specific JWT errors
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please login again.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token. Please login again.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Authentication failed",
      error: error.message,
    });
  }
};

/**
 * Require superadmin role (highest privilege)
 * Only superadmin can: delete IPAL/sensor, manage users
 */
exports.requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (req.user.role !== "superadmin") {
    return res.status(403).json({
      success: false,
      message: "Super Admin access required. Your role: " + req.user.role,
    });
  }

  console.log("✅ Super Admin access granted:", req.user.email);
  next();
};

/**
 * Require admin role (superadmin or admin)
 * Admin can: create/edit IPAL & sensor, view users
 */
exports.requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (req.user.role !== "superadmin" && req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required. Your role: " + req.user.role,
    });
  }

  console.log("✅ Admin access granted:", req.user.email);
  next();
};

// ========================================
// UTILITY: Manual cache management (optional)
// ========================================

/**
 * Clear all cache (useful for logout or admin tools)
 */
exports.clearAllCache = () => {
  const count = tokenCache.size;
  tokenCache.clear();
  console.log(`🧹 Cleared all token cache (${count} entries)`);
};

/**
 * Get cache stats (useful for monitoring)
 */
exports.getCacheStats = () => {
  return {
    size: tokenCache.size,
    entries: Array.from(tokenCache.entries()).map(([token, data]) => ({
      token: token.substring(0, 20) + "...", // Partial token for privacy
      email: data.user.email,
      age: Math.floor((Date.now() - data.timestamp) / 1000), // seconds
    })),
  };
};

console.log("📦 authMiddleware loaded (JWT verify with cache)");
console.log(`⏱️  Cache duration: ${CACHE_DURATION / 1000 / 60} minutes`);

// Aliases for backward compatibility
exports.verifyToken = exports.requireAuth;
exports.requireManager = exports.requireAdmin; // legacy alias
