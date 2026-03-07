/**
 * ========================================
 * SENSOR FAULT HANDLER
 * ========================================
 * Menangani kondisi sensor yang tidak terdeteksi
 * Includes: Fault detection, Firestore imputation
 */

/**
 * ========================================
 * SENSOR FAULT DETECTION
 * ========================================
 * Deteksi sensor yang bermasalah atau tidak terdeteksi
 */
function detectSensorFaults(inlet, outlet) {
  const faults = {
    inlet: [],
    outlet: [],
    count: 0,
  };

  const parameters = ["ph", "tds", "temperature"];

  // Check inlet sensors
  parameters.forEach((param) => {
    if (
      inlet[param] === null ||
      inlet[param] === undefined ||
      isNaN(inlet[param]) ||
      inlet[param] < 0
    ) {
      faults.inlet.push(param);
      faults.count++;
    }
  });

  // Check outlet sensors
  parameters.forEach((param) => {
    if (
      outlet[param] === null ||
      outlet[param] === undefined ||
      isNaN(outlet[param]) ||
      outlet[param] < 0
    ) {
      faults.outlet.push(param);
      faults.count++;
    }
  });

  return faults;
}

/**
 * ========================================
 * FETCH LATEST READING FROM FIRESTORE
 * ========================================
 * Ambil reading terakhir dari water_quality_readings per IPAL
 */
async function fetchLatestReading(ipalId) {
  try {
    const { admin } = require("../../config/firebase-config");
    const db = admin.firestore();

    const snapshot = await db
      .collection("water_quality_readings")
      .where("ipal_id", "==", ipalId)
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const data = snapshot.docs[0].data();
    return { inlet: data.inlet, outlet: data.outlet };
  } catch (error) {
    console.warn("⚠️ Failed to fetch latest reading:", error.message);
    return null;
  }
}

/**
 * ========================================
 * IMPUTE MISSING DATA
 * ========================================
 * Mengisi data yang hilang dengan latest reading dari Firestore
 */
function imputeFromLatest(inlet, outlet, faults, latestReading) {
  const imputedInlet = { ...inlet };
  const imputedOutlet = { ...outlet };
  const imputationLog = [];

  // Impute inlet missing data
  faults.inlet.forEach((param) => {
    const value = latestReading?.inlet?.[param];
    if (value != null) {
      imputedInlet[param] = value;
      imputationLog.push({
        location: "inlet",
        parameter: param,
        original_value: inlet[param],
        imputed_value: value,
        method: "latest_reading",
      });
    }
  });

  // Impute outlet missing data
  faults.outlet.forEach((param) => {
    const value = latestReading?.outlet?.[param];
    if (value != null) {
      imputedOutlet[param] = value;
      imputationLog.push({
        location: "outlet",
        parameter: param,
        original_value: outlet[param],
        imputed_value: value,
        method: "latest_reading",
      });
    }
  });

  return {
    inlet: imputedInlet,
    outlet: imputedOutlet,
    imputation_log: imputationLog,
  };
}

/**
 * ========================================
 * MAIN PROCESSING FUNCTION
 * ========================================
 * Wrapper untuk menangani sensor faults sebelum analisis fuzzy
 */
async function preprocessSensorData(inlet, outlet, ipalId) {
  console.log("🔍 Checking sensor data integrity...");

  // Detect faults
  const faults = detectSensorFaults(inlet, outlet);

  if (faults.count === 0) {
    console.log("✅ All sensors operational");
    return {
      inlet,
      outlet,
      has_faults: false,
      confidence_score: 100,
      sensor_status: "all_operational",
    };
  }

  console.log(`⚠️  Detected ${faults.count} sensor fault(s):`);
  if (faults.inlet.length > 0) {
    console.log(`   Inlet: ${faults.inlet.join(", ")}`);
  }
  if (faults.outlet.length > 0) {
    console.log(`   Outlet: ${faults.outlet.join(", ")}`);
  }

  // Fetch latest reading dari Firestore
  const latestReading = ipalId ? await fetchLatestReading(ipalId) : null;

  if (latestReading) {
    console.log("📦 Using latest reading from Firestore for imputation");
  } else {
    console.warn("⚠️ No previous reading found - cannot impute missing data");
  }

  // Impute missing data dari latest reading
  const {
    inlet: imputedInlet,
    outlet: imputedOutlet,
    imputation_log,
  } = imputeFromLatest(inlet, outlet, faults, latestReading);

  // Check if all faults were resolved
  const unresolvedInlet = faults.inlet.filter(
    (p) =>
      imputedInlet[p] === null ||
      imputedInlet[p] === undefined ||
      isNaN(imputedInlet[p]),
  );
  const unresolvedOutlet = faults.outlet.filter(
    (p) =>
      imputedOutlet[p] === null ||
      imputedOutlet[p] === undefined ||
      isNaN(imputedOutlet[p]),
  );
  if (unresolvedInlet.length > 0 || unresolvedOutlet.length > 0) {
    console.warn(
      `⚠️ Could not impute: inlet=[${unresolvedInlet}] outlet=[${unresolvedOutlet}]`,
    );
  }

  // Simple confidence: percentage of working sensors (6 total)
  const confidenceScore = Math.round(((6 - faults.count) / 6) * 100);

  console.log(`📊 Data imputation complete (Confidence: ${confidenceScore}%)`);
  imputation_log.forEach((log) => {
    console.log(
      `   ${log.location}.${log.parameter}: ${log.original_value} → ${log.imputed_value.toFixed(2)} (${log.method})`,
    );
  });

  return {
    inlet: imputedInlet,
    outlet: imputedOutlet,
    has_faults: true,
    faults,
    imputation_log,
    confidence_score: confidenceScore,
    sensor_status:
      faults.count >= 3
        ? "critical"
        : faults.count >= 2
          ? "degraded"
          : "partial",
  };
}

/**
 * ========================================
 * EXPORTS
 * ========================================
 */
module.exports = {
  detectSensorFaults,
  imputeFromLatest,
  fetchLatestReading,
  preprocessSensorData,
};

console.log("📦 sensorFaultHandler.js loaded (3 Parameters)");
