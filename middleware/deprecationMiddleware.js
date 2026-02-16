/**
 * ========================================
 * DEPRECATION MIDDLEWARE
 * ========================================
 * Marks endpoints as deprecated by:
 * 1. Adding 'Deprecation' and 'Sunset' HTTP headers
 * 2. Adding 'X-Deprecated-Use-Instead' header pointing to the canonical endpoint
 * 3. Logging a warning on each call
 *
 * The endpoint still works normally — no breaking changes.
 *
 * Usage:
 *   const { deprecated } = require("../middleware/deprecationMiddleware");
 *   router.get("/old-endpoint", deprecated("/api/new-endpoint"), controller.handler);
 */

/**
 * Factory function that returns a deprecation middleware
 * @param {string} alternative - The canonical endpoint to use instead
 * @param {string} [sunsetDate="2026-06-01"] - ISO date when the endpoint will be removed
 * @returns {Function} Express middleware
 */
const deprecated = (alternative, sunsetDate = "2026-06-01") => {
  return (req, res, next) => {
    // RFC 8594 Deprecation header
    res.set("Deprecation", "true");
    res.set("Sunset", new Date(sunsetDate).toUTCString());
    res.set("X-Deprecated-Use-Instead", alternative);

    // Log warning (once per unique path per server lifetime would be ideal,
    // but for simplicity we log every call — useful for tracking usage)
    console.warn(
      `⚠️  DEPRECATED: ${req.method} ${req.originalUrl} → use ${alternative} instead`,
    );

    next();
  };
};

module.exports = { deprecated };

console.log("📦 deprecationMiddleware loaded");
