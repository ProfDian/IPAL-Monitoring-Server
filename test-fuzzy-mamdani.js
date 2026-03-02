/**
 * ========================================
 * FUZZY MAMDANI INTEGRATION TEST
 * ========================================
 * Comprehensive test for fuzzyService.js after Mamdani engine integration.
 * Tests: normal scenarios, boundary values, sensor faults,
 *        backward compatibility, and fallback behavior.
 *
 * Run: node test-fuzzy-mamdani.js
 */

const fuzzyService = require("./services/fuzzyService");

// ========================================
// TEST UTILITIES
// ========================================
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    const msg = `  ❌ ${testName}${detail ? " — " + detail : ""}`;
    console.log(msg);
    failures.push(msg);
  }
}

function assertRange(value, min, max, testName) {
  const ok = typeof value === "number" && value >= min && value <= max;
  assert(ok, testName, ok ? "" : `got ${value}, expected ${min}-${max}`);
}

function assertType(value, type, testName) {
  const actual = typeof value;
  assert(actual === type, testName, actual !== type ? `got ${actual}` : "");
}

function assertExists(value, testName) {
  assert(value !== undefined && value !== null, testName, `got ${value}`);
}

// ========================================
// TEST 1: IPAL OPTIMAL
// ========================================
async function testOptimalIPAL() {
  console.log("\n═══════════════════════════════════════════");
  console.log("TEST 1: IPAL OPTIMAL (semua parameter bagus)");
  console.log("═══════════════════════════════════════════");

  const r = await fuzzyService.analyze(
    { ph: 4.2, tds: 6000, temperature: 33 },
    { ph: 7.5, tds: 2200, temperature: 30 },
  );

  // Core fields exist
  assertExists(r.quality_score, "quality_score exists");
  assertExists(r.status, "status exists");
  assertType(r.quality_score, "number", "quality_score is number");
  assertRange(r.quality_score, 1, 100, "quality_score in valid range");

  // Status should be reasonable for good outlet
  assert(
    ["excellent", "good", "fair"].includes(r.status),
    "status is good/fair/excellent",
    `got "${r.status}"`,
  );

  // No violations expected (outlet within baku mutu)
  assert(r.violations.length === 0, "no violations (outlet within limits)");
  assert(r.compliance.is_compliant === true, "compliance is true");

  // Mamdani engine used
  assert(
    r.analysis_method === "fuzzy_mamdani",
    "analysis_method is fuzzy_mamdani",
    `got "${r.analysis_method}"`,
  );
  assert(
    r.defuzzification_method === "centroid",
    "defuzzification is centroid",
    `got "${r.defuzzification_method}"`,
  );
  assert(
    r.membership_type === "gaussian",
    "membership is gaussian",
    `got "${r.membership_type}"`,
  );

  // Sensor health OK
  assert(r.sensor_health.all_healthy === true, "sensors all healthy");
  assert(r.sensor_health.count === 0, "0 sensor faults");
}

// ========================================
// TEST 2: IPAL GAGAL (VIOLATIONS)
// ========================================
async function testFailedIPAL() {
  console.log("\n═══════════════════════════════════════════");
  console.log("TEST 2: IPAL GAGAL (outlet di luar baku mutu)");
  console.log("═══════════════════════════════════════════");

  const r = await fuzzyService.analyze(
    { ph: 3.5, tds: 8000, temperature: 35 },
    { ph: 5.2, tds: 6500, temperature: 42 },
  );

  // Should have violations
  assert(
    r.violations.length === 3,
    "3 violations (pH, TDS, temp)",
    `got ${r.violations.length}`,
  );
  assert(r.compliance.is_compliant === false, "not compliant");

  // Check violation format for createAlertsForViolations compatibility
  const v = r.violations[0];
  assertExists(v.parameter, "violation.parameter exists");
  assertExists(v.location, "violation.location exists");
  assertExists(v.value, "violation.value exists");
  assertExists(v.threshold, "violation.threshold exists");
  assertExists(v.condition, "violation.condition exists");
  assertExists(v.severity, "violation.severity exists");
  assertExists(v.message, "violation.message exists");
  assertType(v.threshold, "number", "violation.threshold is number");

  // Score should be low
  assertRange(r.quality_score, 0, 50, "quality_score is low (≤50)");

  // Status should be poor/critical
  assert(
    ["poor", "critical"].includes(r.status),
    "status is poor/critical",
    `got "${r.status}"`,
  );

  // Should have recommendations
  assert(r.recommendations.length > 0, "has recommendations");
}

// ========================================
// TEST 3: BOUNDARY VALUES (exact limits)
// ========================================
async function testBoundaryValues() {
  console.log("\n═══════════════════════════════════════════");
  console.log("TEST 3: BOUNDARY VALUES (pH=6.0, TDS=4000, Temp=40)");
  console.log("═══════════════════════════════════════════");

  // Exactly AT the limits (should NOT violate)
  const r = await fuzzyService.analyze(
    { ph: 4.0, tds: 5000, temperature: 35 },
    { ph: 6.0, tds: 4000, temperature: 40 },
  );

  assert(
    r.violations.length === 0,
    "no violations at exact boundary",
    `got ${r.violations.length}`,
  );
  assert(r.compliance.is_compliant === true, "compliant at exact boundary");

  // Just OUTSIDE the limits
  const r2 = await fuzzyService.analyze(
    { ph: 4.0, tds: 5000, temperature: 35 },
    { ph: 5.99, tds: 4001, temperature: 40.1 },
  );

  assert(
    r2.violations.length === 3,
    "3 violations just outside boundary",
    `got ${r2.violations.length}`,
  );
  assert(r2.compliance.is_compliant === false, "not compliant just outside");
}

// ========================================
// TEST 4: SENSOR FAULTS (1 sensor)
// ========================================
async function testSensorFault1() {
  console.log("\n═══════════════════════════════════════════");
  console.log("TEST 4: SINGLE SENSOR FAULT (inlet pH null)");
  console.log("═══════════════════════════════════════════");

  const r = await fuzzyService.analyze(
    { ph: null, tds: 6000, temperature: 33 },
    { ph: 7.5, tds: 2200, temperature: 30 },
  );

  // Should still produce a score
  assertExists(r.quality_score, "quality_score exists despite fault");
  assertType(r.quality_score, "number", "quality_score is number");
  assertRange(r.quality_score, 0, 100, "quality_score in valid range");

  // Sensor health should reflect fault
  assert(
    r.sensor_health.count >= 1,
    "at least 1 sensor fault detected",
    `got ${r.sensor_health.count}`,
  );
  assert(r.sensor_health.all_healthy === false, "sensors NOT all healthy");

  // Advanced imputation log should exist
  assert(
    r.sensor_status.advanced !== null && r.sensor_status.advanced !== undefined,
    "advanced sensor imputation info exists",
  );

  // Mamdani should still work
  assert(
    r.analysis_method === "fuzzy_mamdani",
    "Mamdani still works with 1 fault",
  );
}

// ========================================
// TEST 5: SENSOR FAULTS (multiple sensors)
// ========================================
async function testSensorFaultMultiple() {
  console.log("\n═══════════════════════════════════════════");
  console.log("TEST 5: MULTIPLE SENSOR FAULTS (3 sensors null)");
  console.log("═══════════════════════════════════════════");

  const r = await fuzzyService.analyze(
    { ph: null, tds: null, temperature: 33 },
    { ph: 7.5, tds: null, temperature: 30 },
  );

  assertExists(r.quality_score, "quality_score exists despite 3 faults");
  assert(
    r.sensor_health.count >= 3,
    "3+ sensor faults detected",
    `got ${r.sensor_health.count}`,
  );
  assert(r.sensor_health.all_healthy === false, "sensors NOT healthy");

  // Confidence should be notably reduced
  assert(
    r.sensor_health.confidence_score < 80,
    "confidence_score reduced (<80%)",
    `got ${r.sensor_health.confidence_score}`,
  );
}

// ========================================
// TEST 6: ALL SENSORS DEAD
// ========================================
async function testAllSensorsDead() {
  console.log("\n═══════════════════════════════════════════");
  console.log("TEST 6: ALL SENSORS DEAD");
  console.log("═══════════════════════════════════════════");

  const r = await fuzzyService.analyze(
    { ph: null, tds: null, temperature: null },
    { ph: null, tds: null, temperature: null },
  );

  assertExists(r.quality_score, "quality_score exists even with all dead");
  assertType(r.quality_score, "number", "quality_score is number");
  assert(
    r.sensor_health.count === 6,
    "6 sensor faults",
    `got ${r.sensor_health.count}`,
  );
  assert(
    r.sensor_health.confidence_score < 30,
    "very low confidence",
    `got ${r.sensor_health.confidence_score}`,
  );
}

// ========================================
// TEST 7: BACKWARD COMPATIBILITY (exports)
// ========================================
async function testBackwardCompatExports() {
  console.log("\n═══════════════════════════════════════════");
  console.log("TEST 7: BACKWARD COMPATIBILITY (exported functions)");
  console.log("═══════════════════════════════════════════");

  // Functions that must exist for backward compat
  assertType(fuzzyService.analyze, "function", "analyze() exported");
  assertType(
    fuzzyService.formatAnalysisSummary,
    "function",
    "formatAnalysisSummary() exported",
  );
  assertType(
    fuzzyService.checkThresholdViolations,
    "function",
    "checkThresholdViolations() exported",
  );
  assertType(
    fuzzyService.checkSensorHealth,
    "function",
    "checkSensorHealth() exported",
  );
  assertType(
    fuzzyService.scoreParameter,
    "function",
    "scoreParameter() exported",
  );
  assertType(fuzzyService.scoreOutlet, "function", "scoreOutlet() exported");
  assertType(
    fuzzyService.calculateSimpleScore,
    "function",
    "calculateSimpleScore() exported",
  );
  assertType(
    fuzzyService.determineStatus,
    "function",
    "determineStatus() exported",
  );
  assertType(
    fuzzyService.checkViolations,
    "function",
    "checkViolations() exported",
  );
  assertType(
    fuzzyService.calculateEfficiency,
    "function",
    "calculateEfficiency() exported",
  );
  assertType(
    fuzzyService.checkEffectiveness,
    "function",
    "checkEffectiveness() exported",
  );
  assertType(
    fuzzyService.determineSeverity,
    "function",
    "determineSeverity() exported",
  );
  assertType(
    fuzzyService.generateRecommendations,
    "function",
    "generateRecommendations() exported",
  );
  assertType(
    fuzzyService.checkEfficiencyViolations,
    "function",
    "checkEfficiencyViolations() exported",
  );
  assertType(
    fuzzyService.evaluateTreatmentEffectiveness,
    "function",
    "evaluateTreatmentEffectiveness() exported",
  );

  // Constants that must exist
  assertExists(fuzzyService.STANDARDS, "STANDARDS exported");
  assertExists(fuzzyService.BAKU_MUTU, "BAKU_MUTU exported");
  assertExists(fuzzyService.THRESHOLDS, "THRESHOLDS exported");
  assertExists(
    fuzzyService.EFFECTIVENESS_TARGET,
    "EFFECTIVENESS_TARGET exported",
  );

  // STANDARDS values correct
  assert(fuzzyService.STANDARDS.ph.min === 6.0, "pH min = 6.0");
  assert(fuzzyService.STANDARDS.ph.max === 9.0, "pH max = 9.0");
  assert(fuzzyService.STANDARDS.tds.max === 4000, "TDS max = 4000");
  assert(fuzzyService.STANDARDS.temperature.max === 40, "Temp max = 40");
}

// ========================================
// TEST 8: BACKWARD COMPAT (output format for waterQualityService)
// ========================================
async function testBackwardCompatOutput() {
  console.log("\n═══════════════════════════════════════════");
  console.log("TEST 8: OUTPUT FORMAT (waterQualityService compat)");
  console.log("═══════════════════════════════════════════");

  const r = await fuzzyService.analyze(
    { ph: 3.5, tds: 8000, temperature: 35 },
    { ph: 5.2, tds: 6500, temperature: 42 },
  );

  // Fields used by waterQualityService.processCompleteReading()
  assertExists(r.quality_score, "quality_score (used by completeData)");
  assertExists(r.status, "status (used by completeData + updateSensors)");
  assertExists(r.alert_count, "alert_count (used by completeData)");
  assert(Array.isArray(r.violations), "violations is array");
  assert(Array.isArray(r.recommendations), "recommendations is array");
  assertExists(r.analysis_method, "analysis_method (used by completeData)");

  // Fields used by createAlertsForViolations()
  // Each violation must have: parameter, location, value, threshold, condition, severity, message
  if (r.violations.length > 0) {
    const v = r.violations[0];
    const requiredFields = [
      "parameter",
      "location",
      "value",
      "threshold",
      "condition",
      "severity",
      "message",
    ];
    requiredFields.forEach((field) => {
      assertExists(
        v[field],
        `violation.${field} exists for createAlertsForViolations`,
      );
    });

    // threshold must be numeric (for Math.abs(value - threshold))
    assertType(
      v.threshold,
      "number",
      "violation.threshold is number (for deviation calc)",
    );
  }

  // Enriched fields
  assertExists(r.input, "input data preserved");
  assertExists(r.processed, "processed data present");
  assertExists(r.fuzzy_analysis, "fuzzy_analysis details");
  assertExists(r.outlet_quality, "outlet_quality details");
  assertExists(r.ipal_effectiveness, "ipal_effectiveness details");
  assertExists(r.sensor_health, "sensor_health details");
  assertExists(r.compliance, "compliance details");
  assertExists(r.alerts, "alerts array");
  assertExists(r.analyzed_at, "analyzed_at timestamp");
}

// ========================================
// TEST 9: FORMAT REPORT
// ========================================
async function testFormatReport() {
  console.log("\n═══════════════════════════════════════════");
  console.log("TEST 9: FORMAT ANALYSIS SUMMARY");
  console.log("═══════════════════════════════════════════");

  const r = await fuzzyService.analyze(
    { ph: 4.2, tds: 6000, temperature: 33 },
    { ph: 7.5, tds: 2200, temperature: 30 },
  );

  const summary = fuzzyService.formatAnalysisSummary(r);
  assertType(summary, "string", "formatAnalysisSummary returns string");
  assert(
    summary.length > 100,
    "summary is not empty",
    `length=${summary.length}`,
  );
  assert(summary.includes("ANALISIS KUALITAS AIR"), "summary contains header");
  assert(
    summary.includes("BAKU MUTU PEMERINTAH"),
    "summary mentions baku mutu",
  );
  assert(summary.includes("SKOR:"), "summary contains score");
}

// ========================================
// TEST 10: MAMDANI ALERTS (6-level system)
// ========================================
async function testMamdaniAlerts() {
  console.log("\n═══════════════════════════════════════════");
  console.log("TEST 10: MAMDANI 6-LEVEL ALERTS");
  console.log("═══════════════════════════════════════════");

  // Violation scenario should have Mamdani CRITICAL alerts
  const r = await fuzzyService.analyze(
    { ph: 3.5, tds: 8000, temperature: 35 },
    { ph: 5.2, tds: 6500, temperature: 42 },
  );

  assert(Array.isArray(r.mamdani_alerts), "mamdani_alerts is array");
  assert(
    r.mamdani_alerts.length > 0,
    "has mamdani alerts for violation scenario",
    `got ${r.mamdani_alerts.length}`,
  );

  // Each alert should have standard fields
  if (r.mamdani_alerts.length > 0) {
    const a = r.mamdani_alerts[0];
    assertExists(a.level, "mamdani alert has level");
    assertExists(a.type, "mamdani alert has type");
    assertExists(a.message, "mamdani alert has message");
    assertExists(a.severity, "mamdani alert has severity");
    assertExists(a.priority, "mamdani alert has priority");
  }

  // Optimal scenario should have INFO level
  const r2 = await fuzzyService.analyze(
    { ph: 4.2, tds: 6000, temperature: 33 },
    { ph: 7.5, tds: 2200, temperature: 30 },
  );

  assert(Array.isArray(r2.mamdani_alerts), "mamdani_alerts exists for optimal");
}

// ========================================
// TEST 11: EDGE CASE - Negative values
// ========================================
async function testNegativeValues() {
  console.log("\n═══════════════════════════════════════════");
  console.log("TEST 11: EDGE CASE - Negative/Zero values");
  console.log("═══════════════════════════════════════════");

  // Should not crash
  const r = await fuzzyService.analyze(
    { ph: 0, tds: 0, temperature: 0 },
    { ph: 0, tds: 0, temperature: 0 },
  );

  assertExists(r.quality_score, "handles zero values");
  assertType(r.quality_score, "number", "quality_score is number");
  assert(!isNaN(r.quality_score), "quality_score is not NaN");
}

// ========================================
// TEST 12: EDGE CASE - Very extreme values
// ========================================
async function testExtremeValues() {
  console.log("\n═══════════════════════════════════════════");
  console.log("TEST 12: EDGE CASE - Extreme values");
  console.log("═══════════════════════════════════════════");

  const r = await fuzzyService.analyze(
    { ph: 1.0, tds: 50000, temperature: 80 },
    { ph: 14.0, tds: 30000, temperature: 60 },
  );

  assertExists(r.quality_score, "handles extreme values");
  assertType(r.quality_score, "number", "quality_score is number");
  assert(!isNaN(r.quality_score), "quality_score is not NaN");
  assert(r.violations.length > 0, "extreme values create violations");
}

// ========================================
// RUN ALL TESTS
// ========================================
async function runAllTests() {
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║  FUZZY MAMDANI INTEGRATION TEST SUITE     ║");
  console.log("╚═══════════════════════════════════════════╝");

  const start = Date.now();

  try {
    await testOptimalIPAL();
    await testFailedIPAL();
    await testBoundaryValues();
    await testSensorFault1();
    await testSensorFaultMultiple();
    await testAllSensorsDead();
    await testBackwardCompatExports();
    await testBackwardCompatOutput();
    await testFormatReport();
    await testMamdaniAlerts();
    await testNegativeValues();
    await testExtremeValues();
  } catch (err) {
    console.error("\n💥 FATAL ERROR:", err);
    failed++;
  }

  const elapsed = Date.now() - start;

  console.log("\n╔═══════════════════════════════════════════╗");
  console.log("║  TEST RESULTS                             ║");
  console.log("╚═══════════════════════════════════════════╝");
  console.log(`  Total:  ${passed + failed}`);
  console.log(`  Passed: ${passed} ✅`);
  console.log(`  Failed: ${failed} ❌`);
  console.log(`  Time:   ${elapsed}ms`);

  if (failures.length > 0) {
    console.log(`\n  FAILURES:`);
    failures.forEach((f) => console.log(f));
  }

  console.log(
    `\n  ${failed === 0 ? "🎉 ALL TESTS PASSED! Safe to push." : "⚠️  FIX FAILURES before pushing."}`,
  );

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests();
