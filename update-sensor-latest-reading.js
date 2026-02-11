/**
 * One-time script: Add latest_reading to sensor-ph-inlet-001
 * Run: node update-sensor-latest-reading.js
 */

// Initialize Firebase
require("./config/firebase-config");
const admin = require("firebase-admin");
const db = admin.firestore();

async function updateSensorLatestReading() {
  const sensorId = "sensor-ph-inlet-001";

  const latestReading = {
    reading_id: "EzhiuApiXGBspXOtMbXn",
    status: "good",
    timestamp: admin.firestore.Timestamp.fromDate(
      new Date("2025-11-28T16:23:43Z"),
    ),
    value: 7,
  };

  try {
    const sensorRef = db.collection("sensors").doc(sensorId);
    const doc = await sensorRef.get();

    if (!doc.exists) {
      console.log(`❌ Sensor ${sensorId} not found`);
      return;
    }

    await sensorRef.update({ latest_reading: latestReading });
    console.log(`✅ latest_reading added to ${sensorId}:`);
    console.log(JSON.stringify(latestReading, null, 2));
  } catch (error) {
    console.error("💥 Error:", error.message);
  }

  process.exit(0);
}

updateSensorLatestReading();
