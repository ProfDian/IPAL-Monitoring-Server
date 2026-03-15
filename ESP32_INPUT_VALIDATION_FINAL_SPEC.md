# Final Spec — ESP32 Input Validation & Sensor Anomaly Handling

## 1) Tujuan

Menjaga sistem tetap sederhana dan robust:

- Menolak payload non-numerik dari device (terutama string) di boundary API.
- Tetap memproses data numerik untuk analisis domain.
- Menahan skor utama (`data_unreliable`) jika data numerik terdeteksi tidak reliabel.

---

## 2) Scope

Endpoint utama:

- `POST /api/water-quality/submit`

Field wajib request body:

- `ipal_id` (number integer)
- `location` (`"inlet" | "outlet"`)
- `device_id` (string non-empty)
- `data.ph` (number finite)
- `data.tds` (number finite)
- `data.temperature` (number finite)

Catatan:

- `sensor_mapping` optional.

---

## 3) Boundary Validation Policy (API Layer)

### 3.1 Aturan Umum

Untuk `data.ph`, `data.tds`, `data.temperature`:

- HARUS bertipe `number` (bukan string).
- HARUS `Number.isFinite(value) === true`.
- Tidak boleh `null`, `undefined`, `NaN`, `Infinity`, `-Infinity`, boolean, object, array.

### 3.2 Perilaku Ditolak (HTTP 400)

Tolak request jika salah satu kondisi ini terjadi:

- Field wajib hilang.
- Tipe field tidak sesuai.
- Nilai non-finite.

### 3.3 Format Error Response (standar)

```json
{
  "success": false,
  "message": "Invalid sensor payload",
  "errors": [
    {
      "field": "data.ph",
      "code": "TYPE_MISMATCH",
      "expected": "finite number",
      "received": "string"
    }
  ]
}
```

---

## 4) Domain Validation Policy (Fuzzy/Anomaly Layer)

Setelah lolos boundary API, data numerik diproses di fault handler:

- `missing_data`
- `invalid_number`
- `out_of_range`
- `heavy_out_of_range`

Prinsip:

- **Boundary API**: jaga format/tipe data.
- **Domain layer**: nilai numerik tapi tidak masuk akal sensor tetap ditangani sebagai fault/anomali.

### 4.1 Kapan `data_unreliable`

Set `status = data_unreliable` dan `quality_score = null` jika:

- `has_heavy_out_of_range = true`, atau
- imputation gagal dan fault tidak ter-resolve.

Jika reliabel:

- lanjut scoring utama (`fuzzy_mamdani`).

---

## 5) ESP32 / JSON.stringify Edge Cases

### 5.1 Konversi Umum dari Device

- `NaN` / `Infinity` pada JS object akan jadi `null` setelah `JSON.stringify`.
- `undefined` field akan hilang dari JSON.
- String numerik (`"7.2"`) tetap string.

### 5.2 Implikasi Sistem

- `null`/missing/string ditolak di boundary API (400).
- Nilai numerik valid tapi ekstrem diproses di domain layer (fault/anomali).

---

## 6) Rule Matrix Per Parameter

### pH

- Boundary API: finite number.
- Sensor range domain: `0..14`.
- Heavy out-of-range domain: `< -1` atau `> 15`.

### TDS

- Boundary API: finite number.
- Sensor range domain: `0..10000`.
- Heavy out-of-range domain: `< -100` atau `> 12000`.

### Temperature

- Boundary API: finite number.
- Sensor range domain: `-10..60`.
- Heavy out-of-range domain: `< -20` atau `> 80`.

---

## 7) Alerting Rules

### 7.1 Threshold Violations

Tetap gunakan pelanggaran baku mutu outlet untuk alert kualitas air.

### 7.2 Sensor Fault Violations

- Tambahkan alert anomali untuk fault sensor.
- Severity:
  - `critical` jika heavy out-of-range
  - `high` selain itu

### 7.3 Deviation Calculation Safety

Saat membuat alert:

- Jika `value` dan `threshold` numerik => hitung `deviation = abs(value - threshold)`.
- Jika salah satu non-numerik => set `deviation = null` (hindari `NaN`).

---

## 8) Non-Goals (agar tidak over-engineering)

- Tidak melakukan auto-coercion string ke number.
- Tidak menambah pipeline baru/queue baru.
- Tidak menambah fitur UI baru di fase ini.
- Tidak mengubah arsitektur merge inlet-outlet.

---

## 9) Acceptance Criteria

1. Payload dengan `"ph": "7.2"` ditolak 400.
2. Payload dengan `ph: null` ditolak 400.
3. Payload missing `data.temperature` ditolak 400.
4. Payload numerik valid diterima dan diproses normal.
5. Payload numerik ekstrem menghasilkan `data_unreliable` + `quality_score: null`.
6. Alert sensor fault tetap tercipta.
7. Tidak ada `deviation: NaN` pada alert.

---

## 10) Contoh Payload

### 10.1 Valid

```json
{
  "ipal_id": 1,
  "location": "inlet",
  "device_id": "ESP32-INLET-001",
  "data": {
    "ph": 7.2,
    "tds": 1800,
    "temperature": 29.4
  }
}
```

### 10.2 Invalid (string)

```json
{
  "ipal_id": 1,
  "location": "inlet",
  "device_id": "ESP32-INLET-001",
  "data": {
    "ph": "7.2",
    "tds": 1800,
    "temperature": 29.4
  }
}
```

### 10.3 Valid format but unreliable domain

```json
{
  "ipal_id": 1,
  "location": "outlet",
  "device_id": "ESP32-OUTLET-001",
  "data": {
    "ph": 14.0,
    "tds": 30000,
    "temperature": 60
  }
}
```

Expected domain result: `status = data_unreliable`, `quality_score = null`.

---

## 11) Implementasi Minimal yang Direkomendasikan

1. Tambah helper validator finite-number untuk `data.ph/tds/temperature` di controller submit.
2. Sinkronkan validasi service agar konsisten dengan controller (atau jadikan controller sebagai single gate).
3. Perbaiki perhitungan `deviation` alert agar aman untuk threshold non-numerik.
4. Tambah test endpoint-level untuk `string/null/missing/non-finite`.

Dokumen ini menjadi acuan final tahap hardening input ESP32 tanpa perubahan arsitektur besar.
