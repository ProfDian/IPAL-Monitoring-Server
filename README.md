# IPAL Monitoring Server (Backend)

Backend API for an **IPAL (wastewater treatment) monitoring** application — built with **Node.js + Express** and **Firebase Admin (Firestore)**. This service powers authentication, sensor/water-quality data ingestion, dashboard aggregation, alerts, reports, and notifications.

**Related repos**
- Frontend (Client): https://github.com/ProfDian/IPAL-Monitoring-Client

## Key features
- **JWT authentication** + role-based access control (middleware-based)
- **Sensor & water-quality** APIs (includes an ingestion endpoint intended for IoT/ESP32)
- **Dashboard** aggregation endpoints
- **Alerts & notifications**
- **Reporting** (PDF/Excel export)
- **In-memory caching** with `node-cache` + cache stats/clear endpoints

## Tech stack
- Node.js, Express
- Firebase Admin SDK (Firestore)
- JWT (`jsonwebtoken`), validation (`joi`, `express-validator`)
- Reporting: `pdfkit`, `html-pdf-node`, `exceljs`
- Caching: `node-cache`

## API overview
> Exact routes are organized under route modules; these are the main groups you’ll see in the codebase.

- `POST /auth/login` / `POST /auth/register` (auth)
- `/api/sensors/*` (sensor data + management)
- `/api/water-quality/*` (water quality submission + queries)
- `/api/alerts/*` (alerting)
- `/api/dashboard/*` (dashboard summaries)
- `/api/reports/*` (report generation/export)
- `/api/notifications/*` (notifications)
- `GET /api/cache/stats` and `POST /api/cache/clear` (cache utilities)

## Local development
### Prerequisites
- Node.js (recommended: 18+)

### Install
```bash
npm install
```

### Environment variables
This backend needs Firebase Admin credentials + a JWT secret.

Create a `.env` file (or set environment variables in your deployment):
```bash
JWT_SECRET=your-strong-secret
# Option A (recommended for deployments like Vercel): JSON string of your Firebase service account
FIREBASE_SERVICE_ACCOUNT={"type":"service_account", ... }

# Optional
PORT=3000
```

**Firebase credentials options (see `config/firebase-config.js`)**
- `FIREBASE_SERVICE_ACCOUNT`: a JSON string of the service account
- or a local `serviceAccounts.json` file (kept out of git) for local-only development

### Run
```bash
npm run dev
# or
npm start
```

## Deployment notes
- Configure environment variables in your hosting platform (Vercel/Render/etc.)
- If you deploy the frontend to a new domain, update CORS allow-list in `server.js`

## Portfolio notes (what this project demonstrates)
- Designing a REST API with auth + roles
- Working with Firebase Admin/Firestore from a Node backend
- Practical performance techniques (caching) and reporting (PDF/Excel)
