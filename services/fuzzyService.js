/**
 * ========================================
 * FUZZY LOGIC SERVICE
 * ========================================
 * Water quality analysis using threshold-based scoring
 * Analyzes outlet quality AND inlet→outlet treatment efficiency
 *
 * Features:
 * - Outlet quality scoring (pH, TDS, Turbidity, Temperature)
 * - IPAL efficiency checks (reduction percentages)
 * - Violation detection with severity levels
 * - Recommendations generation
 */

// Note: fuzzyLogicHelper.js available for advanced fuzzy (Phase 2)
// Currently using simple threshold-based scoring (Phase 1)

/**
 * ========================================
 * BAKU MUTU THRESHOLDS
 * ========================================
 * Reference: Peraturan Menteri LHK
 * Synchronized with fuzzyLogicHelper.js thresholds
 */

const THRESHOLDS = {
  ph: {
    min: 6.0,
    max: 9.0,
    optimal_min: 6.5,
    optimal_max: 8.5,
  },
  tds: {
    max: 500, // ppm (outlet baku mutu)
    optimal_max: 300,
    inlet_max: 2000, // inlet bisa lebih tinggi
    min_reduction: 0.15, // TDS harus turun min 15%
  },
  turbidity: {
    max: 25, // NTU (outlet baku mutu)
    optimal_max: 5,
    inlet_max: 400, // inlet bisa lebih tinggi
    min_reduction: 0.5, // Turbidity harus turun min 50%
  },
  temperature: {
    min: 20, // °C
    max: 30,
    optimal_min: 25,
    optimal_max: 28,
    max_difference: 3, // Perbedaan inlet-outlet max 3°C
  },
};

/**
 * ========================================
 * MAIN ANALYSIS FUNCTION
 * ========================================
 */

/**
 * Analyze water quality data with fuzzy logic
 * @param {Object} inlet - Inlet sensor data { ph, tds, turbidity, temperature }
 * @param {Object} outlet - Outlet sensor data { ph, tds, turbidity, temperature }
 * @returns {Object} Analysis result with score, status, violations
 */
async function analyze(inlet, outlet) {
  try {
    console.log("🧠 Starting fuzzy logic analysis...");
    console.log("   Inlet:", inlet);
    console.log("   Outlet:", outlet);

    // Score based on outlet quality (baku mutu)
    const score = calculateSimpleScore(outlet);
    const status = determineStatus(score);

    // Check outlet violations (baku mutu)
    const outletViolations = checkViolations(outlet);

    // Check efficiency violations (inlet→outlet comparison)
    const efficiencyViolations = checkEfficiencyViolations(inlet, outlet);

    // Combine all violations
    const violations = [...outletViolations, ...efficiencyViolations];

    const recommendations = generateRecommendations(violations, inlet, outlet);

    const result = {
      quality_score: score,
      status: status,
      violations: violations,
      alert_count: violations.length,
      recommendations: recommendations,
      analysis_method: "threshold_with_efficiency",
      efficiency: calculateEfficiency(inlet, outlet),
    };

    console.log("✅ Fuzzy analysis complete:");
    console.log(`   Score: ${score}/100`);
    console.log(`   Status: ${status}`);
    console.log(
      `   Violations: ${violations.length} (${outletViolations.length} outlet, ${efficiencyViolations.length} efficiency)`,
    );

    return result;
  } catch (error) {
    console.error("❌ Error in fuzzy analysis:", error);
    throw error;
  }
}

/**
 * Calculate IPAL treatment efficiency
 */
function calculateEfficiency(inlet, outlet) {
  return {
    tds_reduction:
      inlet.tds > 0
        ? (((inlet.tds - outlet.tds) / inlet.tds) * 100).toFixed(1) + "%"
        : "N/A",
    turbidity_reduction:
      inlet.turbidity > 0
        ? (
            ((inlet.turbidity - outlet.turbidity) / inlet.turbidity) *
            100
          ).toFixed(1) + "%"
        : "N/A",
    ph_change: (outlet.ph - inlet.ph).toFixed(2),
    temp_change: (outlet.temperature - inlet.temperature).toFixed(1) + "°C",
  };
}

/**
 * Check IPAL efficiency violations (inlet vs outlet)
 */
function checkEfficiencyViolations(inlet, outlet) {
  const violations = [];

  // Check TDS reduction (should reduce by at least 15%)
  if (inlet.tds > 0) {
    const tdsReduction = (inlet.tds - outlet.tds) / inlet.tds;
    if (tdsReduction < THRESHOLDS.tds.min_reduction) {
      violations.push({
        parameter: "tds",
        location: "efficiency",
        value: (tdsReduction * 100).toFixed(1),
        threshold: THRESHOLDS.tds.min_reduction * 100,
        condition: "insufficient_reduction",
        severity: tdsReduction < 0 ? "critical" : "high",
        message: `Efisiensi TDS rendah (${(tdsReduction * 100).toFixed(1)}%). IPAL harus mengurangi TDS minimal ${THRESHOLDS.tds.min_reduction * 100}%`,
      });
    }
  }

  // Check Turbidity reduction (should reduce by at least 50%)
  if (inlet.turbidity > 0) {
    const turbReduction =
      (inlet.turbidity - outlet.turbidity) / inlet.turbidity;
    if (turbReduction < THRESHOLDS.turbidity.min_reduction) {
      violations.push({
        parameter: "turbidity",
        location: "efficiency",
        value: (turbReduction * 100).toFixed(1),
        threshold: THRESHOLDS.turbidity.min_reduction * 100,
        condition: "insufficient_reduction",
        severity: turbReduction < 0 ? "critical" : "high",
        message: `Efisiensi Turbidity rendah (${(turbReduction * 100).toFixed(1)}%). IPAL harus mengurangi Turbidity minimal ${THRESHOLDS.turbidity.min_reduction * 100}%`,
      });
    }
  }

  // Check Temperature difference (max 3°C)
  const tempDiff = Math.abs(outlet.temperature - inlet.temperature);
  if (tempDiff > THRESHOLDS.temperature.max_difference) {
    violations.push({
      parameter: "temperature",
      location: "efficiency",
      value: tempDiff.toFixed(1),
      threshold: THRESHOLDS.temperature.max_difference,
      condition: "excessive_change",
      severity: tempDiff > 5 ? "high" : "medium",
      message: `Perubahan suhu terlalu besar (${tempDiff.toFixed(1)}°C). Maksimal ${THRESHOLDS.temperature.max_difference}°C`,
    });
  }

  return violations;
}

/**
 * ========================================
 * SCORING FUNCTIONS (Phase 1: Simple)
 * ========================================
 */

/**
 * Calculate simple quality score based on thresholds
 * Score: 0-100 (100 = excellent, 0 = very poor)
 */
function calculateSimpleScore(data) {
  let score = 100;
  const deductions = [];

  // 1. Check pH (weight: 25%)
  const phScore = scorePH(data.ph);
  const phDeduction = Math.round((100 - phScore) * 0.25);
  score -= phDeduction;
  if (phDeduction > 0) {
    deductions.push({ parameter: "pH", deduction: phDeduction });
  }

  // 2. Check TDS (weight: 25%)
  const tdsScore = scoreTDS(data.tds);
  const tdsDeduction = Math.round((100 - tdsScore) * 0.25);
  score -= tdsDeduction;
  if (tdsDeduction > 0) {
    deductions.push({ parameter: "TDS", deduction: tdsDeduction });
  }

  // 3. Check Turbidity (weight: 30%)
  const turbidityScore = scoreTurbidity(data.turbidity);
  const turbidityDeduction = Math.round((100 - turbidityScore) * 0.3);
  score -= turbidityDeduction;
  if (turbidityDeduction > 0) {
    deductions.push({ parameter: "Turbidity", deduction: turbidityDeduction });
  }

  // 4. Check Temperature (weight: 20%)
  const tempScore = scoreTemperature(data.temperature);
  const tempDeduction = Math.round((100 - tempScore) * 0.2);
  score -= tempDeduction;
  if (tempDeduction > 0) {
    deductions.push({ parameter: "Temperature", deduction: tempDeduction });
  }

  // Log deductions for debugging
  if (deductions.length > 0) {
    console.log("   Deductions:", deductions);
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, Math.round(score)));

  return score;
}

/**
 * Score pH value (0-100)
 */
function scorePH(ph) {
  const { min, max, optimal_min, optimal_max } = THRESHOLDS.ph;

  if (ph < min || ph > max) {
    // Critical violation
    return 0;
  } else if (ph >= optimal_min && ph <= optimal_max) {
    // Optimal range
    return 100;
  } else if (ph < optimal_min) {
    // Below optimal but above minimum
    const range = optimal_min - min;
    const distance = optimal_min - ph;
    return Math.round(100 - (distance / range) * 50);
  } else {
    // Above optimal but below maximum
    const range = max - optimal_max;
    const distance = ph - optimal_max;
    return Math.round(100 - (distance / range) * 50);
  }
}

/**
 * Score TDS value (0-100)
 */
function scoreTDS(tds) {
  const { max, optimal_max } = THRESHOLDS.tds;

  if (tds > max) {
    // Critical violation
    return 0;
  } else if (tds <= optimal_max) {
    // Optimal range
    return 100;
  } else {
    // Between optimal and max
    const range = max - optimal_max;
    const distance = tds - optimal_max;
    return Math.round(100 - (distance / range) * 100);
  }
}

/**
 * Score Turbidity value (0-100)
 */
function scoreTurbidity(turbidity) {
  const { max, optimal_max } = THRESHOLDS.turbidity;

  if (turbidity > max) {
    // Critical violation
    return 0;
  } else if (turbidity <= optimal_max) {
    // Optimal range
    return 100;
  } else {
    // Between optimal and max
    const range = max - optimal_max;
    const distance = turbidity - optimal_max;
    return Math.round(100 - (distance / range) * 100);
  }
}

/**
 * Score Temperature value (0-100)
 */
function scoreTemperature(temp) {
  const { min, max, optimal_min, optimal_max } = THRESHOLDS.temperature;

  if (temp < min || temp > max) {
    // Critical violation
    return 0;
  } else if (temp >= optimal_min && temp <= optimal_max) {
    // Optimal range
    return 100;
  } else if (temp < optimal_min) {
    // Below optimal but above minimum
    const range = optimal_min - min;
    const distance = optimal_min - temp;
    return Math.round(100 - (distance / range) * 50);
  } else {
    // Above optimal but below maximum
    const range = max - optimal_max;
    const distance = temp - optimal_max;
    return Math.round(100 - (distance / range) * 50);
  }
}

/**
 * ========================================
 * STATUS DETERMINATION
 * ========================================
 */

/**
 * Determine water quality status from score
 */
function determineStatus(score) {
  if (score >= 85) {
    return "excellent";
  } else if (score >= 70) {
    return "good";
  } else if (score >= 50) {
    return "fair";
  } else if (score >= 30) {
    return "poor";
  } else {
    return "critical";
  }
}

/**
 * ========================================
 * VIOLATION DETECTION
 * ========================================
 */

/**
 * Check for threshold violations
 * Returns array of violations with details
 */
function checkViolations(data) {
  const violations = [];

  // Check pH
  if (data.ph < THRESHOLDS.ph.min || data.ph > THRESHOLDS.ph.max) {
    violations.push({
      parameter: "ph",
      location: "outlet",
      value: data.ph,
      threshold:
        data.ph < THRESHOLDS.ph.min ? THRESHOLDS.ph.min : THRESHOLDS.ph.max,
      condition:
        data.ph < THRESHOLDS.ph.min ? "below_minimum" : "above_maximum",
      severity: determineSeverity("ph", data.ph),
      message: `pH outlet (${data.ph.toFixed(2)}) ${
        data.ph < THRESHOLDS.ph.min ? "di bawah" : "melebihi"
      } batas aman (${
        data.ph < THRESHOLDS.ph.min ? THRESHOLDS.ph.min : THRESHOLDS.ph.max
      })`,
    });
  }

  // Check TDS
  if (data.tds > THRESHOLDS.tds.max) {
    violations.push({
      parameter: "tds",
      location: "outlet",
      value: data.tds,
      threshold: THRESHOLDS.tds.max,
      condition: "above_maximum",
      severity: determineSeverity("tds", data.tds),
      message: `TDS outlet (${data.tds.toFixed(1)} ppm) melebihi batas aman (${
        THRESHOLDS.tds.max
      } ppm)`,
    });
  }

  // Check Turbidity
  if (data.turbidity > THRESHOLDS.turbidity.max) {
    violations.push({
      parameter: "turbidity",
      location: "outlet",
      value: data.turbidity,
      threshold: THRESHOLDS.turbidity.max,
      condition: "above_maximum",
      severity: determineSeverity("turbidity", data.turbidity),
      message: `Turbidity outlet (${data.turbidity.toFixed(
        1,
      )} NTU) melebihi batas aman (${THRESHOLDS.turbidity.max} NTU)`,
    });
  }

  // Check Temperature
  if (
    data.temperature < THRESHOLDS.temperature.min ||
    data.temperature > THRESHOLDS.temperature.max
  ) {
    violations.push({
      parameter: "temperature",
      location: "outlet",
      value: data.temperature,
      threshold:
        data.temperature < THRESHOLDS.temperature.min
          ? THRESHOLDS.temperature.min
          : THRESHOLDS.temperature.max,
      condition:
        data.temperature < THRESHOLDS.temperature.min
          ? "below_minimum"
          : "above_maximum",
      severity: determineSeverity("temperature", data.temperature),
      message: `Temperature outlet (${data.temperature.toFixed(1)}°C) ${
        data.temperature < THRESHOLDS.temperature.min ? "di bawah" : "melebihi"
      } batas aman (${
        data.temperature < THRESHOLDS.temperature.min
          ? THRESHOLDS.temperature.min
          : THRESHOLDS.temperature.max
      }°C)`,
    });
  }

  return violations;
}

/**
 * Determine severity level for a violation
 */
function determineSeverity(parameter, value) {
  const threshold = THRESHOLDS[parameter];

  if (parameter === "ph") {
    const deviation = Math.max(
      Math.abs(value - threshold.min),
      Math.abs(value - threshold.max),
    );

    if (deviation > 2.0) return "critical";
    if (deviation > 1.0) return "high";
    if (deviation > 0.5) return "medium";
    return "low";
  }

  if (parameter === "tds") {
    const ratio = value / threshold.max;
    if (ratio > 2.0) return "critical";
    if (ratio > 1.5) return "high";
    if (ratio > 1.2) return "medium";
    return "low";
  }

  if (parameter === "turbidity") {
    const ratio = value / threshold.max;
    if (ratio > 2.0) return "critical";
    if (ratio > 1.5) return "high";
    if (ratio > 1.2) return "medium";
    return "low";
  }

  if (parameter === "temperature") {
    const deviation = Math.max(
      Math.abs(value - threshold.min),
      Math.abs(value - threshold.max),
    );

    if (deviation > 10) return "critical";
    if (deviation > 5) return "high";
    if (deviation > 3) return "medium";
    return "low";
  }

  return "low";
}

/**
 * ========================================
 * RECOMMENDATIONS
 * ========================================
 */

/**
 * Generate recommendations based on violations and data
 */
function generateRecommendations(violations, inlet, outlet) {
  const recommendations = [];

  if (violations.length === 0) {
    recommendations.push({
      type: "maintenance",
      priority: "low",
      message: "Kualitas air baik. Lanjutkan pemeliharaan rutin IPAL.",
    });
    return recommendations;
  }

  // Recommendations based on violations
  violations.forEach((violation) => {
    switch (violation.parameter) {
      case "ph":
        if (violation.value < THRESHOLDS.ph.min) {
          recommendations.push({
            type: "treatment",
            priority: violation.severity,
            message:
              "pH terlalu rendah (asam). Pertimbangkan penambahan basa untuk menetralkan.",
          });
        } else {
          recommendations.push({
            type: "treatment",
            priority: violation.severity,
            message:
              "pH terlalu tinggi (basa). Pertimbangkan penambahan asam untuk menetralkan.",
          });
        }
        break;

      case "tds":
        recommendations.push({
          type: "treatment",
          priority: violation.severity,
          message:
            "TDS tinggi. Periksa sistem filtrasi dan pertimbangkan pembersihan filter.",
        });
        break;

      case "turbidity":
        recommendations.push({
          type: "treatment",
          priority: violation.severity,
          message: "Turbidity tinggi. Periksa sistem sedimentasi dan filtrasi.",
        });
        break;

      case "temperature":
        recommendations.push({
          type: "monitoring",
          priority: violation.severity,
          message:
            "Temperature di luar range normal. Monitor kondisi lingkungan.",
        });
        break;
    }
  });

  // Check treatment effectiveness (inlet vs outlet)
  const effectiveness = evaluateTreatmentEffectiveness(inlet, outlet);
  if (!effectiveness.isEffective) {
    recommendations.push({
      type: "maintenance",
      priority: "high",
      message:
        "Efektivitas IPAL rendah. Lakukan inspeksi dan maintenance komprehensif.",
    });
  }

  return recommendations;
}

/**
 * Evaluate IPAL treatment effectiveness
 */
function evaluateTreatmentEffectiveness(inlet, outlet) {
  const improvements = {
    tds: ((inlet.tds - outlet.tds) / inlet.tds) * 100,
    turbidity: ((inlet.turbidity - outlet.turbidity) / inlet.turbidity) * 100,
  };

  // Treatment is effective if TDS and turbidity reduced significantly
  const isEffective = improvements.tds > 10 && improvements.turbidity > 20;

  return {
    isEffective,
    improvements,
  };
}

/**
 * ========================================
 * ADVANCED FUZZY LOGIC (Phase 2 - Future)
 * ========================================
 * For advanced fuzzy membership functions,
 * see: utils/fuzzyLogicHelper.js
 * Can be integrated when needed for more sophisticated analysis.
 */

/**
 * ========================================
 * EXPORTS
 * ========================================
 */

module.exports = {
  // Main function
  analyze,

  // Helper functions (exported for testing)
  calculateSimpleScore,
  determineStatus,
  checkViolations,
  checkEfficiencyViolations,
  calculateEfficiency,
  determineSeverity,
  generateRecommendations,
  evaluateTreatmentEffectiveness,

  // Thresholds (exported for reference)
  THRESHOLDS,
};

console.log("📦 fuzzyService (with efficiency checks) loaded");
