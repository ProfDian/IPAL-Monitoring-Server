# 📊 Chart API Guide - Dashboard Readings Endpoint

## Endpoint Overview

**Base URL:** `GET /api/dashboard/readings/:ipal_id`

**Authentication:** Required (JWT token in Authorization header)

**Purpose:** Mendapatkan data readings yang sudah diformat optimal untuk Recharts

---

## Query Parameters

| Parameter | Type     | Default | Description                                           |
| --------- | -------- | ------- | ----------------------------------------------------- |
| `period`  | string   | `today` | Period filter: `today`, `yesterday`, `week`, `custom` |
| `start`   | ISO date | -       | Start date (required if period=custom)                |
| `end`     | ISO date | -       | End date (required if period=custom)                  |
| `limit`   | number   | 100     | Max readings (max: 500)                               |

---

## Usage Examples

### 1. Get Today's Readings

```javascript
GET /api/dashboard/readings/1?period=today
```

### 2. Get Yesterday's Readings

```javascript
GET /api/dashboard/readings/1?period=yesterday
```

### 3. Get Last 7 Days

```javascript
GET /api/dashboard/readings/1?period=week
```

### 4. Custom Date Range

```javascript
GET /api/dashboard/readings/1?period=custom&start=2025-11-01&end=2025-11-10
```

---

## Response Format

```json
{
  "success": true,
  "count": 10,
  "period": "today",
  "date_range": {
    "start": "2025-11-10T00:00:00.000Z",
    "end": "2025-11-10T23:59:59.999Z"
  },
  "summary": {
    "total_readings": 10,
    "average_quality_score": 65,
    "status_distribution": {
      "excellent": 2,
      "good": 5,
      "fair": 2,
      "critical": 1
    },
    "total_violations": 3,
    "latest_reading": {
      "timestamp": "2025-11-10T07:29:20Z",
      "quality_score": 20,
      "status": "critical"
    }
  },
  "data": [
    {
      // Identifiers
      "id": "reading_abc123",
      "ipal_id": 1,

      // Timestamps (pilih yang sesuai kebutuhan)
      "timestamp": "2025-11-10T07:29:20.000Z", // ISO format
      "date": "10 Nov", // Short date
      "time": "07:29", // Time only
      "datetime": "10/11/2025 07:29:20", // Full datetime

      // Inlet sensor data
      "inlet_ph": 7,
      "inlet_tds": 200,
      "inlet_turbidity": 15,
      "inlet_temperature": 28,

      // Outlet sensor data
      "outlet_ph": 9.5,
      "outlet_tds": 600,
      "outlet_turbidity": 30,
      "outlet_temperature": 27,

      // ⭐ FUZZY ANALYSIS (KEY DATA!)
      "quality_score": 20, // 0-100
      "status": "critical", // excellent|good|fair|poor|critical
      "alert_count": 3, // Number of violations
      "has_violations": true, // Boolean flag

      // Optional (untuk tooltip/detail)
      "violations": [
        {
          "parameter": "ph",
          "value": 9.5,
          "threshold": 9,
          "severity": "critical",
          "message": "pH outlet (9.50) melebihi batas aman (9)"
        }
      ],
      "recommendations": [
        {
          "type": "treatment",
          "priority": "critical",
          "message": "pH terlalu tinggi..."
        }
      ]
    }
  ]
}
```

---

## Recharts Integration Examples

### 1. Simple Line Chart (Quality Score Over Time)

```jsx
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

function QualityScoreChart({ data }) {
  return (
    <LineChart width={800} height={400} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="time" />
      <YAxis domain={[0, 100]} />
      <Tooltip />
      <Legend />
      <Line
        type="monotone"
        dataKey="quality_score"
        stroke="#8884d8"
        name="Quality Score"
      />
    </LineChart>
  );
}
```

### 2. Multi-Line Chart (Inlet vs Outlet pH)

```jsx
function PHComparisonChart({ data }) {
  return (
    <LineChart width={800} height={400} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="time" />
      <YAxis domain={[0, 14]} />
      <Tooltip />
      <Legend />
      <Line
        type="monotone"
        dataKey="inlet_ph"
        stroke="#82ca9d"
        name="Inlet pH"
      />
      <Line
        type="monotone"
        dataKey="outlet_ph"
        stroke="#8884d8"
        name="Outlet pH"
      />
    </LineChart>
  );
}
```

### 3. Color-Coded by Status

```jsx
function QualityScoreWithStatus({ data }) {
  // Custom dot untuk color-code by status
  const CustomDot = (props) => {
    const { cx, cy, payload } = props;
    const colors = {
      excellent: "#00C49F",
      good: "#0088FE",
      fair: "#FFBB28",
      poor: "#FF8042",
      critical: "#FF0000",
    };

    return (
      <circle cx={cx} cy={cy} r={6} fill={colors[payload.status] || "#999"} />
    );
  };

  return (
    <LineChart width={800} height={400} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="time" />
      <YAxis domain={[0, 100]} />
      <Tooltip
        content={({ payload }) => {
          if (!payload || !payload[0]) return null;
          const data = payload[0].payload;
          return (
            <div className="custom-tooltip">
              <p>Time: {data.time}</p>
              <p>Score: {data.quality_score}</p>
              <p>Status: {data.status}</p>
              {data.has_violations && (
                <p style={{ color: "red" }}>⚠️ {data.alert_count} violations</p>
              )}
            </div>
          );
        }}
      />
      <Legend />
      <Line
        type="monotone"
        dataKey="quality_score"
        stroke="#8884d8"
        dot={<CustomDot />}
        name="Quality Score"
      />
    </LineChart>
  );
}
```

### 4. All Parameters in One Chart

```jsx
function AllParametersChart({ data }) {
  return (
    <LineChart width={1000} height={500} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="time" />
      <YAxis yAxisId="left" />
      <YAxis yAxisId="right" orientation="right" />
      <Tooltip />
      <Legend />

      {/* Quality Score (separate axis) */}
      <Line
        yAxisId="right"
        type="monotone"
        dataKey="quality_score"
        stroke="#FF0000"
        strokeWidth={3}
        name="Quality Score"
      />

      {/* pH */}
      <Line
        yAxisId="left"
        type="monotone"
        dataKey="outlet_ph"
        stroke="#8884d8"
        name="pH"
      />

      {/* TDS */}
      <Line
        yAxisId="left"
        type="monotone"
        dataKey="outlet_tds"
        stroke="#82ca9d"
        name="TDS"
      />

      {/* Turbidity */}
      <Line
        yAxisId="left"
        type="monotone"
        dataKey="outlet_turbidity"
        stroke="#ffc658"
        name="Turbidity"
      />
    </LineChart>
  );
}
```

---

## React Query Hook Example

```jsx
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

function useChartData(ipalId, period = "today") {
  return useQuery({
    queryKey: ["chart-data", ipalId, period],
    queryFn: async () => {
      const { data } = await axios.get(`/api/dashboard/readings/${ipalId}`, {
        params: { period },
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      return data;
    },
    refetchInterval: 60000, // Refresh every 1 minute
  });
}

// Usage in component:
function DashboardChart() {
  const { data, isLoading, error } = useChartData(1, "today");

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading chart</div>;

  return <QualityScoreChart data={data.data} />;
}
```

---

## Tips & Best Practices

### 1. **Pilih Period yang Tepat**

- `today`: Untuk real-time monitoring (update every minute)
- `week`: Untuk trend analysis
- `custom`: Untuk report generation

### 2. **Handle Empty Data**

```jsx
if (!data || data.length === 0) {
  return <EmptyState message="No data available for this period" />;
}
```

### 3. **Responsive Charts**

```jsx
<ResponsiveContainer width="100%" height={400}>
  <LineChart data={data}>{/* ... */}</LineChart>
</ResponsiveContainer>
```

### 4. **Show Summary Cards**

```jsx
<div className="summary-cards">
  <Card>
    <h3>Average Quality Score</h3>
    <p>{summary.average_quality_score}/100</p>
  </Card>
  <Card>
    <h3>Total Violations</h3>
    <p className={summary.total_violations > 0 ? "text-red" : ""}>
      {summary.total_violations}
    </p>
  </Card>
  <Card>
    <h3>Latest Status</h3>
    <StatusBadge status={summary.latest_reading.status} />
  </Card>
</div>
```

---

## Error Handling

### Empty Data Response

```json
{
  "success": true,
  "message": "No readings found for the specified period",
  "data": [],
  "period": "today",
  "date_range": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "message": "Failed to fetch readings for chart",
  "error": "Error message"
}
```

---

## Performance Considerations

1. **Default limit is 100** - cukup untuk daily chart tanpa performance issue
2. **Max limit is 500** - untuk long-term analysis
3. **Data sudah sorted ASC** - ready untuk chart (tidak perlu sort lagi)
4. **Timestamp format multiple** - pilih yang paling cocok untuk chart Anda

---

## Need More Features?

Kalau butuh endpoint tambahan seperti:

- Aggregation by hour/day
- Comparison between multiple IPALs
- Export to CSV

Bisa request ke backend team! 🚀
