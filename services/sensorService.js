/**
 * ========================================
 * SENSOR SERVICE
 * ========================================
 * Business logic for sensor management
 * Extracted from sensorController for clean architecture
 */

const { admin, db } = require("../config/firebase-config");
const { invalidateCache } = require("../middleware/cacheMiddleware");
const cacheService = require("./cacheService");

// ========================================
// SENSOR READINGS
// ========================================

/**
 * Get water quality readings with filters
 * @param {object} params - { ipal_id, limit, order, start_date, end_date }
 * @returns {Promise<Array>} Readings
 */
async function getReadings({
  ipal_id,
  limit = 50,
  order = "desc",
  start_date,
  end_date,
}) {
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
    const endTimestamp = admin.firestore.Timestamp.fromDate(new Date(end_date));
    query = query.where("timestamp", "<=", endTimestamp);
  }

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

  console.log(`✅ Returning ${readings.length} readings (${sortOrder} order)`);

  return readings;
}

/**
 * Get latest reading for specific IPAL
 * @param {number|string} ipal_id
 * @returns {Promise<object>} Latest reading
 * @throws {Error} with status 404 if not found
 */
async function getLatestReading(ipal_id) {
  const snapshot = await db
    .collection("water_quality_readings")
    .where("ipal_id", "==", parseInt(ipal_id))
    .orderBy("timestamp", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) {
    const error = new Error(`No readings found for IPAL ${ipal_id}`);
    error.status = 404;
    throw error;
  }

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp?.toDate().toISOString(),
  };
}

// ========================================
// SENSOR MANAGEMENT
// ========================================

/**
 * Get all sensors with filters and computed online status
 * @param {object} params - { ipal_id, sensor_type, status, limit }
 * @returns {Promise<object>} { sensors, count, online_count, offline_count }
 */
async function getAllSensors({ ipal_id, sensor_type, status, limit = 50 }) {
  console.log("📊 Fetching sensors with filters:", {
    ipal_id,
    sensor_type,
    status,
  });

  let query = db.collection("sensors");

  if (ipal_id) {
    query = query.where("ipal_id", "==", parseInt(ipal_id));
  }

  if (sensor_type) {
    query = query.where("sensor_type", "==", sensor_type);
  }

  if (status) {
    query = query.where("status", "==", status);
  }

  query = query.orderBy("added_at", "desc").limit(parseInt(limit));

  const snapshot = await query.get();

  if (snapshot.empty) {
    return { sensors: [], count: 0, online_count: 0, offline_count: 0 };
  }

  const now = new Date();
  const sensors = [];

  console.log(`🕐 Current time: ${now.toISOString()}`);

  snapshot.forEach((doc) => {
    const data = doc.data();

    let online_status = "offline";
    let debugInfo = { sensorId: doc.id };

    const lastUpdateField =
      data.last_updated_at || data.latest_reading?.timestamp;

    if (lastUpdateField) {
      const lastUpdate = lastUpdateField.toDate
        ? lastUpdateField.toDate()
        : new Date(lastUpdateField);
      const minutesAgo = (now - lastUpdate) / 1000 / 60;

      debugInfo.lastUpdate = lastUpdate.toISOString();
      debugInfo.minutesAgo = minutesAgo.toFixed(2);

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
      online_status,
    };

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

  const onlineCount = sensors.filter(
    (s) => s.online_status === "online",
  ).length;
  console.log(
    `   ${onlineCount} online, ${sensors.length - onlineCount} offline`,
  );

  return {
    sensors,
    count: sensors.length,
    online_count: onlineCount,
    offline_count: sensors.length - onlineCount,
  };
}

/**
 * Get sensor by ID (cached)
 * @param {string} id
 * @returns {Promise<object>} Sensor data
 * @throws {Error} with status 404 if not found
 */
async function getSensorById(id) {
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
    600,
  );

  if (!sensor) {
    const error = new Error(`Sensor with ID ${id} not found`);
    error.status = 404;
    throw error;
  }

  console.log(`✅ Sensor found: ${id}`);
  return sensor;
}

/**
 * Update sensor with cache invalidation
 * @param {string} id
 * @param {object} data - { sensor_type, sensor_location, sensor_description, status }
 * @param {object} user - Requesting user
 * @returns {Promise<object>} Updated sensor
 * @throws {Error} with status 404 if not found
 */
async function updateSensor(id, data, user) {
  const { sensor_type, sensor_location, sensor_description, status } = data;

  console.log(`✏️ Updating sensor: ${id} by ${user.email}`);

  const sensorRef = db.collection("sensors").doc(id);
  const sensorDoc = await sensorRef.get();

  if (!sensorDoc.exists) {
    const error = new Error(`Sensor with ID ${id} not found`);
    error.status = 404;
    throw error;
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

  invalidateCache(["/api/sensors", `/api/sensors/${id}`, "/api/dashboard"]);
  cacheService.invalidate(cacheService.KEYS.SENSOR(id));
  cacheService.invalidate(cacheService.KEYS.LATEST_READING(id));
  cacheService.invalidatePattern(`history:${id}:*`);
  cacheService.invalidatePattern("sensors:*");

  console.log(`✅ Sensor updated: ${id} & cache invalidated`);

  const updatedDoc = await sensorRef.get();
  return {
    id: updatedDoc.id,
    ...updatedDoc.data(),
    added_at: updatedDoc.data().added_at?.toDate
      ? updatedDoc.data().added_at.toDate().toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Get sensor online/offline status
 * @param {string} id
 * @returns {Promise<object>} Status data
 * @throws {Error} with status 404 if not found
 */
async function getSensorStatus(id) {
  console.log(`🔍 Checking sensor status: ${id}`);

  const sensorDoc = await db.collection("sensors").doc(id).get();

  if (!sensorDoc.exists) {
    const error = new Error(`Sensor with ID ${id} not found`);
    error.status = 404;
    throw error;
  }

  const sensorData = sensorDoc.data();

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

  return {
    sensor_id: id,
    ipal_id: sensorData.ipal_id,
    sensor_type: sensorData.sensor_type,
    status: isOnline ? "online" : "offline",
    last_reading: lastReading,
  };
}

/**
 * Get all sensors for specific IPAL
 * @param {number|string} ipal_id
 * @returns {Promise<object>} { sensors, count }
 */
async function getSensorsByIpal(ipal_id) {
  console.log(`📊 Fetching sensors for IPAL: ${ipal_id}`);

  const snapshot = await db
    .collection("sensors")
    .where("ipal_id", "==", parseInt(ipal_id))
    .orderBy("added_at", "desc")
    .get();

  if (snapshot.empty) {
    return { sensors: [], count: 0 };
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
  return { sensors, count: sensors.length };
}

/**
 * Get latest reading for specific sensor (optimized with mapping field, cached)
 * @param {string} id - Sensor ID
 * @returns {Promise<object>} { sensor, latest_reading }
 * @throws {Error} with status 404 if not found
 */
async function getLatestReadingBySensor(id) {
  console.log(`🔍 Fetching latest reading for sensor: ${id}`);

  const cacheKey = cacheService.KEYS.LATEST_READING(id);

  const result = await cacheService.getCached(
    cacheKey,
    async () => {
      const sensorCacheKey = cacheService.KEYS.SENSOR(id);

      const sensorDoc = await cacheService.getCached(
        sensorCacheKey,
        async () => {
          const doc = await db.collection("sensors").doc(id).get();
          if (!doc.exists) return null;
          return { id: doc.id, ...doc.data() };
        },
        600,
      );

      if (!sensorDoc) {
        return null;
      }

      const sensorData = sensorDoc;

      const location = sensorData.sensor_location;
      const type = sensorData.sensor_type;
      const mappingField = `sensor_mapping.${location}_${type}`;

      console.log(`   📌 Using mapping field: ${mappingField}`);

      const snapshot = await db
        .collection("water_quality_readings")
        .where(mappingField, "==", id)
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();

      if (snapshot.empty) {
        return {
          sensor: sensorData,
          latest_reading: null,
        };
      }

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
  );

  if (!result) {
    const error = new Error(`Sensor with ID ${id} not found`);
    error.status = 404;
    throw error;
  }

  console.log(`✅ Latest reading found for sensor ${id}`);
  return result;
}

/**
 * Get sensor reading history (optimized, cached)
 * @param {string} id - Sensor ID
 * @param {object} params - { limit, start_date, end_date }
 * @returns {Promise<object>} { sensor, count, history }
 * @throws {Error} with status 404 if not found
 */
async function getSensorHistory(id, { limit = 100, start_date, end_date }) {
  const safeLimit = Math.min(parseInt(limit), 500);

  console.log(`📊 Fetching history for sensor: ${id} (limit: ${safeLimit})`);

  const cacheKey = cacheService.KEYS.SENSOR_HISTORY(id, safeLimit);

  const result = await cacheService.getCached(
    cacheKey,
    async () => {
      const sensorCacheKey = cacheService.KEYS.SENSOR(id);

      const sensorDoc = await cacheService.getCached(
        sensorCacheKey,
        async () => {
          const doc = await db.collection("sensors").doc(id).get();
          if (!doc.exists) return null;
          return { id: doc.id, ...doc.data() };
        },
        600,
      );

      if (!sensorDoc) {
        return null;
      }

      const sensorData = sensorDoc;
      const location = sensorData.sensor_location;
      const type = sensorData.sensor_type;
      const mappingField = `sensor_mapping.${location}_${type}`;

      console.log(`   📌 Using mapping field: ${mappingField}`);

      let query = db
        .collection("water_quality_readings")
        .where(mappingField, "==", id)
        .orderBy("timestamp", "desc")
        .limit(safeLimit);

      const snapshot = await query.get();

      let readings = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        const timestamp = data.timestamp?.toDate();

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
    180,
  );

  if (!result) {
    const error = new Error(`Sensor with ID ${id} not found`);
    error.status = 404;
    throw error;
  }

  console.log(`✅ Found ${result.count} historical readings`);
  return result;
}

// ========================================
// CREATE & DELETE SENSOR
// ========================================

/**
 * Create new sensor with auto-generated ID
 * @param {object} data - { ipal_id, sensor_type, sensor_location, sensor_description }
 * @param {object} user - Requesting user
 * @returns {Promise<object>} Created sensor
 * @throws {Error} with status 400/404/409
 */
async function createSensor(data, user) {
  const { ipal_id, sensor_type, sensor_location, sensor_description } = data;

  console.log(`🔧 Creating new sensor by ${user.email}`);

  if (!ipal_id || !sensor_type || !sensor_location) {
    const error = new Error(
      "ipal_id, sensor_type, and sensor_location are required",
    );
    error.status = 400;
    throw error;
  }

  const validTypes = ["ph", "tds", "temperature"];
  if (!validTypes.includes(sensor_type.toLowerCase())) {
    const error = new Error(
      `Invalid sensor_type. Must be one of: ${validTypes.join(", ")}`,
    );
    error.status = 400;
    throw error;
  }

  const validLocations = ["inlet", "outlet"];
  if (!validLocations.includes(sensor_location.toLowerCase())) {
    const error = new Error(
      `Invalid sensor_location. Must be one of: ${validLocations.join(", ")}`,
    );
    error.status = 400;
    throw error;
  }

  const ipalSnapshot = await db
    .collection("ipals")
    .where("ipal_id", "==", parseInt(ipal_id))
    .limit(1)
    .get();

  if (ipalSnapshot.empty) {
    const error = new Error(`IPAL with ID ${ipal_id} not found`);
    error.status = 404;
    throw error;
  }

  const ipalData = ipalSnapshot.docs[0].data();

  const duplicateCheck = await db
    .collection("sensors")
    .where("ipal_id", "==", parseInt(ipal_id))
    .where("sensor_type", "==", sensor_type.toLowerCase())
    .where("sensor_location", "==", sensor_location.toLowerCase())
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (!duplicateCheck.empty) {
    const error = new Error(
      `Active sensor of type '${sensor_type}' at '${sensor_location}' already exists for IPAL ${ipal_id}`,
    );
    error.status = 409;
    throw error;
  }

  const existingSensors = await db
    .collection("sensors")
    .where("ipal_id", "==", parseInt(ipal_id))
    .where("sensor_type", "==", sensor_type.toLowerCase())
    .where("sensor_location", "==", sensor_location.toLowerCase())
    .get();

  const sequence = String(existingSensors.size + 1).padStart(3, "0");
  const sensorDocId = `sensor-${parseInt(ipal_id)}-${sensor_type.toLowerCase()}-${sensor_location.toLowerCase()}-${sequence}`;

  const autoDescription =
    sensor_description ||
    `Sensor ${sensor_type.toUpperCase()} ${sensor_location} ${ipalData.ipal_location}`;

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

  await db.collection("sensors").doc(sensorDocId).set(sensorData);

  invalidateCache([
    "/api/sensors",
    `/api/sensors/ipal/${ipal_id}`,
    "/api/dashboard",
  ]);
  cacheService.invalidatePattern("sensors:*");
  cacheService.invalidatePattern(`ipal:${ipal_id}*`);

  console.log(`✅ Sensor created: ${sensorDocId} for IPAL ${ipal_id}`);

  return {
    id: sensorDocId,
    ipal_id: parseInt(ipal_id),
    sensor_type: sensor_type.toLowerCase(),
    sensor_location: sensor_location.toLowerCase(),
    sensor_description: autoDescription,
    status: "active",
    added_by: user.email,
  };
}

/**
 * Delete sensor (SuperAdmin only)
 * @param {string} id - Sensor ID
 * @param {object} user - Requesting user
 * @returns {Promise<object>} Deletion result
 * @throws {Error} with status 404 if not found
 */
async function deleteSensor(id, user) {
  console.log(`🗑️ Deleting sensor ${id} by ${user.email}`);

  const sensorDoc = await db.collection("sensors").doc(id).get();

  if (!sensorDoc.exists) {
    const error = new Error(`Sensor with ID ${id} not found`);
    error.status = 404;
    throw error;
  }

  const sensorData = sensorDoc.data();

  await db.collection("sensors").doc(id).delete();

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

  return {
    deleted_sensor_id: id,
    sensor_type: sensorData.sensor_type,
    sensor_location: sensorData.sensor_location,
    sensor_description: sensorData.sensor_description,
    ipal_id: sensorData.ipal_id,
  };
}

module.exports = {
  getReadings,
  getLatestReading,
  getAllSensors,
  getSensorById,
  updateSensor,
  getSensorStatus,
  getSensorsByIpal,
  getLatestReadingBySensor,
  getSensorHistory,
  createSensor,
  deleteSensor,
};

console.log("📦 sensorService loaded");
