# GrowLeads SaaS Rebuild — Brainstorm
**Date:** 2026-03-13
**Status:** Draft

---

## What We're Building

A LinkedIn DM automation SaaS platform where:
1. A user installs a lightweight Chrome extension (like LeadShark Connect) — its only job is to extract the `li_at` cookie and send it to the GrowLeads backend.
2. All automation runs 24/7 in the cloud (no browser needs to stay open).
3. A Next.js dashboard lets users connect LinkedIn accounts, create campaigns, monitor activity, and view stats.
4. Campaigns watch a LinkedIn post for new commenters and auto-send personalized DMs with a lead magnet URL.

**Target users:** LinkedIn creators, SaaS founders, B2B marketers who want to convert post engagement into warm leads automatically.

**Competitive reference:** LeadShark.io — 3,000+ users, 1.5M DMs delivered, $39–$99/mo pricing.

---

## Why This Approach

The original GrowLeads extension tried to do everything in the browser (poll LinkedIn, deduplicate, send DMs). This is fundamentally unscalable:
- Browser must always be open
- Rate limiting is per-browser, not per-account
- No multi-user support
- Hard to debug, update, or scale

**The clean architecture:** Extension = thin credential extractor only. All logic lives on the server.

This is exactly the pattern LeadShark uses and why they can serve 3,000+ users.

---

## Current State

### Already Built (Backend)
- Fastify REST API (`/accounts`, `/campaigns`, `/campaigns/:id/logs`, `/campaigns/:id/stats`)
- PostgreSQL schema (Prisma): User, LinkedInAccount, Campaign, SentDM, ActivityLog
- BullMQ workers: `pollWorker` (fetches commenters), `dmWorker` (sends DMs, 100/day cap, 15/hr rate limit)
- LinkedIn session manager: refreshes JSESSIONID from `li_at`
- LinkedIn Voyager API client: `getAllCommenters`, `sendDM`, `verifySession`

### Already Built (Extension — needs rebuild)
- Over-engineered: contains full automation engine, storage, logger, LinkedIn API utils
- Must be replaced with a minimal extractor

### Not Yet Built
- **Chrome extension v2** — minimal `li_at` extractor only
- **Next.js dashboard** — the entire user-facing product
- **Auth layer** — user accounts, JWT/sessions
- **Stripe integration** — billing/subscriptions
- **Anti-ban layer** — time-of-day restrictions, human-like delays, jitter

---

## Key Decisions

### Decision 1: Extension scope
**Chosen:** Minimal extractor only (< 100 lines total)
- Single popup with one button: "Connect LinkedIn Account"
- Reads `li_at` cookie via `chrome.cookies.get()`
- POSTs `{ liAt, userId }` to backend `/accounts`
- Shows success/error state
- No storage, no automation, no content scripts needed

**Rejected:** Keep full automation in extension
**Why rejected:** Requires browser always open, unscalable for SaaS, bugs are hard to fix (users must update extension)

### Decision 2: Auth strategy
**Chosen:** Simple JWT-based auth to start
- Users sign up with email + password (or Google OAuth)
- JWT stored in httpOnly cookie for dashboard
- `userId` from JWT injected into all API calls
- Extension uses a short-lived API key (not JWT) for the one-time `li_at` POST

**Why:** Fastest path to working product. Can add SSO/teams later.

### Decision 3: Dashboard stack
**Chosen:** Next.js 14 App Router + Tailwind CSS + shadcn/ui
- Matches what most indie SaaS tools use
- App Router gives server components for fast initial loads
- shadcn/ui is copy-paste components — no design system overhead
- React Query for client-side data fetching with optimistic updates

**Why:** Fastest path to polished UI. No custom CSS needed.

### Decision 4: Extension ↔ Dashboard user linking
**Chosen:** API key approach
- After user logs in to dashboard, they get an API key (shown once)
- Extension popup has a field: "Paste your GrowLeads API key"
- Extension uses that key when POSTing `li_at` to backend

**Why:** Simpler than OAuth flow for extension. User only does it once.

### Decision 5: Deployment
**Chosen:** Single VPS (Railway or Render) to start
- Backend (Node.js): 1 dyno/container
- Redis: managed Redis add-on
- PostgreSQL: managed Postgres add-on
- Frontend (Next.js): Vercel (free tier)

**Why:** Zero DevOps overhead for MVP. Can move to Kubernetes later.

---

## Build Order (Phase by Phase)

### Phase 1 — Extension v2 (1 day)
Strip the extension down to a minimal `li_at` extractor:
- `manifest.json` — remove content scripts, remove alarms permission
- `popup.html/js` — single "Connect Account" flow with API key input
- `background/service-worker.js` — just the cookies permission handler

**Done when:** User can click "Connect Account" and see their LinkedIn name appear in the dashboard.

### Phase 2 — Auth + Dashboard shell (2 days)
- Next.js project setup with shadcn/ui
- Sign up / login pages
- Protected layout with sidebar nav
- API key generation endpoint (`POST /api-keys`)
- "Connected Accounts" page (lists accounts, shows status badge)

**Done when:** User can sign up, get an API key, install extension, connect LinkedIn, and see their account in the dashboard.

### Phase 3 — Campaign management (2 days)
- Campaign list page with status badges, DM count, last polled
- Create campaign form: post URL, message template (with `{firstName}` variable preview), resource URL
- Campaign detail page: activity log, stats chart (DMs sent over time)
- Pause/resume/delete actions

**Done when:** User can create a campaign and see it polling + sending DMs in the activity log.

### Phase 4 — End-to-end test + anti-ban (1 day)
- Verify real LinkedIn DMs are being sent
- Add human-like jitter to DM timing (random 2–8 min delay between DMs)
- Add time-of-day restrictions (no DMs between 10pm–7am local time)
- Test daily cap enforcement (100 DMs/day/account)

**Done when:** Campaign runs for 24 hours without getting the LinkedIn account flagged.

### Phase 5 — Billing + launch (2 days)
- Stripe integration (subscriptions)
- Plan limits enforced in backend (campaigns per user, DMs per day)
- Landing page (can be simple Next.js page or Framer)
- Chrome Web Store submission

**Done when:** Someone can pay and use the product.

---

## Open Questions

1. ~~**Multi-account per user**~~ → **Resolved**: 1 account per user at MVP. Add multi-account as a paid plan feature later.

2. **Message template variables**: LeadShark supports `{firstName}` and `{lastName}`. Do we need more (company, job title)? These would require fetching the commenter's profile.

3. ~~**Email-gated landing pages**~~ → **Resolved**: Future phase. MVP uses a plain `resourceUrl` field. Full Google Drive → AI → Webflow pipeline is post-launch.

4. **LinkedIn ToS risk**: LinkedIn actively fights automation. Do we add a risk disclaimer / ToS agreement at signup? Do we need a stealth mode (residential proxy per account)?

5. ~~**Chrome extension distribution**~~ → **Resolved**: Unlisted ZIP for beta. Users install via developer mode. No Chrome Web Store delay.

---

## Resolved Questions

- **Architecture**: Cloud-first, not browser-first. Server does all work. Extension is credential extractor only. ✅
- **Rate limiting**: 100 DMs/day per account, 15/hour, 3 concurrent sends. Already in `dmWorker.js`. ✅
- **Deduplication**: Per (campaignId, profileId) unique index in DB. Already implemented. ✅
- **Session management**: Server-side `li_at` + JSESSIONID refresh via GET to linkedin.com. Already in `session.js`. ✅

---

## Success Metrics (MVP)

- 10 beta users running campaigns successfully for 7 days
- Zero LinkedIn account bans in beta
- p95 latency from comment → DM < 5 minutes
- Campaign creation takes < 2 minutes for a non-technical user
