/**
 * ================================================================
 *                    FUZZY SERVICE
 *             (Orchestrator / Facade Layer)
 * ================================================================
 *
 * File ini menjalankan 2 SISTEM yang berbeda:
 *
 *   SISTEM 1 — FUZZY MAMDANI (dari folder ./fuzzy/)
 *     → Menghasilkan: quality_score + status
 *     → Proses: Fuzzifikasi → Inferensi 27 Rules → Defuzzifikasi Centroid → Dynamic Weighting
 *
 *   SISTEM 2 — BAKU MUTU PEMERINTAH (di file ini)
 *     → Menghasilkan: violations + effectiveness issues + recommendations
 *     → Proses: Perbandingan sederhana (if value > threshold → violation)
 *
 * Alur di analyze():
 *   STEP 1: Preprocessing sensor    (PART 1)
 *   STEP 2: Fuzzy Mamdani → score   (PART 2 — SISTEM 1)
 *   STEP 3: Threshold → violations  (PART 3 — SISTEM 2)
 *   STEP 4: Gabungkan semua → return (PART 4)
 *
 * ================================================================
 */

// ╔══════════════════════════════════════╗
// ║  PART 0: IMPORTS & CONSTANTS        ║
// ╚══════════════════════════════════════╝

// --- Imports ---
const mamdaniEngine = require("./fuzzy/fuzzyMamdani");
const { preprocessSensorData } = require("./fuzzy/sensorFaultHandler");

// --- Baku Mutu Pemerintah (threshold values) ---
const STANDARDS = {
  ph: { min: 6.0, max: 9.0, optimal: [6.5, 8.5] },
  tds: { max: 4000, optimal: 1000 },
  temperature: { max: 40, optimal: [25, 30] },
};

const BAKU_MUTU = {
  pemerintah: STANDARDS,
  golongan_2: STANDARDS, // Backward compatibility
};

// --- Target efektivitas IPAL ---
const EFFECTIVENESS_TARGET = {
  tds_reduction: 15, // Minimal 15% penurunan TDS
  ph_increase: [0.3, 1.5],
};

// --- Backward-compatible alias (some code references THRESHOLDS) ---
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

// --- Shared helper: score → status ---
function getStatus(score) {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  if (score >= 30) return "poor";
  return "critical";
}

const determineStatus = getStatus; // Backward-compatible alias

// ╔══════════════════════════════════════╗
// ║  PART 1: SENSOR PREPROCESSING       ║
// ║  (sebelum data masuk ke sistem 1&2) ║
// ╚══════════════════════════════════════╝

/**
 * Simple sensor health check (fallback jika advanced preprocessing gagal).
 * Cek apakah sensor inlet/outlet kirim data null/NaN, kalau iya → ganti default.
 */
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

/**
 * Adapter: konversi output preprocessSensorData (advanced)
 * ke format sensorHealth yang dipakai generateRecommendations, alerts, dll.
 */
function buildSensorHealthFromPreprocessed(preprocessed) {
  if (!preprocessed.has_faults) {
    return {
      count: 0,
      confidence_score: 100,
      faults: [],
      all_healthy: true,
      data_reliability: preprocessed.data_reliability || {
        is_reliable: true,
        reason: null,
      },
    };
  }

  const faults = [];
  if (preprocessed?.faults?.details?.length) {
    preprocessed.faults.details.forEach((fault) => {
      faults.push({
        sensor: `${fault.location}.${fault.parameter}`,
        location: fault.location,
        parameter: fault.parameter,
        original_value: fault.value,
        expected_range: fault.expected_range,
        reason: fault.reason,
        is_heavy_out_of_range: fault.is_heavy_out_of_range,
        message: `Sensor ${fault.location}.${fault.parameter} bermasalah (${fault.reason})`,
      });
    });
  } else if (preprocessed.imputation_log) {
    preprocessed.imputation_log.forEach((log) => {
      faults.push({
        sensor: `${log.location}.${log.parameter}`,
        location: log.location,
        parameter: log.parameter,
        original_value: log.original_value,
        replaced_with: log.imputed_value,
        reason: log.reason || "unknown",
        message: `Sensor ${log.location}.${log.parameter} rusak`,
      });
    });
  }

  return {
    count: preprocessed.faults?.count || faults.length,
    confidence_score: preprocessed.confidence_score,
    faults,
    all_healthy: false,
    data_reliability: preprocessed.data_reliability || {
      is_reliable: !(preprocessed.should_skip_primary_scoring || false),
      reason: preprocessed.should_skip_primary_scoring
        ? "imputation_failed"
        : null,
    },
  };
}

// ╔══════════════════════════════════════╗
// ║  PART 2: SISTEM 1 — FUZZY MAMDANI  ║
// ║  (scoring kualitas air)             ║
// ╚══════════════════════════════════════╝
//
// Engine utama ada di: ./fuzzy/fuzzyMamdani.js
// Dipanggil di analyze() STEP 2: mamdaniEngine.analyze(inlet, outlet)
//
// Fungsi di bawah ini adalah FALLBACK scoring
// (dipakai kalau Mamdani engine gagal, atau untuk backward compatibility)

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

function calculateSimpleScore(data) {
  return scoreOutlet(data).score;
}

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

// ╔══════════════════════════════════════╗
// ║  PART 3: SISTEM 2 — BAKU MUTU      ║
// ║  (violations + effectiveness +      ║
// ║   recommendations)                  ║
// ╚══════════════════════════════════════╝
//
// Semua fungsi di PART 3 ini BUKAN fuzzy logic.
// Ini adalah perbandingan sederhana: if (value > threshold) → violation.
// Output dari PART 3 ini yang muncul sebagai "violations" dan
// "recommendations" di Firestore (di bawah field fuzzy_analysis).

// --- 3A: Cek Pelanggaran Baku Mutu ---
// Bandingkan outlet vs baku mutu pemerintah (pH 6-9, TDS ≤4000, Suhu ≤40)

function checkThresholdViolations(outlet) {
  const violations = [];

  // pH: 6.0 - 9.0
  if (outlet.ph != null && (outlet.ph < 6.0 || outlet.ph > 9.0)) {
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
  if (outlet.tds != null && outlet.tds > 4000) {
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
  if (outlet.temperature != null && outlet.temperature > 40) {
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

const checkViolations = checkThresholdViolations; // Backward-compatible alias

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

// --- 3B: Cek Efektivitas IPAL ---
// Bandingkan inlet vs outlet: apakah IPAL berhasil menurunkan polutan?

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

// --- 3C: Generate Rekomendasi ---
// Berdasarkan: sensor faults + violations + effectiveness issues
// (BUKAN berdasarkan fuzzy score)

function generateRecommendations(
  outletScore,
  effectiveness,
  violations,
  sensorHealth,
) {
  const recs = [];

  if (sensorHealth?.data_reliability?.is_reliable === false) {
    recs.push({
      priority: "URGENT",
      category: "DATA_QUALITY",
      type: "sensor",
      action:
        "Data tidak reliabel. Analisis kualitas air utama ditahan sampai sensor kembali valid.",
      message:
        "Mode data_unreliable aktif. Periksa perangkat sensor sebelum mengambil keputusan kualitas air.",
    });
  }

  // Sensor faults - highest priority
  if (sensorHealth.count > 0) {
    recs.push({
      priority: "URGENT",
      category: "SENSOR",
      type: "sensor",
      action: `Perbaiki ${sensorHealth.count} sensor rusak segera`,
      message: `Perbaiki ${sensorHealth.count} sensor rusak segera`,
    });

    sensorHealth.faults.slice(0, 6).forEach((fault) => {
      const rangeText = fault.expected_range
        ? `${fault.expected_range.min}-${fault.expected_range.max}`
        : "rentang valid";
      recs.push({
        priority: "HIGH",
        category: "SENSOR",
        type: "sensor",
        action: `Periksa ${fault.sensor}: alasan ${fault.reason}, nilai ${fault.original_value}, rentang ${rangeText}`,
        message: `Sensor ${fault.sensor} bermasalah (${fault.reason}).`,
      });
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
    sensorHealth?.data_reliability?.is_reliable !== false &&
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

// ╔══════════════════════════════════════╗
// ║  PART 4: ORCHESTRATOR — analyze()   ║
// ║  (gabungkan Sistem 1 + Sistem 2)    ║
// ╚══════════════════════════════════════╝
//
// Ini fungsi utama yang dipanggil oleh waterQualityService.
// Alur:
//   STEP 1: Preprocessing sensor        → data bersih
//   STEP 2: Mamdani engine (SISTEM 1)   → quality_score + status
//   STEP 3: Fallback scoring            → outletScore + effectiveness
//   STEP 4: Violations (SISTEM 2)       → violations[]
//   STEP 5: Recommendations (SISTEM 2)  → recommendations[]
//   STEP 6: Final score                 → Mamdani score × confidence
//   STEP 7: Build alerts                → simpleAlerts[]
//   RETURN: Semua digabung jadi satu objek

async function analyze(inlet, outlet, ipalId) {
  try {
    console.log("🧠 Analyzing water quality (Fuzzy Mamdani)...");
    console.log("   Inlet:", inlet);
    console.log("   Outlet:", outlet);

    // Save original data before any processing
    const inletOriginal = { ...inlet };
    const outletOriginal = { ...outlet };

    // ===== STEP 1: Sensor Preprocessing (PART 1) =====
    // Uses last known value → safe default fallback
    let preprocessed;
    let sensorHealth;

    try {
      preprocessed = await preprocessSensorData(
        { ...inlet },
        { ...outlet },
        ipalId,
      );
      sensorHealth = buildSensorHealthFromPreprocessed(preprocessed);
      inlet = preprocessed.inlet;
      outlet = preprocessed.outlet;
    } catch (sensorError) {
      console.warn(
        "⚠️ Advanced sensor preprocessing failed, using simple fallback:",
        sensorError.message,
      );
      sensorHealth = checkSensorHealth(inlet, outlet);
      preprocessed = {
        has_faults: sensorHealth.count > 0,
        confidence_score: sensorHealth.confidence_score,
        should_skip_primary_scoring: false,
        data_reliability: {
          is_reliable: true,
          reason: null,
        },
      };
    }

    const isDataReliable =
      preprocessed?.data_reliability?.is_reliable !== false &&
      !preprocessed?.should_skip_primary_scoring;

    // ===== STEP 2: Run Mamdani Engine — SISTEM 1 (PART 2) =====
    // Gaussian membership → 27 fuzzy rules (MIN-MAX) → Centroid defuzzification
    // → Dynamic weighting → quality_score + status
    let mamdaniResult;

    if (isDataReliable) {
      try {
        mamdaniResult = await mamdaniEngine.analyze(inlet, outlet);
        console.log(
          `   Mamdani Score: ${mamdaniResult.final_score}/100 (${mamdaniResult.overall_status})`,
        );
      } catch (mamdaniError) {
        console.warn(
          "⚠️ Mamdani engine failed, using simple scoring fallback:",
          mamdaniError.message,
        );
        mamdaniResult = null;
      }
    } else {
      mamdaniResult = null;
      console.warn(
        "⚠️ Skipping primary scoring because data is unreliable:",
        preprocessed?.data_reliability?.reason || "unknown",
      );
    }

    // ===== STEP 3: Fallback scoring (PART 2 fallback) =====
    const outletScore = scoreOutlet(outlet);
    const effectiveness = checkEffectiveness(inlet, outlet);

    // ===== STEP 4: Violations — SISTEM 2 (PART 3) =====
    // Cek outlet vs baku mutu pemerintah (threshold sederhana)
    const violations = checkThresholdViolations(outlet);

    // ===== STEP 5: Recommendations — SISTEM 2 (PART 3) =====
    // Berdasarkan violations + effectiveness, BUKAN fuzzy score
    const recommendations = generateRecommendations(
      outletScore,
      effectiveness,
      violations,
      sensorHealth,
    );

    // ===== STEP 6: Final Score =====
    // Use Mamdani score if available, adjusted by sensor confidence
    let finalScore;
    if (!isDataReliable) {
      finalScore = null;
    } else if (mamdaniResult) {
      finalScore = preprocessed.has_faults
        ? Math.round(
            mamdaniResult.final_score * (preprocessed.confidence_score / 100),
          )
        : mamdaniResult.final_score;
    } else {
      // Fallback: simple weighted average
      finalScore = Math.round(
        outletScore.score * 0.6 +
          effectiveness.score * 0.3 +
          sensorHealth.confidence_score * 0.1,
      );
    }

    const status = isDataReliable ? getStatus(finalScore) : "data_unreliable";

    const sensorFaultViolations = (sensorHealth.faults || []).map((fault) => ({
      parameter: fault.parameter,
      location: "anomaly",
      value:
        typeof fault.original_value === "number"
          ? fault.original_value
          : String(fault.original_value),
      threshold: fault.expected_range
        ? `${fault.expected_range.min}-${fault.expected_range.max}`
        : "valid_number",
      condition: fault.reason || "sensor_fault",
      severity: fault.is_heavy_out_of_range ? "critical" : "high",
      message: `Sensor ${fault.sensor} bermasalah (${fault.reason})`,
    }));

    // ===== STEP 7: Build alerts =====
    // Simple alerts for backward compatibility
    const simpleAlerts = [
      ...sensorHealth.faults.map((f) => ({
        type: "SENSOR_FAULT",
        priority: f.is_heavy_out_of_range ? "critical" : "high",
        level: f.is_heavy_out_of_range ? "CRITICAL" : "WARNING",
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

    const effectiveness_issues = simpleAlerts.filter(
      (a) => a.type !== "SENSOR_FAULT" && a.type !== "VIOLATION",
    );
    const sensor_faults = simpleAlerts.filter((a) => a.type === "SENSOR_FAULT");

    console.log("✅ Fuzzy analysis complete:");
    console.log(
      `   Score: ${
        finalScore === null ? "N/A" : `${finalScore}/100`
      } (${mamdaniResult ? "Mamdani" : "Simple"})`,
    );
    console.log(`   Status: ${status}`);
    console.log(`   Violations: ${violations.length}`);
    console.log(`   Effectiveness issues: ${effectiveness_issues.length}`);
    console.log(`   Sensor faults: ${sensor_faults.length}`);

    // ===== RETURN: Gabungkan SISTEM 1 + SISTEM 2 =====
    return {
      // --- Dari SISTEM 1 (Fuzzy Mamdani): score + status ---
      quality_score: finalScore,
      status: status,
      final_score: finalScore,
      overall_status: status,
      analysis_status: status,
      analysis_method: mamdaniResult
        ? "fuzzy_mamdani"
        : "simplified_fuzzy_logic",

      // --- Dari SISTEM 2 (Baku Mutu): violations + recommendations ---
      violations: violations, // Top-level for createAlertsForViolations
      sensor_fault_violations: sensorFaultViolations,
      effectiveness_issues: effectiveness_issues,
      sensor_faults: sensor_faults,
      alert_count: violations.length + sensorFaultViolations.length,
      recommendations: recommendations,

      // --- Data input/output ---
      input: { inlet: inletOriginal, outlet: outletOriginal },
      processed: { inlet, outlet },
      efficiency: calculateEfficiency(inlet, outlet),

      // --- Detail Fuzzy Mamdani (SISTEM 1) ---
      fuzzy_analysis: mamdaniResult
        ? {
            outlet: {
              score: isDataReliable
                ? mamdaniResult.outlet_analysis.score
                : null,
              status: isDataReliable
                ? mamdaniResult.outlet_analysis.status
                : "data_unreliable",
              membership: mamdaniResult.outlet_analysis.fuzzy_membership,
              compliance: violations.length === 0,
            },
            effectiveness: {
              score: isDataReliable
                ? mamdaniResult.effectiveness_analysis.score
                : null,
              status: isDataReliable
                ? mamdaniResult.effectiveness_analysis.status
                : "data_unreliable",
              membership: mamdaniResult.effectiveness_analysis.fuzzy_membership,
              reduction_rates:
                mamdaniResult.effectiveness_analysis.reduction_rates,
            },
            scoring_weights: mamdaniResult.scoring_weights,
          }
        : {
            outlet: {
              score: isDataReliable ? outletScore.score : null,
              status: isDataReliable ? outletScore.status : "data_unreliable",
              membership: outletScore.breakdown,
              compliance: violations.length === 0,
            },
            effectiveness: {
              score: isDataReliable ? effectiveness.score : null,
              status: isDataReliable ? effectiveness.status : "data_unreliable",
              membership: {},
              reduction_rates: effectiveness.reductions,
            },
            scoring_weights: {
              outlet_quality: 60,
              effectiveness: 30,
              sensor_health: 10,
            },
          },

      // --- Detail scoring (backward compat) ---
      outlet_quality: outletScore,
      ipal_effectiveness: effectiveness,

      // --- Sensor status ---
      sensor_status: {
        ...sensorHealth,
        faults: { count: sensorHealth.count, ...sensorHealth },
        advanced:
          preprocessed.has_faults && preprocessed.imputation_log
            ? {
                imputation_log: preprocessed.imputation_log,
                imputation_strategies_used: true,
              }
            : null,
      },
      sensor_health: sensorHealth,

      sensor_alert_count: sensorHealth.count,
      fuzzy_alert_count: effectiveness.issues.length + violations.length,

      // --- Compliance (SISTEM 2 summary) ---
      compliance: {
        is_compliant: isDataReliable && violations.length === 0,
        violations,
        standard: "Baku Mutu Pemerintah",
      },

      data_reliability: preprocessed?.data_reliability || {
        is_reliable: isDataReliable,
        reason: isDataReliable ? null : "unknown",
      },

      // --- Alerts ---
      alerts: simpleAlerts,
      mamdani_alerts: [],

      // --- Metadata ---
      analyzed_at: new Date().toISOString(),
      defuzzification_method: mamdaniResult ? "centroid" : "weighted_average",
      membership_type: mamdaniResult ? "gaussian" : "linear",
      standard_used:
        "Baku Mutu Pemerintah (pH: 6.0-9.0, TDS: ≤4000, Temp: ≤40)",
    };
  } catch (error) {
    console.error("❌ Error in fuzzy analysis:", error);
    throw error;
  }
}

// --- Format report (text summary) ---
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

🎯 SKOR: ${result.quality_score === null ? "N/A" : `${result.quality_score}/100`} (${result.status.toUpperCase()})

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

// ╔══════════════════════════════════════╗
// ║  PART 5: EXPORTS                    ║
// ╚══════════════════════════════════════╝

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
  "📦 fuzzyService.js loaded (Fuzzy Mamdani Engine - 3 Parameters) ✅",
);
