/**
 * ========================================
 * SENSOR CONTROLLER (EXTENDED)
 * ========================================
 * Complete CRUD operations for sensor management
 * - GET: All authenticated users
 * - CREATE/UPDATE: superadmin + admin
 * - DELETE: superadmin only
 */

const { admin, db } = require("../config/firebase-config");
const { invalidateCache } = require("../middleware/cacheMiddleware");
const cacheService = require("../services/cacheService");

// ========================================
// EXISTING FUNCTIONS (keep these)
// ========================================

/**
 * GET - Ambil data readings (EXISTING)
 */
exports.getReadings = async (req, res) => {
  try {
    const {
      ipal_id,
      limit = 50,
      order = "desc",
      start_date,
      end_date,
    } = req.query;

    console.log("📊 getReadings called with:", {
      ipal_id,
      limit,
      order,
      start_date,
      end_date,
    });

    let query = db.collection("water_quality_readings");

    if (ipal_id) {
      query = query.where("ipal_id", "==", parseInt(ipal_id));
    }

    if (start_date) {
      const startTimestamp = admin.firestore.Timestamp.fromDate(
        new Date(start_date),
      );
      query = query.where("timestamp", ">=", startTimestamp);
    }

    if (end_date) {
      const endTimestamp = admin.firestore.Timestamp.fromDate(
        new Date(end_date),
      );
      query = query.where("timestamp", "<=", endTimestamp);
    }

    // ✅ Use order parameter from query string (asc or desc)
    const sortOrder = order.toLowerCase() === "asc" ? "asc" : "desc";
    query = query.orderBy("timestamp", sortOrder).limit(parseInt(limit));

    console.log(`   Sorting by timestamp: ${sortOrder}`);

    const snapshot = await query.get();

    const readings = [];
    snapshot.forEach((doc) => {
      readings.push({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate().toISOString(),
      });
    });

    console.log(
      `✅ Returning ${readings.length} readings (${sortOrder} order)`,
    );

    return res.status(200).json({
      success: true,
      count: readings.length,
      data: readings,
    });
  } catch (error) {
    console.error("💥 Error fetching readings:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch readings",
      error: error.message,
    });
  }
};

/**
 * GET - Latest reading (EXISTING)
 */
exports.getLatestReading = async (req, res) => {
  try {
    const { ipal_id } = req.params;

    const snapshot = await db
      .collection("water_quality_readings")
      .where("ipal_id", "==", parseInt(ipal_id))
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        message: `No readings found for IPAL ${ipal_id}`,
      });
    }

    const doc = snapshot.docs[0];
    const reading = {
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate().toISOString(),
    };

    return res.status(200).json({
      success: true,
      data: reading,
    });
  } catch (error) {
    console.error("💥 Error fetching latest reading:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch latest reading",
      error: error.message,
    });
  }
};

// ========================================
// NEW FUNCTIONS - SENSOR MANAGEMENT
// ========================================

/**
 * GET ALL SENSORS dengan filters
 * Endpoint: GET /api/sensors?ipal_id=1&sensor_type=ph&status=active
 */
exports.getAllSensors = async (req, res) => {
  try {
    const { ipal_id, sensor_type, status, limit = 50 } = req.query;

    console.log("📊 Fetching sensors with filters:", {
      ipal_id,
      sensor_type,
      status,
    });

    let query = db.collection("sensors");

    // Filters
    if (ipal_id) {
      query = query.where("ipal_id", "==", parseInt(ipal_id));
    }

    if (sensor_type) {
      query = query.where("sensor_type", "==", sensor_type);
    }

    if (status) {
      query = query.where("status", "==", status);
    }

    // Order and limit
    query = query.orderBy("added_at", "desc").limit(parseInt(limit));

    const snapshot = await query.get();

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        message: "No sensors found",
        count: 0,
        data: [],
      });
    }

    const now = new Date();
    const sensors = [];

    console.log(`🕐 Current time: ${now.toISOString()}`);

    snapshot.forEach((doc) => {
      const data = doc.data();

      // 🆕 CALCULATE ONLINE STATUS on-the-fly
      let online_status = "offline";
      let debugInfo = { sensorId: doc.id };

      // Check both last_updated_at and latest_reading.timestamp
      const lastUpdateField =
        data.last_updated_at || data.latest_reading?.timestamp;

      if (lastUpdateField) {
        const lastUpdate = lastUpdateField.toDate
          ? lastUpdateField.toDate()
          : new Date(lastUpdateField);
        const minutesAgo = (now - lastUpdate) / 1000 / 60;

        debugInfo.lastUpdate = lastUpdate.toISOString();
        debugInfo.minutesAgo = minutesAgo.toFixed(2);

        // Online jika update < 5 menit yang lalu
        online_status = minutesAgo < 5 ? "online" : "offline";
        debugInfo.online_status = online_status;

        console.log(
          `   Sensor ${doc.id}: ${minutesAgo.toFixed(
            1,
          )}min ago → ${online_status}`,
        );
      } else {
        console.log(`   Sensor ${doc.id}: NO last_updated_at → offline`);
      }

      // Format timestamps
      const sensorData = {
        id: doc.id,
        ...data,
        added_at: data.added_at?.toDate
          ? data.added_at.toDate().toISOString()
          : null,
        last_calibration: data.last_calibration?.toDate
          ? data.last_calibration.toDate().toISOString()
          : null,
        last_updated_at: data.last_updated_at?.toDate
          ? data.last_updated_at.toDate().toISOString()
          : null,
        online_status, // 🆕 ADDED
      };

      // Format latest_reading timestamps if exists
      if (data.latest_reading?.timestamp) {
        sensorData.latest_reading = {
          ...data.latest_reading,
          timestamp: data.latest_reading.timestamp.toDate
            ? data.latest_reading.timestamp.toDate().toISOString()
            : data.latest_reading.timestamp,
        };
      }

      sensors.push(sensorData);
    });

    console.log(`✅ Found ${sensors.length} sensors`);

    // 🆕 COUNT ONLINE SENSORS
    const onlineCount = sensors.filter(
      (s) => s.online_status === "online",
    ).length;
    console.log(
      `   ${onlineCount} online, ${sensors.length - onlineCount} offline`,
    );

    return res.status(200).json({
      success: true,
      count: sensors.length,
      online_count: onlineCount,
      offline_count: sensors.length - onlineCount,
      data: sensors,
    });
  } catch (error) {
    console.error("💥 Error fetching sensors:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sensors",
      error: error.message,
    });
  }
};

/**
 * GET SENSOR BY ID (OPTIMIZED WITH CACHE)
 * Endpoint: GET /api/sensors/:id
 */
exports.getSensorById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🔍 Fetching sensor: ${id}`);

    const cacheKey = cacheService.KEYS.SENSOR(id);

    const sensor = await cacheService.getCached(
      cacheKey,
      async () => {
        const doc = await db.collection("sensors").doc(id).get();

        if (!doc.exists) {
          return null;
        }

        return {
          id: doc.id,
          ...doc.data(),
          added_at: doc.data().added_at?.toDate
            ? doc.data().added_at.toDate().toISOString()
            : null,
        };
      },
      600, // Cache for 10 minutes (metadata rarely changes)
    );

    if (!sensor) {
      return res.status(404).json({
        success: false,
        message: `Sensor with ID ${id} not found`,
      });
    }

    console.log(`✅ Sensor found: ${id}`);

    return res.status(200).json({
      success: true,
      data: sensor,
    });
  } catch (error) {
    console.error("💥 Error fetching sensor:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sensor",
      error: error.message,
    });
  }
};

/**
 * UPDATE SENSOR (WITH CACHE INVALIDATION)
 * Endpoint: PUT /api/sensors/:id
 */
exports.updateSensor = async (req, res) => {
  try {
    const { id } = req.params;
    const { sensor_type, sensor_location, sensor_description, status } =
      req.body;
    const user = req.user;

    console.log(`✏️ Updating sensor: ${id} by ${user.email}`);

    const sensorRef = db.collection("sensors").doc(id);
    const sensorDoc = await sensorRef.get();

    if (!sensorDoc.exists) {
      return res.status(404).json({
        success: false,
        message: `Sensor with ID ${id} not found`,
      });
    }

    const updateData = {
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_by: user.email,
    };

    if (sensor_type) updateData.sensor_type = sensor_type;
    if (sensor_location) updateData.sensor_location = sensor_location;
    if (sensor_description !== undefined)
      updateData.sensor_description = sensor_description;
    if (status) updateData.status = status;

    await sensorRef.update(updateData);

    // ✅ Invalidate both HTTP cache and cacheService cache
    invalidateCache(["/api/sensors", `/api/sensors/${id}`, "/api/dashboard"]);
    cacheService.invalidate(cacheService.KEYS.SENSOR(id));
    cacheService.invalidate(cacheService.KEYS.LATEST_READING(id));
    cacheService.invalidatePattern(`history:${id}:*`);
    cacheService.invalidatePattern("sensors:*");

    console.log(`✅ Sensor updated: ${id} & cache invalidated`);

    const updatedDoc = await sensorRef.get();
    const updatedSensor = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
      added_at: updatedDoc.data().added_at?.toDate
        ? updatedDoc.data().added_at.toDate().toISOString()
        : null,
      updated_at: new Date().toISOString(),
    };

    return res.status(200).json({
      success: true,
      message: "Sensor updated successfully",
      data: updatedSensor,
    });
  } catch (error) {
    console.error("💥 Error updating sensor:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update sensor",
      error: error.message,
    });
  }
};

/**
 * GET SENSOR STATUS (online/offline)
 * Endpoint: GET /api/sensors/:id/status
 *
 * Logic: Sensor dianggap online jika ada reading dalam 10 menit terakhir
 */
exports.getSensorStatus = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🔍 Checking sensor status: ${id}`);

    // Get sensor
    const sensorDoc = await db.collection("sensors").doc(id).get();

    if (!sensorDoc.exists) {
      return res.status(404).json({
        success: false,
        message: `Sensor with ID ${id} not found`,
      });
    }

    const sensorData = sensorDoc.data();

    // Get latest reading untuk IPAL ini
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const tenMinutesAgoTimestamp =
      admin.firestore.Timestamp.fromDate(tenMinutesAgo);

    const recentReadings = await db
      .collection("water_quality_readings")
      .where("ipal_id", "==", sensorData.ipal_id)
      .where("timestamp", ">=", tenMinutesAgoTimestamp)
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    const isOnline = !recentReadings.empty;

    let lastReading = null;
    if (!recentReadings.empty) {
      const doc = recentReadings.docs[0];
      lastReading = {
        timestamp: doc.data().timestamp?.toDate().toISOString(),
        data: doc.data(),
      };
    }

    console.log(`✅ Sensor status: ${isOnline ? "online" : "offline"}`);

    return res.status(200).json({
      success: true,
      data: {
        sensor_id: id,
        ipal_id: sensorData.ipal_id,
        sensor_type: sensorData.sensor_type,
        status: isOnline ? "online" : "offline",
        last_reading: lastReading,
      },
    });
  } catch (error) {
    console.error("💥 Error checking sensor status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check sensor status",
      error: error.message,
    });
  }
};

/**
 * GET SENSORS BY IPAL
 * Endpoint: GET /api/sensors/ipal/:ipal_id
 */
exports.getSensorsByIpal = async (req, res) => {
  try {
    const { ipal_id } = req.params;

    console.log(`📊 Fetching sensors for IPAL: ${ipal_id}`);

    const snapshot = await db
      .collection("sensors")
      .where("ipal_id", "==", parseInt(ipal_id))
      .orderBy("added_at", "desc")
      .get();

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        message: `No sensors found for IPAL ${ipal_id}`,
        count: 0,
        data: [],
      });
    }

    const sensors = [];
    snapshot.forEach((doc) => {
      sensors.push({
        id: doc.id,
        ...doc.data(),
        added_at: doc.data().added_at?.toDate
          ? doc.data().added_at.toDate().toISOString()
          : null,
      });
    });

    console.log(`✅ Found ${sensors.length} sensors for IPAL ${ipal_id}`);

    return res.status(200).json({
      success: true,
      count: sensors.length,
      data: sensors,
    });
  } catch (error) {
    console.error("💥 Error fetching sensors by IPAL:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sensors",
      error: error.message,
    });
  }
};

/**
 * GET LATEST READING BY SENSOR ID (OPTIMIZED)
 * Endpoint: GET /api/sensors/:id/latest
 * ✅ OPTIMIZED: 1 query instead of 8-64 queries (using sensor metadata)
 */
exports.getLatestReadingBySensor = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🔍 Fetching latest reading for sensor: ${id}`);

    // Try cache first (5 min TTL)
    const cacheKey = cacheService.KEYS.LATEST_READING(id);

    const result = await cacheService.getCached(
      cacheKey,
      async () => {
        // 1. Get sensor metadata (CACHED separately)
        const sensorCacheKey = cacheService.KEYS.SENSOR(id);

        const sensorDoc = await cacheService.getCached(
          sensorCacheKey,
          async () => {
            const doc = await db.collection("sensors").doc(id).get();
            if (!doc.exists) return null;
            return { id: doc.id, ...doc.data() };
          },
          600, // 10 min TTL for sensor metadata
        );

        if (!sensorDoc) {
          return null;
        }

        const sensorData = sensorDoc;

        // 2. ✅ OPTIMIZATION: Build EXACT mapping field from sensor metadata
        const location = sensorData.sensor_location; // inlet or outlet
        const type = sensorData.sensor_type; // ph, tds, turbidity, temperature
        const mappingField = `sensor_mapping.${location}_${type}`;

        console.log(`   📌 Using mapping field: ${mappingField}`);

        // 3. Single query instead of loop!
        const snapshot = await db
          .collection("water_quality_readings")
          .where(mappingField, "==", id)
          .orderBy("timestamp", "desc")
          .limit(1) // Only need latest
          .get();

        if (snapshot.empty) {
          return {
            sensor: sensorData,
            latest_reading: null,
          };
        }

        // 4. Extract data
        const readingDoc = snapshot.docs[0];
        const latestReading = readingDoc.data();

        const timestamp = latestReading.timestamp?.toDate
          ? latestReading.timestamp.toDate().toISOString()
          : null;

        const sensorValue = latestReading[location]?.[type] || null;

        return {
          sensor: {
            id: sensorDoc.id,
            sensor_id: sensorData.sensor_id,
            sensor_type: sensorData.sensor_type,
            sensor_location: sensorData.sensor_location,
            sensor_description: sensorData.sensor_description,
            status: sensorData.status,
            last_calibration: sensorData.last_calibration?.toDate
              ? sensorData.last_calibration.toDate().toISOString()
              : null,
          },
          latest_reading: {
            value: sensorValue,
            timestamp: timestamp,
            reading_id: readingDoc.id,
            full_reading: latestReading,
          },
        };
      },
      300,
    ); // Cache for 5 minutes

    if (!result) {
      return res.status(404).json({
        success: false,
        message: `Sensor with ID ${id} not found`,
      });
    }

    console.log(`✅ Latest reading found for sensor ${id}`);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("💥 Error fetching latest reading:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch latest reading",
      error: error.message,
    });
  }
};

/**
 * GET SENSOR HISTORY (OPTIMIZED)
 * Endpoint: GET /api/sensors/:id/history?limit=100&start_date=...&end_date=...
 * ✅ OPTIMIZED: 1 query with cache instead of inefficient compound query
 */
exports.getSensorHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100, start_date, end_date } = req.query;

    // ✅ SAFETY: Enforce max limit
    const safeLimit = Math.min(parseInt(limit), 500);

    console.log(`📊 Fetching history for sensor: ${id} (limit: ${safeLimit})`);

    // Cache key with limit
    const cacheKey = cacheService.KEYS.SENSOR_HISTORY(id, safeLimit);

    const result = await cacheService.getCached(
      cacheKey,
      async () => {
        // 1. Get sensor metadata (CACHED)
        const sensorCacheKey = cacheService.KEYS.SENSOR(id);

        const sensorDoc = await cacheService.getCached(
          sensorCacheKey,
          async () => {
            const doc = await db.collection("sensors").doc(id).get();
            if (!doc.exists) return null;
            return { id: doc.id, ...doc.data() };
          },
          600, // 10 min TTL
        );

        if (!sensorDoc) {
          return null;
        }

        const sensorData = sensorDoc;
        const location = sensorData.sensor_location;
        const type = sensorData.sensor_type;
        const mappingField = `sensor_mapping.${location}_${type}`;

        console.log(`   📌 Using mapping field: ${mappingField}`);

        // 2. ✅ OPTIMIZATION: Single query with proper ordering
        let query = db
          .collection("water_quality_readings")
          .where(mappingField, "==", id)
          .orderBy("timestamp", "desc")
          .limit(safeLimit);

        // Optional date filters (applied in JavaScript to avoid compound index)
        const snapshot = await query.get();

        // 3. Filter and extract data
        let readings = [];

        snapshot.forEach((doc) => {
          const data = doc.data();
          const timestamp = data.timestamp?.toDate();

          // Apply date filters if provided
          if (start_date && timestamp < new Date(start_date)) return;
          if (end_date && timestamp > new Date(end_date + "T23:59:59Z")) return;

          const value = data[location]?.[type];

          readings.push({
            reading_id: doc.id,
            value: value,
            timestamp: timestamp ? timestamp.toISOString() : null,
          });
        });

        return {
          sensor: {
            id: sensorDoc.id,
            sensor_type: sensorData.sensor_type,
            sensor_location: sensorData.sensor_location,
            sensor_description: sensorData.sensor_description,
            status: sensorData.status,
          },
          count: readings.length,
          history: readings,
        };
      },
      180, // Cache for 3 minutes (shorter for history data)
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: `Sensor with ID ${id} not found`,
      });
    }

    console.log(`✅ Found ${result.count} historical readings`);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("💥 Error fetching sensor history:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sensor history",
      error: error.message,
    });
  }
};

// ========================================
// CREATE & DELETE SENSOR
// ========================================

/**
 * CREATE SENSOR
 * Endpoint: POST /api/sensors
 * Access: superadmin, admin
 * Body: { ipal_id, sensor_type, sensor_location, sensor_description? }
 */
exports.createSensor = async (req, res) => {
  try {
    const { ipal_id, sensor_type, sensor_location, sensor_description } =
      req.body;
    const user = req.user;

    console.log(`🔧 Creating new sensor by ${user.email}`);

    // Validate required fields
    if (!ipal_id || !sensor_type || !sensor_location) {
      return res.status(400).json({
        success: false,
        message: "ipal_id, sensor_type, and sensor_location are required",
      });
    }

    // Validate sensor_type
    const validTypes = ["ph", "tds", "turbidity", "temperature"];
    if (!validTypes.includes(sensor_type.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid sensor_type. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    // Validate sensor_location
    const validLocations = ["inlet", "outlet"];
    if (!validLocations.includes(sensor_location.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid sensor_location. Must be one of: ${validLocations.join(", ")}`,
      });
    }

    // Verify IPAL exists
    const ipalSnapshot = await db
      .collection("ipals")
      .where("ipal_id", "==", parseInt(ipal_id))
      .limit(1)
      .get();

    if (ipalSnapshot.empty) {
      return res.status(404).json({
        success: false,
        message: `IPAL with ID ${ipal_id} not found`,
      });
    }

    const ipalData = ipalSnapshot.docs[0].data();

    // Check for duplicate sensor (same type + location + ipal)
    const duplicateCheck = await db
      .collection("sensors")
      .where("ipal_id", "==", parseInt(ipal_id))
      .where("sensor_type", "==", sensor_type.toLowerCase())
      .where("sensor_location", "==", sensor_location.toLowerCase())
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (!duplicateCheck.empty) {
      return res.status(409).json({
        success: false,
        message: `Active sensor of type '${sensor_type}' at '${sensor_location}' already exists for IPAL ${ipal_id}`,
      });
    }

    // Generate sensor document ID
    // Format: sensor-{ipal_id}-{type}-{location}-{sequence}
    // Includes ipal_id to prevent cross-IPAL ID collisions
    const existingSensors = await db
      .collection("sensors")
      .where("ipal_id", "==", parseInt(ipal_id))
      .where("sensor_type", "==", sensor_type.toLowerCase())
      .where("sensor_location", "==", sensor_location.toLowerCase())
      .get();

    const sequence = String(existingSensors.size + 1).padStart(3, "0");
    const sensorDocId = `sensor-${parseInt(ipal_id)}-${sensor_type.toLowerCase()}-${sensor_location.toLowerCase()}-${sequence}`;

    // Auto-generate description if not provided
    const autoDescription =
      sensor_description ||
      `Sensor ${sensor_type.toUpperCase()} ${sensor_location} ${ipalData.ipal_location}`;

    // Prepare sensor data
    const sensorData = {
      ipal_id: parseInt(ipal_id),
      sensor_type: sensor_type.toLowerCase(),
      sensor_location: sensor_location.toLowerCase(),
      sensor_description: autoDescription,
      status: "active",
      readings_count: 0,
      latest_reading: null,
      last_updated_at: null,
      last_calibration: null,
      added_at: admin.firestore.FieldValue.serverTimestamp(),
      added_by: user.email,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Save with custom document ID
    await db.collection("sensors").doc(sensorDocId).set(sensorData);

    // Invalidate cache
    invalidateCache([
      "/api/sensors",
      `/api/sensors/ipal/${ipal_id}`,
      "/api/dashboard",
    ]);
    cacheService.invalidatePattern("sensors:*");
    cacheService.invalidatePattern(`ipal:${ipal_id}*`);

    console.log(`✅ Sensor created: ${sensorDocId} for IPAL ${ipal_id}`);

    return res.status(201).json({
      success: true,
      message: "Sensor created successfully",
      data: {
        id: sensorDocId,
        ipal_id: parseInt(ipal_id),
        sensor_type: sensor_type.toLowerCase(),
        sensor_location: sensor_location.toLowerCase(),
        sensor_description: autoDescription,
        status: "active",
        added_by: user.email,
      },
    });
  } catch (error) {
    console.error("💥 Error creating sensor:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create sensor",
      error: error.message,
    });
  }
};

/**
 * DELETE SENSOR
 * Endpoint: DELETE /api/sensors/:id
 * Access: superadmin ONLY
 */
exports.deleteSensor = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    console.log(`🗑️ Deleting sensor ${id} by ${user.email}`);

    // Check if sensor exists
    const sensorDoc = await db.collection("sensors").doc(id).get();

    if (!sensorDoc.exists) {
      return res.status(404).json({
        success: false,
        message: `Sensor with ID ${id} not found`,
      });
    }

    const sensorData = sensorDoc.data();

    // Delete sensor document
    await db.collection("sensors").doc(id).delete();

    // Invalidate cache
    invalidateCache([
      "/api/sensors",
      `/api/sensors/${id}`,
      `/api/sensors/ipal/${sensorData.ipal_id}`,
      "/api/dashboard",
    ]);
    cacheService.invalidate(cacheService.KEYS.SENSOR(id));
    cacheService.invalidate(cacheService.KEYS.LATEST_READING(id));
    cacheService.invalidatePattern(`history:${id}:*`);
    cacheService.invalidatePattern("sensors:*");
    cacheService.invalidatePattern(`ipal:${sensorData.ipal_id}*`);

    console.log(`✅ Sensor ${id} deleted (was in IPAL ${sensorData.ipal_id})`);

    return res.status(200).json({
      success: true,
      message: `Sensor "${sensorData.sensor_description}" deleted successfully`,
      data: {
        deleted_sensor_id: id,
        sensor_type: sensorData.sensor_type,
        sensor_location: sensorData.sensor_location,
        ipal_id: sensorData.ipal_id,
      },
    });
  } catch (error) {
    console.error("💥 Error deleting sensor:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete sensor",
      error: error.message,
    });
  }
};

console.log("📦 sensorController (full CRUD) loaded");
