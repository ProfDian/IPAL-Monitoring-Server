/**
 * Fuzzy Logic Engine untuk Water Quality Analysis
 *
 * Aturan berdasarkan Baku Mutu Air Limbah Domestik
 * dan efektivitas IPAL
 *
 * NOTE: This file provides fuzzy membership functions for advanced analysis.
 * Main analysis is handled by: services/fuzzyService.js
 * THRESHOLDS here should be synchronized with fuzzyService.js
 *
 * Used by:
 * - functions/triggers/readingTrigger.js (Firebase trigger)
 * - test-fuzzy.js (testing)
 */

// Baku mutu parameter (sesuaikan dengan regulasi)
const THRESHOLDS = {
  pH: {
    inlet: { min: 6.0, max: 9.0 },
    outlet: { min: 6.0, max: 9.0 },
    optimalIncrease: { min: 0.3, max: 1.5 }, // pH harus naik sedikit
  },
  tds: {
    inlet: { max: 2000 },
    outlet: { max: 1000 },
    minReduction: 0.15, // TDS harus turun min 15%
  },
  turbidity: {
    inlet: { max: 400 },
    outlet: { max: 25 }, // Baku mutu air limbah domestik
    minReduction: 0.5, // Turbidity harus turun min 50%
  },
  temperature: {
    inlet: { min: 20, max: 40 },
    outlet: { min: 20, max: 38 },
    maxDifference: 3, // Perbedaan suhu max 3°C
  },
};

/**
 * Fungsi membership untuk pH (Fuzzy Sets)
 */
function pHMembership(value) {
  if (value < 6.0) return { category: "very_acidic", severity: "high" };
  if (value >= 6.0 && value < 6.5)
    return { category: "acidic", severity: "medium" };
  if (value >= 6.5 && value <= 8.5)
    return { category: "normal", severity: "low" };
  if (value > 8.5 && value <= 9.0)
    return { category: "alkaline", severity: "medium" };
  if (value > 9.0) return { category: "very_alkaline", severity: "high" };
  return { category: "unknown", severity: "low" };
}

/**
 * Fungsi membership untuk TDS
 */
function tdsMembership(value, location) {
  const threshold =
    location === "outlet"
      ? THRESHOLDS.tds.outlet.max
      : THRESHOLDS.tds.inlet.max;

  if (value <= threshold * 0.5)
    return { category: "very_low", severity: "low" };
  if (value <= threshold * 0.75) return { category: "low", severity: "low" };
  if (value <= threshold) return { category: "normal", severity: "low" };
  if (value <= threshold * 1.2) return { category: "high", severity: "medium" };
  return { category: "very_high", severity: "high" };
}

/**
 * Fungsi membership untuk Turbidity
 */
function turbidityMembership(value, location) {
  const threshold =
    location === "outlet"
      ? THRESHOLDS.turbidity.outlet.max
      : THRESHOLDS.turbidity.inlet.max;

  if (value <= threshold * 0.3)
    return { category: "very_clear", severity: "low" };
  if (value <= threshold * 0.6) return { category: "clear", severity: "low" };
  if (value <= threshold) return { category: "normal", severity: "low" };
  if (value <= threshold * 1.5)
    return { category: "turbid", severity: "medium" };
  return { category: "very_turbid", severity: "high" };
}

/**
 * Fungsi membership untuk Temperature
 */
function temperatureMembership(value) {
  if (value < 20) return { category: "cold", severity: "medium" };
  if (value >= 20 && value <= 30)
    return { category: "normal", severity: "low" };
  if (value > 30 && value <= 35) return { category: "warm", severity: "low" };
  if (value > 35 && value <= 38) return { category: "hot", severity: "medium" };
  return { category: "very_hot", severity: "high" };
}

/**
 * Analisis perubahan parameter inlet vs outlet
 */
function analyzeParameterChange(inlet, outlet, parameter) {
  const alerts = [];

  switch (parameter) {
    case "ph":
      const pHDiff = outlet - inlet;

      // Rule 1: pH outlet harus naik sedikit (0.3 - 1.5)
      if (pHDiff < THRESHOLDS.pH.optimalIncrease.min) {
        alerts.push({
          parameter: "ph",
          location: "comparison",
          rule: "pH outlet tidak naik cukup",
          message: `pH hanya naik ${pHDiff.toFixed(2)} (seharusnya ${
            THRESHOLDS.pH.optimalIncrease.min
          } - ${THRESHOLDS.pH.optimalIncrease.max})`,
          severity: "medium",
          inlet_value: inlet,
          outlet_value: outlet,
          difference: pHDiff,
        });
      }

      // Rule 2: pH outlet terlalu tinggi
      if (pHDiff > THRESHOLDS.pH.optimalIncrease.max) {
        alerts.push({
          parameter: "ph",
          location: "comparison",
          rule: "pH outlet naik terlalu tinggi",
          message: `pH naik ${pHDiff.toFixed(2)} (max seharusnya ${
            THRESHOLDS.pH.optimalIncrease.max
          })`,
          severity: "high",
          inlet_value: inlet,
          outlet_value: outlet,
          difference: pHDiff,
        });
      }

      // Rule 3: pH outlet di luar baku mutu
      if (
        outlet < THRESHOLDS.pH.outlet.min ||
        outlet > THRESHOLDS.pH.outlet.max
      ) {
        alerts.push({
          parameter: "ph",
          location: "outlet",
          rule: "pH outlet di luar baku mutu",
          message: `pH outlet ${outlet.toFixed(2)} (baku mutu: ${
            THRESHOLDS.pH.outlet.min
          } - ${THRESHOLDS.pH.outlet.max})`,
          severity: "critical",
          inlet_value: inlet,
          outlet_value: outlet,
          threshold: `${THRESHOLDS.pH.outlet.min}-${THRESHOLDS.pH.outlet.max}`,
        });
      }
      break;

    case "tds":
      const tdsReduction = ((inlet - outlet) / inlet) * 100;

      // Rule 4: TDS harus turun minimal 15%
      if (tdsReduction < THRESHOLDS.tds.minReduction * 100) {
        alerts.push({
          parameter: "tds",
          location: "comparison",
          rule: "TDS tidak turun cukup",
          message: `TDS hanya turun ${tdsReduction.toFixed(
            1,
          )}% (seharusnya min ${THRESHOLDS.tds.minReduction * 100}%)`,
          severity: "high",
          inlet_value: inlet,
          outlet_value: outlet,
          reduction: tdsReduction,
        });
      }

      // Rule 5: TDS outlet melebihi baku mutu
      if (outlet > THRESHOLDS.tds.outlet.max) {
        alerts.push({
          parameter: "tds",
          location: "outlet",
          rule: "TDS outlet melebihi baku mutu",
          message: `TDS outlet ${outlet.toFixed(1)} ppm (max ${
            THRESHOLDS.tds.outlet.max
          } ppm)`,
          severity: "critical",
          inlet_value: inlet,
          outlet_value: outlet,
          threshold: THRESHOLDS.tds.outlet.max,
        });
      }
      break;

    case "turbidity":
      const turbidityReduction = ((inlet - outlet) / inlet) * 100;

      // Rule 6: Turbidity harus turun minimal 50%
      if (turbidityReduction < THRESHOLDS.turbidity.minReduction * 100) {
        alerts.push({
          parameter: "turbidity",
          location: "comparison",
          rule: "Turbidity tidak turun cukup",
          message: `Turbidity hanya turun ${turbidityReduction.toFixed(
            1,
          )}% (seharusnya min ${THRESHOLDS.turbidity.minReduction * 100}%)`,
          severity: "high",
          inlet_value: inlet,
          outlet_value: outlet,
          reduction: turbidityReduction,
        });
      }

      // Rule 7: Turbidity outlet melebihi baku mutu
      if (outlet > THRESHOLDS.turbidity.outlet.max) {
        alerts.push({
          parameter: "turbidity",
          location: "outlet",
          rule: "Turbidity outlet melebihi baku mutu",
          message: `Turbidity outlet ${outlet.toFixed(1)} NTU (max ${
            THRESHOLDS.turbidity.outlet.max
          } NTU)`,
          severity: "critical",
          inlet_value: inlet,
          outlet_value: outlet,
          threshold: THRESHOLDS.turbidity.outlet.max,
        });
      }
      break;

    case "temperature":
      const tempDiff = Math.abs(outlet - inlet);

      // Rule 8: Perbedaan suhu tidak boleh terlalu besar
      if (tempDiff > THRESHOLDS.temperature.maxDifference) {
        alerts.push({
          parameter: "temperature",
          location: "comparison",
          rule: "Perbedaan suhu terlalu besar",
          message: `Perbedaan suhu ${tempDiff.toFixed(1)}°C (max ${
            THRESHOLDS.temperature.maxDifference
          }°C)`,
          severity: "medium",
          inlet_value: inlet,
          outlet_value: outlet,
          difference: tempDiff,
        });
      }

      // Rule 9: Suhu outlet di luar range normal
      if (
        outlet < THRESHOLDS.temperature.outlet.min ||
        outlet > THRESHOLDS.temperature.outlet.max
      ) {
        alerts.push({
          parameter: "temperature",
          location: "outlet",
          rule: "Suhu outlet di luar range normal",
          message: `Suhu outlet ${outlet.toFixed(1)}°C (range: ${
            THRESHOLDS.temperature.outlet.min
          }-${THRESHOLDS.temperature.outlet.max}°C)`,
          severity: "medium",
          inlet_value: inlet,
          outlet_value: outlet,
          threshold: `${THRESHOLDS.temperature.outlet.min}-${THRESHOLDS.temperature.outlet.max}`,
        });
      }
      break;
  }

  return alerts;
}

/**
 * Main Fuzzy Logic Analysis Function
 * @param {Object} inletData - Data dari inlet {ph, tds, turbidity, temperature}
 * @param {Object} outletData - Data dari outlet {ph, tds, turbidity, temperature}
 * @returns {Object} - Hasil analisis dengan alerts
 */
function analyzeFuzzy(inletData, outletData) {
  console.log("🧠 Running Fuzzy Logic Analysis...");

  const alerts = [];

  // Analisis setiap parameter
  const parameters = ["ph", "tds", "turbidity", "temperature"];

  parameters.forEach((param) => {
    const paramAlerts = analyzeParameterChange(
      inletData[param],
      outletData[param],
      param,
    );
    alerts.push(...paramAlerts);
  });

  // Hitung skor kualitas keseluruhan (0-100)
  const qualityScore = calculateQualityScore(inletData, outletData, alerts);

  console.log(`✅ Fuzzy Analysis Complete: ${alerts.length} alerts found`);
  console.log(`📊 Quality Score: ${qualityScore}/100`);

  return {
    hasAlert: alerts.length > 0,
    alertCount: alerts.length,
    alerts: alerts,
    qualityScore: qualityScore,
    status: getOverallStatus(qualityScore, alerts),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Hitung skor kualitas (0-100)
 */
function calculateQualityScore(inlet, outlet, alerts) {
  let score = 100;

  // Kurangi skor berdasarkan severity alerts
  alerts.forEach((alert) => {
    switch (alert.severity) {
      case "critical":
        score -= 20;
        break;
      case "high":
        score -= 10;
        break;
      case "medium":
        score -= 5;
        break;
      case "low":
        score -= 2;
        break;
    }
  });

  return Math.max(0, score); // Min 0
}

/**
 * Tentukan status keseluruhan
 */
function getOverallStatus(score, alerts) {
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const highCount = alerts.filter((a) => a.severity === "high").length;

  if (criticalCount > 0) return "critical";
  if (highCount > 1) return "warning";
  if (score >= 80) return "good";
  if (score >= 60) return "fair";
  return "poor";
}

module.exports = {
  analyzeFuzzy,
  THRESHOLDS,
  pHMembership,
  tdsMembership,
  turbidityMembership,
  temperatureMembership,
};

console.log("📦 fuzzyLogicHelper loaded");
