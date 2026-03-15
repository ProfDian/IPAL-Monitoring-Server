/**
 * ========================================
 * SUBMIT ENDPOINT VALIDATION TEST
 * ========================================
 * Focus: boundary validation for ESP32 payload
 *
 * Run: node test-submit-validation.js
 */

const path = require("path");

const serviceModulePath = path.resolve(
  __dirname,
  "services/waterQualityService.js",
);

require.cache[serviceModulePath] = {
  id: serviceModulePath,
  filename: serviceModulePath,
  loaded: true,
  exports: {
    submitReading: async () => ({
      success: true,
      merged: false,
      buffer_id: "buffer-mock-001",
      waiting_for: "outlet",
      message: "Data buffered, waiting for outlet pair",
    }),
  },
};

const waterQualityController = require("./controllers/waterQualityController");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
    return;
  }

  failed++;
  console.log(`  ❌ ${message}`);
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function callSubmit(body) {
  const req = { body };
  const res = createMockRes();
  await waterQualityController.submitReading(req, res);
  return res;
}

async function testRejectStringPayload() {
  const res = await callSubmit({
    ipal_id: 1,
    location: "inlet",
    device_id: "ESP32-INLET-001",
    data: {
      ph: "7.2",
      tds: 1200,
      temperature: 29.5,
    },
  });

  assert(res.statusCode === 400, "reject string sensor value with HTTP 400");
  assert(
    res.body?.message === "Invalid sensor payload",
    "return invalid sensor payload message",
  );
  assert(
    Array.isArray(res.body?.errors) &&
      res.body.errors.some(
        (error) => error.field === "data.ph" && error.received === "string",
      ),
    "include field-level error for data.ph string",
  );
}

async function testRejectNullPayload() {
  const res = await callSubmit({
    ipal_id: 1,
    location: "inlet",
    device_id: "ESP32-INLET-001",
    data: {
      ph: null,
      tds: 1200,
      temperature: 29.5,
    },
  });

  assert(res.statusCode === 400, "reject null sensor value with HTTP 400");
  assert(
    Array.isArray(res.body?.errors) &&
      res.body.errors.some(
        (error) => error.field === "data.ph" && error.received === "null",
      ),
    "include field-level error for data.ph null",
  );
}

async function testRejectMissingField() {
  const res = await callSubmit({
    ipal_id: 1,
    location: "inlet",
    device_id: "ESP32-INLET-001",
    data: {
      ph: 7.2,
      tds: 1200,
    },
  });

  assert(
    res.statusCode === 400,
    "reject missing data.temperature with HTTP 400",
  );
  assert(
    res.body?.message === "Invalid data structure",
    "return invalid data structure message",
  );
}

async function testRejectNonFinite() {
  const res = await callSubmit({
    ipal_id: 1,
    location: "inlet",
    device_id: "ESP32-INLET-001",
    data: {
      ph: Infinity,
      tds: 1200,
      temperature: 29.5,
    },
  });

  assert(res.statusCode === 400, "reject non-finite value with HTTP 400");
  assert(
    Array.isArray(res.body?.errors) &&
      res.body.errors.some(
        (error) =>
          error.field === "data.ph" && error.expected === "finite number",
      ),
    "include finite-number contract in error payload",
  );
}

async function testRejectInvalidIpalIdType() {
  const res = await callSubmit({
    ipal_id: "1",
    location: "inlet",
    device_id: "ESP32-INLET-001",
    data: {
      ph: 7.2,
      tds: 1200,
      temperature: 29.5,
    },
  });

  assert(res.statusCode === 400, "reject non-integer ipal_id with HTTP 400");
  assert(
    res.body?.message === "Invalid ipal_id",
    "return invalid ipal_id message",
  );
}

async function testAcceptValidNumericPayload() {
  const res = await callSubmit({
    ipal_id: 1,
    location: "inlet",
    device_id: "ESP32-INLET-001",
    data: {
      ph: 7.2,
      tds: 1200,
      temperature: 29.5,
    },
  });

  assert(res.statusCode === 200, "accept valid numeric payload with HTTP 200");
  assert(res.body?.success === true, "response success true for valid payload");
  assert(res.body?.merged === false, "uses mocked service response path");
}

async function run() {
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║  SUBMIT VALIDATION TEST SUITE             ║");
  console.log("╚═══════════════════════════════════════════╝");

  try {
    await testRejectStringPayload();
    await testRejectNullPayload();
    await testRejectMissingField();
    await testRejectNonFinite();
    await testRejectInvalidIpalIdType();
    await testAcceptValidNumericPayload();
  } catch (error) {
    failed++;
    console.error("\n💥 FATAL ERROR:", error);
  }

  console.log("\n═══════════════════════════════════════════");
  console.log(`Total:  ${passed + failed}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(
    `\n${failed === 0 ? "🎉 ALL TESTS PASSED!" : "⚠️  SOME TESTS FAILED"}`,
  );

  process.exit(failed > 0 ? 1 : 0);
}

run();
