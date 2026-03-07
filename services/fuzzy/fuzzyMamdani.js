/**
 * ========================================
 * FUZZY LOGIC MAMDANI ENGINE - PHASE 2
 * ========================================
 * Advanced fuzzy logic with:
 * - Gaussian membership functions
 * - Dynamic weighted scoring
 * - Context-aware analysis
 * - Dual analysis (Outlet + Effectiveness)
 */

const {
  OUTLET_RULES,
  EFFECTIVENESS_RULES,
  OUTPUT_MEMBERSHIP,
} = require("./fuzzyRules");

/**
 * ========================================
 * GAUSSIAN MEMBERSHIP FUNCTION
 * ========================================
 */
function gaussianMembership(x, center, sigma) {
  return Math.exp(-Math.pow(x - center, 2) / (2 * Math.pow(sigma, 2)));
}

/**
 * ========================================
 * TRAPEZOIDAL MEMBERSHIP FUNCTION
 * ========================================
 */
function trapezoidalMembership(x, a, b, c, d) {
  if (x <= a || x >= d) return 0;
  if (x >= b && x <= c) return 1;
  if (x > a && x < b) return (x - a) / (b - a);
  if (x > c && x < d) return (d - x) / (d - c);
  return 0;
}

/**
 * ========================================
 * TRIANGULAR MEMBERSHIP FUNCTION
 * ========================================
 */
function triangularMembership(x, a, b, c) {
  if (x <= a || x >= c) return 0;
  if (x === b) return 1;
  if (x > a && x < b) return (x - a) / (b - a);
  if (x > b && x < c) return (c - x) / (c - b);
  return 0;
}

/**
 * ========================================
 * FUZZIFICATION - OUTLET PARAMETERS
 * ========================================
 */
function fuzzifyOutlet(outlet) {
  const fuzzified = {
    ph: {},
    tds: {},
    suhu: {},
  };

  // pH (Gaussian)
  fuzzified.ph = {
    rendah: gaussianMembership(outlet.ph, 5.0, 1.0),
    normal: gaussianMembership(outlet.ph, 7.5, 1.0),
    tinggi: gaussianMembership(outlet.ph, 10.0, 1.0),
  };

  // TDS (Gaussian) - Calibrated for realistic IPAL range (baku mutu: ≤4000 mg/L)
  fuzzified.tds = {
    rendah: gaussianMembership(outlet.tds, 500, 400),
    normal: gaussianMembership(outlet.tds, 2000, 800),
    tinggi: gaussianMembership(outlet.tds, 4000, 800),
  };

  // Suhu (Gaussian)
  fuzzified.suhu = {
    rendah: gaussianMembership(outlet.temperature, 22, 3),
    normal: gaussianMembership(outlet.temperature, 30, 4),
    tinggi: gaussianMembership(outlet.temperature, 38, 3),
  };

  return fuzzified;
}

/**
 * ========================================
 * FUZZIFICATION - EFFECTIVENESS
 * ========================================
 */
function fuzzifyEffectiveness(inlet, outlet) {
  const effectiveness = calculateReductionRates(inlet, outlet);
  const fuzzified = {};

  // pH Effectiveness (based on outlet compliance)
  const phCompliant = outlet.ph >= 6.0 && outlet.ph <= 9.0;
  const phOptimal = outlet.ph >= 6.5 && outlet.ph <= 8.5;

  fuzzified.ph = {
    tidak_efektif: phCompliant ? 0 : 1,
    kurang_efektif: phCompliant && !phOptimal ? 0.7 : 0,
    efektif: phCompliant ? 0.8 : 0,
    sangat_efektif: phOptimal ? 1 : 0,
  };

  // TDS Reduction (Gaussian)
  fuzzified.tds = {
    tidak_efektif: gaussianMembership(effectiveness.tds_reduction, 5, 5),
    kurang_efektif: gaussianMembership(effectiveness.tds_reduction, 20, 8),
    efektif: gaussianMembership(effectiveness.tds_reduction, 45, 10),
    sangat_efektif: gaussianMembership(effectiveness.tds_reduction, 70, 12),
  };

  // Suhu Stability (based on change)
  const suhuChange = Math.abs(outlet.temperature - inlet.temperature);
  fuzzified.suhu = {
    tidak_stabil: suhuChange > 5 ? 1 : 0,
    kurang_stabil: gaussianMembership(suhuChange, 3, 1.5),
    stabil: gaussianMembership(suhuChange, 1, 1),
    sangat_stabil: suhuChange < 0.5 ? 1 : 0,
  };

  return { fuzzified, effectiveness };
}

/**
 * ========================================
 * CALCULATE REDUCTION RATES
 * ========================================
 */
function calculateReductionRates(inlet, outlet) {
  const tds_reduction =
    inlet.tds > 0 ? ((inlet.tds - outlet.tds) / inlet.tds) * 100 : 0;

  const ph_change = Math.abs(outlet.ph - inlet.ph);
  const suhu_change = inlet.temperature - outlet.temperature;

  return {
    tds_reduction: Math.max(0, tds_reduction),
    ph_change,
    suhu_change,
  };
}

/**
 * ========================================
 * FUZZY INFERENCE - OUTLET QUALITY
 * ========================================
 */
function inferOutletQuality(fuzzified) {
  const results = {
    baik: 0,
    cukup: 0,
    buruk: 0,
  };

  OUTLET_RULES.forEach((rule) => {
    let strength = 1;

    // Evaluate conditions (AND = MIN)
    rule.conditions.forEach((condition) => {
      const idx = condition.indexOf("_");
      const param = condition.substring(0, idx);
      const level = condition.substring(idx + 1);
      const membership = fuzzified[param][level];
      strength = Math.min(strength, membership);
    });

    // Apply to output (MAX aggregation)
    results[rule.output] = Math.max(results[rule.output], strength);
  });

  return results;
}

/**
 * ========================================
 * FUZZY INFERENCE - EFFECTIVENESS
 * ========================================
 */
function inferEffectiveness(fuzzified) {
  const results = {
    tidak_efektif: 0,
    kurang_efektif: 0,
    efektif: 0,
    sangat_efektif: 0,
  };

  EFFECTIVENESS_RULES.forEach((rule) => {
    let strength = 1;

    // Evaluate conditions (AND = MIN)
    rule.conditions.forEach((condition) => {
      const idx = condition.indexOf("_");
      const param = condition.substring(0, idx);
      const level = condition.substring(idx + 1);
      const membership = fuzzified[param]?.[level] || 0;
      strength = Math.min(strength, membership);
    });

    // Apply to output (MAX aggregation)
    results[rule.output] = Math.max(results[rule.output], strength);
  });

  return results;
}

/**
 * ========================================
 * DEFUZZIFICATION - CENTROID METHOD
 * ========================================
 */
function defuzzify(fuzzyOutput, outputMembership) {
  let numerator = 0;
  let denominator = 0;

  // Iterate through crisp values (0-100)
  for (let x = 0; x <= 100; x++) {
    let membership = 0;

    // Calculate membership for each category
    Object.keys(fuzzyOutput).forEach((category) => {
      const categoryMembership = fuzzyOutput[category];
      const outputShape = outputMembership[category];

      // Calculate membership at point x
      let pointMembership = 0;
      if (outputShape.type === "trapezoid") {
        pointMembership = trapezoidalMembership(
          x,
          outputShape.a,
          outputShape.b,
          outputShape.c,
          outputShape.d,
        );
      } else if (outputShape.type === "triangle") {
        pointMembership = triangularMembership(
          x,
          outputShape.a,
          outputShape.b,
          outputShape.c,
        );
      }

      // Apply fuzzy strength (MIN)
      membership = Math.max(
        membership,
        Math.min(categoryMembership, pointMembership),
      );
    });

    numerator += membership * x;
    denominator += membership;
  }

  return denominator > 0 ? Math.round(numerator / denominator) : 50;
}

/**
 * ========================================
 * CONTEXT-AWARE DYNAMIC WEIGHTING
 * ========================================
 */
function calculateDynamicWeights(outlet, outletScore, effectivenessScore) {
  // Check outlet compliance
  const outletCompliant =
    outlet.ph >= 6.0 &&
    outlet.ph <= 9.0 &&
    outlet.tds <= 4000 &&
    outlet.temperature <= 40;

  let outletWeight, effectivenessWeight;

  if (!outletCompliant) {
    // CRITICAL: Outlet tidak compliant - prioritas outlet
    outletWeight = 0.7;
    effectivenessWeight = 0.3;
  } else if (outletScore >= 80) {
    // Outlet sangat baik - fokus ke effectiveness
    outletWeight = 0.4;
    effectivenessWeight = 0.6;
  } else {
    // Balanced
    outletWeight = 0.5;
    effectivenessWeight = 0.5;
  }

  return { outletWeight, effectivenessWeight };
}

/**
 * ========================================
 * MAIN ANALYSIS FUNCTION
 * ========================================
 */
async function analyze(inlet, outlet) {
  try {
    console.log("🧠 Starting Fuzzy Mamdani Analysis (Phase 2)...");
    console.log("   Inlet:", inlet);
    console.log("   Outlet:", outlet);

    // ===== STEP 1: FUZZIFICATION =====
    const outletFuzzified = fuzzifyOutlet(outlet);
    const { fuzzified: effectivenessFuzzified, effectiveness } =
      fuzzifyEffectiveness(inlet, outlet);

    // ===== STEP 2: INFERENCE =====
    const outletQualityFuzzy = inferOutletQuality(outletFuzzified);
    const effectivenessFuzzy = inferEffectiveness(effectivenessFuzzified);

    // ===== STEP 3: DEFUZZIFICATION =====
    const outletScore = defuzzify(
      outletQualityFuzzy,
      OUTPUT_MEMBERSHIP.quality,
    );
    const effectivenessScore = defuzzify(
      effectivenessFuzzy,
      OUTPUT_MEMBERSHIP.effectiveness,
    );

    // ===== STEP 4: DYNAMIC WEIGHTING =====
    const weights = calculateDynamicWeights(
      outlet,
      outletScore,
      effectivenessScore,
    );

    const finalScore =
      outletScore * weights.outletWeight +
      effectivenessScore * weights.effectivenessWeight;

    // ===== STEP 5: STATUS DETERMINATION =====
    const outletStatus = determineStatus(outletScore);
    const effectivenessStatus =
      determineEffectivenessStatus(effectivenessScore);
    const overallStatus = determineStatus(Math.round(finalScore));

    // ===== STEP 6: COMPLIANCE CHECK =====
    const compliance = checkCompliance(outlet);

    // ===== STEP 7: GENERATE ALERTS =====
    const alerts = generateAlerts(
      inlet,
      outlet,
      outletScore,
      effectivenessScore,
      effectiveness,
      compliance,
    );

    // ===== STEP 8: RECOMMENDATIONS =====
    const recommendations = generateRecommendations(
      alerts,
      effectiveness,
      compliance,
    );

    const result = {
      // Overall scores
      final_score: Math.round(finalScore),
      overall_status: overallStatus,

      // Outlet analysis
      outlet_analysis: {
        score: outletScore,
        status: outletStatus,
        fuzzy_membership: outletQualityFuzzy,
        compliance: compliance.is_compliant,
        violations: compliance.violations,
      },

      // Effectiveness analysis
      effectiveness_analysis: {
        score: effectivenessScore,
        status: effectivenessStatus,
        fuzzy_membership: effectivenessFuzzy,
        reduction_rates: {
          tds: `${effectiveness.tds_reduction.toFixed(1)}%`,
          ph_change: effectiveness.ph_change.toFixed(2),
          suhu_change: `${effectiveness.suhu_change.toFixed(1)}°C`,
        },
      },

      // Dynamic weights used
      scoring_weights: {
        outlet_weight: weights.outletWeight,
        effectiveness_weight: weights.effectivenessWeight,
        reason: getWeightReason(weights),
      },

      // Alerts & recommendations
      alerts: alerts,
      alert_count: alerts.length,
      recommendations: recommendations,

      // Metadata
      analysis_method: "fuzzy_mamdani_phase2",
      defuzzification_method: "centroid",
      membership_type: "gaussian",
    };

    console.log("✅ Fuzzy Mamdani analysis complete:");
    console.log(`   Final Score: ${result.final_score}/100`);
    console.log(`   Overall Status: ${result.overall_status}`);
    console.log(`   Outlet Score: ${outletScore}/100 (${outletStatus})`);
    console.log(
      `   Effectiveness: ${effectivenessScore}/100 (${effectivenessStatus})`,
    );
    console.log(`   Alerts: ${alerts.length}`);

    return result;
  } catch (error) {
    console.error("❌ Error in fuzzy analysis:", error);
    throw error;
  }
}

/**
 * ========================================
 * STATUS DETERMINATION
 * ========================================
 */
function determineStatus(score) {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  if (score >= 30) return "poor";
  return "critical";
}

function determineEffectivenessStatus(score) {
  if (score >= 80) return "sangat_efektif";
  if (score >= 60) return "efektif";
  if (score >= 40) return "kurang_efektif";
  return "tidak_efektif";
}

/**
 * ========================================
 * COMPLIANCE CHECK
 * ========================================
 */
function checkCompliance(outlet) {
  const violations = [];

  // Baku Mutu Pemerintah
  if (outlet.ph < 6.0 || outlet.ph > 9.0) {
    violations.push({
      parameter: "ph",
      value: outlet.ph,
      limit: "6.0 - 9.0",
      severity: "critical",
    });
  }

  if (outlet.tds > 4000) {
    violations.push({
      parameter: "tds",
      value: outlet.tds,
      limit: "≤ 4000 mg/L",
      severity: "critical",
    });
  }

  if (outlet.temperature > 40) {
    violations.push({
      parameter: "temperature",
      value: outlet.temperature,
      limit: "≤ 40°C",
      severity: "critical",
    });
  }

  return {
    is_compliant: violations.length === 0,
    violations: violations,
  };
}

/**
 * ========================================
 * ALERT GENERATION (6 LEVELS)
 * ========================================
 */
function generateAlerts(
  inlet,
  outlet,
  outletScore,
  effectivenessScore,
  effectiveness,
  compliance,
) {
  const alerts = [];

  // 1. CRITICAL ALERTS (Compliance violations)
  if (!compliance.is_compliant) {
    compliance.violations.forEach((violation) => {
      alerts.push({
        level: "CRITICAL",
        type: "compliance_violation",
        parameter: violation.parameter,
        message: `${violation.parameter.toUpperCase()} outlet tidak memenuhi baku mutu (${
          violation.value
        } vs limit ${violation.limit})`,
        severity: "critical",
        priority: 1,
        action_required: "Immediate action - Stop discharge if necessary",
        timestamp: new Date().toISOString(),
      });
    });
  }

  // 2. ANOMALY ALERTS (Unusual patterns)
  // pH outlet worse than inlet (should not happen)
  if (
    inlet.ph >= 6.0 &&
    inlet.ph <= 9.0 &&
    (outlet.ph < 6.0 || outlet.ph > 9.0)
  ) {
    alerts.push({
      level: "ANOMALY",
      type: "unusual_pattern",
      parameter: "ph",
      message: `Inlet pH normal (${inlet.ph.toFixed(
        1,
      )}) tapi outlet di luar baku mutu (${outlet.ph.toFixed(
        1,
      )}) - Kemungkinan kontaminasi sekunder atau sistem buffer gagal`,
      severity: "high",
      priority: 2,
      action_required: "Urgent inspection required (< 4 hours)",
      timestamp: new Date().toISOString(),
    });
  }

  // TDS outlet > inlet (contamination)
  if (outlet.tds > inlet.tds * 1.1) {
    alerts.push({
      level: "ANOMALY",
      type: "contamination_suspected",
      parameter: "tds",
      message: `TDS outlet (${outlet.tds}) lebih tinggi dari inlet (${inlet.tds}) - Kemungkinan kontaminasi sekunder`,
      severity: "high",
      priority: 2,
      action_required: "Check for secondary contamination sources",
      timestamp: new Date().toISOString(),
    });
  }

  // 3. WARNING ALERTS (Low effectiveness)
  if (effectivenessScore < 50) {
    alerts.push({
      level: "WARNING",
      type: "low_effectiveness",
      parameter: "overall",
      message: `IPAL effectiveness rendah (${effectivenessScore}/100) - Performa di bawah standar`,
      severity: "medium",
      priority: 3,
      action_required: "Action required within 24 hours",
      details: {
        tds_reduction: effectiveness.tds_reduction.toFixed(1) + "%",
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Individual parameter effectiveness warnings
  if (effectiveness.tds_reduction < 20) {
    alerts.push({
      level: "WARNING",
      type: "low_reduction",
      parameter: "tds",
      message: `TDS reduction sangat rendah (${effectiveness.tds_reduction.toFixed(
        1,
      )}%) - Filter mungkin tersumbat`,
      severity: "medium",
      priority: 3,
      action_required: "Check filter system within 24 hours",
      timestamp: new Date().toISOString(),
    });
  }

  // 4. MAINTENANCE ALERTS (Borderline cases)
  // pH borderline
  if (
    (outlet.ph > 8.5 && outlet.ph <= 9.0) ||
    (outlet.ph < 6.5 && outlet.ph >= 6.0)
  ) {
    alerts.push({
      level: "MAINTENANCE",
      type: "borderline_parameter",
      parameter: "ph",
      message: `pH outlet mendekati batas (${outlet.ph.toFixed(
        1,
      )}) - Monitor ketat dan pertimbangkan adjustment`,
      severity: "low",
      priority: 4,
      action_required: "Schedule maintenance check",
      timestamp: new Date().toISOString(),
    });
  }

  // TDS borderline
  if (outlet.tds > 3500 && outlet.tds <= 4000) {
    alerts.push({
      level: "MAINTENANCE",
      type: "borderline_parameter",
      parameter: "tds",
      message: `TDS outlet mendekati batas maksimum (${outlet.tds.toFixed(
        0,
      )} mg/L) - Filter maintenance mungkin diperlukan`,
      severity: "low",
      priority: 4,
      action_required: "Plan filter cleaning/replacement",
      timestamp: new Date().toISOString(),
    });
  }

  // Temperature borderline
  if (outlet.temperature > 38 && outlet.temperature <= 40) {
    alerts.push({
      level: "MAINTENANCE",
      type: "borderline_parameter",
      parameter: "temperature",
      message: `Suhu outlet mendekati batas (${outlet.temperature.toFixed(
        1,
      )}°C) - Monitor sistem pendingin`,
      severity: "low",
      priority: 4,
      action_required: "Check cooling system",
      timestamp: new Date().toISOString(),
    });
  }

  // 5. PERFORMANCE ALERTS (Moderate effectiveness)
  if (effectivenessScore >= 50 && effectivenessScore < 70) {
    alerts.push({
      level: "PERFORMANCE",
      type: "moderate_effectiveness",
      parameter: "overall",
      message: `IPAL effectiveness moderat (${effectivenessScore}/100) - Ada ruang untuk optimasi`,
      severity: "low",
      priority: 5,
      action_required: "Review & optimize within 1 month",
      timestamp: new Date().toISOString(),
    });
  }

  // 6. INFO ALERTS (Good but informative)
  if (outletScore >= 70 && effectivenessScore >= 70) {
    alerts.push({
      level: "INFO",
      type: "system_normal",
      parameter: "overall",
      message: `Sistem beroperasi normal - Outlet score: ${outletScore}/100, Effectiveness: ${effectivenessScore}/100`,
      severity: "info",
      priority: 6,
      action_required: "Continue routine monitoring",
      timestamp: new Date().toISOString(),
    });
  }

  // Sort by priority
  return alerts.sort((a, b) => a.priority - b.priority);
}

/**
 * ========================================
 * RECOMMENDATIONS
 * ========================================
 */
function generateRecommendations(alerts, effectiveness, compliance) {
  const recommendations = [];

  // Critical recommendations
  if (!compliance.is_compliant) {
    recommendations.push({
      priority: "critical",
      category: "compliance",
      message: "IMMEDIATE: Stop discharge dan lakukan perbaikan sistem IPAL",
      actions: [
        "Isolasi outlet untuk mencegah pencemaran lingkungan",
        "Identifikasi penyebab kegagalan treatment",
        "Lakukan perbaikan sebelum melanjutkan operasi",
      ],
    });
  }

  // Effectiveness recommendations
  if (effectiveness.tds_reduction < 30) {
    recommendations.push({
      priority: "high",
      category: "maintenance",
      message: "Periksa dan bersihkan sistem filtrasi TDS",
      actions: [
        "Cek tekanan filter - mungkin tersumbat",
        "Lakukan backwash atau ganti media filter",
        "Periksa membrane RO jika ada",
        "Test kualitas chemical untuk regenerasi resin",
      ],
    });
  }

  // pH recommendations
  if (
    effectiveness.ph_change < 0.5 &&
    compliance.violations.find((v) => v.parameter === "ph")
  ) {
    recommendations.push({
      priority: "medium",
      category: "treatment",
      message: "Perbaiki sistem netralisasi pH",
      actions: [
        "Cek stok chemical buffer (NaOH/H2SO4)",
        "Kalibrasi pH controller",
        "Adjust dosing pump setting",
        "Periksa mixing chamber",
      ],
    });
  }

  // Temperature recommendations
  if (compliance.violations.find((v) => v.parameter === "temperature")) {
    recommendations.push({
      priority: "high",
      category: "treatment",
      message: "Perbaiki sistem pendingin air",
      actions: [
        "Periksa heat exchanger",
        "Cek cooling tower operation",
        "Monitor inlet temperature source",
        "Evaluasi cooling capacity",
      ],
    });
  }

  // General maintenance
  if (alerts.filter((a) => a.level === "MAINTENANCE").length > 0) {
    recommendations.push({
      priority: "medium",
      category: "preventive",
      message: "Scheduled maintenance diperlukan",
      actions: [
        "Lakukan maintenance rutin bulanan",
        "Cek semua sensor dan kalibrasi",
        "Inspect pompa dan motor",
        "Review chemical consumption",
      ],
    });
  }

  // Optimization recommendations
  if (effectiveness.tds_reduction >= 30 && compliance.is_compliant) {
    recommendations.push({
      priority: "low",
      category: "optimization",
      message: "Sistem bekerja baik - Pertimbangkan optimasi lebih lanjut",
      actions: [
        "Monitor trend jangka panjang",
        "Identifikasi peak load patterns",
        "Evaluasi efisiensi energi",
        "Consider automation upgrade",
      ],
    });
  }

  return recommendations;
}

/**
 * ========================================
 * HELPER FUNCTIONS
 * ========================================
 */
function getWeightReason(weights) {
  if (weights.outletWeight === 0.7) {
    return "Outlet tidak compliant - prioritas keselamatan";
  } else if (weights.effectivenessWeight === 0.6) {
    return "Outlet sangat baik - fokus optimasi effectiveness";
  } else {
    return "Balanced evaluation - kedua aspek sama penting";
  }
}

/**
 * ========================================
 * EXPORTS
 * ========================================
 */
module.exports = {
  analyze,

  // Exported for testing
  fuzzifyOutlet,
  fuzzifyEffectiveness,
  inferOutletQuality,
  inferEffectiveness,
  defuzzify,
  calculateReductionRates,
  checkCompliance,
  generateAlerts,

  // Helper functions
  gaussianMembership,
  trapezoidalMembership,
  triangularMembership,
};

console.log("📦 fuzzyMamdani.js (Phase 2 - 3 Parameters) loaded");
