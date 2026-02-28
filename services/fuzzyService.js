/**
 * ========================================
 * FUZZY SERVICE - BAKU MUTU PEMERINTAH
 * ========================================
 * Integrated from fuzzylogiccapstone with backward-compatible API.
 * Sesuai Standar Pemerintah untuk Limbah Industri.
 *
 * Features:
 * - Outlet quality scoring (pH, TDS, Temperature) with 35/40/25 weights
 * - IPAL effectiveness checks (TDS reduction, pH change)
 * - Sensor health detection & fallback replacement
 * - Composite scoring: 60% outlet + 30% effectiveness + 10% sensor health
 * - Violation detection with severity levels
 * - Recommendations generation with priority/category
 */

// ========================================
// KONFIGURASI BAKU MUTU PEMERINTAH
// ========================================
const STANDARDS = {
  ph: { min: 6.0, max: 9.0, optimal: [6.5, 8.5] },
  tds: { max: 4000, optimal: 1000 },
  temperature: { max: 40, optimal: [25, 30] },
};

const BAKU_MUTU = {
  pemerintah: STANDARDS,
  golongan_2: STANDARDS, // Backward compatibility
};

// Target efektivitas IPAL
const EFFECTIVENESS_TARGET = {
  tds_reduction: 15, // Minimal 15% penurunan TDS
  ph_increase: [0.3, 1.5],
};

// Backward-compatible alias (some code references THRESHOLDS)
const THRESHOLDS = {
  ph: {
    min: STANDARDS.ph.min,
    max: STANDARDS.ph.max,
    optimal_min: STANDARDS.ph.optimal[0],
    optimal_max: STANDARDS.ph.optimal[1],
  },
  tds: {
    max: STANDARDS.tds.max,
    optimal_max: STANDARDS.tds.optimal,
    min_reduction: EFFECTIVENESS_TARGET.tds_reduction / 100,
  },
  temperature: {
    min: STANDARDS.temperature.optimal[0],
    max: STANDARDS.temperature.max,
    optimal_min: STANDARDS.temperature.optimal[0],
    optimal_max: STANDARDS.temperature.optimal[1],
    max_difference: 3,
  },
};

// ========================================
// HELPER FUNCTIONS
// ========================================
function getStatus(score) {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  if (score >= 30) return "poor";
  return "critical";
}

// Alias for backward compatibility
const determineStatus = getStatus;

// ========================================
// SENSOR HEALTH CHECK
// ========================================
function checkSensorHealth(inlet, outlet) {
  const faults = [];
  const params = ["ph", "tds", "temperature"];
  const defaults = { ph: 7, tds: 500, temperature: 28 };

  // Check inlet
  params.forEach((p) => {
    const val = inlet[p];
    if (val === null || val === undefined || isNaN(val)) {
      faults.push({
        sensor: `inlet.${p}`,
        location: "inlet",
        parameter: p,
        original_value: val,
        replaced_with: defaults[p],
        message: `Sensor inlet.${p} rusak`,
      });
      inlet[p] = defaults[p];
    }
  });

  // Check outlet
  params.forEach((p) => {
    const val = outlet[p];
    if (val === null || val === undefined || isNaN(val)) {
      faults.push({
        sensor: `outlet.${p}`,
        location: "outlet",
        parameter: p,
        original_value: val,
        replaced_with: defaults[p],
        message: `Sensor outlet.${p} rusak`,
      });
      outlet[p] = defaults[p];
    }
  });

  return {
    count: faults.length,
    confidence_score: ((6 - faults.length) / 6) * 100,
    faults,
    all_healthy: faults.length === 0,
  };
}

// ========================================
// SCORING
// ========================================
function scoreParameter(value, param) {
  const std = STANDARDS[param];

  if (param === "ph" || param === "temperature") {
    const min = std.min || 0;
    const max = std.max;
    if (value < min || value > max) return 0;
    if (value >= std.optimal[0] && value <= std.optimal[1]) return 100;
    if (value < std.optimal[0]) {
      return 100 - ((std.optimal[0] - value) / (std.optimal[0] - min)) * 50;
    }
    return 100 - ((value - std.optimal[1]) / (max - std.optimal[1])) * 50;
  }

  // TDS
  if (value > std.max) return 0;
  if (value <= std.optimal) return 100;
  return 100 - ((value - std.optimal) / (std.max - std.optimal)) * 100;
}

function scoreOutlet(outlet) {
  const scores = {
    ph: scoreParameter(outlet.ph, "ph"),
    tds: scoreParameter(outlet.tds, "tds"),
    temperature: scoreParameter(outlet.temperature, "temperature"),
  };

  const total = scores.ph * 0.35 + scores.tds * 0.4 + scores.temperature * 0.25;

  return {
    score: Math.round(total),
    breakdown: scores,
    status: getStatus(Math.round(total)),
  };
}

// Backward-compatible alias
function calculateSimpleScore(data) {
  return scoreOutlet(data).score;
}

// ========================================
// EFFECTIVENESS
// ========================================
function checkEffectiveness(inlet, outlet) {
  const reductions = {
    tds: ((inlet.tds - outlet.tds) / inlet.tds) * 100,
    ph_change: outlet.ph - inlet.ph,
  };

  const issues = [];

  if (reductions.tds < EFFECTIVENESS_TARGET.tds_reduction) {
    issues.push({ type: "LOW_TDS_REDUCTION", severity: "high" });
  }
  if (reductions.ph_change < 0.3 || reductions.ph_change > 1.5) {
    issues.push({ type: "PH_CHANGE_ISSUE", severity: "medium" });
  }

  const score = Math.round(
    (Math.min(reductions.tds / EFFECTIVENESS_TARGET.tds_reduction, 1) * 100 +
      (reductions.ph_change >= 0.3 && reductions.ph_change <= 1.5 ? 100 : 50)) /
      2,
  );

  return {
    score,
    reductions,
    issues,
    effective: issues.length === 0,
    status: issues.length === 0 ? "effective" : "ineffective",
  };
}

// Backward-compatible aliases
function calculateEfficiency(inlet, outlet) {
  return {
    tds_reduction:
      inlet.tds > 0
        ? (((inlet.tds - outlet.tds) / inlet.tds) * 100).toFixed(1) + "%"
        : "N/A",
    ph_change: (outlet.ph - inlet.ph).toFixed(2),
    temp_change: (outlet.temperature - inlet.temperature).toFixed(1) + "°C",
  };
}

function checkEfficiencyViolations(inlet, outlet) {
  const eff = checkEffectiveness(inlet, outlet);
  return eff.issues.map((issue) => ({
    parameter: issue.type === "LOW_TDS_REDUCTION" ? "tds" : "ph",
    location: "efficiency",
    value:
      issue.type === "LOW_TDS_REDUCTION"
        ? eff.reductions.tds.toFixed(1)
        : eff.reductions.ph_change.toFixed(2),
    threshold:
      issue.type === "LOW_TDS_REDUCTION"
        ? EFFECTIVENESS_TARGET.tds_reduction
        : "0.3-1.5",
    condition:
      issue.type === "LOW_TDS_REDUCTION"
        ? "insufficient_reduction"
        : "ph_change_issue",
    severity: issue.severity,
    message:
      issue.type === "LOW_TDS_REDUCTION"
        ? `Efisiensi TDS rendah (${eff.reductions.tds.toFixed(1)}%). IPAL harus mengurangi TDS minimal ${EFFECTIVENESS_TARGET.tds_reduction}%`
        : `Perubahan pH ${eff.reductions.ph_change.toFixed(2)} tidak optimal (target: 0.3-1.5)`,
  }));
}

function evaluateTreatmentEffectiveness(inlet, outlet) {
  const eff = checkEffectiveness(inlet, outlet);
  return {
    isEffective: eff.effective,
    improvements: { tds: eff.reductions.tds },
  };
}

// ========================================
// VIOLATIONS - BAKU MUTU PEMERINTAH
// ========================================
/**
 * Check for threshold violations (backward-compatible format)
 * Each violation includes location, condition, and numeric threshold
 * for compatibility with createAlertsForViolations()
 */
function checkThresholdViolations(outlet) {
  const violations = [];

  // pH: 6.0 - 9.0
  if (outlet.ph < 6.0 || outlet.ph > 9.0) {
    const isBelow = outlet.ph < 6.0;
    violations.push({
      parameter: "ph",
      location: "outlet",
      value: outlet.ph,
      threshold: isBelow ? 6.0 : 9.0,
      condition: isBelow ? "below_minimum" : "above_maximum",
      message: `pH ${outlet.ph.toFixed(2)} di luar batas baku mutu (6.0-9.0)`,
      severity:
        Math.abs(outlet.ph - (isBelow ? 6.0 : 9.0)) > 1.0 ? "critical" : "high",
    });
  }

  // TDS: ≤4000 mg/L
  if (outlet.tds > 4000) {
    violations.push({
      parameter: "tds",
      location: "outlet",
      value: outlet.tds,
      threshold: 4000,
      condition: "above_maximum",
      message: `TDS ${outlet.tds.toFixed(1)} mg/L melebihi baku mutu (≤4000 mg/L)`,
      severity: outlet.tds > 5000 ? "critical" : "high",
    });
  }

  // Temperature: ≤40°C
  if (outlet.temperature > 40) {
    violations.push({
      parameter: "temperature",
      location: "outlet",
      value: outlet.temperature,
      threshold: 40,
      condition: "above_maximum",
      message: `Suhu ${outlet.temperature.toFixed(1)}°C melebihi baku mutu (≤40°C)`,
      severity: outlet.temperature > 45 ? "critical" : "medium",
    });
  }

  return violations;
}

// Backward-compatible alias
const checkViolations = checkThresholdViolations;

function determineSeverity(parameter, value) {
  if (parameter === "ph") {
    const deviation = Math.max(Math.abs(value - 6.0), Math.abs(value - 9.0));
    if (deviation > 2.0) return "critical";
    if (deviation > 1.0) return "high";
    if (deviation > 0.5) return "medium";
    return "low";
  }
  if (parameter === "tds") {
    const ratio = value / STANDARDS.tds.max;
    if (ratio > 2.0) return "critical";
    if (ratio > 1.5) return "high";
    if (ratio > 1.2) return "medium";
    return "low";
  }
  if (parameter === "temperature") {
    const deviation = Math.abs(value - STANDARDS.temperature.max);
    if (deviation > 10) return "critical";
    if (deviation > 5) return "high";
    if (deviation > 3) return "medium";
    return "low";
  }
  return "low";
}

// ========================================
// RECOMMENDATIONS
// ========================================
function generateRecommendations(
  outletScore,
  effectiveness,
  violations,
  sensorHealth,
) {
  const recs = [];

  // Sensor faults - highest priority
  if (sensorHealth.count > 0) {
    recs.push({
      priority: "URGENT",
      category: "SENSOR",
      type: "sensor",
      action: `Perbaiki ${sensorHealth.count} sensor rusak segera`,
      message: `Perbaiki ${sensorHealth.count} sensor rusak segera`,
    });
  }

  // Critical violations - stop operations
  if (violations.filter((v) => v.severity === "critical").length > 0) {
    recs.push({
      priority: "URGENT",
      category: "SAFETY",
      type: "treatment",
      action: "STOP OPERASI! Pelanggaran baku mutu kritis terdeteksi",
      message: "STOP OPERASI! Pelanggaran baku mutu kritis terdeteksi",
    });
  }

  // Specific parameter violations
  violations.forEach((v) => {
    if (v.parameter === "tds" && v.value > 4000) {
      recs.push({
        priority: "HIGH",
        category: "TREATMENT",
        type: "treatment",
        action: `TDS ${v.value.toFixed(0)} mg/L > 4000 mg/L: Evaluasi sistem reverse osmosis atau ion exchange`,
        message: `TDS tinggi. Periksa sistem filtrasi dan pertimbangkan pembersihan filter.`,
      });
    }
    if (v.parameter === "ph" && (v.value < 6.0 || v.value > 9.0)) {
      recs.push({
        priority: "HIGH",
        category: "TREATMENT",
        type: "treatment",
        action: `pH ${v.value.toFixed(2)} di luar 6.0-9.0: Sesuaikan dosis kimia netralisasi`,
        message:
          v.value < 6.0
            ? "pH terlalu rendah (asam). Pertimbangkan penambahan basa untuk menetralkan."
            : "pH terlalu tinggi (basa). Pertimbangkan penambahan asam untuk menetralkan.",
      });
    }
    if (v.parameter === "temperature" && v.value > 40) {
      recs.push({
        priority: "MEDIUM",
        category: "TREATMENT",
        type: "monitoring",
        action: `Suhu ${v.value.toFixed(1)}°C > 40°C: Periksa sistem pendingin dan heat exchanger`,
        message:
          "Temperature di luar range normal. Monitor kondisi lingkungan.",
      });
    }
  });

  // Low effectiveness
  if (!effectiveness.effective) {
    if (effectiveness.reductions.tds < EFFECTIVENESS_TARGET.tds_reduction) {
      recs.push({
        priority: "MEDIUM",
        category: "MAINTENANCE",
        type: "maintenance",
        action: `Penurunan TDS hanya ${effectiveness.reductions.tds.toFixed(1)}% (target: ≥15%): Evaluasi proses biologis dan kimia`,
        message:
          "Efektivitas IPAL rendah. Lakukan inspeksi dan maintenance komprehensif.",
      });
    }
    if (
      effectiveness.reductions.ph_change < 0.3 ||
      effectiveness.reductions.ph_change > 1.5
    ) {
      recs.push({
        priority: "MEDIUM",
        category: "MAINTENANCE",
        type: "maintenance",
        action: `Perubahan pH ${effectiveness.reductions.ph_change.toFixed(2)} tidak optimal (target: 0.3-1.5): Cek sistem netralisasi`,
        message: "Perubahan pH tidak optimal. Cek sistem netralisasi.",
      });
    }
  }

  // All good
  if (
    outletScore.status === "excellent" &&
    effectiveness.effective &&
    violations.length === 0
  ) {
    recs.push({
      priority: "LOW",
      category: "MAINTENANCE",
      type: "maintenance",
      action:
        "Sistem optimal sesuai baku mutu pemerintah. Lanjutkan pemeliharaan rutin.",
      message: "Kualitas air baik. Lanjutkan pemeliharaan rutin IPAL.",
    });
  }

  return recs;
}

// ========================================
// MAIN ANALYSIS
// ========================================
/**
 * Analyze water quality data with fuzzy logic
 * @param {Object} inlet - Inlet sensor data { ph, tds, temperature }
 * @param {Object} outlet - Outlet sensor data { ph, tds, temperature }
 * @returns {Object} Analysis result with score, status, violations
 */
async function analyze(inlet, outlet) {
  try {
    console.log("🧠 Analyzing water quality (Baku Mutu Pemerintah)...");
    console.log("   Inlet:", inlet);
    console.log("   Outlet:", outlet);

    // Save original data before sensor health fix
    const inletOriginal = { ...inlet };
    const outletOriginal = { ...outlet };

    // Check & fix faulty sensors
    const sensorHealth = checkSensorHealth(inlet, outlet);

    // Score outlet quality
    const outletScore = scoreOutlet(outlet);

    // Check effectiveness
    const effectiveness = checkEffectiveness(inlet, outlet);

    // Check baku mutu violations (backward-compatible format)
    const violations = checkThresholdViolations(outlet);

    // Generate recommendations
    const recommendations = generateRecommendations(
      outletScore,
      effectiveness,
      violations,
      sensorHealth,
    );

    // Calculate composite final score
    const finalScore = Math.round(
      outletScore.score * 0.6 +
        effectiveness.score * 0.3 +
        sensorHealth.confidence_score * 0.1,
    );

    const status = getStatus(finalScore);

    // Build alerts array
    const alerts = [
      ...sensorHealth.faults.map((f) => ({
        type: "SENSOR_FAULT",
        priority: "medium",
        level: "WARNING",
        message: f.message,
      })),
      ...effectiveness.issues.map((i) => ({
        type: i.type,
        priority: i.severity,
        level: i.severity === "high" ? "CRITICAL" : "WARNING",
        message: i.type,
      })),
      ...violations.map((v) => ({
        type: "VIOLATION",
        priority: v.severity,
        level: v.severity === "critical" ? "CRITICAL" : "WARNING",
        message: v.message,
        threshold: v.threshold,
      })),
    ];

    console.log("✅ Fuzzy analysis complete:");
    console.log(`   Score: ${finalScore}/100`);
    console.log(`   Status: ${status}`);
    console.log(`   Violations: ${violations.length}`);

    return {
      // === Backward-compatible fields (used by waterQualityService) ===
      quality_score: finalScore,
      status: status,
      violations: violations, // Top-level for createAlertsForViolations
      alert_count: violations.length,
      recommendations: recommendations,
      analysis_method: "simplified_fuzzy_logic",
      efficiency: calculateEfficiency(inlet, outlet),

      // === New enriched fields from capstone integration ===
      input: { inlet: inletOriginal, outlet: outletOriginal },
      processed: { inlet, outlet },
      final_score: finalScore,
      overall_status: status,

      fuzzy_analysis: {
        outlet: {
          score: outletScore.score,
          status: outletScore.status,
          membership: outletScore.breakdown,
          compliance: violations.length === 0,
        },
        effectiveness: {
          score: effectiveness.score,
          status: effectiveness.status,
          membership: {},
          reduction_rates: effectiveness.reductions,
        },
        scoring_weights: {
          outlet_quality: 60,
          effectiveness: 30,
          sensor_health: 10,
        },
      },

      outlet_quality: outletScore,
      ipal_effectiveness: effectiveness,

      sensor_status: {
        ...sensorHealth,
        faults: { count: sensorHealth.count, ...sensorHealth },
      },
      sensor_health: sensorHealth,

      sensor_alert_count: sensorHealth.count,
      fuzzy_alert_count: effectiveness.issues.length + violations.length,

      compliance: {
        is_compliant: violations.length === 0,
        violations,
        standard: "Baku Mutu Pemerintah",
      },

      alerts,

      analyzed_at: new Date().toISOString(),
      defuzzification_method: "weighted_average",
      membership_type: "linear",
      standard_used:
        "Baku Mutu Pemerintah (pH: 6.0-9.0, TDS: ≤4000, Temp: ≤40)",
    };
  } catch (error) {
    console.error("❌ Error in fuzzy analysis:", error);
    throw error;
  }
}

// ========================================
// FORMAT REPORT
// ========================================
function formatAnalysisSummary(result) {
  const inp = result.input?.inlet || {};
  const out = result.input?.outlet || {};

  const fmt = (val, decimals = 1) => {
    if (val === null || val === undefined || isNaN(val)) return "N/A";
    return Number(val).toFixed(decimals);
  };

  return `
📊 ANALISIS KUALITAS AIR LIMBAH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 BAKU MUTU PEMERINTAH:
   • pH: 6.0 - 9.0
   • TDS: ≤4000 mg/L
   • Suhu: ≤40°C

🎯 SKOR: ${result.quality_score}/100 (${result.status.toUpperCase()})

🔥 INLET:  pH=${fmt(inp.ph, 2)} | TDS=${fmt(inp.tds)} | Temp=${fmt(inp.temperature)}
🔤 OUTLET: pH=${fmt(out.ph, 2)} | TDS=${fmt(out.tds)} | Temp=${fmt(out.temperature)}

📊 OUTLET QUALITY: ${result.outlet_quality.score}/100 (${result.outlet_quality.status})
   ${out.ph >= 6.0 && out.ph <= 9.0 ? "✅" : "❌"} pH: ${fmt(out.ph, 2)} ${out.ph >= 6.0 && out.ph <= 9.0 ? "" : "(MELEBIHI BAKU MUTU)"}
   ${out.tds <= 4000 ? "✅" : "❌"} TDS: ${fmt(out.tds)} mg/L ${out.tds <= 4000 ? "" : "(MELEBIHI BAKU MUTU)"}
   ${out.temperature <= 40 ? "✅" : "❌"} Suhu: ${fmt(out.temperature)}°C ${out.temperature <= 40 ? "" : "(MELEBIHI BAKU MUTU)"}

⚙️ IPAL EFFECTIVENESS: ${result.ipal_effectiveness.score}/100 (${result.ipal_effectiveness.status})
   • TDS Reduction: ${fmt(result.ipal_effectiveness.reductions.tds)}% (target: ≥15%)
   • pH Change: ${fmt(result.ipal_effectiveness.reductions.ph_change, 2)} (target: 0.3-1.5)

🔧 SENSORS: ${result.sensor_health?.count === 0 ? "✅ All Healthy" : `⚠️ ${result.sensor_health?.count} Faulty`}
${result.sensor_health?.faults?.length > 0 ? result.sensor_health.faults.map((f) => `   • ${f.sensor}: ${f.original_value} → ${f.replaced_with}`).join("\n") : ""}

${result.compliance.violations.length > 0 ? `🚨 PELANGGARAN BAKU MUTU (${result.compliance.violations.length}):\n${result.compliance.violations.map((v, i) => `   ${i + 1}. [${v.severity.toUpperCase()}] ${v.message}`).join("\n")}` : "✅ SESUAI BAKU MUTU PEMERINTAH"}

${result.alerts.length > 0 ? `🚨 ALERTS (${result.alerts.length}):\n${result.alerts.map((a, i) => `   ${i + 1}. [${a.priority.toUpperCase()}] ${a.message}`).join("\n")}` : "✅ No alerts"}

${result.recommendations.length > 0 ? `📋 REKOMENDASI TINDAKAN:\n${result.recommendations.map((r, i) => `   ${i + 1}. [${r.priority}] ${r.action}`).join("\n")}` : ""}

📅 ${result.analyzed_at}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

// ========================================
// EXPORTS
// ========================================
module.exports = {
  // Main functions
  analyze,
  formatAnalysisSummary,

  // Helper functions (exported for testing & backward compatibility)
  calculateSimpleScore,
  determineStatus,
  checkViolations,
  checkThresholdViolations,
  checkEfficiencyViolations,
  calculateEfficiency,
  checkEffectiveness,
  checkSensorHealth,
  scoreParameter,
  scoreOutlet,
  determineSeverity,
  generateRecommendations,
  evaluateTreatmentEffectiveness,

  // Constants (exported for reference)
  THRESHOLDS,
  STANDARDS,
  BAKU_MUTU,
  EFFECTIVENESS_TARGET,
};

console.log(
  "📦 fuzzyService.js loaded (Baku Mutu Pemerintah - 3 Parameters) ✅",
);
