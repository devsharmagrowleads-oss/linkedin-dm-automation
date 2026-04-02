---
title: LinkedIn Server-Side Session — li_at Invalidated Without JSESSIONID
category: integration-issues
date: 2026-03-16
tags: [linkedin, voyager-api, session, cookies, jsessionid, chrome-extension, bullmq]
symptoms:
  - "fetch failed: redirect count exceeded"
  - "Could not obtain JSESSIONID — li_at may be expired"
  - LinkedIn returns `li_at=delete me; Expires=Thu, 01-Jan-1970` in Set-Cookie
  - Poll worker fails every 2 minutes with session errors
  - Account status never reaches invalid (auth check never triggers)
components: [backend/src/linkedin/session.js, extension/src/background/service-worker.js]
---

## Problem

When making server-side requests to LinkedIn using only the `li_at` cookie,
LinkedIn detects the request is not from a real browser and **deletes the `li_at`
token** by returning `Set-Cookie: li_at=delete me; Expires=1970-01-01`.

The session refresh flow — which fetched `https://www.linkedin.com/` to obtain a
`JSESSIONID` — failed with `redirect count exceeded` because LinkedIn sends
an infinite redirect loop for unauthenticated/suspicious server-side requests.

### Why It Happens

LinkedIn's `li_at` cookie is only valid when paired with a `JSESSIONID`. In a
real browser session both cookies travel together on every request. When the
backend sends `li_at` alone, LinkedIn's server-side validation fails — it treats
the request as a session hijack attempt and invalidates the token.

Additionally, using `redirect: 'follow'` on `fetch('https://www.linkedin.com/')`
causes Node.js to hit LinkedIn's maximum redirect limit before any cookies are set.

---

## Root Cause

Two compounding issues:

1. **Redirect loop** — `redirect: 'follow'` on the root LinkedIn URL causes
   infinite redirects server-side. The fallback to `/uas/authenticate` was
   never reached because the exception was thrown first.

2. **Missing JSESSIONID** — Even after fixing redirects, LinkedIn rejects
   `li_at`-only requests and actively deletes the cookie. The `JSESSIONID`
   (CSRF token) must be present alongside `li_at` for requests to be accepted.

---

## Solution

### 1. Capture JSESSIONID from the browser (extension)

Instead of deriving JSESSIONID server-side, read it directly from the browser
where it already exists as part of the active LinkedIn session.

```js
// extension/src/background/service-worker.js
Promise.all([
  chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'li_at' }),
  chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'JSESSIONID' }),
]).then(([liAtCookie, jsessionCookie]) => {
  sendResponse({
    liAt:       liAtCookie?.value  ?? null,
    jsessionId: jsessionCookie?.value ?? null,
  })
})
```

### 2. Store JSESSIONID in the database on account connect

```js
// backend/src/routes/accounts.js
const { userId, liAt, jsessionId } = req.body
// ...
const account = await db.linkedInAccount.upsert({
  create: { userId, liAt, jsessionId, ... },
  update: { liAt, jsessionId, ... }
})
```

### 3. Seed the session with the stored JSESSIONID

```js
// backend/src/linkedin/session.js
export class LinkedInSession {
  constructor(liAt, accountId, jsessionId = null) {
    this.jsessionId  = jsessionId
    this.lastRefresh = jsessionId ? Date.now() : 0  // treat pre-seeded as fresh
  }
}

export function getSession(liAt, accountId, jsessionId = null) {
  // ...
  if (jsessionId) {
    session.jsessionId  = jsessionId
    session.lastRefresh = Date.now()
  }
  return session
}
```

### 4. Fix the refresh fallback — use `redirect: 'manual'`

For when JSESSIONID eventually expires and a refresh is needed:

```js
// backend/src/linkedin/session.js
async refresh() {
  const endpoints = [
    `https://www.linkedin.com/uas/authenticate`,
    `https://www.linkedin.com/voyager/api/voyagerIdentityDashProfileComponents?q=me`,
  ]
  for (const url of endpoints) {
    const res = await fetch(url, {
      headers: { ...BASE_HEADERS, cookie: `li_at=${this.liAt}` },
      redirect: 'manual'  // ← critical: avoids redirect loop
    })
    const jsessionId = this._extractJsessionId(res)
    if (jsessionId) { this.jsessionId = jsessionId; return }
  }
  throw new Error('Could not obtain JSESSIONID — li_at may be expired')
}
```

### 5. Pass JSESSIONID when creating sessions in workers

```js
// pollWorker.js + dmWorker.js
const session = getSession(account.liAt, account.id, account.jsessionId)
```

---

## Prevention

- **Never rely solely on `li_at` for server-side LinkedIn API calls.** Always
  pair it with `JSESSIONID`.
- When building LinkedIn integrations, capture all session cookies from the
  browser at connection time — not just the primary auth token.
- Use `redirect: 'manual'` for all server-side fetches to LinkedIn endpoints
  to prevent redirect loops.
- After fixing session issues, the user must **reconnect** their LinkedIn
  account via the extension so the new JSESSIONID gets stored in the DB.

---

## Also Fixed in This Session

| Issue | Fix |
|-------|-----|
| BullMQ `QueueScheduler` import error | Removed — deprecated in BullMQ v2+, not present in v5 |
| Chrome extension `fetch` to localhost blocked | Added `http://localhost:3001/*` to `host_permissions` in `manifest.json` |
