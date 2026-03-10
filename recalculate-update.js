/**
 * UPDATE FIRESTORE: Recalculate all water_quality_readings with fixed Mamdani engine
 * - Backs up old fuzzy_analysis to fuzzy_analysis_backup
 * - Overwrites fuzzy_analysis with recalculated values
 */
const { admin } = require("./config/firebase-config");
const mamdani = require("./services/fuzzy/fuzzyMamdani");

const db = admin.firestore();

async function updateAll() {
  console.log("📖 Reading all water_quality_readings...\n");
  const snapshot = await db
    .collection("water_quality_readings")
    .orderBy("timestamp", "asc")
    .get();
  console.log(`Found ${snapshot.size} documents\n`);

  const origLog = console.log;
  const origWarn = console.warn;

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const inlet = data.inlet;
    const outlet = data.outlet;
    const oldFuzzy = data.fuzzy_analysis;

    if (!inlet || !outlet) {
      skipped++;
      continue;
    }

    const params = ["ph", "tds", "temperature"];
    const hasValidData = params.every(
      (p) =>
        typeof inlet[p] === "number" &&
        !isNaN(inlet[p]) &&
        typeof outlet[p] === "number" &&
        !isNaN(outlet[p]),
    );

    if (!hasValidData) {
      skipped++;
      continue;
    }

    try {
      // Suppress Mamdani noise
      console.log = () => {};
      console.warn = () => {};

      const result = await mamdani.analyze(
        { ph: inlet.ph, tds: inlet.tds, temperature: inlet.temperature },
        { ph: outlet.ph, tds: outlet.tds, temperature: outlet.temperature },
      );

      console.log = origLog;
      console.warn = origWarn;

      // Build new fuzzy_analysis matching production schema
      const newFuzzy = {
        quality_score: result.final_score,
        status: result.overall_status,
        alert_count: result.alert_count,
        violations: result.outlet_analysis.violations || [],
        recommendations: result.recommendations || [],
        analysis_method: "fuzzy_mamdani",
        analyzed_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Backup old + write new in one update
      await doc.ref.update({
        fuzzy_analysis_backup: oldFuzzy || null,
        fuzzy_analysis: newFuzzy,
      });

      updated++;
      if (updated % 20 === 0) {
        origLog(`   ✅ ${updated} / ${snapshot.size} updated...`);
      }
    } catch (e) {
      console.log = origLog;
      console.warn = origWarn;
      origLog(`❌ ${doc.id}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ DONE`);
  console.log(`   Updated:  ${updated}`);
  console.log(`   Skipped:  ${skipped}`);
  console.log(`   Errors:   ${errors}`);
  console.log(`   Total:    ${snapshot.size}`);
  console.log(`\n💾 Old values backed up to 'fuzzy_analysis_backup' field`);
  console.log(`${"=".repeat(50)}`);

  process.exit(0);
}

updateAll().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
