const { analyzeFuzzy } = require("./utils/fuzzyLogicHelper");

// Test Case 1: Data Normal (IPAL bekerja baik)
console.log("\n=== TEST 1: Normal Data ===");
const normalResult = analyzeFuzzy(
  { ph: 7.2, tds: 450, temperature: 28 },
  { ph: 7.8, tds: 320, temperature: 29 },
);
console.log(JSON.stringify(normalResult, null, 2));

// Test Case 2: pH Outlet Terlalu Tinggi
console.log("\n=== TEST 2: High pH Outlet ===");
const highPHResult = analyzeFuzzy(
  { ph: 7.3, tds: 480, temperature: 27 },
  { ph: 9.5, tds: 340, temperature: 28 },
);
console.log(JSON.stringify(highPHResult, null, 2));

// Test Case 3: TDS Tidak Turun Cukup
console.log("\n=== TEST 3: TDS Not Reduced Enough ===");
const tdsProblem = analyzeFuzzy(
  { ph: 7.2, tds: 500, temperature: 28 },
  { ph: 7.7, tds: 480, temperature: 28.5 },
);
console.log(JSON.stringify(tdsProblem, null, 2));
