/**
 * ========================================
 * DASHBOARD SERVICE
 * ========================================
 * Business logic for dashboard operations
 * Extracted from dashboardController for clean architecture
 */

const { db, admin } = require("../config/firebase-config");

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get latest reading untuk IPAL tertentu
 */
async function getLatestReading(ipalId) {
  try {
    const snapshot = await db
      .collection("water_quality_readings")
      .where("ipal_id", "==", ipalId)
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate
        ? doc.data().timestamp.toDate().toISOString()
        : null,
    };
  } catch (error) {
    console.error("Error fetching latest reading:", error);
    return null;
  }
}

/**
 * Get active alerts count dengan breakdown severity
 */
async function getActiveAlertsCount(ipalId) {
  try {
    const snapshot = await db
      .collection("alerts")
      .where("ipal_id", "==", ipalId)
      .where("status", "==", "active")
      .get();

    const counts = {
      total: snapshot.size,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    snapshot.forEach((doc) => {
      const severity = doc.data().severity;
      if (counts.hasOwnProperty(severity)) {
        counts[severity]++;
      }
    });

    return counts;
  } catch (error) {
    console.error("Error fetching active alerts count:", error);
    return { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
  }
}

/**
 * Get today statistics (average, min, max)
 */
async function getTodayStatistics(ipalId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const snapshot = await db
      .collection("water_quality_readings")
      .where("ipal_id", "==", ipalId)
      .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(today))
      .get();

    if (snapshot.empty) {
      return {
        readings_count: 0,
        inlet: null,
        outlet: null,
      };
    }

    // Calculate averages, min, max
    const readings = snapshot.docs.map((doc) => doc.data());

    const inletStats = calculateStats(readings.map((r) => r.inlet));
    const outletStats = calculateStats(readings.map((r) => r.outlet));

    return {
      readings_count: readings.length,
      inlet: inletStats,
      outlet: outletStats,
    };
  } catch (error) {
    console.error("Error fetching today statistics:", error);
    return null;
  }
}

/**
 * Get weekly statistics
 */
async function getWeeklyStatistics(ipalId) {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const snapshot = await db
      .collection("water_quality_readings")
      .where("ipal_id", "==", ipalId)
      .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(oneWeekAgo))
      .get();

    if (snapshot.empty) {
      return {
        readings_count: 0,
        inlet: null,
        outlet: null,
      };
    }

    const readings = snapshot.docs.map((doc) => doc.data());

    const inletStats = calculateStats(readings.map((r) => r.inlet));
    const outletStats = calculateStats(readings.map((r) => r.outlet));

    return {
      readings_count: readings.length,
      inlet: inletStats,
      outlet: outletStats,
    };
  } catch (error) {
    console.error("Error fetching weekly statistics:", error);
    return null;
  }
}

/**
 * Calculate statistics (avg, min, max) for array of readings
 */
function calculateStats(readings) {
  if (!readings || readings.length === 0) {
    return null;
  }

  const parameters = ["ph", "tds", "temperature"];
  const stats = {};

  parameters.forEach((param) => {
    const values = readings.map((r) => r[param]).filter((v) => v != null);

    if (values.length > 0) {
      stats[param] = {
        avg: parseFloat(
          (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
        ),
        min: parseFloat(Math.min(...values).toFixed(2)),
        max: parseFloat(Math.max(...values).toFixed(2)),
      };
    } else {
      stats[param] = { avg: null, min: null, max: null };
    }
  });

  return stats;
}

/**
 * Get IPAL info
 */
async function getIPALInfo(ipalId) {
  try {
    const snapshot = await db
      .collection("ipals")
      .where("ipal_id", "==", ipalId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    };
  } catch (error) {
    console.error("Error fetching IPAL info:", error);
    return null;
  }
}

/**
 * Helper: Calculate summary statistics dari readings
 */
function calculateReadingsSummary(readings) {
  if (readings.length === 0) {
    return null;
  }

  const avgQualityScore =
    readings.reduce((sum, r) => sum + (r.quality_score || 0), 0) /
    readings.length;

  const statusCounts = readings.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const totalViolations = readings.reduce(
    (sum, r) => sum + (r.alert_count || 0),
    0,
  );

  const latest = readings[readings.length - 1];

  return {
    total_readings: readings.length,
    average_quality_score: Math.round(avgQualityScore),
    status_distribution: statusCounts,
    total_violations: totalViolations,
    latest_reading: {
      timestamp: latest.timestamp,
      quality_score: latest.quality_score,
      status: latest.status,
    },
  };
}

// ========================================
// MAIN SERVICE FUNCTIONS
// ========================================

/**
 * Get dashboard summary for specific IPAL
 * @param {number} ipalId
 * @returns {Promise<object>} Dashboard summary
 */
async function getSummary(ipalId) {
  console.log(`📊 Fetching dashboard summary for IPAL: ${ipalId}`);

  // Parallel fetch untuk performa
  const [latestReading, activeAlertsCount, todayStats, weeklyStats, ipalInfo] =
    await Promise.all([
      getLatestReading(ipalId),
      getActiveAlertsCount(ipalId),
      getTodayStatistics(ipalId),
      getWeeklyStatistics(ipalId),
      getIPALInfo(ipalId),
    ]);

  const summary = {
    ipal_info: ipalInfo,
    latest_reading: latestReading,
    active_alerts: activeAlertsCount,
    statistics: {
      today: todayStats,
      this_week: weeklyStats,
    },
    water_quality_status: latestReading?.fuzzy_analysis?.status || "Unknown",
    last_updated: new Date().toISOString(),
  };

  console.log(`✅ Dashboard summary fetched for IPAL ${ipalId}`);
  return summary;
}

/**
 * Get overview for all IPALs
 * @returns {Promise<object>} Overview with statistics and IPAL summaries
 */
async function getOverview() {
  console.log(`📊 Fetching dashboard overview for all IPALs`);

  // Get all IPALs
  const ipalsSnapshot = await db.collection("ipals").get();

  if (ipalsSnapshot.empty) {
    return {
      statistics: { total_ipals: 0 },
      ipals: [],
      last_updated: new Date().toISOString(),
    };
  }

  // Fetch summary for each IPAL
  const ipalSummaries = await Promise.all(
    ipalsSnapshot.docs.map(async (ipalDoc) => {
      const ipalData = ipalDoc.data();
      const ipalId = ipalData.ipal_id;

      const [latestReading, activeAlertsCount] = await Promise.all([
        getLatestReading(ipalId),
        getActiveAlertsCount(ipalId),
      ]);

      return {
        ipal_id: ipalId,
        ipal_location: ipalData.ipal_location,
        ipal_description: ipalData.ipal_description,
        latest_reading: latestReading
          ? {
              timestamp: latestReading.timestamp,
              inlet: latestReading.inlet,
              outlet: latestReading.outlet,
              quality_status: latestReading.fuzzy_analysis?.status || "Unknown",
              quality_score: latestReading.fuzzy_analysis?.quality_score || 0,
            }
          : null,
        active_alerts: activeAlertsCount,
        status:
          activeAlertsCount.critical > 0
            ? "critical"
            : activeAlertsCount.high > 0
              ? "warning"
              : "normal",
      };
    }),
  );

  // Calculate total statistics
  const totalStats = {
    total_ipals: ipalsSnapshot.size,
    ipals_with_critical_alerts: ipalSummaries.filter(
      (ipal) => ipal.status === "critical",
    ).length,
    ipals_with_warnings: ipalSummaries.filter(
      (ipal) => ipal.status === "warning",
    ).length,
    total_active_alerts: ipalSummaries.reduce(
      (sum, ipal) => sum + ipal.active_alerts.total,
      0,
    ),
  };

  console.log(`✅ Dashboard overview fetched for ${ipalsSnapshot.size} IPALs`);

  return {
    statistics: totalStats,
    ipals: ipalSummaries,
    last_updated: new Date().toISOString(),
  };
}

/**
 * Get readings optimized for Recharts
 * @param {number} ipalId
 * @param {object} params - { period, start, end, limit }
 * @returns {Promise<object>} Chart data with readings and summary
 * @throws {Error} with status 400 for invalid params
 */
async function getReadingsForChart(
  ipalId,
  { period = "today", start, end, limit = 100 },
) {
  console.log(
    `📊 Fetching readings for chart - IPAL: ${ipalId}, Period: ${period}`,
  );

  // Calculate date range based on period
  let startDate, endDate;

  switch (period) {
    case "today":
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      break;

    case "yesterday":
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setDate(endDate.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
      break;

    case "week":
    case "7days":
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      break;

    case "custom":
      if (!start || !end) {
        const error = new Error(
          "Custom period requires 'start' and 'end' query parameters",
        );
        error.status = 400;
        throw error;
      }
      startDate = new Date(start);
      endDate = new Date(end);
      break;

    default: {
      const error = new Error(
        "Invalid period. Use: today, yesterday, week, or custom (with start/end)",
      );
      error.status = 400;
      throw error;
    }
  }

  console.log(
    `   Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`,
  );

  // Query Firestore
  const snapshot = await db
    .collection("water_quality_readings")
    .where("ipal_id", "==", parseInt(ipalId))
    .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(startDate))
    .where("timestamp", "<=", admin.firestore.Timestamp.fromDate(endDate))
    .orderBy("timestamp", "asc") // ASC untuk chart (kiri ke kanan)
    .limit(parseInt(limit))
    .get();

  if (snapshot.empty) {
    return {
      readings: [],
      count: 0,
      period,
      date_range: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      summary: null,
    };
  }

  // Transform data untuk Recharts
  const readings = snapshot.docs.map((doc) => {
    const data = doc.data();
    const timestamp = data.timestamp?.toDate
      ? data.timestamp.toDate()
      : new Date(data.timestamp);

    return {
      // IDs
      id: doc.id,
      ipal_id: data.ipal_id,

      // Timestamps (ISO format for proper parsing)
      timestamp: timestamp.toISOString(),
      // Unix timestamp for numeric operations
      unix_timestamp: timestamp.getTime(),
      // Formatted strings for display only (not for parsing)
      date: timestamp.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        timeZone: "Asia/Jakarta",
      }),
      time: timestamp.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Jakarta",
      }),
      date_display: timestamp.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      }),
      time_display: timestamp.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Jakarta",
      }),
      datetime_display: timestamp.toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
      }),

      // Inlet data
      inlet_ph: data.inlet?.ph || null,
      inlet_tds: data.inlet?.tds || null,
      inlet_temperature: data.inlet?.temperature || null,

      // Outlet data
      outlet_ph: data.outlet?.ph || null,
      outlet_tds: data.outlet?.tds || null,
      outlet_temperature: data.outlet?.temperature || null,

      // FUZZY ANALYSIS
      quality_score: data.fuzzy_analysis?.quality_score || 0,
      status: data.fuzzy_analysis?.status || "unknown",
      alert_count: data.fuzzy_analysis?.alert_count || 0,
      has_violations: data.fuzzy_analysis?.violations?.length > 0 || false,

      // Additional fuzzy data
      violations: data.fuzzy_analysis?.violations || [],
      effectiveness_issues: data.fuzzy_analysis?.effectiveness_issues || [],
      sensor_faults: data.fuzzy_analysis?.sensor_faults || [],
      recommendations: data.fuzzy_analysis?.recommendations || [],
      analysis_method: data.fuzzy_analysis?.analysis_method || null,
    };
  });

  // Calculate summary statistics
  const summary = calculateReadingsSummary(readings);

  console.log(`✅ Retrieved ${readings.length} readings for chart`);

  return {
    readings,
    count: readings.length,
    period,
    date_range: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
    summary,
  };
}

module.exports = {
  getSummary,
  getOverview,
  getReadingsForChart,
  getLatestReading,
  getActiveAlertsCount,
  calculateStats,
  calculateReadingsSummary,
};

// Debug
console.log("📦 dashboardService loaded");
