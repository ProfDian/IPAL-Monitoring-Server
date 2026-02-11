/**
 * ========================================
 * IPAL CONTROLLER
 * ========================================
 * Full CRUD operations for IPAL facilities
 * - GET: All users with auth
 * - CREATE/UPDATE: superadmin + admin
 * - DELETE: superadmin only
 */

const { admin, db } = require("../config/firebase-config");
const cacheService = require("../services/cacheService");
const { invalidateCache } = require("../middleware/cacheMiddleware");

/**
 * GET ALL IPALS
 * Endpoint: GET /api/ipals
 * Query params:
 *   - status: active|inactive|maintenance (optional)
 *   - limit: number (default: 50)
 */
exports.getAllIpals = async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;

    console.log("📊 Fetching all IPALs");

    // Cache key based on filters
    const cacheKey = `ipals:all:${status || "all"}`;

    const ipals = await cacheService.getCached(
      cacheKey,
      async () => {
        let query = db.collection("ipals").orderBy("ipal_id", "asc");

        // Note: Removed status filter to avoid composite index requirement
        // Filter will be applied in-memory instead
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

          // Apply status filter in-memory if provided
          if (status && data.status !== status) {
            return; // Skip this document
          }

          ipals.push({
            id: doc.id, // Firestore document ID
            ipal_id: data.ipal_id, // Your custom numeric ID
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
      600, // Cache for 10 minutes
    );

    console.log(`✅ Found ${ipals.length} IPALs`);

    return res.status(200).json({
      success: true,
      count: ipals.length,
      data: ipals,
    });
  } catch (error) {
    console.error("💥 Error fetching IPALs:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch IPALs",
      error: error.message,
    });
  }
};

/**
 * GET IPAL BY ID
 * Endpoint: GET /api/ipals/:ipal_id
 * Returns IPAL info + sensor count + latest reading
 */
exports.getIpalById = async (req, res) => {
  try {
    const { ipal_id } = req.params;

    console.log(`🔍 Fetching IPAL: ${ipal_id}`);

    const cacheKey = `ipal:${ipal_id}`;

    const result = await cacheService.getCached(
      cacheKey,
      async () => {
        // Query by ipal_id field (not document ID)
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

        // Get sensor count for this IPAL
        const sensorSnapshot = await db
          .collection("sensors")
          .where("ipal_id", "==", parseInt(ipal_id))
          .where("status", "==", "active")
          .count()
          .get();

        const sensorCount = sensorSnapshot.data().count;

        // Get latest reading for this IPAL
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
          // Additional computed fields
          sensor_count: sensorCount,
          latest_reading: latestReading,
        };
      },
      300, // Cache for 5 minutes
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: `IPAL with ID ${ipal_id} not found`,
      });
    }

    console.log(
      `✅ IPAL found: ${ipal_id} with ${result.sensor_count} sensors`,
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("💥 Error fetching IPAL:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch IPAL",
      error: error.message,
    });
  }
};

/**
 * GET IPAL STATISTICS
 * Endpoint: GET /api/ipals/:ipal_id/stats
 * Returns comprehensive statistics for specific IPAL
 */
exports.getIpalStats = async (req, res) => {
  try {
    const { ipal_id } = req.params;

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
          // Total sensors
          db
            .collection("sensors")
            .where("ipal_id", "==", parseInt(ipal_id))
            .count()
            .get()
            .then((snapshot) => snapshot.data().count),

          // Active sensors
          db
            .collection("sensors")
            .where("ipal_id", "==", parseInt(ipal_id))
            .where("status", "==", "active")
            .count()
            .get()
            .then((snapshot) => snapshot.data().count),

          // Inactive sensors
          db
            .collection("sensors")
            .where("ipal_id", "==", parseInt(ipal_id))
            .where("status", "==", "inactive")
            .count()
            .get()
            .then((snapshot) => snapshot.data().count),

          // Active alerts
          db
            .collection("alerts")
            .where("ipal_id", "==", parseInt(ipal_id))
            .where("status", "==", "active")
            .count()
            .get()
            .then((snapshot) => snapshot.data().count),

          // Critical alerts
          db
            .collection("alerts")
            .where("ipal_id", "==", parseInt(ipal_id))
            .where("status", "==", "active")
            .where("severity", "==", "critical")
            .count()
            .get()
            .then((snapshot) => snapshot.data().count),

          // Total readings
          db
            .collection("water_quality_readings")
            .where("ipal_id", "==", parseInt(ipal_id))
            .count()
            .get()
            .then((snapshot) => snapshot.data().count),

          // Readings today
          (async () => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const snapshot = await db
              .collection("water_quality_readings")
              .where("ipal_id", "==", parseInt(ipal_id))
              .where(
                "timestamp",
                ">=",
                admin.firestore.Timestamp.fromDate(today),
              )
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
      180, // Cache for 3 minutes (stats change more frequently)
    );

    console.log(`✅ Statistics fetched for IPAL ${ipal_id}`);

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("💥 Error fetching IPAL stats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch IPAL statistics",
      error: error.message,
    });
  }
};

// ========================================
// CREATE, UPDATE, DELETE IPAL
// ========================================

/**
 * CREATE IPAL
 * Endpoint: POST /api/ipals
 * Access: superadmin, admin
 * Body: { ipal_location, ipal_description, address?, capacity?, contact_person?, contact_phone?, coordinates?, operational_hours?, installation_date? }
 */
exports.createIpal = async (req, res) => {
  try {
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
    } = req.body;

    const user = req.user;

    console.log(`🏭 Creating new IPAL by ${user.email}`);

    // Validate required fields
    if (!ipal_location || !ipal_description) {
      return res.status(400).json({
        success: false,
        message: "ipal_location and ipal_description are required",
      });
    }

    // Auto-generate next ipal_id
    const existingIpals = await db
      .collection("ipals")
      .orderBy("ipal_id", "desc")
      .limit(1)
      .get();

    let nextIpalId = 1;
    if (!existingIpals.empty) {
      nextIpalId = existingIpals.docs[0].data().ipal_id + 1;
    }

    // Prepare IPAL data
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

    // Save to Firestore
    const docRef = await db.collection("ipals").add(ipalData);

    // Invalidate cache
    invalidateCache(["/api/ipals"]);
    cacheService.invalidatePattern("ipals:*");

    console.log(`✅ IPAL created: ${docRef.id} (ipal_id: ${nextIpalId})`);

    return res.status(201).json({
      success: true,
      message: "IPAL created successfully",
      data: {
        id: docRef.id,
        ipal_id: nextIpalId,
        ipal_location,
        ipal_description,
        status: "active",
        created_by: user.email,
      },
    });
  } catch (error) {
    console.error("💥 Error creating IPAL:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create IPAL",
      error: error.message,
    });
  }
};

/**
 * UPDATE IPAL
 * Endpoint: PUT /api/ipals/:ipal_id
 * Access: superadmin, admin
 * Body: { ipal_location?, ipal_description?, address?, capacity?, contact_person?, contact_phone?, coordinates?, operational_hours?, status? }
 */
exports.updateIpal = async (req, res) => {
  try {
    const { ipal_id } = req.params;
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
    } = req.body;

    const user = req.user;

    console.log(`✏️ Updating IPAL ${ipal_id} by ${user.email}`);

    // Find IPAL document by ipal_id field
    const snapshot = await db
      .collection("ipals")
      .where("ipal_id", "==", parseInt(ipal_id))
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        message: `IPAL with ID ${ipal_id} not found`,
      });
    }

    const docRef = snapshot.docs[0].ref;

    // Build update data (only include provided fields)
    const updateData = {
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_by: user.email,
    };

    if (ipal_location !== undefined) updateData.ipal_location = ipal_location;
    if (ipal_description !== undefined)
      updateData.ipal_description = ipal_description;
    if (address !== undefined) updateData.address = address;
    if (capacity !== undefined) updateData.capacity = capacity;
    if (contact_person !== undefined)
      updateData.contact_person = contact_person;
    if (contact_phone !== undefined) updateData.contact_phone = contact_phone;
    if (coordinates !== undefined) updateData.coordinates = coordinates;
    if (operational_hours !== undefined)
      updateData.operational_hours = operational_hours;
    if (status !== undefined) {
      const validStatuses = ["active", "inactive", "maintenance"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }
      updateData.status = status;
    }

    await docRef.update(updateData);

    // Invalidate cache
    invalidateCache(["/api/ipals", `/api/ipals/${ipal_id}`]);
    cacheService.invalidatePattern("ipals:*");
    cacheService.invalidate(`ipal:${ipal_id}`);

    // Get updated document
    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data();

    console.log(`✅ IPAL ${ipal_id} updated successfully`);

    return res.status(200).json({
      success: true,
      message: "IPAL updated successfully",
      data: {
        id: updatedDoc.id,
        ipal_id: updatedData.ipal_id,
        ipal_location: updatedData.ipal_location,
        ipal_description: updatedData.ipal_description,
        address: updatedData.address,
        capacity: updatedData.capacity,
        status: updatedData.status,
        updated_by: user.email,
      },
    });
  } catch (error) {
    console.error("💥 Error updating IPAL:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update IPAL",
      error: error.message,
    });
  }
};

/**
 * DELETE IPAL
 * Endpoint: DELETE /api/ipals/:ipal_id
 * Access: superadmin ONLY
 * WARNING: This will also deactivate all sensors associated with this IPAL
 */
exports.deleteIpal = async (req, res) => {
  try {
    const { ipal_id } = req.params;
    const user = req.user;

    console.log(`🗑️ Deleting IPAL ${ipal_id} by ${user.email}`);

    // Find IPAL document
    const snapshot = await db
      .collection("ipals")
      .where("ipal_id", "==", parseInt(ipal_id))
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        message: `IPAL with ID ${ipal_id} not found`,
      });
    }

    const ipalDoc = snapshot.docs[0];
    const ipalData = ipalDoc.data();

    // Check for associated sensors
    const sensorSnapshot = await db
      .collection("sensors")
      .where("ipal_id", "==", parseInt(ipal_id))
      .get();

    const sensorCount = sensorSnapshot.size;

    // Deactivate associated sensors (soft delete)
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

    // Delete IPAL document
    await ipalDoc.ref.delete();

    // Invalidate cache
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

    return res.status(200).json({
      success: true,
      message: `IPAL "${ipalData.ipal_location}" deleted successfully`,
      data: {
        deleted_ipal_id: parseInt(ipal_id),
        ipal_location: ipalData.ipal_location,
        sensors_deactivated: sensorCount,
      },
    });
  } catch (error) {
    console.error("💥 Error deleting IPAL:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete IPAL",
      error: error.message,
    });
  }
};

console.log("📦 ipalController (full CRUD) loaded");
