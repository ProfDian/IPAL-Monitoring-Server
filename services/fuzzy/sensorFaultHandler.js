/**
 * ========================================
 * SENSOR FAULT HANDLER
 * ========================================
 * Menangani kondisi sensor yang tidak terdeteksi
 * Includes: Fault detection, Firestore imputation
 */

const SENSOR_RANGES = {
  ph: { min: 0, max: 14 },
  tds: { min: 0, max: 10000 },
  temperature: { min: -10, max: 60 },
};

const HEAVY_OUT_OF_RANGE_LIMITS = {
  ph: { min: -1, max: 15 },
  tds: { min: -100, max: 12000 },
  temperature: { min: -20, max: 80 },
};

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
    details: [],
    count: 0,
    has_heavy_out_of_range: false,
  };

  const parameters = ["ph", "tds", "temperature"];

  const classifyFault = (value, param) => {
    const numericValue = Number(value);

    if (value === null || value === undefined) {
      return {
        reason: "missing_data",
        isFault: true,
        isHeavyOutOfRange: false,
      };
    }

    if (Number.isNaN(numericValue)) {
      return {
        reason: "invalid_number",
        isFault: true,
        isHeavyOutOfRange: false,
      };
    }

    const sensorRange = SENSOR_RANGES[param];
    if (numericValue < sensorRange.min || numericValue > sensorRange.max) {
      const heavyRange = HEAVY_OUT_OF_RANGE_LIMITS[param];
      const isHeavyOutOfRange =
        numericValue < heavyRange.min || numericValue > heavyRange.max;

      return {
        reason: "out_of_range",
        isFault: true,
        isHeavyOutOfRange,
      };
    }

    return { reason: null, isFault: false, isHeavyOutOfRange: false };
  };

  // Check inlet sensors
  parameters.forEach((param) => {
    const value = inlet[param];
    const faultInfo = classifyFault(value, param);
    if (faultInfo.isFault) {
      faults.inlet.push(param);
      faults.count++;
      faults.details.push({
        location: "inlet",
        parameter: param,
        value,
        reason: faultInfo.reason,
        expected_range: SENSOR_RANGES[param],
        is_heavy_out_of_range: faultInfo.isHeavyOutOfRange,
      });
      if (faultInfo.isHeavyOutOfRange) {
        faults.has_heavy_out_of_range = true;
      }
    }
  });

  // Check outlet sensors
  parameters.forEach((param) => {
    const value = outlet[param];
    const faultInfo = classifyFault(value, param);
    if (faultInfo.isFault) {
      faults.outlet.push(param);
      faults.count++;
      faults.details.push({
        location: "outlet",
        parameter: param,
        value,
        reason: faultInfo.reason,
        expected_range: SENSOR_RANGES[param],
        is_heavy_out_of_range: faultInfo.isHeavyOutOfRange,
      });
      if (faultInfo.isHeavyOutOfRange) {
        faults.has_heavy_out_of_range = true;
      }
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
  const canImputeByKey = new Map(
    (faults.details || []).map((fault) => [
      `${fault.location}.${fault.parameter}`,
      ["missing_data", "invalid_number", "out_of_range"].includes(fault.reason),
    ]),
  );

  // Impute inlet missing data
  faults.inlet.forEach((param) => {
    if (!canImputeByKey.get(`inlet.${param}`)) {
      return;
    }
    const value = latestReading?.inlet?.[param];
    if (value != null) {
      imputedInlet[param] = value;
      const faultDetail = (faults.details || []).find(
        (fault) => fault.location === "inlet" && fault.parameter === param,
      );
      imputationLog.push({
        location: "inlet",
        parameter: param,
        original_value: inlet[param],
        imputed_value: value,
        method: "latest_reading",
        reason: faultDetail?.reason || "unknown",
      });
    }
  });

  // Impute outlet missing data
  faults.outlet.forEach((param) => {
    if (!canImputeByKey.get(`outlet.${param}`)) {
      return;
    }
    const value = latestReading?.outlet?.[param];
    if (value != null) {
      imputedOutlet[param] = value;
      const faultDetail = (faults.details || []).find(
        (fault) => fault.location === "outlet" && fault.parameter === param,
      );
      imputationLog.push({
        location: "outlet",
        parameter: param,
        original_value: outlet[param],
        imputed_value: value,
        method: "latest_reading",
        reason: faultDetail?.reason || "unknown",
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
  const isStillInvalid = (value, parameter) => {
    const numericValue = Number(value);
    if (value === null || value === undefined) return true;
    if (Number.isNaN(numericValue)) return true;
    const range = SENSOR_RANGES[parameter];
    if (!range) return false;
    return numericValue < range.min || numericValue > range.max;
  };

  const unresolvedInlet = faults.inlet.filter((parameter) =>
    isStillInvalid(imputedInlet[parameter], parameter),
  );
  const unresolvedOutlet = faults.outlet.filter((parameter) =>
    isStillInvalid(imputedOutlet[parameter], parameter),
  );

  const unresolvedFaultDetails = (faults.details || []).filter((fault) => {
    const value =
      fault.location === "inlet"
        ? imputedInlet[fault.parameter]
        : imputedOutlet[fault.parameter];
    return isStillInvalid(value, fault.parameter);
  });

  const hasFailedImputation = unresolvedFaultDetails.length > 0;
  const shouldSkipPrimaryScoring =
    faults.has_heavy_out_of_range || hasFailedImputation;

  let reliabilityReason = null;
  if (faults.has_heavy_out_of_range) {
    reliabilityReason = "heavy_out_of_range";
  } else if (hasFailedImputation) {
    reliabilityReason = "imputation_failed";
  }
  if (unresolvedInlet.length > 0 || unresolvedOutlet.length > 0) {
    console.warn(
      `⚠️ Could not impute: inlet=[${unresolvedInlet}] outlet=[${unresolvedOutlet}]`,
    );
  }

  // Simple confidence: percentage of working sensors (6 total)
  const confidenceScore = Math.round(((6 - faults.count) / 6) * 100);

  console.log(`📊 Data imputation complete (Confidence: ${confidenceScore}%)`);
  imputation_log.forEach((log) => {
    const formattedImputedValue =
      typeof log.imputed_value === "number"
        ? log.imputed_value.toFixed(2)
        : String(log.imputed_value);
    console.log(
      `   ${log.location}.${log.parameter}: ${log.original_value} → ${formattedImputedValue} (${log.method})`,
    );
  });

  return {
    inlet: imputedInlet,
    outlet: imputedOutlet,
    has_faults: true,
    faults,
    unresolved_faults: unresolvedFaultDetails,
    imputation_log,
    confidence_score: confidenceScore,
    should_skip_primary_scoring: shouldSkipPrimaryScoring,
    data_reliability: {
      is_reliable: !shouldSkipPrimaryScoring,
      reason: reliabilityReason,
    },
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
