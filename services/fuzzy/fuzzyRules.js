/**
 * ========================================
 * FUZZY RULES & MEMBERSHIP FUNCTIONS
 * ========================================
 * Configuration for Fuzzy Mamdani system
 * Phase 2: Gaussian membership + Extended rules
 */

/**
 * ========================================
 * OUTLET MEMBERSHIP FUNCTIONS
 * ========================================
 * Using Gaussian membership for smooth transitions
 * Centers and sigmas tuned for realistic water quality
 */
const OUTLET_MEMBERSHIP = {
  ph: {
    rendah: { center: 5.0, sigma: 1.0 }, // Peak at pH 5
    normal: { center: 7.5, sigma: 1.0 }, // Peak at pH 7.5
    tinggi: { center: 10.0, sigma: 1.0 }, // Peak at pH 10
  },
  tds: {
    rendah: { center: 1500, sigma: 500 }, // Peak at 1500 mg/L
    normal: { center: 3000, sigma: 800 }, // Peak at 3000 mg/L
    tinggi: { center: 5000, sigma: 700 }, // Peak at 5000 mg/L
  },
  suhu: {
    rendah: { center: 22, sigma: 3 }, // Peak at 22°C
    normal: { center: 30, sigma: 4 }, // Peak at 30°C
    tinggi: { center: 38, sigma: 3 }, // Peak at 38°C
  },
};

/**
 * ========================================
 * EFFECTIVENESS MEMBERSHIP FUNCTIONS
 * ========================================
 * For reduction rates and treatment effectiveness
 */
const EFFECTIVENESS_MEMBERSHIP = {
  tds_reduction: {
    tidak_efektif: { center: 5, sigma: 5 }, // 0-10% reduction
    kurang_efektif: { center: 20, sigma: 8 }, // 10-30%
    efektif: { center: 45, sigma: 10 }, // 30-60%
    sangat_efektif: { center: 70, sigma: 12 }, // >60%
  },
  suhu_change: {
    tidak_stabil: { threshold: 5 }, // >5°C change
    kurang_stabil: { center: 3, sigma: 1.5 }, // 2-4°C
    stabil: { center: 1, sigma: 1 }, // 0-2°C
    sangat_stabil: { threshold: 0.5 }, // <0.5°C
  },
};

/**
 * ========================================
 * OUTLET QUALITY FUZZY RULES (15 Rules)
 * ========================================
 * Format: IF conditions THEN output
 * Conditions connected with AND (MIN operator)
 */
const OUTLET_RULES = [
  // ===== BAIK (Good Quality) =====
  {
    id: 1,
    conditions: ["ph_normal", "tds_rendah", "suhu_normal"],
    output: "baik",
    description: "Semua parameter optimal",
  },
  {
    id: 2,
    conditions: ["ph_normal", "tds_normal", "suhu_normal"],
    output: "baik",
    description: "Semua parameter dalam range baik",
  },
  {
    id: 3,
    conditions: ["ph_normal", "tds_rendah", "suhu_rendah"],
    output: "baik",
    description: "pH optimal, suhu dingin, TDS rendah",
  },
  {
    id: 4,
    conditions: ["ph_normal", "tds_rendah"],
    output: "baik",
    description: "pH & TDS optimal",
  },
  {
    id: 5,
    conditions: ["ph_normal", "suhu_normal"],
    output: "baik",
    description: "pH & suhu optimal",
  },

  // ===== CUKUP (Fair Quality) =====
  {
    id: 6,
    conditions: ["ph_normal", "tds_normal"],
    output: "cukup",
    description: "pH & TDS dalam range normal",
  },
  {
    id: 7,
    conditions: ["ph_normal", "suhu_tinggi"],
    output: "cukup",
    description: "pH baik tapi suhu tinggi",
  },
  {
    id: 8,
    conditions: ["tds_normal", "suhu_normal"],
    output: "cukup",
    description: "TDS & suhu dalam range tengah",
  },
  {
    id: 9,
    conditions: ["ph_tinggi", "tds_normal"],
    output: "cukup",
    description: "pH sedikit tinggi, TDS normal",
  },
  {
    id: 10,
    conditions: ["ph_rendah", "tds_normal"],
    output: "cukup",
    description: "pH sedikit rendah, TDS normal",
  },
  {
    id: 11,
    conditions: ["tds_rendah", "suhu_tinggi"],
    output: "cukup",
    description: "TDS rendah tapi suhu tinggi",
  },

  // ===== BURUK (Poor Quality) =====
  {
    id: 12,
    conditions: ["ph_rendah", "tds_tinggi"],
    output: "buruk",
    description: "pH asam DAN TDS tinggi - sangat buruk",
  },
  {
    id: 13,
    conditions: ["ph_tinggi", "tds_tinggi"],
    output: "buruk",
    description: "pH basa DAN TDS tinggi - sangat buruk",
  },
  {
    id: 14,
    conditions: ["ph_rendah", "suhu_tinggi"],
    output: "buruk",
    description: "pH asam DAN suhu tinggi - berbahaya",
  },
  {
    id: 15,
    conditions: ["ph_tinggi", "suhu_tinggi"],
    output: "buruk",
    description: "pH basa DAN suhu tinggi - berbahaya",
  },
];

/**
 * ========================================
 * EFFECTIVENESS FUZZY RULES (12 Rules)
 * ========================================
 * Evaluate IPAL treatment effectiveness
 */
const EFFECTIVENESS_RULES = [
  // ===== SANGAT EFEKTIF =====
  {
    id: 1,
    conditions: ["tds_sangat_efektif", "ph_sangat_efektif"],
    output: "sangat_efektif",
    description: "TDS & pH treatment excellent",
  },
  {
    id: 2,
    conditions: ["tds_sangat_efektif", "suhu_sangat_stabil"],
    output: "sangat_efektif",
    description: "TDS reduction excellent & suhu stabil",
  },
  {
    id: 3,
    conditions: ["tds_sangat_efektif", "ph_efektif", "suhu_stabil"],
    output: "sangat_efektif",
    description: "Semua parameter treatment excellent",
  },

  // ===== EFEKTIF =====
  {
    id: 4,
    conditions: ["tds_efektif", "ph_efektif"],
    output: "efektif",
    description: "TDS & pH treatment good",
  },
  {
    id: 5,
    conditions: ["tds_sangat_efektif", "ph_kurang_efektif"],
    output: "efektif",
    description: "TDS excellent tapi pH moderate",
  },
  {
    id: 6,
    conditions: ["tds_efektif", "suhu_stabil"],
    output: "efektif",
    description: "TDS reduction good & temperature stable",
  },
  {
    id: 7,
    conditions: ["ph_sangat_efektif", "tds_kurang_efektif"],
    output: "efektif",
    description: "pH excellent tapi TDS moderate",
  },
  {
    id: 8,
    conditions: ["tds_efektif", "ph_efektif", "suhu_kurang_stabil"],
    output: "efektif",
    description: "Treatment baik meski suhu kurang stabil",
  },

  // ===== KURANG EFEKTIF =====
  {
    id: 9,
    conditions: ["tds_kurang_efektif", "ph_kurang_efektif"],
    output: "kurang_efektif",
    description: "TDS & pH treatment insufficient",
  },
  {
    id: 10,
    conditions: ["tds_tidak_efektif", "ph_efektif"],
    output: "kurang_efektif",
    description: "pH OK tapi TDS tidak turun",
  },
  {
    id: 11,
    conditions: ["tds_efektif", "ph_tidak_efektif"],
    output: "kurang_efektif",
    description: "TDS OK tapi pH treatment gagal",
  },

  // ===== TIDAK EFEKTIF =====
  {
    id: 12,
    conditions: ["tds_tidak_efektif", "ph_tidak_efektif"],
    output: "tidak_efektif",
    description: "IPAL gagal - TDS & pH tidak membaik",
  },
];

/**
 * ========================================
 * OUTPUT MEMBERSHIP FUNCTIONS
 * ========================================
 * For defuzzification (Centroid method)
 * Using trapezoid/triangle shapes
 */
const OUTPUT_MEMBERSHIP = {
  // Outlet Quality Output (0-100)
  quality: {
    buruk: {
      type: "trapezoid",
      a: 0,
      b: 0,
      c: 30,
      d: 50,
    },
    cukup: {
      type: "triangle",
      a: 30,
      b: 50,
      c: 70,
    },
    baik: {
      type: "trapezoid",
      a: 60,
      b: 80,
      c: 100,
      d: 100,
    },
  },

  // Effectiveness Output (0-100)
  effectiveness: {
    tidak_efektif: {
      type: "trapezoid",
      a: 0,
      b: 0,
      c: 25,
      d: 40,
    },
    kurang_efektif: {
      type: "triangle",
      a: 30,
      b: 45,
      c: 60,
    },
    efektif: {
      type: "triangle",
      a: 50,
      b: 65,
      c: 80,
    },
    sangat_efektif: {
      type: "trapezoid",
      a: 70,
      b: 85,
      c: 100,
      d: 100,
    },
  },
};

/**
 * ========================================
 * BAKU MUTU STANDARDS (Reference)
 * ========================================
 * Peraturan Menteri LHK - Updated for 3 parameters
 */
const BAKU_MUTU = {
  pemerintah: {
    ph: { min: 6.0, max: 9.0, optimal_min: 6.5, optimal_max: 8.5 },
    tds: { max: 4000, optimal_max: 2000 }, // mg/L
    temperature: { max: 40, optimal_max: 35 }, // °C
  },
  golongan_2: {
    ph: { min: 6.0, max: 9.0, optimal_min: 6.5, optimal_max: 8.5 },
    tds: { max: 4000, optimal_max: 2000 }, // mg/L
    temperature: { max: 40, optimal_max: 35 }, // °C
  },
  golongan_1: {
    ph: { min: 6.0, max: 9.0, optimal_min: 6.5, optimal_max: 8.5 },
    tds: { max: 2000, optimal_max: 1000 }, // mg/L
    temperature: { max: 38, optimal_max: 30 }, // °C
  },
};

/**
 * ========================================
 * ALERT THRESHOLDS
 * ========================================
 */
const ALERT_THRESHOLDS = {
  outlet_score: {
    critical: 30, // < 30 = critical
    poor: 50, // 30-50 = poor
    fair: 70, // 50-70 = fair
    good: 85, // 70-85 = good
  },
  effectiveness_score: {
    tidak_efektif: 40,
    kurang_efektif: 60,
    efektif: 80,
  },
  reduction_rates: {
    tds: {
      minimal: 10, // < 10% = tidak efektif
      low: 30, // 10-30% = kurang efektif
      good: 50, // 30-50% = efektif
      excellent: 70, // > 70% = sangat efektif
    },
  },
};

/**
 * ========================================
 * EXPORTS
 * ========================================
 */
module.exports = {
  OUTLET_MEMBERSHIP,
  EFFECTIVENESS_MEMBERSHIP,
  OUTLET_RULES,
  EFFECTIVENESS_RULES,
  OUTPUT_MEMBERSHIP,
  BAKU_MUTU,
  ALERT_THRESHOLDS,
};

console.log("📦 fuzzyRules.js loaded (3 Parameters)");
console.log(`   - ${OUTLET_RULES.length} outlet quality rules`);
console.log(`   - ${EFFECTIVENESS_RULES.length} effectiveness rules`);