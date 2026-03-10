/**
 * DRY-RUN: Recalculate all water_quality_readings with fixed Mamdani engine
 * Does NOT modify Firestore — only prints comparison
 */
const { admin } = require("./config/firebase-config");
const mamdani = require("./services/fuzzy/fuzzyMamdani");

const db = admin.firestore();

async function dryRun() {
  console.log("📖 Reading all water_quality_readings...\n");
  const snapshot = await db
    .collection("water_quality_readings")
    .orderBy("timestamp", "asc")
    .get();
  console.log(`Found ${snapshot.size} documents\n`);

  const results = [];
  let changed = 0;
  let errors = 0;

  // Suppress Mamdani console noise during batch processing
  const origLog = console.log;
  const origWarn = console.warn;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const inlet = data.inlet;
    const outlet = data.outlet;
    const oldScore = data.fuzzy_analysis?.quality_score;
    const oldStatus = data.fuzzy_analysis?.status;

    if (!inlet || !outlet) {
      console.log(`⚠️  ${doc.id}: Missing inlet/outlet — SKIP`);
      errors++;
      continue;
    }

    // Check for valid numeric data
    const params = ["ph", "tds", "temperature"];
    const hasValidData = params.every(
      (p) =>
        typeof inlet[p] === "number" &&
        !isNaN(inlet[p]) &&
        typeof outlet[p] === "number" &&
        !isNaN(outlet[p]),
    );

    if (!hasValidData) {
      console.log(`⚠️  ${doc.id}: Invalid sensor data — SKIP`);
      errors++;
      continue;
    }

    try {
      console.log = () => {};
      console.warn = () => {};
      const result = await mamdani.analyze(
        { ph: inlet.ph, tds: inlet.tds, temperature: inlet.temperature },
        { ph: outlet.ph, tds: outlet.tds, temperature: outlet.temperature },
      );

      const newScore = result.final_score;
      const newStatus = result.overall_status;
      console.log = origLog;
      console.warn = origWarn;
      const scoreChanged = oldScore !== newScore;

      if (scoreChanged) changed++;

      results.push({
        id: doc.id.substring(0, 12),
        ipal: (typeof data.ipal_id === "string"
          ? data.ipal_id
          : data.ipal_id?.id || data.ipal_id?.path || "?"
        ).substring(0, 20),
        inlet_ph: inlet.ph,
        inlet_tds: inlet.tds,
        outlet_ph: outlet.ph,
        outlet_tds: outlet.tds,
        old_score: oldScore,
        new_score: newScore,
        old_status: oldStatus,
        new_status: newStatus,
        diff: newScore - (oldScore || 0),
      });
    } catch (e) {
      console.log = origLog;
      console.warn = origWarn;
      console.log(`❌ ${doc.id}: ${e.message}`);
      errors++;
    }
  }

  // Suppress Mamdani console logs — print summary
  console.log("\n" + "=".repeat(110));
  console.log("DRY-RUN RESULTS — Old vs New Fuzzy Scores");
  console.log("=".repeat(110));
  console.log(
    "ID".padEnd(14) +
      "IPAL".padEnd(22) +
      "In-pH".padEnd(8) +
      "In-TDS".padEnd(9) +
      "Out-pH".padEnd(9) +
      "Out-TDS".padEnd(10) +
      "OLD".padEnd(6) +
      "NEW".padEnd(6) +
      "DIFF".padEnd(7) +
      "OLD-STATUS".padEnd(13) +
      "NEW-STATUS",
  );
  console.log("-".repeat(110));

  for (const r of results) {
    const diffStr = r.diff > 0 ? `+${r.diff}` : `${r.diff}`;
    const ipalStr = String(r.ipal || "?").substring(0, 20);
    console.log(
      r.id.padEnd(14) +
        ipalStr.padEnd(22) +
        (r.inlet_ph?.toFixed(1) || "?").padEnd(8) +
        (r.inlet_tds?.toFixed(0) || "?").padEnd(9) +
        (r.outlet_ph?.toFixed(1) || "?").padEnd(9) +
        (r.outlet_tds?.toFixed(0) || "?").padEnd(10) +
        String(r.old_score ?? "?").padEnd(6) +
        String(r.new_score).padEnd(6) +
        diffStr.padEnd(7) +
        (r.old_status || "?").padEnd(13) +
        r.new_status,
    );
  }

  console.log("-".repeat(110));
  console.log(`\n📊 SUMMARY:`);
  console.log(`   Total docs:  ${snapshot.size}`);
  console.log(`   Processed:   ${results.length}`);
  console.log(`   Changed:     ${changed}`);
  console.log(`   Unchanged:   ${results.length - changed}`);
  console.log(`   Errors/Skip: ${errors}`);

  // Score distribution
  const dist = { excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 };
  const oldDist = { excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 };
  for (const r of results) {
    if (r.new_status in dist) dist[r.new_status]++;
    if (r.old_status in oldDist) oldDist[r.old_status]++;
  }
  console.log(`\n📈 STATUS DISTRIBUTION:`);
  console.log(`   ${"Status".padEnd(12)} OLD → NEW`);
  for (const key of ["excellent", "good", "fair", "poor", "critical"]) {
    console.log(`   ${key.padEnd(12)} ${oldDist[key] || 0} → ${dist[key]}`);
  }

  // Average scores
  const oldAvg =
    results.reduce((s, r) => s + (r.old_score || 0), 0) / results.length;
  const newAvg = results.reduce((s, r) => s + r.new_score, 0) / results.length;
  console.log(`\n   Avg score:   ${oldAvg.toFixed(1)} → ${newAvg.toFixed(1)}`);

  process.exit(0);
}

dryRun().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
