# GrowLeads — Project Status Document
**Date:** 2026-03-13
**Purpose:** Internal LinkedIn DM automation tool for the team.

---

## What Is GrowLeads

GrowLeads monitors a LinkedIn post for new commenters and automatically sends each commenter a personalized direct message containing a lead magnet URL — completely in the cloud, 24/7, no browser required.

**Example flow:**
1. You publish a LinkedIn post offering a free resource
2. Someone comments on the post
3. GrowLeads detects the new comment within 2 minutes
4. Automatically sends them a DM: *"Hey John! Here's the resource I mentioned: [your-link]"*
5. Everything is logged in the dashboard

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Chrome Extension (GrowLeads Connect)                           │
│  • Reads li_at cookie from LinkedIn                             │
│  • Sends it to the backend once (account connection)            │
│  • After that, browser can be closed — cloud handles everything │
└────────────────────────┬────────────────────────────────────────┘
                         │ POST /accounts { userId, liAt }
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend (Node.js + Fastify)          localhost:3001            │
│                                                                 │
│  REST API                                                       │
│  ├── POST   /accounts       Connect LinkedIn account            │
│  ├── GET    /accounts       List accounts                       │
│  ├── DELETE /accounts/:id   Remove account                      │
│  ├── POST   /campaigns      Create campaign                     │
│  ├── GET    /campaigns      List campaigns                      │
│  ├── PATCH  /campaigns/:id  Pause / Resume                      │
│  ├── DELETE /campaigns/:id  Delete campaign                     │
│  ├── GET    /campaigns/:id/stats  DM stats                      │
│  └── GET    /campaigns/:id/logs   Activity logs                 │
│                                                                 │
│  BullMQ Workers (run continuously)                              │
│  ├── Poll Worker   — every 2 min per campaign                   │
│  │     → fetches all commenters from LinkedIn                   │
│  │     → deduplicates against sent_dms table                    │
│  │     → enqueues DM job for each new commenter                 │
│  └── DM Worker     — sends one DM per job                       │
│        → enforces 100 DMs/day cap per account                   │
│        → rate limited to 15 DMs/hour                            │
│        → random 0–90s delay between DMs (anti-ban)             │
└────────┬──────────────────────┬──────────────────────────────────┘
         │                      │
         ▼                      ▼
┌─────────────────┐   ┌──────────────────────────────────────────┐
│  PostgreSQL 17  │   │  Redis (BullMQ job queue)                │
│  localhost:5432 │   │  localhost:6379                          │
│  DB: growleads  │   │  Queues: poll-campaigns, send-dms        │
└─────────────────┘   └──────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Dashboard (Next.js 14)               localhost:3000            │
│  • Enter User ID (from extension) to access                     │
│  • View connected LinkedIn account                              │
│  • Create / pause / resume / delete campaigns                   │
│  • View live activity log per campaign                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
linkedin-dm-automation/
├── backend/                          Node.js API + workers
│   ├── .env                          DB + Redis connection strings
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma             Database schema
│   └── src/
│       ├── index.js                  Server entry point
│       ├── logger.js                 Pino structured logger
│       ├── db/
│       │   └── client.js             Prisma client singleton
│       ├── linkedin/
│       │   ├── api.js                LinkedIn Voyager API client
│       │   └── session.js            li_at + JSESSIONID session manager
│       ├── queue/
│       │   ├── index.js              BullMQ queues + job schedulers
│       │   └── workers/
│       │       ├── pollWorker.js     Fetches commenters every 2 min
│       │       └── dmWorker.js       Sends DMs with rate limiting
│       └── routes/
│           ├── accounts.js           LinkedIn account CRUD
│           └── campaigns.js          Campaign CRUD + stats + logs
│
├── dashboard/                        Next.js dashboard
│   ├── .env.local                    API URL config
│   ├── app/
│   │   ├── layout.jsx
│   │   ├── globals.css
│   │   ├── page.jsx                  User ID entry screen
│   │   └── dashboard/
│   │       └── page.jsx              Main dashboard (accounts + campaigns + logs)
│   └── lib/
│       └── api.js                    API client helper
│
├── extension/                        Chrome Extension (Manifest V3)
│   ├── manifest.json                 Permissions: cookies + storage only
│   ├── icons/
│   └── src/
│       ├── background/
│       │   └── service-worker.js     Reads li_at httpOnly cookie
│       └── popup/
│           ├── popup.html            Connect / Connected UI
│           ├── popup.js              Connection flow logic
│           └── popup.css             Dark theme styles
│
└── docs/
    └── brainstorms/
        └── 2026-03-13-growleads-saas-rebuild-brainstorm.md
```

---

## Database Schema

```
users
  id            UUID (primary key — matches extension-generated UUID)
  email         auto-generated placeholder (user_<uuid>@growleads.local)
  created_at

linkedin_accounts
  id            UUID
  user_id       → users.id
  li_at         LinkedIn session cookie (stored securely)
  profile_name  e.g. "John Doe"
  profile_id    LinkedIn internal person ID
  status        active | invalid | rate_limited
  last_verified_at
  UNIQUE (user_id, profile_id)

campaigns
  id
  user_id       → users.id
  account_id    → linkedin_accounts.id
  name          e.g. "Free SEO Checklist"
  post_url      LinkedIn post URL
  activity_id   Extracted LinkedIn activity ID (used to fetch comments)
  resource_url  Lead magnet URL sent in DM
  message_template  Supports {firstName} and {resourceUrl} variables
  status        active | paused
  dms_sent      running count
  last_polled_at

sent_dms
  id
  campaign_id   → campaigns.id
  linkedin_profile_id
  profile_name
  sent_at
  UNIQUE (campaign_id, linkedin_profile_id)   ← prevents duplicate DMs

activity_logs
  id
  campaign_id   → campaigns.id
  level         INFO | WARN | ERROR
  action        poll_start | poll_result | dm_sent | dm_failed | api_error
  message       Human-readable description
  meta          JSON (extra context)
  created_at
```

---

## Key Technical Details

### Authentication (Identity)
- No login/password system
- Chrome extension generates a UUID on first install — this is the user's identity
- Extension shows this UUID; user pastes it into the dashboard
- All API calls use `userId` query param or request body

### LinkedIn Session Management
- Extension extracts `li_at` cookie (LinkedIn's persistent auth cookie)
- Backend `session.js` refreshes the `JSESSIONID` (CSRF token) by making a GET to `linkedin.com` and reading `Set-Cookie` response headers
- Sessions cached in memory, refreshed every 25 minutes
- If session returns 401/403, account status is set to `invalid` and polling stops

### Comment Polling
- Uses LinkedIn's undocumented Voyager API: `GET /voyager/api/feed/comments?updateId=<urn>&count=100`
- Response uses normalized JSON: `data.included[]` contains both `Comment` and `MiniProfile` objects
- Worker parses profiles into a map, then matches comment actors against profiles
- Paginated — fetches all pages until no new commenters found

### DM Sending
- Uses `POST /voyager/api/messaging/conversations`
- Payload format: `LEGACY_INBOX` with `MEMBER_TO_MEMBER` subtype
- Each DM job has a random 0–90 second delay before execution
- Hard cap: 100 DMs/day per LinkedIn account
- Rate limiter: 15 DMs/hour, max 3 sending concurrently

### Rate Limiting & Anti-ban
| Limit | Value |
|-------|-------|
| Daily cap per account | 25 DMs |
| Hourly rate limit | 8 DMs/hour |
| Concurrent sends | 1 (no bursts) |
| Delay between DMs | Random 2–8 min (added at enqueue) |
| Sending hours | 08:00–20:00 local time (jobs auto-delayed until morning) |
| Poll interval per campaign | Every 2 minutes |
| Inter-page delay when paginating | 1.2 seconds |

---

## Infrastructure (Local)

| Component | Details |
|-----------|---------|
| PostgreSQL 17 | Installed via winget, runs as Windows service (auto-starts) |
| Redis 5.0 | Portable binary, e.g. `<redis-dir>\redis-server.exe` |
| Backend | Node.js 18+, runs on port 3001 |
| Dashboard | Next.js 14, runs on port 3000 |

**Start Redis** (must run manually each time — not a Windows service):
```
<redis-dir>\redis-server.exe
```

**Start Backend:**
```
cd backend
npm run dev
```

**Start Dashboard:**
```
cd dashboard
npm run dev
```

---

## How to Use (End-to-End)

1. Start Redis, backend, and dashboard (3 terminals above)
2. Make sure you're logged into LinkedIn in Chrome
3. Click the **GrowLeads Connect** Chrome extension
4. Click **Connect LinkedIn Account** — your name appears
5. Copy your **User ID** from the extension
6. Open `http://localhost:3000`
7. Paste your User ID → click **Open Dashboard**
8. Click **+ New Campaign**
9. Fill in:
   - **Campaign Name** — anything descriptive
   - **LinkedIn Post URL** — the post you want to monitor
   - **Lead Magnet URL** — the link sent in every DM
   - **Message Template** — uses `{firstName}`, `{lastName}`, `{fullName}`, and `{resourceUrl}` variables
10. Click **Create Campaign**
11. Within 2 minutes, the poll worker runs, finds commenters, and starts sending DMs
12. Click **View Logs** to watch activity in real time

---

## What Is NOT Built Yet

All originally planned features are now complete.

---

## Environment Variables

**`backend/.env`**
```
DATABASE_URL="postgresql://<user>:<password>@localhost:5432/growleads"
REDIS_URL="redis://localhost:6379"
PORT=3001
ALLOWED_ORIGINS="http://localhost:3000"
```

**`dashboard/.env.local`**
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```
