# QR Code Attendance Management System

<div align="center">

  <h3>A full-stack, open-source employee attendance system built with Next.js and Node.js</h3>

  ![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js&logoColor=white)
  ![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
  ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)
  ![Express](https://img.shields.io/badge/Express-4.18-000000?logo=express&logoColor=white)
  ![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## Overview

A production-ready attendance management system where employees scan a QR code at the office entrance to mark their check-in and check-out. The system tracks GPS location, prevents duplicate entries, manages leave requests, and gives administrators a live dashboard with export capabilities.

No mobile app install required — the QR code opens a mobile-optimised web page that works on any device.

---

## Features

### Employee Side
- **One-scan attendance** — scan QR → enter ID → check in or out
- **Live clock** on the attendance page
- **GPS verification** — Haversine formula, configurable radius (default 100 m)
- **Duplicate prevention** — one check-in per employee per day enforced at DB level
- **Leave application** — submit casual, sick, or paid leave requests
- **Attendance history** — paginated personal records with working hours

### Admin Dashboard
- **Live today summary** — present, absent, late, on leave counts
- **Auto-refresh** every 60 seconds
- **Searchable attendance table** — filter by name, ID, or department
- **Leave review panel** — approve or reject with inline comment
- **Date-range reports** — filter by department or employee
- **Export** — Excel (`.xlsx`) and CSV download
- **Role-based access** — `super_admin`, `hr_admin`, `viewer`

### System
- JWT authentication with configurable expiry
- bcrypt password hashing (12 salt rounds)
- Rate limiting — 10 req/15 min on auth, 30 req/min on attendance
- Helmet security headers
- Winston structured logging
- Configurable settings stored in the database (GPS radius, late threshold, etc.)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TailwindCSS |
| Backend | Node.js, Express 4, JWT, bcrypt |
| Database | PostgreSQL 15 (Supabase recommended) |
| Exports | ExcelJS, json2csv |
| Deployment | Vercel (frontend), Render (backend), Supabase (DB) |

---

## Project Structure

```
qr-attendance-system/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── attend/page.jsx          # Public QR attendance page
│   │   │   ├── admin/page.jsx           # Admin login
│   │   │   └── admin/dashboard/page.jsx # Admin dashboard
│   │   ├── components/admin/
│   │   │   ├── StatCard.jsx
│   │   │   ├── AttendanceTable.jsx
│   │   │   └── LeaveRequestsPanel.jsx
│   │   ├── context/AdminAuthContext.jsx
│   │   └── utils/api.js                 # Axios + JWT interceptor
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── attendance.controller.js
│   │   │   ├── leave.controller.js
│   │   │   └── admin.controller.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── attendance.routes.js
│   │   │   ├── leave.routes.js
│   │   │   ├── admin.routes.js
│   │   │   └── employee.routes.js
│   │   ├── middleware/
│   │   │   ├── auth.js                  # JWT guards + requireRole
│   │   │   └── errorHandler.js
│   │   └── utils/
│   │       ├── validators.js            # Haversine GPS check
│   │       ├── settings.js              # 60s-cached DB settings
│   │       ├── logger.js                # Winston
│   │       └── AppError.js
│   └── package.json
│
└── database/
    └── schema.sql                       # Tables, triggers, seed data
```

---

## Database Schema

| Table | Purpose |
|---|---|
| `employees` | Employee records and leave balances |
| `admins` | Admin accounts with role |
| `departments` | Department list |
| `attendance` | Check-in/out records (unique per employee per day) |
| `leave_requests` | Leave submissions and approval status |
| `public_holidays` | Holiday list for reporting |
| `system_settings` | Runtime config (GPS radius, late threshold, etc.) |

Key constraints:
- `UNIQUE (employee_id, date)` on `attendance` — prevents duplicate check-ins at the database level
- Trigger auto-calculates `working_minutes` when check-out is recorded
- Auto `updated_at` triggers on all tables

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/employee/login` | Employee login — returns JWT |
| `POST` | `/api/auth/admin/login` | Admin login — returns JWT (8h expiry) |

### Attendance
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/attendance/status/:employee_id` | None | Today's check-in status |
| `POST` | `/api/attendance/checkin` | None | Record check-in with GPS + device |
| `POST` | `/api/attendance/checkout` | None | Record check-out, calculate working hours |
| `GET` | `/api/attendance/history` | Employee JWT | Paginated personal history |

### Leave
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/leave/apply` | Employee JWT | Submit leave request |
| `GET` | `/api/leave/my-requests` | Employee JWT | List own requests + balance |

### Admin
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/attendance/today` | Admin JWT | Full today summary with stats |
| `GET` | `/api/admin/attendance/report` | Admin JWT | Date-range report |
| `GET` | `/api/admin/attendance/export` | Admin JWT | Download Excel or CSV |
| `GET` | `/api/admin/leave/pending` | Admin JWT | All pending leave requests |
| `PATCH` | `/api/admin/leave/:id/review` | Admin JWT (`hr_admin`+) | Approve or reject |

Error response format:
```json
{ "success": false, "error": "ERROR_CODE", "message": "Human-readable message" }
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (or a free [Supabase](https://supabase.com) project)
- npm 9+

### 1. Clone the repository

```bash
git clone https://github.com/CodeByAftab/qr-attendance-system.git
cd qr-attendance-system
```

### 2. Set up the database

Run the schema against your PostgreSQL instance or Supabase SQL editor:

```bash
psql $DATABASE_URL -f database/schema.sql
```

This creates all tables, triggers, 7 seed departments, and a default admin account.

**Default admin credentials:**
```
Email:    admin@company.com
Password: Admin@1234
```
> Change the password immediately after first login.

### 3. Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/attendance
DB_SSL=false
JWT_SECRET=your_64_char_random_secret_here
CORS_ORIGIN=http://localhost:3000
OFFICE_LATITUDE=your_office_lat
OFFICE_LONGITUDE=your_office_lng
OFFICE_RADIUS=100
```

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4. Configure the frontend

```bash
cd ../frontend
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### 5. Install dependencies and run

```bash
# Backend
cd backend
npm install
npm run dev        # starts on port 5000

# Frontend (new terminal)
cd frontend
npm install
npm run dev        # starts on port 3000
```

Open [http://localhost:3000/attend](http://localhost:3000/attend) for the attendance page.  
Open [http://localhost:3000/admin](http://localhost:3000/admin) for the admin login.

---

## Deployment

### Supabase (Database)

1. Create a new project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** → paste and run `database/schema.sql`
3. Copy the connection string from **Settings → Database**

### Render (Backend)

1. Create a **Web Service** pointing to this repo
2. Set **Root Directory** to `backend`
3. Set **Build Command** to `npm install`
4. Set **Start Command** to `node src/server.js`
5. Add environment variables in the Render dashboard:

```
DATABASE_URL      → your Supabase connection string
DB_SSL            → true
JWT_SECRET        → your 64-char secret
CORS_ORIGIN       → https://your-app.vercel.app
OFFICE_LATITUDE   → your office latitude
OFFICE_LONGITUDE  → your office longitude
OFFICE_RADIUS     → 100
NODE_ENV          → production
```

### Vercel (Frontend)

1. Import the repo on [vercel.com](https://vercel.com)
2. Set **Root Directory** to `frontend`
3. Add environment variable:
   - `NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api`
4. Deploy

### Generate the QR Code

After deployment, generate a QR code pointing to:

```
https://your-app.vercel.app/attend
```

Print and display it at the office entrance. The URL is permanent — no reconfiguration needed.

---

## Configuration

System behaviour is controlled via the `system_settings` table and can be changed without redeployment:

| Key | Default | Description |
|---|---|---|
| `late_threshold` | `09:30` | Check-ins after this time are marked late |
| `gps_radius_meters` | `100` | Max distance from office coordinates (metres) |
| `office_lat` / `office_lng` | — | Office GPS coordinates |
| `working_hours_per_day` | `8` | Standard hours for reporting |
| `attend_page_url` | — | Full URL of the `/attend` page |

---

## Security

- Passwords hashed with **bcrypt** (12 salt rounds)
- **JWT** tokens — employees 7-day expiry, admins 8-hour expiry
- **Role-based access**: `super_admin` → `hr_admin` → `viewer`
- **Rate limiting** — auth: 10 req/15 min, attendance: 30 req/min
- **Helmet** HTTP security headers on all responses
- **GPS validation** runs server-side (Haversine), not only client-side
- `UNIQUE (employee_id, date)` database constraint prevents duplicate check-ins even under concurrent requests

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: describe your change"`
4. Push to your branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## License

MIT License — see [LICENSE](LICENSE) for details.
