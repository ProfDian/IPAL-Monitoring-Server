# 🚀 Caching Implementation Guide

## 📋 Overview

Implementasi caching untuk meningkatkan performance API dengan mengurangi:

- ✅ Firestore reads (cost savings)
- ✅ Response time (50-90% faster)
- ✅ Server load

---

## 🎯 Priority 2: Response Caching Strategy

### Target Endpoints untuk Caching

#### High Priority (Cache 30-60 seconds)

```
GET /api/dashboard/summary/:ipal_id       // Dashboard utama
GET /api/dashboard/readings/:ipal_id      // Chart data
GET /api/sensors?ipal_id=:id              // Sensor list
```

#### Medium Priority (Cache 60-120 seconds)

```
GET /api/alerts/stats                     // Alert statistics
GET /api/sensors/:id                      // Sensor detail
```

#### Low Priority (Cache 120-300 seconds)

```
GET /api/users                            // User list
GET /api/reports/preview                  // Report preview
```

#### ❌ NO Cache

```
POST /api/water-quality/submit            // Real-time ESP32 data
POST /api/auth/*                          // Authentication
PUT /api/alerts/:id/status                // Status updates
```

---

## 📦 Option 1: In-Memory Cache (Node-Cache)

### Pros

✅ Simple setup (no external dependencies)
✅ Fast performance (in-memory)
✅ Zero cost (bundled with Node.js)
✅ Perfect untuk single-server setup

### Cons

❌ Data hilang saat server restart
❌ Tidak scalable untuk multi-server
❌ Memory usage bisa tinggi

### Implementation

#### Step 1: Install Package

```bash
npm install node-cache
```

#### Step 2: Create Cache Middleware

**File**: `water-quality-backend/middleware/cacheMiddleware.js`

```javascript
/**
 * ========================================
 * CACHE MIDDLEWARE
 * ========================================
 * In-memory caching using node-cache
 */

const NodeCache = require("node-cache");

// Initialize cache with default TTL 60 seconds
const cache = new NodeCache({
  stdTTL: 60, // Default: 60 seconds
  checkperiod: 120, // Check for expired keys every 120 seconds
  useClones: false, // Performance: Don't clone objects
  deleteOnExpire: true, // Auto-delete expired keys
});

/**
 * Cache statistics (for monitoring)
 */
const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
};

/**
 * Cache middleware factory
 * @param {Number} duration - Cache duration in seconds
 * @param {Function} keyGenerator - Optional custom key generator
 */
const cacheMiddleware = (duration = 60, keyGenerator = null) => {
  return (req, res, next) => {
    // Generate cache key
    const key = keyGenerator
      ? keyGenerator(req)
      : `${req.method}:${req.originalUrl || req.url}`;

    // Check if response is cached
    const cachedResponse = cache.get(key);

    if (cachedResponse) {
      stats.hits++;
      console.log(`🎯 Cache HIT: ${key} (${stats.hits} hits)`);

      // Return cached response
      return res.json(cachedResponse);
    }

    // Cache miss - continue to controller
    stats.misses++;
    console.log(`❌ Cache MISS: ${key} (${stats.misses} misses)`);

    // Override res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, body, duration);
        stats.sets++;
        console.log(`💾 Cached: ${key} (TTL: ${duration}s)`);
      }

      return originalJson(body);
    };

    next();
  };
};

/**
 * Clear cache for specific pattern
 * @param {String} pattern - URL pattern to clear (e.g., '/api/dashboard')
 */
const clearCache = (pattern = null) => {
  if (pattern) {
    const keys = cache.keys();
    const keysToDelete = keys.filter((key) => key.includes(pattern));

    keysToDelete.forEach((key) => cache.del(key));

    console.log(
      `🗑️  Cleared ${keysToDelete.length} cache entries matching: ${pattern}`
    );
    return keysToDelete.length;
  } else {
    cache.flushAll();
    console.log("🗑️  Cleared all cache");
    return true;
  }
};

/**
 * Get cache statistics
 */
const getCacheStats = () => {
  const hitRate = (stats.hits / (stats.hits + stats.misses)) * 100 || 0;

  return {
    hits: stats.hits,
    misses: stats.misses,
    sets: stats.sets,
    hit_rate: `${hitRate.toFixed(2)}%`,
    keys: cache.keys().length,
    stats: cache.getStats(),
  };
};

/**
 * Invalidate cache on data change
 * Use this in controllers after POST/PUT/DELETE operations
 */
const invalidateCache = (patterns = []) => {
  let totalCleared = 0;

  patterns.forEach((pattern) => {
    totalCleared += clearCache(pattern);
  });

  console.log(`♻️  Cache invalidation: ${totalCleared} entries cleared`);
  return totalCleared;
};

module.exports = {
  cacheMiddleware,
  clearCache,
  getCacheStats,
  invalidateCache,
};
```

#### Step 3: Update server.js

**File**: `water-quality-backend/server.js`

Add before route registration:

```javascript
// ========================================
// CACHE SETUP
// ========================================
const {
  cacheMiddleware,
  getCacheStats,
} = require("./middleware/cacheMiddleware");

// Cache stats endpoint (monitoring)
app.get("/api/cache/stats", requireAuth, (req, res) => {
  const stats = getCacheStats();
  res.json({
    success: true,
    data: stats,
    message: "Cache statistics",
  });
});
```

#### Step 4: Apply to Routes

**Method A: Route-level caching (Recommended)**

```javascript
// dashboardRoutes.js
const { cacheMiddleware } = require("../middleware/cacheMiddleware");

// Cache for 30 seconds
router.get(
  "/summary/:ipal_id",
  requireAuth,
  cacheMiddleware(30), // ⬅️ Add caching here
  dashboardController.getSummary
);

// Cache for 60 seconds
router.get(
  "/readings/:ipal_id",
  requireAuth,
  cacheMiddleware(60), // ⬅️ Add caching here
  dashboardController.getReadingsForChart
);
```

**Method B: Global route caching (Alternative)**

```javascript
// server.js
// Apply caching to all dashboard routes
app.use("/api/dashboard/summary", cacheMiddleware(30));
app.use("/api/dashboard/readings", cacheMiddleware(60));
app.use("/api/sensors", cacheMiddleware(45));
```

#### Step 5: Cache Invalidation

Update controllers to invalidate cache on data changes:

```javascript
// sensorController.js
const { invalidateCache } = require("../middleware/cacheMiddleware");

// After creating new reading
exports.createReading = async (req, res) => {
  try {
    // ... create reading logic ...

    // Invalidate related caches
    invalidateCache([
      "/api/dashboard", // Clear all dashboard caches
      "/api/sensors/readings",
      `/api/sensors/${sensorId}`,
    ]);

    res.json({ success: true, data: result });
  } catch (error) {
    // ...
  }
};
```

---

## 🔴 Option 2: Redis Cache (Recommended for Production)

### Pros

✅ Persistent cache (survives restarts)
✅ Scalable (multi-server support)
✅ Advanced features (pub/sub, TTL)
✅ Battle-tested in production

### Cons

❌ External dependency (Redis server needed)
❌ More complex setup
❌ Additional cost (hosting Redis)

### Implementation

#### Step 1: Install Redis

**Local Development:**

```bash
# Windows (using Chocolatey)
choco install redis-64

# Or download from: https://github.com/microsoftarchive/redis/releases

# Start Redis server
redis-server
```

**Production (Vercel/Cloud):**

- Use Redis Cloud (free tier: 30MB)
- Or Upstash Redis (free tier: 10K commands/day)

#### Step 2: Install Package

```bash
npm install redis
```

#### Step 3: Create Redis Cache Middleware

**File**: `water-quality-backend/middleware/redisCacheMiddleware.js`

```javascript
/**
 * ========================================
 * REDIS CACHE MIDDLEWARE
 * ========================================
 */

const redis = require("redis");

// Create Redis client
const client = redis.createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error("❌ Redis connection failed after 10 retries");
        return new Error("Too many retries");
      }
      return retries * 100; // Retry every 100ms * retries
    },
  },
});

// Connect to Redis
client.connect().catch((error) => {
  console.error("❌ Redis connection error:", error);
});

// Event listeners
client.on("connect", () => {
  console.log("✅ Redis connected");
});

client.on("error", (error) => {
  console.error("❌ Redis error:", error);
});

// Stats
const stats = { hits: 0, misses: 0 };

/**
 * Redis cache middleware
 */
const redisCacheMiddleware = (duration = 60) => {
  return async (req, res, next) => {
    // Skip if Redis not connected
    if (!client.isReady) {
      return next();
    }

    const key = `cache:${req.method}:${req.originalUrl || req.url}`;

    try {
      // Check cache
      const cachedData = await client.get(key);

      if (cachedData) {
        stats.hits++;
        console.log(`🎯 Redis Cache HIT: ${key}`);
        return res.json(JSON.parse(cachedData));
      }

      // Cache miss
      stats.misses++;
      console.log(`❌ Redis Cache MISS: ${key}`);

      // Override res.json
      const originalJson = res.json.bind(res);
      res.json = async (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          await client.setEx(key, duration, JSON.stringify(body));
          console.log(`💾 Redis Cached: ${key} (${duration}s)`);
        }
        return originalJson(body);
      };

      next();
    } catch (error) {
      console.error("❌ Redis middleware error:", error);
      next(); // Continue without caching
    }
  };
};

/**
 * Clear Redis cache by pattern
 */
const clearRedisCache = async (pattern = "*") => {
  try {
    const keys = await client.keys(`cache:*${pattern}*`);
    if (keys.length > 0) {
      await client.del(keys);
      console.log(`🗑️  Cleared ${keys.length} Redis cache entries`);
    }
    return keys.length;
  } catch (error) {
    console.error("❌ Redis clear error:", error);
    return 0;
  }
};

module.exports = {
  redisCacheMiddleware,
  clearRedisCache,
  redisClient: client,
};
```

#### Step 4: Update .env

```env
# Redis Configuration
REDIS_URL=redis://localhost:6379

# For Redis Cloud:
# REDIS_URL=redis://default:password@redis-12345.cloud.redislabs.com:12345
```

#### Step 5: Apply to Routes

Same as node-cache, just import different middleware:

```javascript
const { redisCacheMiddleware } = require("../middleware/redisCacheMiddleware");

router.get(
  "/summary/:ipal_id",
  requireAuth,
  redisCacheMiddleware(30),
  dashboardController.getSummary
);
```

---

## 📊 Performance Testing

### Test Cache Performance

**File**: `test-cache-performance.js`

```javascript
const axios = require("axios");

async function testCache() {
  const token = "YOUR_JWT_TOKEN";
  const url = "http://localhost:3000/api/dashboard/summary/1";

  console.log("🧪 Testing cache performance...\n");

  // First request (cache miss)
  console.log("1️⃣ First request (should be MISS):");
  const start1 = Date.now();
  await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
  const time1 = Date.now() - start1;
  console.log(`   Time: ${time1}ms\n`);

  // Second request (cache hit)
  console.log("2️⃣ Second request (should be HIT):");
  const start2 = Date.now();
  await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
  const time2 = Date.now() - start2;
  console.log(`   Time: ${time2}ms\n`);

  const improvement = (((time1 - time2) / time1) * 100).toFixed(2);
  console.log(`📈 Performance improvement: ${improvement}%`);
  console.log(`⚡ Speedup: ${(time1 / time2).toFixed(2)}x faster`);
}

testCache();
```

**Expected Results:**

```
1️⃣ First request (should be MISS):
   Time: 350ms

2️⃣ Second request (should be HIT):
   Time: 15ms

📈 Performance improvement: 95.71%
⚡ Speedup: 23.33x faster
```

---

## 🎯 Recommended Implementation Plan

### Phase 1: In-Memory Cache (This Week)

- ✅ Install node-cache
- ✅ Create cacheMiddleware.js
- ✅ Apply to dashboard routes
- ✅ Test performance improvements
- ✅ Monitor cache hit rates

**Why**: Quick wins, no external dependencies

### Phase 2: Cache Invalidation (Next Week)

- ✅ Add invalidateCache to POST/PUT/DELETE operations
- ✅ Implement smart invalidation patterns
- ✅ Test data consistency

**Why**: Ensure cache doesn't serve stale data

### Phase 3: Redis Migration (Future, if needed)

- ⏭️ Set up Redis server (production)
- ⏭️ Migrate to redisCacheMiddleware
- ⏭️ Test multi-server setup

**Why**: Only needed when scaling to multiple servers

---

## ⚠️ Important Considerations

### 1. Cache Invalidation Strategy

```javascript
// When to invalidate cache?

// After creating new sensor reading
POST /api/sensors/readings
  ↓
  Invalidate: ['/api/dashboard', '/api/sensors/readings']

// After updating sensor
PUT /api/sensors/:id
  ↓
  Invalidate: [`/api/sensors/${id}`, '/api/sensors?']

// After resolving alert
PUT /api/alerts/:id/status
  ↓
  Invalidate: ['/api/alerts', '/api/dashboard/summary']
```

### 2. Cache Duration Guidelines

```javascript
// Real-time data (5-30s)
- Dashboard summary: 30s
- Latest readings: 15s
- Active alerts: 20s

// Semi-static data (60-120s)
- Sensor list: 60s
- Chart data: 60s
- Statistics: 90s

// Static data (300s+)
- User list: 300s
- System configuration: 600s
```

### 3. Memory Usage Estimation

```javascript
// Average cache entry sizes:
- Dashboard summary: ~5 KB
- Chart data (100 readings): ~50 KB
- Sensor list: ~10 KB
- Alert list: ~15 KB

// Total estimated memory (100 users, 10 IPAL):
// ~10 MB for all cached responses
```

---

## 📈 Monitoring & Optimization

### Cache Stats Endpoint

```javascript
GET /api/cache/stats

Response:
{
  "success": true,
  "data": {
    "hits": 1247,
    "misses": 328,
    "sets": 328,
    "hit_rate": "79.19%",
    "keys": 45,
    "stats": {
      "hits": 1247,
      "misses": 328,
      "keys": 45,
      "ksize": 45,
      "vsize": 45
    }
  }
}
```

### Optimization Tips

1. **Increase cache duration** if hit rate < 70%
2. **Decrease cache duration** if data seems stale
3. **Add more endpoints** to caching if frequently accessed
4. **Remove caching** from rarely accessed endpoints

---

## ✅ Expected Results

### Before Caching:

```
Dashboard load: ~450ms
Chart data: ~400ms
Sensor list: ~200ms
Total: ~1050ms
```

### After Caching (cache hit):

```
Dashboard load: ~15ms (96% faster)
Chart data: ~20ms (95% faster)
Sensor list: ~10ms (95% faster)
Total: ~45ms (96% faster)
```

### Cost Savings:

```
Firestore reads per dashboard load:
- Before: ~50 reads
- After (cached): ~0 reads (cache hit)

Monthly savings (1000 users, 10 views/day):
- Reads: 500,000 → 50,000 (90% reduction)
- Cost: $0.18 → $0.018 (90% savings)
```

---

## 🚀 Ready to Implement?

**Recommended**: Start with **Option 1 (node-cache)** for immediate results.

**Next Steps**:

1. Review this guide with team
2. Test in development environment
3. Monitor performance improvements
4. Deploy to production
5. Consider Redis migration later if needed

---

_Last Updated: 2025-01-25_  
_Status: Ready for Implementation_
