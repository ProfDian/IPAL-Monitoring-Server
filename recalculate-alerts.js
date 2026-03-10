/**
 * REGENERATE ALERTS: Delete old alerts, create new ones from recalculated violations
 * - Preserves created_at from old alerts (or uses reading timestamp)
 * - Preserves resolved status from old alerts
 */
const { admin } = require("./config/firebase-config");
const db = admin.firestore();

// Same violation logic as fuzzyService.checkThresholdViolations
function checkViolations(outlet) {
  const violations = [];
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

async function regenerateAlerts() {
  // ===== STEP 1: Read old alerts, index by reading_id =====
  console.log("📖 Reading old alerts...");
  const oldAlertSnap = await db.collection("alerts").get();
  console.log(`   Found ${oldAlertSnap.size} old alerts`);

  // Map: reading_id → { created_at, status, resolved_by, resolved_at, ... }
  const oldAlertMeta = {};
  oldAlertSnap.docs.forEach((d) => {
    const a = d.data();
    const rid = a.reading_id;
    if (!oldAlertMeta[rid]) {
      oldAlertMeta[rid] = {
        created_at: a.created_at,
        status: a.status || "active",
        resolved_by: a.resolved_by || null,
        resolved_at: a.resolved_at || null,
        updated_by: a.updated_by || null,
        updated_at: a.updated_at || null,
      };
    }
  });

  // ===== STEP 2: Read all readings =====
  console.log("📖 Reading all water_quality_readings...");
  const readingSnap = await db.collection("water_quality_readings").get();
  console.log(`   Found ${readingSnap.size} readings`);

  // ===== STEP 3: Delete all old alerts =====
  console.log("🗑️  Deleting old alerts...");
  const batchSize = 400;
  let deleteCount = 0;
  const allOldDocs = oldAlertSnap.docs;

  for (let i = 0; i < allOldDocs.length; i += batchSize) {
    const batch = db.batch();
    const chunk = allOldDocs.slice(i, i + batchSize);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleteCount += chunk.length;
    console.log(`   Deleted ${deleteCount} / ${allOldDocs.length}`);
  }

  // ===== STEP 4: Create new alerts from violations =====
  console.log("🔄 Creating new alerts...");
  let created = 0;
  let readingsWithAlerts = 0;
  let skipped = 0;

  for (const doc of readingSnap.docs) {
    const data = doc.data();
    const outlet = data.outlet;
    const readingId = doc.id;
    const ipalId = data.ipal_id;

    if (!outlet || typeof outlet.ph !== "number") {
      skipped++;
      continue;
    }

    const violations = checkViolations(outlet);
    if (violations.length === 0) continue;

    readingsWithAlerts++;

    // Prefer old alert's created_at, fallback to reading's timestamp
    const meta = oldAlertMeta[readingId];
    const createdAt =
      meta?.created_at ||
      data.timestamp ||
      admin.firestore.FieldValue.serverTimestamp();

    for (const v of violations) {
      const alertData = {
        ipal_id: ipalId,
        reading_id: readingId,
        parameter: v.parameter,
        location: v.location,
        value: v.value,
        threshold: v.threshold,
        deviation: parseFloat(Math.abs(v.value - v.threshold).toFixed(2)),
        severity: v.severity,
        rule: `${v.parameter} ${v.condition}`,
        message: v.message,
        read: false,
        status: meta?.status || "resolved",
        created_at: createdAt,
      };

      // Preserve resolved info if old alert was resolved
      if (meta?.status === "resolved") {
        alertData.resolved_by = meta.resolved_by;
        alertData.resolved_at = meta.resolved_at;
        alertData.updated_by = meta.updated_by;
        alertData.updated_at = meta.updated_at;
      }

      await db.collection("alerts").add(alertData);
      created++;
    }

    if (readingsWithAlerts % 20 === 0) {
      console.log(
        `   Processed ${readingsWithAlerts} readings, ${created} alerts created...`,
      );
    }
  }

  // ===== SUMMARY =====
  console.log(`\n${"=".repeat(50)}`);
  console.log("✅ ALERT REGENERATION DONE");
  console.log(`   Old alerts deleted:      ${deleteCount}`);
  console.log(`   New alerts created:      ${created}`);
  console.log(`   Readings with violations: ${readingsWithAlerts}`);
  console.log(`   Readings skipped:        ${skipped}`);
  console.log(`   created_at preserved from old alerts`);
  console.log(`${"=".repeat(50)}`);

  process.exit(0);
}

regenerateAlerts().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
