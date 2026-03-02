/**
 * ========================================
 * SENSOR FAULT HANDLER
 * ========================================
 * Menangani kondisi sensor yang tidak terdeteksi
 * Includes: Data imputation, confidence scoring, alerts
 */

const { BAKU_MUTU } = require("./fuzzyRules");

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
 * DATA IMPUTATION STRATEGIES
 * ========================================
 * Mengisi data sensor yang hilang dengan estimasi
 */
const IMPUTATION_STRATEGIES = {
  /**
   * Strategy 1: Default Safe Values
   * Menggunakan nilai tengah yang aman dari baku mutu
   */
  safe_default: {
    ph: 7.5, // Neutral pH
    tds: 2500, // Mid-range TDS
    temperature: 30, // Normal temperature
  },

  /**
   * Strategy 2: Historical Average
   * Dalam implementasi real, ini akan menggunakan data historis
   * Untuk simulasi, gunakan typical values
   */
  historical_average: {
    inlet: {
      ph: 5.0,
      tds: 5000,
      temperature: 32,
    },
    outlet: {
      ph: 7.5,
      tds: 2200,
      temperature: 30,
    },
  },

  /**
   * Strategy 3: Cross-Parameter Estimation
   * Estimasi berdasarkan parameter lain yang tersedia
   */
  cross_parameter: function (data, location, missingParam, availableData) {
    // Jika TDS hilang, estimasi dari temperature (rough correlation)
    if (missingParam === "tds" && availableData.temperature !== undefined) {
      return location === "inlet"
        ? 5000 - (availableData.temperature - 25) * 100 // Rough inverse correlation
        : 2500 - (availableData.temperature - 25) * 50;
    }

    // Jika temperature hilang, estimasi dari TDS
    if (missingParam === "temperature" && availableData.tds !== undefined) {
      return location === "inlet"
        ? 32 - (availableData.tds - 4000) * 0.001
        : 30 - (availableData.tds - 2000) * 0.002;
    }

    // Jika pH hilang, gunakan default berdasarkan lokasi
    if (missingParam === "ph") {
      return location === "inlet" ? 5.0 : 7.5;
    }

    return null;
  },

  /**
   * Strategy 4: Inlet-Outlet Relationship
   * Estimasi outlet dari inlet (atau sebaliknya) berdasarkan typical reduction
   */
  inlet_outlet_relationship: {
    // Typical reduction rates untuk estimasi
    outlet_from_inlet: {
      ph: (inletPh) => {
        // Netralisasi menuju pH 7-8
        if (inletPh < 6.5) return 7.2;
        if (inletPh > 8.5) return 7.8;
        return inletPh;
      },
      tds: (inletTds) => inletTds * 0.45, // ~55% reduction
      temperature: (inletTemp) => inletTemp - 2, // ~2°C cooling
    },
    inlet_from_outlet: {
      ph: (outletPh) => {
        // Reverse estimation - assume inlet was more extreme
        if (outletPh < 7.0) return 5.0;
        if (outletPh > 8.0) return 9.5;
        return outletPh;
      },
      tds: (outletTds) => outletTds / 0.45, // Reverse of reduction
      temperature: (outletTemp) => outletTemp + 2,
    },
  },
};

/**
 * ========================================
 * IMPUTE MISSING DATA
 * ========================================
 * Mengisi data yang hilang dengan strategi yang sesuai
 */
function imputeMissingData(inlet, outlet, faults) {
  const imputedInlet = { ...inlet };
  const imputedOutlet = { ...outlet };
  const imputationLog = [];

  // Strategi: Gunakan relationship jika salah satu lokasi lengkap
  const inletComplete = faults.inlet.length === 0;
  const outletComplete = faults.outlet.length === 0;

  // Impute inlet missing data
  faults.inlet.forEach((param) => {
    let imputedValue;
    let method;

    if (outletComplete && outlet[param] !== undefined) {
      // Strategy 4: Estimate from outlet
      imputedValue =
        IMPUTATION_STRATEGIES.inlet_outlet_relationship.inlet_from_outlet[
          param
        ](outlet[param]);
      method = "inlet_from_outlet_relationship";
    } else if (Object.keys(inlet).some((k) => inlet[k] !== null && k !== param)) {
      // Strategy 3: Cross-parameter estimation
      imputedValue = IMPUTATION_STRATEGIES.cross_parameter(
        inlet,
        "inlet",
        param,
        inlet
      );
      method = "cross_parameter_estimation";
    } else {
      // Strategy 2: Historical average
      imputedValue = IMPUTATION_STRATEGIES.historical_average.inlet[param];
      method = "historical_average";
    }

    imputedInlet[param] = imputedValue || IMPUTATION_STRATEGIES.safe_default[param];
    imputationLog.push({
      location: "inlet",
      parameter: param,
      original_value: inlet[param],
      imputed_value: imputedInlet[param],
      method: method || "safe_default",
    });
  });

  // Impute outlet missing data
  faults.outlet.forEach((param) => {
    let imputedValue;
    let method;

    if (inletComplete && imputedInlet[param] !== undefined) {
      // Strategy 4: Estimate from inlet
      imputedValue =
        IMPUTATION_STRATEGIES.inlet_outlet_relationship.outlet_from_inlet[
          param
        ](imputedInlet[param]);
      method = "outlet_from_inlet_relationship";
    } else if (Object.keys(outlet).some((k) => outlet[k] !== null && k !== param)) {
      // Strategy 3: Cross-parameter estimation
      imputedValue = IMPUTATION_STRATEGIES.cross_parameter(
        outlet,
        "outlet",
        param,
        outlet
      );
      method = "cross_parameter_estimation";
    } else {
      // Strategy 2: Historical average
      imputedValue = IMPUTATION_STRATEGIES.historical_average.outlet[param];
      method = "historical_average";
    }

    imputedOutlet[param] = imputedValue || IMPUTATION_STRATEGIES.safe_default[param];
    imputationLog.push({
      location: "outlet",
      parameter: param,
      original_value: outlet[param],
      imputed_value: imputedOutlet[param],
      method: method || "safe_default",
    });
  });

  return {
    inlet: imputedInlet,
    outlet: imputedOutlet,
    imputation_log: imputationLog,
  };
}

/**
 * ========================================
 * CONFIDENCE SCORING
 * ========================================
 * Menghitung confidence score berdasarkan data yang tersedia
 */
function calculateConfidenceScore(faults, totalParameters = 6) {
  const missingCount = faults.count;
  const availableCount = totalParameters - missingCount;

  // Base confidence dari persentase data tersedia
  let confidence = (availableCount / totalParameters) * 100;

  // Penalty berdasarkan lokasi sensor yang hilang
  const criticalParameters = ["ph", "tds"]; // Parameter paling penting

  faults.inlet.forEach((param) => {
    if (criticalParameters.includes(param)) {
      confidence -= 5; // Extra penalty untuk parameter kritis
    }
  });

  faults.outlet.forEach((param) => {
    if (criticalParameters.includes(param)) {
      confidence -= 5;
    }
  });

  // Bonus jika hanya 1 parameter hilang
  if (missingCount === 1) {
    confidence += 5;
  }

  return Math.max(0, Math.min(100, confidence));
}

/**
 * ========================================
 * GENERATE SENSOR FAULT ALERTS
 * ========================================
 */
function generateSensorFaultAlerts(faults, imputationLog, confidenceScore) {
  const alerts = [];

  // Critical alert jika banyak sensor mati (≥3 dari 6 total)
  if (faults.count >= 3) {
    alerts.push({
      level: "CRITICAL",
      type: "sensor_multiple_failure",
      message: `CRITICAL: ${faults.count} sensor tidak terdeteksi - Data reliability sangat rendah`,
      severity: "critical",
      priority: 1,
      affected_sensors: {
        inlet: faults.inlet,
        outlet: faults.outlet,
      },
      action_required: "IMMEDIATE: Periksa sistem sensor dan koneksi",
      confidence_impact: `Confidence Score: ${confidenceScore.toFixed(1)}%`,
      timestamp: new Date().toISOString(),
    });
  }

  // Warning untuk setiap sensor yang mati
  faults.inlet.forEach((param) => {
    alerts.push({
      level: "WARNING",
      type: "sensor_fault",
      parameter: param,
      location: "inlet",
      message: `Sensor ${param.toUpperCase()} inlet tidak terdeteksi - Menggunakan data estimasi`,
      severity: "high",
      priority: 2,
      imputation_method: imputationLog.find(
        (log) => log.location === "inlet" && log.parameter === param
      )?.method,
      action_required: "Periksa sensor dalam 24 jam",
      timestamp: new Date().toISOString(),
    });
  });

  faults.outlet.forEach((param) => {
    alerts.push({
      level: "WARNING",
      type: "sensor_fault",
      parameter: param,
      location: "outlet",
      message: `Sensor ${param.toUpperCase()} outlet tidak terdeteksi - Menggunakan data estimasi`,
      severity: "high",
      priority: 2,
      imputation_method: imputationLog.find(
        (log) => log.location === "outlet" && log.parameter === param
      )?.method,
      action_required: "Periksa sensor dalam 24 jam",
      timestamp: new Date().toISOString(),
    });
  });

  // Info alert untuk low confidence
  if (confidenceScore < 70) {
    alerts.push({
      level: "INFO",
      type: "low_confidence",
      message: `Analisis memiliki confidence rendah (${confidenceScore.toFixed(
        1
      )}%) karena beberapa sensor tidak terdeteksi`,
      severity: "info",
      priority: 6,
      action_required: "Hasil analisis harus diverifikasi manual",
      timestamp: new Date().toISOString(),
    });
  }

  return alerts;
}

/**
 * ========================================
 * MAIN PROCESSING FUNCTION
 * ========================================
 * Wrapper untuk menangani sensor faults sebelum analisis fuzzy
 */
function preprocessSensorData(inlet, outlet) {
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

  // Impute missing data
  const { inlet: imputedInlet, outlet: imputedOutlet, imputation_log } =
    imputeMissingData(inlet, outlet, faults);

  // Calculate confidence
  const confidenceScore = calculateConfidenceScore(faults);

  console.log(`📊 Data imputation complete (Confidence: ${confidenceScore.toFixed(1)}%)`);
  imputation_log.forEach((log) => {
    console.log(
      `   ${log.location}.${log.parameter}: ${log.original_value} → ${log.imputed_value.toFixed(
        2
      )} (${log.method})`
    );
  });

  // Generate alerts
  const sensorAlerts = generateSensorFaultAlerts(
    faults,
    imputation_log,
    confidenceScore
  );

  return {
    inlet: imputedInlet,
    outlet: imputedOutlet,
    has_faults: true,
    faults: faults,
    imputation_log: imputation_log,
    confidence_score: confidenceScore,
    sensor_alerts: sensorAlerts,
    sensor_status: faults.count >= 3 ? "critical" : faults.count >= 2 ? "degraded" : "partial",
  };
}

/**
 * ========================================
 * INTEGRATION HELPER
 * ========================================
 * Helper untuk integrasi dengan fuzzyService
 */
function enhanceAnalysisResult(fuzzyResult, preprocessResult) {
  // Merge sensor alerts dengan fuzzy alerts
  const combinedAlerts = [
    ...(preprocessResult.sensor_alerts || []),
    ...fuzzyResult.alerts,
  ].sort((a, b) => a.priority - b.priority);

  // Update alert count
  const updatedResult = {
    ...fuzzyResult,
    
    // Add sensor fault info
    sensor_status: {
      has_faults: preprocessResult.has_faults,
      status: preprocessResult.sensor_status,
      confidence_score: preprocessResult.confidence_score,
      faults: preprocessResult.faults,
      imputation_log: preprocessResult.imputation_log,
    },

    // Update scores dengan confidence penalty
    original_quality_score: fuzzyResult.quality_score,
    quality_score: Math.round(
      fuzzyResult.quality_score * (preprocessResult.confidence_score / 100)
    ),

    // Combined alerts
    alerts: combinedAlerts,
    alert_count: combinedAlerts.length,
    sensor_alert_count: preprocessResult.sensor_alerts?.length || 0,
    fuzzy_alert_count: fuzzyResult.alerts.length,

    // Data reliability disclaimer
    data_reliability: preprocessResult.has_faults
      ? `⚠️  Analisis menggunakan ${preprocessResult.imputation_log?.length || 0} data estimasi (Confidence: ${preprocessResult.confidence_score.toFixed(1)}%)`
      : "✅ Semua data sensor tersedia dan reliable",
  };

  return updatedResult;
}

/**
 * ========================================
 * EXPORTS
 * ========================================
 */
module.exports = {
  detectSensorFaults,
  imputeMissingData,
  calculateConfidenceScore,
  generateSensorFaultAlerts,
  preprocessSensorData,
  enhanceAnalysisResult,
  IMPUTATION_STRATEGIES,
};

console.log("📦 sensorFaultHandler.js loaded (3 Parameters)");