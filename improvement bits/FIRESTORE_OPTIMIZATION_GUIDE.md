# 🔥 Firestore Optimization Guide - Reduce Read/Write Quota

## 📊 Current Problems

### Free Tier Limits:
- **50,000 reads/day** (2,083/hour, 35/minute)
- **20,000 writes/day** (833/hour, 14/minute)

### Identified Bottlenecks:

| Operation | Reads per Call | Frequency | Daily Total | Priority |
|-----------|----------------|-----------|-------------|----------|
| **Frontend Auto-Refresh** | 152 reads | Every 30s | 438,912 📈 | 🔴 CRITICAL |
| **getSensorHistory (loop)** | 8-64 reads | Per sensor | Variable | 🔴 HIGH |
| **getLatestReadingBySensor** | 8-64 reads | Per sensor | Variable | 🔴 HIGH |
| **Dashboard chart** | 100-500 | Per load | Variable | 🟡 MEDIUM |
| **getAllSensors** | 8 reads | Per page | Variable | 🟢 LOW |

---

## ✅ SOLUTIONS

### 1. 🔴 CRITICAL: Disable/Reduce Auto-Refresh

#### Option A: Increase Interval
```javascript
// ❌ Before: 30 seconds (438K reads/day)
setInterval(fetchSensors, 30000);

// ✅ After: 5 minutes (43K reads/day)
setInterval(fetchSensors, 300000);

// ✅ Better: 10 minutes (21K reads/day)
setInterval(fetchSensors, 600000);
```

#### Option B: Smart Refresh (Only Active Tab)
```javascript
// Only refresh if user is viewing the page
useEffect(() => {
  const handleVisibilityChange = () => {
    if (!document.hidden) {
      fetchSensors();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  // Refresh only when page becomes visible
  const interval = setInterval(() => {
    if (!document.hidden) {
      fetchSensors();
    }
  }, 300000); // 5 minutes

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    clearInterval(interval);
  };
}, []);
```

#### Option C: Manual Refresh Only
```javascript
// ❌ Remove auto-refresh entirely
// ✅ User clicks "Refresh" button manually
// Savings: 438K → ~100 reads/day
```

---

### 2. 🔴 FIX: Optimize getSensorHistory

#### Current Implementation (❌ INEFFICIENT):
```javascript
// Loops through 8 fields, charges reads even if empty
const mappingFields = [
  "sensor_mapping.inlet_ph",
  "sensor_mapping.inlet_tds",
  // ... 8 fields total
];

for (const field of mappingFields) {
  const snapshot = await db
    .collection("water_quality_readings")
    .where(field, "==", id)
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get(); // CHARGED EVEN IF EMPTY!
}
```

#### ✅ OPTIMIZED VERSION:
```javascript
// Use sensor metadata to know EXACT mapping field
const sensorData = sensorDoc.data();
const location = sensorData.sensor_location; // inlet or outlet
const type = sensorData.sensor_type; // ph, tds, etc
const mappingField = `sensor_mapping.${location}_${type}`;

// Single query instead of 8!
const snapshot = await db
  .collection("water_quality_readings")
  .where(mappingField, "==", id)
  .orderBy("timestamp", "desc")
  .limit(parseInt(limit))
  .get();
```

**Savings:** 8 queries → 1 query = **87.5% reduction**

---

### 3. 🔴 FIX: Add Caching Layer

#### In-Memory Cache (Node.js Backend):
```javascript
// services/cacheService.js
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes

exports.getCached = (key, fetchFunction) => {
  const cached = cache.get(key);
  if (cached) {
    console.log(`✅ Cache hit: ${key}`);
    return Promise.resolve(cached);
  }

  console.log(`❌ Cache miss: ${key}, fetching...`);
  return fetchFunction().then(data => {
    cache.set(key, data);
    return data;
  });
};

exports.invalidate = (key) => {
  cache.del(key);
};
```

#### Usage:
```javascript
// In sensorController.js
const cacheService = require('../services/cacheService');

exports.getAllSensors = async (req, res) => {
  const cacheKey = `sensors:ipal:${req.query.ipal_id}`;
  
  const sensors = await cacheService.getCached(cacheKey, async () => {
    const snapshot = await db.collection('sensors')
      .where('ipal_id', '==', parseInt(req.query.ipal_id))
      .get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  });

  return res.json({ success: true, data: sensors });
};
```

**Savings:** 80-90% reads for frequently accessed data

---

### 4. 🟡 Add Pagination (Large Queries)

#### Before (❌ DANGEROUS):
```javascript
// Could return 1000s of readings!
const snapshot = await db
  .collection('water_quality_readings')
  .where('ipal_id', '==', ipalId)
  .orderBy('timestamp', 'desc')
  .get(); // NO LIMIT!
```

#### After (✅ SAFE):
```javascript
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

const limit = Math.min(
  parseInt(req.query.limit) || DEFAULT_LIMIT,
  MAX_LIMIT
);

const snapshot = await db
  .collection('water_quality_readings')
  .where('ipal_id', '==', ipalId)
  .orderBy('timestamp', 'desc')
  .limit(limit)
  .get();
```

---

### 5. 🟢 Use Aggregated/Summary Collections

#### Create Daily Summary (Scheduled Function):
```javascript
// Run once per day (Cloud Scheduler)
exports.createDailySummary = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const snapshot = await db
    .collection('water_quality_readings')
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(today))
    .get();

  // Calculate summary
  const summary = {
    date: today,
    total_readings: snapshot.size,
    avg_ph: calculateAvg(snapshot, 'outlet.ph'),
    avg_tds: calculateAvg(snapshot, 'outlet.tds'),
    // ... other stats
  };

  // Save to summary collection (1 WRITE instead of 100s of READS later)
  await db.collection('daily_summaries').doc(today.toISOString()).set(summary);
};

// Frontend reads 1 doc instead of 100s
const summary = await db.collection('daily_summaries')
  .doc(todayISO)
  .get(); // 1 READ!
```

---

### 6. 🟢 Frontend: Fetch Mini History Only

#### Before (❌ WASTEFUL):
```javascript
// Fetches 100 readings per sensor just for sparkline!
const historyData = await sensorService.getSensorHistory(sensor.id, {
  limit: 100
});
```

#### After (✅ EFFICIENT):
```javascript
// Only fetch 10 readings for sparkline
const historyData = await sensorService.getSensorHistory(sensor.id, {
  limit: 10 // 90% less reads!
});
```

---

### 7. 🟢 Batch Reads (Where Possible)

#### Before (❌ N+1 Problem):
```javascript
// 1 read per sensor
for (const sensor of sensors) {
  const reading = await getLatestReading(sensor.id);
}
```

#### After (✅ Batched):
```javascript
// Get all readings in 1 query
const readings = await db
  .collection('water_quality_readings')
  .where('ipal_id', '==', 1)
  .orderBy('timestamp', 'desc')
  .limit(1)
  .get();

// Map to sensors
const readingMap = {};
readings.docs.forEach(doc => {
  const data = doc.data();
  // Create mapping for each sensor
  readingMap[data.sensor_mapping.inlet_ph] = data.inlet.ph;
  readingMap[data.sensor_mapping.inlet_tds] = data.inlet.tds;
  // ... etc
});
```

---

## 📊 Estimated Savings

| Optimization | Before (reads/day) | After (reads/day) | Savings |
|--------------|-------------------|-------------------|---------|
| **Auto-refresh interval** | 438,912 | 21,888 (10 min) | 95% 🎉 |
| **Sensor history optimization** | ~5,000 | ~625 | 87.5% |
| **Mini sparkline (10 vs 100)** | ~8,000 | ~800 | 90% |
| **Caching layer** | ~10,000 | ~1,000 | 90% |
| **Add limits to queries** | Variable | Controlled | N/A |

**Total Estimated Savings: 90-95% reduction** 🚀

---

## 🎯 Implementation Priority

### Phase 1 (IMMEDIATE - 1 hour):
1. ✅ Increase auto-refresh interval to 10 minutes
2. ✅ Reduce sparkline history to 10 readings
3. ✅ Add `.limit()` to all queries without limits

### Phase 2 (HIGH - 1 day):
1. ✅ Fix `getSensorHistory` - use single query
2. ✅ Fix `getLatestReadingBySensor` - use single query
3. ✅ Add caching service (node-cache)

### Phase 3 (MEDIUM - 1 week):
1. ✅ Implement smart refresh (only active tab)
2. ✅ Add pagination to large queries
3. ✅ Create daily summary collections

---

## 🔍 Monitoring Quota Usage

### Firebase Console:
```
Firebase Console → Build → Firestore Database → Usage
```

### Add Quota Monitoring (Backend):
```javascript
// middleware/quotaMonitor.js
let dailyReads = 0;
let dailyWrites = 0;

exports.trackRead = (count = 1) => {
  dailyReads += count;
  if (dailyReads > 45000) { // 90% of 50K
    console.warn(`⚠️  High read quota: ${dailyReads}/50000`);
  }
};

exports.trackWrite = (count = 1) => {
  dailyWrites += count;
  if (dailyWrites > 18000) { // 90% of 20K
    console.warn(`⚠️  High write quota: ${dailyWrites}/20000`);
  }
};

// Reset daily at midnight
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    console.log(`📊 Daily quota: Reads: ${dailyReads}, Writes: ${dailyWrites}`);
    dailyReads = 0;
    dailyWrites = 0;
  }
}, 60000);
```

---

## 📝 Quick Checklist

Before deploying any query, ask:
- ✅ Is there a `.limit()`?
- ✅ Is this cached?
- ✅ Could this be batched?
- ✅ Do I really need ALL this data?
- ✅ Can I use a summary instead?

**Remember:** Every `.get()` call costs reads = number of documents returned + 1 (minimum)

---

## 🚀 Next Steps

1. Review and apply Phase 1 optimizations
2. Test quota reduction in Firebase Console
3. Implement caching layer (Phase 2)
4. Monitor daily usage for 1 week
5. Adjust intervals based on real usage patterns
