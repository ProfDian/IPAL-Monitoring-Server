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

    const result = {
      // Overall scores
      final_score: Math.round(finalScore),
      overall_status: overallStatus,

      // Outlet analysis
      outlet_analysis: {
        score: outletScore,
        status: outletStatus,
        fuzzy_membership: outletQualityFuzzy,
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

  // Helper functions
  gaussianMembership,
  trapezoidalMembership,
  triangularMembership,
};

console.log("📦 fuzzyMamdani.js (Phase 2 - 3 Parameters) loaded");
