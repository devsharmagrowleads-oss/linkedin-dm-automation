# GrowLeads — LinkedIn DM Automation

Monitors a LinkedIn post for new commenters and sends each one a direct message containing a lead magnet link. Internal tool.

The repo has three parts:

| Folder | What it is |
|---|---|
| `backend/` | Node.js API (Fastify) plus BullMQ workers that poll posts and send DMs. Uses PostgreSQL (via Prisma) and Redis. |
| `dashboard/` | Next.js 14 dashboard for creating campaigns and viewing logs. |
| `extension/` | Chrome extension (Manifest V3) that connects your LinkedIn account to the backend. |

For architecture and behaviour details see [PROJECT_STATUS.md](PROJECT_STATUS.md) and [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md).

## Prerequisites

- **Node.js 18.17 or newer** (20 LTS or newer recommended; an `.nvmrc` is included)
- **PostgreSQL** and **Redis**, either through Docker (see below) or installed locally
- **Google Chrome**, to load the extension

## 1. Start Postgres and Redis

With Docker:

```bash
docker compose up -d
```

This starts Postgres on `localhost:5432` (user `postgres`, password `password`, database `growleads`) and Redis on `localhost:6379`. These are local development values and match `backend/.env.example`.

If you run Postgres and Redis yourself instead, create a database and put your own connection strings in `backend/.env`. On Windows, `install-redis-service.bat` can register a portable Redis build as a service: set `REDIS_EXE` to the path of `redis-server.exe` and run the script as Administrator.

## 2. Backend

```bash
cd backend
npm install
cp .env.example .env
npm run db:push    # creates the tables from prisma/schema.prisma
npm run dev        # API on http://localhost:3001
```

`npm start` runs the same server without file watching. `GET http://localhost:3001/health` should return `{"status":"ok", ...}`.

### Backend environment variables (`backend/.env`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `REDIS_URL` | no | Defaults to `redis://localhost:6379` |
| `PORT` | no | Defaults to `3001` |
| `ALLOWED_ORIGINS` | no | Comma-separated CORS origins. Defaults to `http://localhost:3000` |
| `LOG_LEVEL` | no | Defaults to `info` |
| `ALERT_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | no | Email alerts when a LinkedIn account goes invalid. If unset, alerts are only logged |

`API_SECRET` and `ENCRYPTION_KEY` are listed in `.env.example` but the current code does not read them.

## 3. Dashboard

In a second terminal:

```bash
cd dashboard
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000
```

`NEXT_PUBLIC_API_URL` in `dashboard/.env.local` is the backend URL (defaults to `http://localhost:3001`).

`npm run build` and `npm start` build and serve the production version on the same port.

## 4. Chrome extension

1. Open `chrome://extensions` in Chrome
2. Turn on **Developer mode**
3. Click **Load unpacked** and select the `extension/` folder
4. Log into LinkedIn in the same browser, then open the extension and connect your account
5. Copy the User ID shown in the extension and paste it into the dashboard at `http://localhost:3000`

The extension talks to the backend at `http://localhost:3001`. To use a different backend URL, change `API_BASE` in `extension/src/popup/popup.js` and the matching entry under `host_permissions` in `extension/manifest.json`.

## Notes

- The backend uses LinkedIn's internal, undocumented API, which can change without notice.
- LinkedIn's terms of service prohibit automated messaging. Keep rate limits conservative.
- The backend stores the LinkedIn session cookie (`li_at`) of each connected account in Postgres. Treat the database as sensitive.
