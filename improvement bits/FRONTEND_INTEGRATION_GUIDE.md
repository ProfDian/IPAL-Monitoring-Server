# 🚀 Frontend Integration Guide

## Overview

Panduan untuk integrate endpoint baru `/api/dashboard/readings/:ipal_id` ke frontend React.

---

## 📝 Step-by-Step Integration

### **Step 1: Update `dashboardService.js`**

Tambahkan fungsi baru di file `src/services/dashboardService.js`:

```javascript
/**
 * Get readings untuk chart (NEW ENDPOINT)
 * @param {number} ipalId - IPAL ID
 * @param {Object} options - Filter options
 * @returns {Promise<Object>} Chart data with summary
 */
getReadingsForChart: async (ipalId = 1, options = {}) => {
  try {
    const {
      period = 'week',    // today|yesterday|week|custom
      start = null,       // ISO date string (for custom)
      end = null,         // ISO date string (for custom)
      limit = 100,        // Max 500
    } = options;

    console.log(`📈 Fetching chart data for IPAL ${ipalId}...`);
    console.log('   Options:', { period, start, end, limit });

    // Build query params
    const params = new URLSearchParams({
      period,
      limit: limit.toString(),
    });

    // Add custom date range if specified
    if (period === 'custom' && start && end) {
      params.append('start', start);
      params.append('end', end);
    }

    const response = await api.get(
      `/api/dashboard/readings/${ipalId}?${params.toString()}`
    );

    console.log('✅ Chart data fetched successfully');
    console.log('   Total readings:', response.data?.count || 0);
    console.log('   Period:', response.data?.period);
    console.log('   Avg quality score:', response.data?.summary?.average_quality_score);

    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch chart data:', error.message);
    throw error;
  }
},
```

---

### **Step 2: Create New Chart Component** (Optional)

Buat `src/components/charts/QualityScoreChart.jsx`:

```jsx
import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const QualityScoreChart = ({ data = [] }) => {
  // Custom tooltip dengan status color
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload[0]) return null;

    const item = payload[0].payload;
    const statusColors = {
      excellent: "#00C49F",
      good: "#0088FE",
      fair: "#FFBB28",
      poor: "#FF8042",
      critical: "#FF0000",
    };

    return (
      <div className="bg-white p-4 rounded-lg shadow-xl border border-gray-200">
        <p className="font-bold text-gray-900 mb-2">
          {item.date} {item.time}
        </p>
        <div className="space-y-1">
          <p className="text-sm">
            <span className="font-semibold">Quality Score:</span>{" "}
            <span className="font-bold">{item.quality_score}</span>/100
          </p>
          <p className="text-sm">
            <span className="font-semibold">Status:</span>{" "}
            <span
              className="font-bold capitalize px-2 py-1 rounded"
              style={{
                backgroundColor: statusColors[item.status] + "20",
                color: statusColors[item.status],
              }}
            >
              {item.status}
            </span>
          </p>
          {item.has_violations && (
            <p className="text-sm text-red-600 font-semibold mt-2">
              ⚠️ {item.alert_count} violation(s)
            </p>
          )}
        </div>
      </div>
    );
  };

  // Custom dot dengan color berdasarkan status
  const CustomDot = (props) => {
    const { cx, cy, payload } = props;
    const statusColors = {
      excellent: "#00C49F",
      good: "#0088FE",
      fair: "#FFBB28",
      poor: "#FF8042",
      critical: "#FF0000",
    };

    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill={statusColors[payload.status] || "#999"}
        stroke="white"
        strokeWidth={2}
      />
    );
  };

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} stroke="#6b7280" />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 12 }}
          stroke="#6b7280"
          label={{
            value: "Quality Score",
            angle: -90,
            position: "insideLeft",
            style: { fontSize: 12 },
          }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />

        {/* Reference lines */}
        <ReferenceLine
          y={85}
          stroke="#00C49F"
          strokeDasharray="5 5"
          label={{ value: "Excellent", position: "right", fontSize: 10 }}
        />
        <ReferenceLine
          y={50}
          stroke="#FFBB28"
          strokeDasharray="5 5"
          label={{ value: "Fair", position: "right", fontSize: 10 }}
        />
        <ReferenceLine
          y={30}
          stroke="#FF0000"
          strokeDasharray="5 5"
          label={{ value: "Critical", position: "right", fontSize: 10 }}
        />

        {/* Main line */}
        <Line
          type="monotone"
          dataKey="quality_score"
          stroke="#8884d8"
          strokeWidth={3}
          dot={<CustomDot />}
          name="Quality Score"
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default QualityScoreChart;
```

---

### **Step 3: Update Dashboard.jsx**

Tambahkan quality score chart di dashboard:

```jsx
// Import di top
import QualityScoreChart from "../components/charts/QualityScoreChart";

// Tambah state
const [qualityChartData, setQualityChartData] = useState([]);
const [selectedPeriod, setSelectedPeriod] = useState("week");

// Fetch quality score data
useEffect(() => {
  fetchQualityScoreData();
}, [selectedPeriod]);

const fetchQualityScoreData = async () => {
  try {
    console.log(`📊 Fetching quality score chart data (${selectedPeriod})...`);
    const result = await dashboardService.getReadingsForChart(IPAL_ID, {
      period: selectedPeriod,
      limit: 50,
    });

    console.log("✅ Quality chart data received:", result);
    setQualityChartData(result.data || []);
  } catch (err) {
    console.error("❌ Error fetching quality chart:", err);
  }
};

// Tambah section baru di JSX (setelah grid parameters)
```

```jsx
{
  /* Quality Score Trend Section */
}
<div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden">
  <div className="p-6 border-b bg-gradient-to-r from-green-50/50 to-emerald-50/50">
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-2 rounded-lg">
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">Quality Score Trend</h3>
          <p className="text-xs text-gray-600 mt-0.5">
            Fuzzy logic analysis over time
          </p>
        </div>
      </div>
      <select
        value={selectedPeriod}
        onChange={(e) => setSelectedPeriod(e.target.value)}
        className="px-3 py-2 border rounded-lg text-sm"
      >
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="week">Last 7 Days</option>
      </select>
    </div>
  </div>
  <div className="p-6 h-[400px]">
    <QualityScoreChart data={qualityChartData} />
  </div>
</div>;
```

---

### **Step 4: Add Summary Cards** (Optional)

Tampilkan summary dari chart data:

```jsx
{
  /* Summary Stats dari Chart Data */
}
{
  qualityChartData.length > 0 && (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-white rounded-xl p-4 border shadow-sm">
        <p className="text-sm text-gray-600 mb-1">Average Score</p>
        <p className="text-2xl font-bold text-blue-600">
          {Math.round(
            qualityChartData.reduce((sum, d) => sum + d.quality_score, 0) /
              qualityChartData.length
          )}
          /100
        </p>
      </div>
      <div className="bg-white rounded-xl p-4 border shadow-sm">
        <p className="text-sm text-gray-600 mb-1">Total Violations</p>
        <p className="text-2xl font-bold text-red-600">
          {qualityChartData.reduce((sum, d) => sum + d.alert_count, 0)}
        </p>
      </div>
      <div className="bg-white rounded-xl p-4 border shadow-sm">
        <p className="text-sm text-gray-600 mb-1">Data Points</p>
        <p className="text-2xl font-bold text-green-600">
          {qualityChartData.length}
        </p>
      </div>
    </div>
  );
}
```

---

## 🎨 Complete Updated `dashboardService.js`

```javascript
/**
 * ========================================
 * DASHBOARD SERVICE (UPDATED)
 * ========================================
 */

import api from "./api";

const dashboardService = {
  /**
   * Get dashboard summary untuk IPAL tertentu
   */
  getSummary: async (ipalId = 1) => {
    try {
      console.log(`📊 Fetching dashboard summary for IPAL ${ipalId}...`);
      const response = await api.get(`/api/dashboard/summary/${ipalId}`);
      console.log("✅ Dashboard summary fetched successfully");
      return response.data;
    } catch (error) {
      console.error("❌ Failed to fetch dashboard summary:", error.message);
      throw error;
    }
  },

  /**
   * Get overview semua IPAL
   */
  getOverview: async () => {
    try {
      console.log("📊 Fetching dashboard overview...");
      const response = await api.get("/api/dashboard/overview");
      console.log("✅ Dashboard overview fetched successfully");
      return response.data;
    } catch (error) {
      console.error("❌ Failed to fetch dashboard overview:", error.message);
      throw error;
    }
  },

  /**
   * 🆕 Get readings untuk chart dengan fuzzy analysis
   * @param {number} ipalId - IPAL ID
   * @param {Object} options - Filter options
   * @returns {Promise<Object>} Chart data with summary
   */
  getReadingsForChart: async (ipalId = 1, options = {}) => {
    try {
      const {
        period = "week", // today|yesterday|week|custom
        start = null, // ISO date string (for custom)
        end = null, // ISO date string (for custom)
        limit = 100, // Max 500
      } = options;

      console.log(`📈 Fetching chart data for IPAL ${ipalId}...`);
      console.log("   Options:", { period, start, end, limit });

      // Build query params
      const params = new URLSearchParams({
        period,
        limit: limit.toString(),
      });

      // Add custom date range if specified
      if (period === "custom" && start && end) {
        params.append("start", start);
        params.append("end", end);
      }

      const response = await api.get(
        `/api/dashboard/readings/${ipalId}?${params.toString()}`
      );

      console.log("✅ Chart data fetched successfully");
      console.log("   Total readings:", response.data?.count || 0);
      console.log("   Period:", response.data?.period);
      console.log(
        "   Avg quality score:",
        response.data?.summary?.average_quality_score
      );

      return response.data;
    } catch (error) {
      console.error("❌ Failed to fetch chart data:", error.message);
      throw error;
    }
  },

  // ... existing functions (getHistoricalData, getLatestReading, etc.)
};

export default dashboardService;
```

---

## 📊 Usage Examples

### **Example 1: Get Last 7 Days**

```javascript
const data = await dashboardService.getReadingsForChart(1, {
  period: "week",
  limit: 50,
});
```

### **Example 2: Get Today Only**

```javascript
const data = await dashboardService.getReadingsForChart(1, {
  period: "today",
  limit: 24,
});
```

### **Example 3: Custom Date Range**

```javascript
const data = await dashboardService.getReadingsForChart(1, {
  period: "custom",
  start: "2025-11-01",
  end: "2025-11-10",
  limit: 100,
});
```

---

## 🎯 Response Structure

```javascript
{
  success: true,
  count: 10,
  period: "week",
  date_range: {
    start: "2025-11-03T00:00:00.000Z",
    end: "2025-11-10T23:59:59.999Z"
  },
  summary: {
    total_readings: 10,
    average_quality_score: 65,
    status_distribution: {
      excellent: 2,
      good: 5,
      fair: 2,
      critical: 1
    },
    total_violations: 3,
    latest_reading: { ... }
  },
  data: [
    {
      timestamp: "2025-11-10T07:29:20.000Z",
      date: "10 Nov",
      time: "07:29",
      datetime: "10/11/2025 07:29:20",

      // Sensor readings
      inlet_ph: 7,
      outlet_ph: 9.5,
      inlet_tds: 200,
      outlet_tds: 600,
      // ... more sensor data

      // Fuzzy analysis
      quality_score: 20,
      status: "critical",
      alert_count: 3,
      has_violations: true,
      violations: [...],
      recommendations: [...]
    }
  ]
}
```

---

## ✅ Testing Checklist

- [ ] Backend endpoint `/api/dashboard/readings/1?period=week` returns data
- [ ] Frontend `dashboardService.getReadingsForChart()` works
- [ ] Chart component displays quality score trend
- [ ] Period selector (today/yesterday/week) works
- [ ] Custom date range works
- [ ] Tooltip shows violations and recommendations
- [ ] Summary cards display correct averages
- [ ] No console errors

---

## 🚀 Next Steps

1. Copy fungsi `getReadingsForChart` ke `dashboardService.js`
2. Import & use di `Dashboard.jsx`
3. Test dengan period selector
4. Style sesuai design Anda
5. Add loading & error states

**Backend sudah ready, tinggal integrate! Good luck!** 🎉
