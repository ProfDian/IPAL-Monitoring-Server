# 🎭 EXPO GIMMICK MODE

Branch khusus untuk **demo/expo** dengan dummy outlet data generator.

## 🎯 Kenapa Branch Ini?

- Alat ESP32 outlet belum ready
- Butuh demo aplikasi lengkap untuk expo
- Tidak mau ganggu `main` branch production

## ✨ Fitur Dummy Generator

Ketika **inlet data masuk**, sistem otomatis generate **dummy outlet** dengan skenario yang rotate:

### Test Scenarios (Berputar Otomatis)

1. **Normal** ✅

   - Semua parameter dalam range optimal
   - Tidak ada alert
   - Score: 85-100

2. **Warning** ⚠️

   - 1 parameter sedikit over (TDS)
   - 1 alert dengan severity medium
   - Score: 70-84

3. **Multiple Alerts** 🔶

   - 3 parameter over (pH, TDS, Turbidity)
   - 3 alert dengan severity medium-high
   - Score: 50-69

4. **Critical** 🚨
   - Semua parameter violation
   - 4 alert dengan severity high-critical
   - Score: 0-49

## 🚀 Cara Deploy ke Vercel

### Opsi 1: Preview Deployment (Recommended)

```bash
# 1. Push branch ini
git add .
git commit -m "feat: expo gimmick mode with dummy outlet"
git push origin expo-gimmick

# 2. Vercel otomatis build dan kasih preview URL
# Format: https://water-quality-backend-expo-gimmick-hash.vercel.app
```

### Opsi 2: Manual dari Vercel Dashboard

1. Buka [vercel.com/dashboard](https://vercel.com/dashboard)
2. Pilih project backend Anda
3. Settings → Git
4. Enable "Production Branch" untuk `expo-gimmick`
5. Deploy!

## 🔧 Setup Environment Variable

Di Vercel Dashboard → Settings → Environment Variables:

```
ENABLE_DUMMY_OUTLET=true
```

Variable ini **HANYA** aktif di branch `expo-gimmick`, tidak akan affect `main`.

## 📱 Cara Pakai

### ESP32 Inlet Configuration

Arahkan ESP32 inlet ke preview URL:

```cpp
// ESP32_INLET_EXPO.ino
const char* serverUrl = "https://your-preview-url.vercel.app/api/water-quality/submit";
```

### Testing Flow

1. ESP32 inlet kirim data → backend buffer
2. **Auto-generate dummy outlet** (triggered by inlet)
3. Merge inlet + dummy outlet
4. Fuzzy analysis dengan scenario yang rotate
5. Alert & notification sesuai severity

## 📊 Expected Results

### Request 1 (Normal)

```json
{
  "inlet": { "ph": 7.2, "tds": 180, "turbidity": 12, "temperature": 27 },
  "outlet": { "ph": 7.5, "tds": 220, "turbidity": 3.2, "temperature": 26.5 }
}
// ✅ Score: ~92, Status: excellent, Alerts: 0
```

### Request 2 (Warning)

```json
{
  "inlet": { "ph": 7.2, "tds": 180, "turbidity": 12, "temperature": 27 },
  "outlet": { "ph": 7.8, "tds": 350, "turbidity": 3.5, "temperature": 26.8 }
}
// ⚠️ Score: ~78, Status: good, Alerts: 1 (TDS medium)
```

### Request 3 (Multiple)

```json
{
  "inlet": { "ph": 7.2, "tds": 180, "turbidity": 12, "temperature": 27 },
  "outlet": { "ph": 8.7, "tds": 450, "turbidity": 22, "temperature": 26.5 }
}
// 🔶 Score: ~58, Status: fair, Alerts: 3 (pH, TDS, Turbidity)
```

### Request 4 (Critical)

```json
{
  "inlet": { "ph": 7.2, "tds": 180, "turbidity": 12, "temperature": 27 },
  "outlet": { "ph": 5.5, "tds": 600, "turbidity": 30, "temperature": 33 }
}
// 🚨 Score: ~15, Status: critical, Alerts: 4 (ALL)
```

## 🎬 Demo Script

Untuk expo, kirim 4-8 kali data inlet dari ESP32:

1. **Request 1** → Normal (audience lihat semua hijau ✅)
2. **Request 2** → Warning (muncul 1 notif kuning ⚠️)
3. **Request 3** → Multiple alerts (dashboard jadi orange 🔶)
4. **Request 4** → Critical (alarm merah, email notif 🚨)
5. **Request 5** → Normal lagi (sistem recovery)
6. dst...

## ⚠️ IMPORTANT

**JANGAN merge branch ini ke `main`!**

Branch ini hanya untuk demo expo. Setelah event selesai:

```bash
# Option 1: Hapus branch
git branch -D expo-gimmick
git push origin --delete expo-gimmick

# Option 2: Keep untuk dokumentasi (tapi jangan merge)
```

## 🔙 Kembali ke Production

```bash
git checkout main
git pull origin main
```

Deploy production tetap menggunakan `main` branch dengan ESP32 real (inlet & outlet).

## 📝 Notes

- Dummy outlet device_id: `ESP32-OUTLET-DUMMY`
- Sensor mapping: `sensor-*-outlet-dummy`
- Scenario counter persist selama server hidup (reset jika cold start)
- Fuzzy logic tetap sama dengan production
- Firebase writes tetap terjadi (data demo akan tersimpan)

---

**Happy Demo! 🎉**
