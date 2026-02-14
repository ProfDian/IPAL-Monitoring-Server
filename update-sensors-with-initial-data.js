/**
 * ========================================
 * UPDATE SENSORS WITH INITIAL DATA
 * ========================================
 * Initialize all sensors with dummy latest_reading and last_updated_at
 * so they show up as "online" in the frontend
 *
 * Usage: node update-sensors-with-initial-data.js
 */

const { db, admin } = require("./config/firebase-config");

async function updateSensorsWithInitialData() {
  try {
    console.log("🔧 Starting sensor initialization...\n");

    // Get all sensors
    const sensorsSnapshot = await db.collection("sensors").get();

    if (sensorsSnapshot.empty) {
      console.log("⚠️  No sensors found. Run setupSensor.js first!");
      process.exit(1);
    }

    console.log(`📊 Found ${sensorsSnapshot.size} sensor(s)\n`);

    const batch = db.batch();
    const now = admin.firestore.Timestamp.now();

    // Initial dummy values based on sensor type
    const dummyValues = {
      ph: 7.2,
      tds: 350,
      temperature: 28.5,
    };

    sensorsSnapshot.forEach((doc) => {
      const sensor = doc.data();
      const sensorType = sensor.sensor_type;
      const dummyValue = dummyValues[sensorType] || 0;

      console.log(`✏️  Updating ${doc.id}...`);
      console.log(`   Type: ${sensorType}`);
      console.log(`   Location: ${sensor.sensor_location}`);
      console.log(`   Dummy value: ${dummyValue}`);

      // Update sensor with initial data
      batch.update(doc.ref, {
        latest_reading: {
          value: dummyValue,
          timestamp: now,
          reading_id: "initial_setup",
          status: "normal",
        },
        last_updated_at: now,
        updated_at: now,
        readings_count: 1,
      });

      console.log(`✅ ${doc.id} updated\n`);
    });

    // Commit batch
    await batch.commit();

    console.log("========================================");
    console.log("✅ Sensor initialization completed!");
    console.log(`📊 Total sensors updated: ${sensorsSnapshot.size}`);
    console.log("========================================\n");
    console.log(
      "💡 All sensors now have initial data and should show as 'online'",
    );
    console.log("   Refresh your frontend to see the changes!");

    process.exit(0);
  } catch (error) {
    console.error("💥 Error initializing sensors:", error);
    process.exit(1);
  }
}

// Run update
updateSensorsWithInitialData();
