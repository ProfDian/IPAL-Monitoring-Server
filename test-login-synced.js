/**
 * Test login dengan user yang baru dibuat
 */

const axios = require("axios");

const API_URL = "http://localhost:3000";

async function testLogin() {
  try {
    console.log("🔐 Testing login...\n");

    const response = await axios.post(`${API_URL}/auth/login`, {
      email: "fattah.afr2@gmail.com",
      password: "cerberus02",
    });

    console.log("✅ Login successful!\n");
    console.log("📋 User Info:");
    console.log(`   Email: ${response.data.user.email}`);
    console.log(`   UID: ${response.data.user.uid}`);
    console.log(`   Role: ${response.data.user.role}`);
    console.log(`   Username: ${response.data.user.username}`);
    console.log(`\n🔑 Token: ${response.data.token.substring(0, 50)}...`);

    console.log("\n✅ User is properly synced!");
  } catch (error) {
    console.error("❌ Login failed:");
    console.error(error.response?.data || error.message);
  }
}

testLogin();
