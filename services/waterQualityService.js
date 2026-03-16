/**
 * ========================================
 * WATER QUALITY SERVICE (ORCHESTRATOR)
 * ========================================
 * Main service that coordinates:
 * - Buffer management
 * - Inlet/Outlet merge logic
 * - Fuzzy logic processing
 * - Alert generation
 * - Notifications
 *
 * This is the "brain" of the water quality monitoring system
 */

// ⚡ Lazy load heavy dependencies to reduce cold start
let waterQualityModel;
let fuzzyService;
let validationService;
let alertModel;
let notificationService;
let sensorModel;

const getWaterQualityModel = () => {
  if (!waterQualityModel) {
    waterQualityModel = require("../models/waterQualityModel");
  }
  return waterQualityModel;
};

const getFuzzyService = () => {
  if (!fuzzyService) {
    console.log("⚡ Loading fuzzyService...");
    fuzzyService = require("./fuzzyService");
  }
  return fuzzyService;
};

const getValidationService = () => {
  if (!validationService) {
    validationService = require("./validationService");
  }
  return validationService;
};

const getAlertModel = () => {
  if (!alertModel) {
    alertModel = require("../models/alertModel");
  }
  return alertModel;
};

const getNotificationService = () => {
  if (!notificationService) {
    notificationService = require("./notificationService");
  }
  return notificationService;
};

const getSensorModel = () => {
  if (!sensorModel) {
    sensorModel = require("../models/sensorModel");
  }
  return sensorModel;
};

/**
 * ========================================
 * CONFIGURATION
 * ========================================
 */

const CONFIG = {
  MERGE_TIME_WINDOW: 5, // Minutes
  MAX_MERGE_ATTEMPTS: 3, // Max retry attempts
  ALERT_INCOMPLETE_AFTER: 10, // Minutes before alerting admin
};

/**
 * ========================================
 * MAIN ENTRY POINT
 * ========================================
 */

/**
 * Submit reading from ESP32
 * Entry point for all incoming sensor data
 */
async function submitReading(data) {
  try {
    const {
      ipal_id,
      location,
      device_id,
      data: readingData,
      sensor_mapping,
    } = data;

    console.log("📥 Submitting reading...");
    console.log(`   IPAL: ${ipal_id}`);
    console.log(`   Location: ${location}`);
    console.log(`   Device: ${device_id}`);

    // Step 1: Validate input data
    console.log("🔍 Validating input...");
    const inputValidation = validateReadingInput(data);
    if (!inputValidation.valid) {
      throw new Error(
        `Validation failed: ${inputValidation.errors.join(", ")}`,
      );
    }

    // Step 2: Validate sensor data ranges
    const validationSvc = getValidationService();
    if (validationSvc && validationSvc.validateReadingData) {
      const dataValidation = validationSvc.validateReadingData(readingData);
      if (!dataValidation.valid) {
        console.warn("⚠️ Data validation warnings:", dataValidation.warnings);
      }
    }

    // Step 3: Save to buffer
    console.log("💾 Saving to buffer...");
    const bufferResult = await getWaterQualityModel().saveToBuffer({
      ipal_id,
      location,
      device_id,
      data: readingData,
      sensor_mapping,
    });

    console.log(`✅ Buffer saved: ${bufferResult.buffer_id}`);

    // Step 4: Try to merge with pair
    console.log("🔄 Attempting to merge...");
    const mergeResult = await tryMerge(ipal_id);

    if (mergeResult) {
      // Merge successful!
      console.log("🎉 Merge successful! Processing complete reading...");
      return {
        success: true,
        merged: true,
        buffer_id: bufferResult.buffer_id,
        reading_id: mergeResult.reading_id,
        fuzzy_analysis: mergeResult.fuzzy_analysis,
        message: "Data merged and processed successfully",
      };
    } else {
      // Not merged yet, waiting for pair
      console.log("⏳ Waiting for pair data...");

      return {
        success: true,
        merged: false,
        buffer_id: bufferResult.buffer_id,
        waiting_for: location === "inlet" ? "outlet" : "inlet",
        message: `Data buffered, waiting for ${
          location === "inlet" ? "outlet" : "inlet"
        } pair`,
      };
    }
  } catch (error) {
    console.error("❌ Error in submitReading:", error);
    throw error;
  }
}

/**
 * ========================================
 * MERGE LOGIC
 * ========================================
 */

/**
 * Try to merge inlet and outlet data
 * Returns merged result if successful, null if waiting
 */
async function tryMerge(ipalId) {
  try {
    // Step 1: Get unmerged readings from buffer
    const unmergedReadings = await getWaterQualityModel().getUnmergedReadings(
      ipalId,
      CONFIG.MERGE_TIME_WINDOW,
    );

    if (unmergedReadings.length === 0) {
      console.log("⏳ No unmerged readings found");
      return null;
    }

    // Step 2: Separate inlet and outlet
    const inletReadings = unmergedReadings.filter(
      (r) => r.location === "inlet",
    );
    const outletReadings = unmergedReadings.filter(
      (r) => r.location === "outlet",
    );

    console.log(
      `   Found: ${inletReadings.length} inlet, ${outletReadings.length} outlet`,
    );

    // Step 3: Check if we have complete pair
    if (inletReadings.length === 0 || outletReadings.length === 0) {
      console.log("⏳ Incomplete pair, waiting...");
      return null;
    }

    // Step 4: Select latest from each location
    const latestInlet = inletReadings.sort(
      (a, b) => b.timestamp?.toMillis() - a.timestamp?.toMillis(),
    )[0];

    const latestOutlet = outletReadings.sort(
      (a, b) => b.timestamp?.toMillis() - a.timestamp?.toMillis(),
    )[0];

    console.log("✅ Complete pair found!");
    console.log(`   Inlet ID: ${latestInlet.id}`);
    console.log(`   Outlet ID: ${latestOutlet.id}`);

    // Step 5: Merge data
    const mergedData = {
      ipal_id: ipalId,
      inlet: latestInlet.data,
      outlet: latestOutlet.data,
      device_ids: {
        inlet: latestInlet.device_id,
        outlet: latestOutlet.device_id,
      },
      sensor_mapping: {
        ...latestInlet.sensor_mapping,
        ...latestOutlet.sensor_mapping,
      },
      timestamp: latestOutlet.timestamp || new Date(), // Use outlet timestamp (latest)
      buffer_ids: [latestInlet.id, latestOutlet.id],
    };

    // Step 6: Process complete reading (THE ORCHESTRATOR!)
    const result = await processCompleteReading(mergedData);

    return result;
  } catch (error) {
    console.error("❌ Error in tryMerge:", error);
    throw error;
  }
}

/**
 * ========================================
 * COMPLETE READING PROCESSOR (ORCHESTRATOR!)
 * ========================================
 * This is where the magic happens!
 */

/**
 * Process complete reading (inlet + outlet merged)
 * Orchestrates: fuzzy logic → save → alerts → notifications
 */
async function processCompleteReading(mergedData) {
  try {
    const { ipal_id, inlet, outlet, device_ids, sensor_mapping, buffer_ids } =
      mergedData;

    console.log("🎯 Processing complete reading...");
    console.log("   Inlet:", inlet);
    console.log("   Outlet:", outlet);

    // ========================================
    // STEP 1: RUN FUZZY LOGIC ANALYSIS
    // ========================================
    console.log("🧠 Running fuzzy logic analysis...");
    const fuzzyResult = await getFuzzyService().analyze(inlet, outlet, ipal_id);

    console.log("✅ Fuzzy analysis complete:");
    console.log(`   Score: ${fuzzyResult.quality_score}/100`);
    console.log(`   Status: ${fuzzyResult.status}`);
    console.log(`   Violations: ${fuzzyResult.violations.length}`);

    // ========================================
    // STEP 2: PREPARE COMPLETE DATA
    // ========================================
    const completeData = {
      ipal_id,
      inlet,
      outlet,
      device_ids,
      sensor_mapping,
      timestamp: mergedData.timestamp,
      fuzzy_analysis: {
        quality_score: fuzzyResult.quality_score,
        status: fuzzyResult.status,
        alert_count: fuzzyResult.alert_count,
        violations: fuzzyResult.violations,
        recommendations: fuzzyResult.recommendations,
        analysis_method: fuzzyResult.analysis_method,
      },
    };

    // ========================================
    // STEP 3: SAVE TO FINAL COLLECTION
    // ========================================
    console.log("💾 Saving to water_quality_readings...");
    const readingId =
      await getWaterQualityModel().saveToFinalReadings(completeData);

    console.log(`✅ Reading saved: ${readingId}`);

    // ========================================
    // STEP 4: CREATE ALERTS (if violations exist)
    // ========================================
    let alertsCreated = [];

    const thresholdViolations = Array.isArray(fuzzyResult.violations)
      ? fuzzyResult.violations
      : [];
    const sensorFaultViolations = Array.isArray(
      fuzzyResult.sensor_fault_violations,
    )
      ? fuzzyResult.sensor_fault_violations
      : [];
    const allAlertViolations = [
      ...thresholdViolations,
      ...sensorFaultViolations,
    ];

    if (allAlertViolations.length > 0) {
      console.log("🚨 Creating alerts...");
      alertsCreated = await createAlertsForViolations(
        readingId,
        ipal_id,
        allAlertViolations,
      );
      console.log(`✅ Created ${alertsCreated.length} alert(s)`);
    } else {
      console.log("✅ No violations, no alerts needed");
    }

    // ========================================
    // STEP 5: SEND NOTIFICATIONS (if critical)
    // ========================================
    if (alertsCreated.length > 0) {
      const criticalAlerts = alertsCreated.filter(
        (a) => a.severity === "critical" || a.severity === "high",
      );

      if (criticalAlerts.length > 0) {
        console.log("📧 Sending notifications for critical alerts...");
        await sendNotificationsForAlerts(criticalAlerts);
        console.log("✅ Notifications sent");
      }
    }

    // ========================================
    // STEP 6: UPDATE BUFFER STATUS
    // ========================================
    console.log("✏️ Marking buffer as merged...");
    await getWaterQualityModel().markBufferAsMerged(buffer_ids);
    console.log("✅ Buffer updated");

    // ========================================
    // STEP 7: UPDATE SENSORS (NEW!)
    // ========================================
    console.log("🔧 Updating sensors with latest readings...");
    await updateSensorsFromReading(
      readingId,
      sensor_mapping,
      inlet,
      outlet,
      fuzzyResult.status,
    );
    console.log("✅ Sensors updated");

    // ========================================
    // RETURN COMPLETE RESULT
    // ========================================
    return {
      reading_id: readingId,
      fuzzy_analysis: fuzzyResult,
      alerts_created: alertsCreated.length,
      notifications_sent: alertsCreated.filter(
        (a) => a.severity === "critical" || a.severity === "high",
      ).length,
    };
  } catch (error) {
    console.error("❌ Error in processCompleteReading:", error);
    throw error;
  }
}

/**
 * ========================================
 * ALERT CREATION
 * ========================================
 */

/**
 * Create alerts for violations
 */
async function createAlertsForViolations(readingId, ipalId, violations) {
  try {
    const alertsCreated = [];

    for (const violation of violations) {
      const hasNumericValue =
        typeof violation.value === "number" && Number.isFinite(violation.value);
      const hasNumericThreshold =
        typeof violation.threshold === "number" &&
        Number.isFinite(violation.threshold);

      const alertData = {
        ipal_id: ipalId,
        reading_id: readingId,
        parameter: violation.parameter,
        location: violation.location,
        source: violation.source || "compliance_threshold",
        alert_type:
          violation.source === "sensor_diagnostic"
            ? "SENSOR_ANOMALY"
            : "COMPLIANCE_VIOLATION",
        value: violation.value,
        threshold: violation.threshold,
        deviation:
          hasNumericValue && hasNumericThreshold
            ? Math.abs(violation.value - violation.threshold)
            : null,
        severity: violation.severity,
        status: "active",
        rule:
          violation.source === "sensor_diagnostic"
            ? `sensor.${violation.parameter} ${violation.condition}`
            : `${violation.parameter} ${violation.condition}`,
        message: violation.message,
        // Note: created_at will be added by alertModel using serverTimestamp()
      };

      // Save alert using alertModel
      const alertId = await getAlertModel().createAlert(alertData);

      alertsCreated.push({
        alert_id: alertId,
        ...alertData,
      });

      console.log(`   Alert created: ${alertId} (${violation.severity})`);
    }

    return alertsCreated;
  } catch (error) {
    console.error("❌ Error creating alerts:", error);
    // Don't throw - continue even if alerts fail
    return [];
  }
}

async function sendNotificationsForAlerts(alerts) {
  try {
    // Load notification service if not loaded
    const notifService = getNotificationService();

    if (!notifService) {
      console.warn("⚠️ notificationService not available");
      return;
    }

    if (!alerts || alerts.length === 0) {
      console.log("ℹ️  No alerts to send");
      return;
    }

    console.log(
      `📤 Preparing to send notifications for ${alerts.length} alert(s)...`,
    );

    // Filter critical/high alerts only (optional)
    // Uncomment line below to only send critical/high severity alerts
    // const criticalAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high');

    // OR send all alerts regardless of severity:
    const alertsToSend = alerts;

    if (alertsToSend.length === 0) {
      console.log("ℹ️  No critical/high alerts to send");
      return;
    }

    console.log(
      `📧 Sending notifications for ${alertsToSend.length} alert(s)...`,
    );

    // ⭐ CALL NEW ORCHESTRATOR
    // This will:
    // 1. Get admin/manager emails from Firestore
    // 2. Send 1 email with ALL violations
    // 3. Send FCM (if tokens available)
    const result = await notifService.sendAlerts(alertsToSend);

    if (result.success) {
      console.log("✅ Notifications sent successfully");
      console.log(`   Email: ${result.results?.email?.success ? "✅" : "❌"}`);
      console.log(
        `   FCM: ${result.results?.fcm?.success ? "✅" : "⏭️ Skipped"}`,
      );
    } else {
      console.log("⚠️  Notification sending had issues:", result.message);
    }

    return result;
  } catch (error) {
    console.error("❌ Error sending notifications:", error);
    // Don't throw - notifications failing shouldn't break the main flow
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * ========================================
 * VALIDATION HELPERS
 * ========================================
 */

/**
 * Validate reading input data
 */
function validateReadingInput(data) {
  const errors = [];
  const isFiniteNumber = (value) =>
    typeof value === "number" && Number.isFinite(value);

  // Required fields
  if (!data.ipal_id) errors.push("ipal_id is required");
  if (!data.location) errors.push("location is required");
  if (!data.device_id) errors.push("device_id is required");
  if (!data.data) errors.push("data is required");

  // Validate location
  if (data.location && !["inlet", "outlet"].includes(data.location)) {
    errors.push('location must be "inlet" or "outlet"');
  }

  // Validate data structure
  if (data.data) {
    if (typeof data.data.ph === "undefined") errors.push("data.ph is required");
    if (typeof data.data.tds === "undefined")
      errors.push("data.tds is required");
    if (typeof data.data.temperature === "undefined")
      errors.push("data.temperature is required");
    if (typeof data.data.ph !== "undefined" && !isFiniteNumber(data.data.ph)) {
      errors.push("data.ph must be a finite number");
    }
    if (
      typeof data.data.tds !== "undefined" &&
      !isFiniteNumber(data.data.tds)
    ) {
      errors.push("data.tds must be a finite number");
    }
    if (
      typeof data.data.temperature !== "undefined" &&
      !isFiniteNumber(data.data.temperature)
    ) {
      errors.push("data.temperature must be a finite number");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * ========================================
 * MONITORING & DEBUGGING
 * ========================================
 */

/**
 * Get buffer status (for monitoring)
 */
async function getBufferStatus(ipalId = null) {
  try {
    return await getWaterQualityModel().getBufferStatus(ipalId);
  } catch (error) {
    console.error("❌ Error getting buffer status:", error);
    throw error;
  }
}

/**
 * Manual cleanup of expired buffer
 */
async function cleanupExpiredBuffer() {
  try {
    console.log("🧹 Cleaning expired buffer...");
    const result = await getWaterQualityModel().cleanupExpiredBuffer();
    console.log(`✅ Cleaned ${result.deleted} expired document(s)`);
    return result;
  } catch (error) {
    console.error("❌ Error cleaning buffer:", error);
    throw error;
  }
}

/**
 * Check for incomplete readings (monitoring)
 */
async function checkIncompleteReadings(ipalId) {
  try {
    const cutoffTime = new Date(
      Date.now() - CONFIG.ALERT_INCOMPLETE_AFTER * 60 * 1000,
    );

    const unmerged = await getWaterQualityModel().getUnmergedReadings(
      ipalId,
      CONFIG.ALERT_INCOMPLETE_AFTER,
    );

    if (unmerged.length > 0) {
      console.warn(
        `⚠️ Found ${unmerged.length} incomplete reading(s) > ${CONFIG.ALERT_INCOMPLETE_AFTER} minutes old`,
      );

      // TODO: Alert admin about incomplete readings
      // This could indicate ESP32 failure

      return {
        hasIncomplete: true,
        count: unmerged.length,
        readings: unmerged,
      };
    }

    return {
      hasIncomplete: false,
      count: 0,
    };
  } catch (error) {
    console.error("❌ Error checking incomplete readings:", error);
    throw error;
  }
}

/**
 * ========================================
 * SENSOR UPDATE FUNCTIONS (NEW!)
 * ========================================
 */

/**
 * Update sensors dengan latest readings dari water_quality_readings
 * @param {string} readingId - ID of water_quality_readings document
 * @param {Object} sensor_mapping - Mapping of sensor IDs
 * @param {Object} inlet - Inlet sensor data
 * @param {Object} outlet - Outlet sensor data
 * @param {string} qualityStatus - Overall quality status (normal/warning/critical)
 */
async function updateSensorsFromReading(
  readingId,
  sensor_mapping,
  inlet,
  outlet,
  qualityStatus,
) {
  try {
    if (!sensor_mapping || Object.keys(sensor_mapping).length === 0) {
      console.log("ℹ️  No sensor_mapping provided, skipping sensor update");
      return;
    }

    console.log("🔧 Parsing sensor_mapping...");
    const sensorsToUpdate = [];

    const { admin } = require("../config/firebase-config");
    const db = admin.firestore();

    let timestamp;
    try {
      const readingDoc = await db
        .collection("water_quality_readings")
        .doc(readingId)
        .get();

      if (readingDoc.exists) {
        timestamp = readingDoc.data().timestamp;
        console.log(
          `📅 Using timestamp from reading: ${
            timestamp?.toDate ? timestamp.toDate().toISOString() : timestamp
          }`,
        );
      }
    } catch (err) {
      console.warn(
        "⚠️ Could not fetch reading timestamp, using server timestamp",
      );
    }

    if (!timestamp) {
      timestamp = admin.firestore.Timestamp.now();
    }

    if (inlet) {
      const inletMapping = {
        inlet_ph: inlet.ph,
        inlet_tds: inlet.tds,
        inlet_temperature: inlet.temperature,
      };

      for (const [key, value] of Object.entries(inletMapping)) {
        const sensorId = sensor_mapping[key];
        if (sensorId && value !== null && value !== undefined) {
          sensorsToUpdate.push({
            sensorId,
            readingData: {
              value,
              timestamp,
              reading_id: readingId,
              status: qualityStatus || "normal",
            },
          });
        }
      }
    }

    if (outlet) {
      const outletMapping = {
        outlet_ph: outlet.ph,
        outlet_tds: outlet.tds,
        outlet_temperature: outlet.temperature,
      };

      for (const [key, value] of Object.entries(outletMapping)) {
        const sensorId = sensor_mapping[key];
        if (sensorId && value !== null && value !== undefined) {
          sensorsToUpdate.push({
            sensorId,
            readingData: {
              value,
              timestamp,
              reading_id: readingId,
              status: qualityStatus || "normal",
            },
          });
        }
      }
    }

    if (sensorsToUpdate.length === 0) {
      console.log("ℹ️  No sensors to update");
      return;
    }

    console.log(`📦 Updating ${sensorsToUpdate.length} sensor(s)...`);
    const result =
      await getSensorModel().batchUpdateSensorsReading(sensorsToUpdate);

    console.log(
      `✅ Sensors updated: ${result.success} success, ${result.failed} failed, ${result.skipped} skipped`,
    );

    return result;
  } catch (error) {
    console.error("❌ Error updating sensors from reading:", error);
  }
}

// ╔══════════════════════════════════════╗
// ║  EXPORTS (PUBLIC API ONLY)          ║
// ╚══════════════════════════════════════╝
//
// Hanya 4 fungsi publik yang dipakai controller:
//   submitReading          → POST /submit (ESP32 endpoint)
//   getBufferStatus        → GET /buffer-status (monitoring)
//   cleanupExpiredBuffer   → DELETE /cleanup-buffer (maintenance)
//   checkIncompleteReadings → GET /incomplete (monitoring)
//
// Fungsi internal (TIDAK di-export, hanya dipanggil internal):
//   tryMerge, processCompleteReading,
//   createAlertsForViolations, sendNotificationsForAlerts,
//   updateSensorsFromReading, validateReadingInput

module.exports = {
  submitReading,
  getBufferStatus,
  cleanupExpiredBuffer,
  checkIncompleteReadings,
};

console.log("📦 waterQualityService (orchestrator) loaded");
