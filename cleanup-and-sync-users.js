/**
 * ========================================
 * CLEANUP & SYNC USERS
 * ========================================
 * Hapus semua user dan buat ulang dengan sinkronisasi benar
 * UID Authentication = Document ID Firestore
 */

const { admin, db } = require("./config/firebase-config");

// Data user yang akan dibuat ulang
const USERS_TO_CREATE = [
  {
    email: "fattah.afr2@gmail.com",
    password: "Cerberus02",
    role: "admin",
    username: "FattahAFR",
    // FCM token akan di-update via app nanti
  },
];

/**
 * Step 1: Backup existing users data
 */
async function backupUsers() {
  try {
    console.log("\n📦 Step 1: Backing up existing users...");

    const usersSnapshot = await db.collection("users").get();
    const backup = [];

    usersSnapshot.forEach((doc) => {
      backup.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    console.log(`✅ Found ${backup.length} users in Firestore`);
    backup.forEach((user) => {
      console.log(
        `   - ${user.email} (${user.role}) [${user.id.substring(0, 8)}...]`
      );
    });

    return backup;
  } catch (error) {
    console.error("❌ Error backing up:", error);
    throw error;
  }
}

/**
 * Step 2: Delete all users from Authentication
 */
async function deleteAllAuthUsers() {
  try {
    console.log("\n🗑️  Step 2: Deleting users from Authentication...");

    const listUsersResult = await admin.auth().listUsers();
    const deletePromises = listUsersResult.users.map((user) =>
      admin.auth().deleteUser(user.uid)
    );

    await Promise.all(deletePromises);

    console.log(
      `✅ Deleted ${deletePromises.length} users from Authentication`
    );
  } catch (error) {
    console.error("❌ Error deleting auth users:", error);
    throw error;
  }
}

/**
 * Step 3: Delete all users from Firestore
 */
async function deleteAllFirestoreUsers() {
  try {
    console.log("\n🗑️  Step 3: Deleting users from Firestore...");

    const usersSnapshot = await db.collection("users").get();
    const batch = db.batch();

    usersSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`✅ Deleted ${usersSnapshot.size} users from Firestore`);
  } catch (error) {
    console.error("❌ Error deleting Firestore users:", error);
    throw error;
  }
}

/**
 * Step 4: Create users with proper sync
 */
async function createUsersWithSync() {
  try {
    console.log("\n✨ Step 4: Creating users with proper sync...");

    for (const userData of USERS_TO_CREATE) {
      console.log(`\n👤 Creating: ${userData.email}`);

      // 1. Create in Authentication first
      const userRecord = await admin.auth().createUser({
        email: userData.email,
        password: userData.password,
        emailVerified: true,
      });

      console.log(`   ✅ Auth created with UID: ${userRecord.uid}`);

      // 2. Create in Firestore with SAME UID as document ID
      const firestoreData = {
        email: userData.email,
        username: userData.username,
        role: userData.role,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await db.collection("users").doc(userRecord.uid).set(firestoreData);

      console.log(`   ✅ Firestore doc created with ID: ${userRecord.uid}`);
      console.log(`   ℹ️  Email: ${userData.email}`);
      console.log(`   ℹ️  Role: ${userData.role}`);
      console.log(`   ℹ️  Username: ${userData.username}`);
    }

    console.log(`\n✅ Successfully created ${USERS_TO_CREATE.length} users`);
  } catch (error) {
    console.error("❌ Error creating users:", error);
    throw error;
  }
}

/**
 * Step 5: Verify sync
 */
async function verifySync() {
  try {
    console.log("\n🔍 Step 5: Verifying sync...");

    const listUsersResult = await admin.auth().listUsers();
    console.log(
      `\n📊 Users in Authentication: ${listUsersResult.users.length}`
    );

    const usersSnapshot = await db.collection("users").get();
    console.log(`📊 Users in Firestore: ${usersSnapshot.size}`);

    console.log("\n🔍 Checking each user:");
    for (const authUser of listUsersResult.users) {
      const firestoreDoc = await db.collection("users").doc(authUser.uid).get();

      if (firestoreDoc.exists) {
        const data = firestoreDoc.data();
        console.log(
          `   ✅ ${authUser.email} - UID: ${authUser.uid.substring(0, 8)}... (${
            data.role
          })`
        );
      } else {
        console.log(
          `   ❌ ${authUser.email} - Missing in Firestore! UID: ${authUser.uid}`
        );
      }
    }
  } catch (error) {
    console.error("❌ Error verifying:", error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log("🚀 Starting User Cleanup & Sync Process...");
  console.log("⚠️  This will DELETE all existing users!");

  try {
    // Backup
    const backup = await backupUsers();

    // Ask for confirmation
    console.log("\n⚠️  CONFIRMATION REQUIRED:");
    console.log(
      `   This will delete ${backup.length} users and recreate ${USERS_TO_CREATE.length} users`
    );
    console.log("   Press Ctrl+C to cancel, or wait 5 seconds to continue...");

    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Delete all
    await deleteAllAuthUsers();
    await deleteAllFirestoreUsers();

    // Create new
    await createUsersWithSync();

    // Verify
    await verifySync();

    console.log("\n✨ ========================================");
    console.log("✅ CLEANUP & SYNC COMPLETED SUCCESSFULLY!");
    console.log("========================================\n");

    console.log("📝 Next steps:");
    console.log("   1. Test login dengan: fattah.afr2@gmail.com / cerberus02");
    console.log("   2. FCM token akan auto-update saat login via app");
    console.log("   3. Gunakan API /api/users untuk create user lainnya");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Process failed:", error);
    process.exit(1);
  }
}

// Run
main();
