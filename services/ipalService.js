/**
 * ========================================
 * IPAL SERVICE
 * ========================================
 * Business logic for IPAL facility operations
 * Extracted from ipalController for clean architecture
 */

const { admin, db } = require("../config/firebase-config");
const cacheService = require("./cacheService");
const { invalidateCache } = require("../middleware/cacheMiddleware");

/**
 * Get all IPAL facilities
 * @param {object} params - { status, limit }
 * @returns {Promise<Array>} List of IPALs
 */
async function getAllIpals({ status, limit = 50 }) {
  console.log("📊 Fetching all IPALs");

  const cacheKey = `ipals:all:${status || "all"}`;

  const ipals = await cacheService.getCached(
    cacheKey,
    async () => {
      let query = db.collection("ipals").orderBy("ipal_id", "asc");

      if (limit) {
        query = query.limit(parseInt(limit));
      }

      const snapshot = await query.get();

      if (snapshot.empty) {
        return [];
      }

      const ipals = [];
      snapshot.forEach((doc) => {
        const data = doc.data();

        if (status && data.status !== status) {
          return;
        }

        ipals.push({
          id: doc.id,
          ipal_id: data.ipal_id,
          ipal_location: data.ipal_location,
          ipal_description: data.ipal_description,
          address: data.address || null,
          coordinates: data.coordinates || null,
          capacity: data.capacity || null,
          status: data.status || "active",
          contact_person: data.contact_person || null,
          contact_phone: data.contact_phone || null,
          created_at: data.created_at?.toDate
            ? data.created_at.toDate().toISOString()
            : null,
          created_by: data.created_by || null,
        });
      });

      return ipals;
    },
    600,
  );

  console.log(`✅ Found ${ipals.length} IPALs`);
  return ipals;
}

/**
 * Get IPAL by ID with sensor count and latest reading
 * @param {number|string} ipal_id
 * @returns {Promise<object>} IPAL data
 * @throws {Error} with status 404 if not found
 */
async function getIpalById(ipal_id) {
  console.log(`🔍 Fetching IPAL: ${ipal_id}`);

  const cacheKey = `ipal:${ipal_id}`;

  const result = await cacheService.getCached(
    cacheKey,
    async () => {
      const snapshot = await db
        .collection("ipals")
        .where("ipal_id", "==", parseInt(ipal_id))
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      const data = doc.data();

      const sensorSnapshot = await db
        .collection("sensors")
        .where("ipal_id", "==", parseInt(ipal_id))
        .where("status", "==", "active")
        .count()
        .get();

      const sensorCount = sensorSnapshot.data().count;

      const readingSnapshot = await db
        .collection("water_quality_readings")
        .where("ipal_id", "==", parseInt(ipal_id))
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();

      let latestReading = null;
      if (!readingSnapshot.empty) {
        const readingData = readingSnapshot.docs[0].data();
        latestReading = {
          timestamp: readingData.timestamp?.toDate
            ? readingData.timestamp.toDate().toISOString()
            : null,
          quality_score: readingData.fuzzy_analysis?.quality_score || null,
          status: readingData.fuzzy_analysis?.status || null,
        };
      }

      return {
        id: doc.id,
        ipal_id: data.ipal_id,
        ipal_location: data.ipal_location,
        ipal_description: data.ipal_description,
        address: data.address || null,
        coordinates: data.coordinates || null,
        capacity: data.capacity || null,
        status: data.status || "active",
        contact_person: data.contact_person || null,
        contact_phone: data.contact_phone || null,
        created_at: data.created_at?.toDate
          ? data.created_at.toDate().toISOString()
          : null,
        created_by: data.created_by || null,
        sensor_count: sensorCount,
        latest_reading: latestReading,
      };
    },
    300,
  );

  if (!result) {
    const error = new Error(`IPAL with ID ${ipal_id} not found`);
    error.status = 404;
    throw error;
  }

  console.log(`✅ IPAL found: ${ipal_id} with ${result.sensor_count} sensors`);
  return result;
}

/**
 * Get IPAL statistics
 * @param {number|string} ipal_id
 * @returns {Promise<object>} Statistics
 */
async function getIpalStats(ipal_id) {
  console.log(`📊 Fetching statistics for IPAL: ${ipal_id}`);

  const cacheKey = `ipal:${ipal_id}:stats`;

  const stats = await cacheService.getCached(
    cacheKey,
    async () => {
      const [
        totalSensors,
        activeSensors,
        inactiveSensors,
        activeAlerts,
        criticalAlerts,
        totalReadings,
        readingsToday,
      ] = await Promise.all([
        db
          .collection("sensors")
          .where("ipal_id", "==", parseInt(ipal_id))
          .count()
          .get()
          .then((snapshot) => snapshot.data().count),
        db
          .collection("sensors")
          .where("ipal_id", "==", parseInt(ipal_id))
          .where("status", "==", "active")
          .count()
          .get()
          .then((snapshot) => snapshot.data().count),
        db
          .collection("sensors")
          .where("ipal_id", "==", parseInt(ipal_id))
          .where("status", "==", "inactive")
          .count()
          .get()
          .then((snapshot) => snapshot.data().count),
        db
          .collection("alerts")
          .where("ipal_id", "==", parseInt(ipal_id))
          .where("status", "==", "active")
          .count()
          .get()
          .then((snapshot) => snapshot.data().count),
        db
          .collection("alerts")
          .where("ipal_id", "==", parseInt(ipal_id))
          .where("status", "==", "active")
          .where("severity", "==", "critical")
          .count()
          .get()
          .then((snapshot) => snapshot.data().count),
        db
          .collection("water_quality_readings")
          .where("ipal_id", "==", parseInt(ipal_id))
          .count()
          .get()
          .then((snapshot) => snapshot.data().count),
        (async () => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const snapshot = await db
            .collection("water_quality_readings")
            .where("ipal_id", "==", parseInt(ipal_id))
            .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(today))
            .count()
            .get();
          return snapshot.data().count;
        })(),
      ]);

      return {
        ipal_id: parseInt(ipal_id),
        sensors: {
          total: totalSensors,
          active: activeSensors,
          inactive: inactiveSensors,
        },
        alerts: {
          active: activeAlerts,
          critical: criticalAlerts,
        },
        readings: {
          total: totalReadings,
          today: readingsToday,
        },
      };
    },
    180,
  );

  console.log(`✅ Statistics fetched for IPAL ${ipal_id}`);
  return stats;
}

/**
 * Create new IPAL
 * @param {object} data - IPAL data
 * @param {object} user - Requesting user
 * @returns {Promise<object>} Created IPAL
 * @throws {Error} with status 400 for validation errors
 */
async function createIpal(data, user) {
  const {
    ipal_location,
    ipal_description,
    address,
    capacity,
    contact_person,
    contact_phone,
    coordinates,
    operational_hours,
    installation_date,
  } = data;

  console.log(`🏭 Creating new IPAL by ${user.email}`);

  if (!ipal_location || !ipal_description) {
    const error = new Error("ipal_location and ipal_description are required");
    error.status = 400;
    throw error;
  }

  const existingIpals = await db
    .collection("ipals")
    .orderBy("ipal_id", "desc")
    .limit(1)
    .get();

  let nextIpalId = 1;
  if (!existingIpals.empty) {
    nextIpalId = existingIpals.docs[0].data().ipal_id + 1;
  }

  const ipalData = {
    ipal_id: nextIpalId,
    ipal_location,
    ipal_description,
    address: address || null,
    capacity: capacity || null,
    contact_person: contact_person || null,
    contact_phone: contact_phone || null,
    coordinates: coordinates || null,
    operational_hours: operational_hours || "24/7",
    installation_date: installation_date
      ? admin.firestore.Timestamp.fromDate(new Date(installation_date))
      : null,
    status: "active",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    created_by: user.email,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  const docRef = await db.collection("ipals").add(ipalData);

  invalidateCache(["/api/ipals"]);
  cacheService.invalidatePattern("ipals:*");

  console.log(`✅ IPAL created: ${docRef.id} (ipal_id: ${nextIpalId})`);

  return {
    id: docRef.id,
    ipal_id: nextIpalId,
    ipal_location,
    ipal_description,
    status: "active",
    created_by: user.email,
  };
}

/**
 * Update IPAL
 * @param {number|string} ipal_id
 * @param {object} data - Fields to update
 * @param {object} user - Requesting user
 * @returns {Promise<object>} Updated IPAL
 * @throws {Error} with status 400/404
 */
async function updateIpal(ipal_id, data, user) {
  const {
    ipal_location,
    ipal_description,
    address,
    capacity,
    contact_person,
    contact_phone,
    coordinates,
    operational_hours,
    status,
  } = data;

  console.log(`✏️ Updating IPAL ${ipal_id} by ${user.email}`);

  const snapshot = await db
    .collection("ipals")
    .where("ipal_id", "==", parseInt(ipal_id))
    .limit(1)
    .get();

  if (snapshot.empty) {
    const error = new Error(`IPAL with ID ${ipal_id} not found`);
    error.status = 404;
    throw error;
  }

  const docRef = snapshot.docs[0].ref;

  const updateData = {
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_by: user.email,
  };

  if (ipal_location !== undefined) updateData.ipal_location = ipal_location;
  if (ipal_description !== undefined)
    updateData.ipal_description = ipal_description;
  if (address !== undefined) updateData.address = address;
  if (capacity !== undefined) updateData.capacity = capacity;
  if (contact_person !== undefined) updateData.contact_person = contact_person;
  if (contact_phone !== undefined) updateData.contact_phone = contact_phone;
  if (coordinates !== undefined) updateData.coordinates = coordinates;
  if (operational_hours !== undefined)
    updateData.operational_hours = operational_hours;
  if (status !== undefined) {
    const validStatuses = ["active", "inactive", "maintenance"];
    if (!validStatuses.includes(status)) {
      const error = new Error(
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      );
      error.status = 400;
      throw error;
    }
    updateData.status = status;
  }

  await docRef.update(updateData);

  invalidateCache(["/api/ipals", `/api/ipals/${ipal_id}`]);
  cacheService.invalidatePattern("ipals:*");
  cacheService.invalidate(`ipal:${ipal_id}`);

  const updatedDoc = await docRef.get();
  const updatedData = updatedDoc.data();

  console.log(`✅ IPAL ${ipal_id} updated successfully`);

  return {
    id: updatedDoc.id,
    ipal_id: updatedData.ipal_id,
    ipal_location: updatedData.ipal_location,
    ipal_description: updatedData.ipal_description,
    address: updatedData.address,
    capacity: updatedData.capacity,
    status: updatedData.status,
    updated_by: user.email,
  };
}

/**
 * Delete IPAL and deactivate associated sensors
 * @param {number|string} ipal_id
 * @param {object} user - Requesting user
 * @returns {Promise<object>} Deletion result
 * @throws {Error} with status 404 if not found
 */
async function deleteIpal(ipal_id, user) {
  console.log(`🗑️ Deleting IPAL ${ipal_id} by ${user.email}`);

  const snapshot = await db
    .collection("ipals")
    .where("ipal_id", "==", parseInt(ipal_id))
    .limit(1)
    .get();

  if (snapshot.empty) {
    const error = new Error(`IPAL with ID ${ipal_id} not found`);
    error.status = 404;
    throw error;
  }

  const ipalDoc = snapshot.docs[0];
  const ipalData = ipalDoc.data();

  const sensorSnapshot = await db
    .collection("sensors")
    .where("ipal_id", "==", parseInt(ipal_id))
    .get();

  const sensorCount = sensorSnapshot.size;

  if (sensorCount > 0) {
    const batch = db.batch();
    sensorSnapshot.forEach((sensorDoc) => {
      batch.update(sensorDoc.ref, {
        status: "inactive",
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_by: user.email,
        deactivated_reason: `IPAL ${ipal_id} deleted`,
      });
    });
    await batch.commit();
    console.log(`⚠️ Deactivated ${sensorCount} sensors from IPAL ${ipal_id}`);
  }

  await ipalDoc.ref.delete();

  invalidateCache([
    "/api/ipals",
    `/api/ipals/${ipal_id}`,
    "/api/sensors",
    "/api/dashboard",
  ]);
  cacheService.invalidatePattern("ipals:*");
  cacheService.invalidatePattern("sensors:*");
  cacheService.invalidate(`ipal:${ipal_id}`);

  console.log(
    `✅ IPAL ${ipal_id} deleted (${sensorCount} sensors deactivated)`,
  );

  return {
    deleted_ipal_id: parseInt(ipal_id),
    ipal_location: ipalData.ipal_location,
    sensors_deactivated: sensorCount,
  };
}

module.exports = {
  getAllIpals,
  getIpalById,
  getIpalStats,
  createIpal,
  updateIpal,
  deleteIpal,
};

console.log("📦 ipalService loaded");
