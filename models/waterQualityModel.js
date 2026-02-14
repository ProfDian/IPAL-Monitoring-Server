/**
 * ========================================
 * WATER QUALITY MODEL
 * ========================================
 * Handles Firestore operations for:
 * - readings_buffer (temporary storage)
 * - water_quality_readings (final data)
 *
 * Part of buffer-merge system for ESP32 inlet/outlet data
 */

const { db } = require("../config/firebase-config");
const admin = require("firebase-admin");

/**
 * ========================================
 * BUFFER OPERATIONS
 * ========================================
 */

/**
 * Save reading to temporary buffer
 * Used when ESP32 sends data (inlet or outlet)
 */
async function saveToBuffer(data) {
  try {
    const {
      ipal_id,
      location,
      device_id,
      data: readingData,
      sensor_mapping,
    } = data;

    // Prepare buffer document
    const bufferDoc = {
      ipal_id,
      location, // "inlet" atau "outlet"
      device_id,
      data: readingData, // { ph, tds, temperature }
      sensor_mapping: sensor_mapping || {},
      is_merged: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000), // +5 menit
    };

    // Save to Firestore
    const docRef = await db.collection("readings_buffer").add(bufferDoc);

    console.log(`✅ Buffer saved: ${docRef.id} (${location})`);

    return {
      success: true,
      buffer_id: docRef.id,
      location,
    };
  } catch (error) {
    console.error("❌ Error saving to buffer:", error);
    throw error;
  }
}

/**
 * Get unmerged readings from buffer within time window
 * Used to check if we have a complete pair (inlet + outlet)
 */
async function getUnmergedReadings(ipalId, timeWindowMinutes = 5) {
  try {
    const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

    // Query buffer for unmerged readings
    const snapshot = await db
      .collection("readings_buffer")
      .where("ipal_id", "==", ipalId)
      .where("is_merged", "==", false)
      .where("timestamp", ">", cutoffTime)
      .get();

    if (snapshot.empty) {
      console.log("⏳ No unmerged readings in buffer");
      return [];
    }

    // Convert to array of objects
    const readings = [];
    snapshot.forEach((doc) => {
      readings.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    console.log(`🔍 Found ${readings.length} unmerged reading(s) in buffer`);

    return readings;
  } catch (error) {
    console.error("❌ Error getting unmerged readings:", error);
    throw error;
  }
}

/**
 * Mark buffer documents as merged
 * Called after successful merge to water_quality_readings
 */
async function markBufferAsMerged(bufferIds) {
  try {
    if (!Array.isArray(bufferIds) || bufferIds.length === 0) {
      throw new Error("bufferIds must be a non-empty array");
    }

    // Use batch write for atomic update
    const batch = db.batch();

    bufferIds.forEach((bufferId) => {
      const docRef = db.collection("readings_buffer").doc(bufferId);
      batch.update(docRef, {
        is_merged: true,
        merged_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    console.log(`✅ Marked ${bufferIds.length} buffer document(s) as merged`);

    return { success: true, count: bufferIds.length };
  } catch (error) {
    console.error("❌ Error marking buffer as merged:", error);
    throw error;
  }
}

/**
 * ========================================
 * FINAL READINGS OPERATIONS
 * ========================================
 */

/**
 * Save complete reading (merged inlet + outlet) to final collection
 * Includes fuzzy_analysis if provided
 */
async function saveToFinalReadings(data) {
  try {
    const {
      ipal_id,
      inlet,
      outlet,
      device_ids,
      sensor_mapping,
      fuzzy_analysis,
      timestamp,
    } = data;

    // Prepare final document
    const readingDoc = {
      ipal_id,
      inlet,
      outlet,
      device_ids: device_ids || {},
      sensor_mapping: sensor_mapping || {},
      timestamp: timestamp || admin.firestore.FieldValue.serverTimestamp(),
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Add fuzzy_analysis if provided
    if (fuzzy_analysis) {
      readingDoc.fuzzy_analysis = {
        ...fuzzy_analysis,
        analyzed_at: admin.firestore.FieldValue.serverTimestamp(),
      };
    }

    // Save to Firestore
    const docRef = await db
      .collection("water_quality_readings")
      .add(readingDoc);

    console.log(`✅ Final reading saved: ${docRef.id}`);
    console.log(`   Quality Score: ${fuzzy_analysis?.quality_score || "N/A"}`);
    console.log(`   Status: ${fuzzy_analysis?.status || "N/A"}`);

    return docRef.id;
  } catch (error) {
    console.error("❌ Error saving final reading:", error);
    throw error;
  }
}

/**
 * Update existing reading with fuzzy analysis results
 * Used if fuzzy is run separately after initial save
 */
async function updateWithFuzzyAnalysis(readingId, fuzzyAnalysis) {
  try {
    const docRef = db.collection("water_quality_readings").doc(readingId);

    await docRef.update({
      fuzzy_analysis: {
        ...fuzzyAnalysis,
        analyzed_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Updated reading ${readingId} with fuzzy analysis`);

    return { success: true };
  } catch (error) {
    console.error("❌ Error updating fuzzy analysis:", error);
    throw error;
  }
}

/**
 * Get latest readings (for dashboard/frontend)
 */
async function getLatestReadings(limit = 50, ipalId = null) {
  try {
    let query = db
      .collection("water_quality_readings")
      .orderBy("timestamp", "desc")
      .limit(limit);

    // Filter by IPAL if specified
    if (ipalId !== null) {
      query = query.where("ipal_id", "==", ipalId);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      console.log("📭 No readings found");
      return [];
    }

    const readings = [];
    snapshot.forEach((doc) => {
      readings.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    console.log(`📊 Retrieved ${readings.length} reading(s)`);

    return readings;
  } catch (error) {
    console.error("❌ Error getting latest readings:", error);
    throw error;
  }
}

/**
 * Get reading by ID
 */
async function getReadingById(readingId) {
  try {
    const docRef = db.collection("water_quality_readings").doc(readingId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    return {
      id: doc.id,
      ...doc.data(),
    };
  } catch (error) {
    console.error("❌ Error getting reading by ID:", error);
    throw error;
  }
}

/**
 * ========================================
 * CLEANUP OPERATIONS
 * ========================================
 */

/**
 * Clean up expired buffer documents
 * Called manually or via scheduled job
 */
async function cleanupExpiredBuffer() {
  try {
    const now = new Date();

    // Query expired documents
    const snapshot = await db
      .collection("readings_buffer")
      .where("expires_at", "<", now)
      .get();

    if (snapshot.empty) {
      console.log("✨ No expired buffer documents to clean");
      return { deleted: 0 };
    }

    // Delete in batch
    const batch = db.batch();
    let count = 0;

    snapshot.forEach((doc) => {
      batch.delete(doc.ref);
      count++;
    });

    await batch.commit();

    console.log(`🗑️ Cleaned up ${count} expired buffer document(s)`);

    return { deleted: count };
  } catch (error) {
    console.error("❌ Error cleaning expired buffer:", error);
    throw error;
  }
}

/**
 * Get buffer status (for monitoring/debugging)
 */
async function getBufferStatus(ipalId = null) {
  try {
    let query = db.collection("readings_buffer");

    if (ipalId !== null) {
      query = query.where("ipal_id", "==", ipalId);
    }

    const snapshot = await query.get();

    const status = {
      total: snapshot.size,
      unmerged: 0,
      merged: 0,
      inlet: 0,
      outlet: 0,
      documents: [],
    };

    snapshot.forEach((doc) => {
      const data = doc.data();

      // Count by merge status
      if (data.is_merged) {
        status.merged++;
      } else {
        status.unmerged++;
      }

      // Count by location
      if (data.location === "inlet") {
        status.inlet++;
      } else if (data.location === "outlet") {
        status.outlet++;
      }

      // Add to documents array
      status.documents.push({
        id: doc.id,
        ...data,
      });
    });

    console.log("📋 Buffer Status:", {
      total: status.total,
      unmerged: status.unmerged,
      merged: status.merged,
    });

    return status;
  } catch (error) {
    console.error("❌ Error getting buffer status:", error);
    throw error;
  }
}

/**
 * ========================================
 * EXPORTS
 * ========================================
 */

module.exports = {
  // Buffer operations
  saveToBuffer,
  getUnmergedReadings,
  markBufferAsMerged,
  cleanupExpiredBuffer,
  getBufferStatus,

  // Final readings operations
  saveToFinalReadings,
  updateWithFuzzyAnalysis,
  getLatestReadings,
  getReadingById,
};

console.log("📦 waterQualityModel loaded");
