# 🚀 VERCEL ENVIRONMENT VARIABLES SETUP

## 📋 Setup Push Notification URL di Vercel

Push notification saat ini redirect ke `localhost:5173`. Untuk redirect ke production URL, ikuti langkah berikut:

---

## 🔧 LANGKAH-LANGKAH:

### 1. **Login ke Vercel Dashboard**
```
https://vercel.com/dashboard
```

### 2. **Pilih Project Backend**
```
Project: water-quality-backend
atau
Project: water-quality-backend-git-expo-gimmick-profdians-projects
```

### 3. **Buka Settings → Environment Variables**

Klik tab **"Settings"** → **"Environment Variables"**

### 4. **Tambahkan/Update Variable: `FRONTEND_URL`**

**Variable Name:**
```
FRONTEND_URL
```

**Value (Production):**
```
https://ipal-monitoring-teklingundip.vercel.app
```

**Atau (Alternative URL):**
```
https://ipal-monitoring-teklingundip-git-main-profdians-projects.vercel.app
```

**Environment:**
- ✅ Production
- ✅ Preview
- ✅ Development

### 5. **Save Changes**

Klik **"Save"** atau **"Add"**

### 6. **Redeploy Backend**

Setelah save, Vercel akan minta untuk redeploy:
- Klik tombol **"Redeploy"** di banner atas
- Atau trigger redeploy dengan push commit baru ke GitHub

---

## ✅ VERIFIKASI

Setelah redeploy, cek di logs Vercel:

1. **Build Logs:**
   ```
   ✓ Environment variables loaded
   FRONTEND_URL=https://ipal-monitoring-teklingundip.vercel.app
   ```

2. **Runtime Logs:**
   Saat notifikasi dikirim, akan log:
   ```
   🔔 Sending push notification...
   Click action: https://ipal-monitoring-teklingundip.vercel.app/alerts
   ```

---

## 📱 TESTING

### Test Push Notification:

**Option 1: Via API (Development Mode Only)**
```bash
POST https://water-quality-backend.vercel.app/api/notifications/test-push
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN

{
  "fcm_token": "YOUR_FCM_TOKEN"
}
```

**Option 2: Trigger Real Alert**
1. ESP32 kirim data parameter yang buruk
2. Backend akan auto-detect violation
3. Kirim push notification otomatis
4. Klik notification → Harus redirect ke:
   ```
   https://ipal-monitoring-teklingundip.vercel.app/alerts
   ```

---

## 🔍 TROUBLESHOOTING

### Problem: Masih redirect ke localhost

**Solusi:**
1. Pastikan `FRONTEND_URL` sudah disave di Vercel
2. Redeploy backend (old deployment masih pakai old env vars)
3. Clear browser cache & restart browser
4. Logout & login ulang di aplikasi untuk refresh FCM token

### Problem: Environment variable tidak terload

**Solusi:**
1. Cek di Vercel Settings → Environment Variables
2. Pastikan apply ke **Production, Preview, Development**
3. Redeploy dengan force rebuild:
   ```bash
   # Di terminal
   git commit --allow-empty -m "Trigger redeploy"
   git push origin main
   ```

---

## 📊 CURRENT CONFIGURATION

### Backend (.env)
```env
FRONTEND_URL=https://ipal-monitoring-teklingundip.vercel.app
```

### Frontend (.env)
```env
VITE_API_URL=https://water-quality-backend-git-expo-gimmick-profdians-projects.vercel.app
```

### Push Notification Flow:
```
ESP32 → Backend Vercel → Firebase FCM → User Browser
                                              ↓
                                    Click notification
                                              ↓
                            Redirect ke: FRONTEND_URL/alerts
```

---

## 🎯 EXPECTED BEHAVIOR

Setelah setup correct:

1. ✅ User login → Request notification permission
2. ✅ FCM token saved ke Firestore
3. ✅ Alert terdeteksi → Backend kirim push notification
4. ✅ User terima notification di browser
5. ✅ User klik notification → Redirect ke:
   ```
   https://ipal-monitoring-teklingundip.vercel.app/alerts
   ```
6. ✅ BUKAN redirect ke `localhost:5173/alerts`

---

## 📞 SUPPORT

Jika masih ada masalah, cek:
- Vercel Build Logs
- Vercel Runtime Logs  
- Browser Console (F12)
- Firebase Console → Cloud Messaging

---

**Last Updated:** November 27, 2025
**Status:** ✅ Ready for Production Deployment
