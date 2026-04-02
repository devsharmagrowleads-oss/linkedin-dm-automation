# GrowLeads — Technical Documentation

**Version:** 1.0.0
**Type:** Chrome Extension (Manifest V3)
**Purpose:** LinkedIn comment-to-DM automation for lead generation

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [File Structure](#3-file-structure)
4. [Component Breakdown](#4-component-breakdown)
   - 4.1 [Manifest](#41-manifest)
   - 4.2 [Popup UI](#42-popup-ui)
   - 4.3 [Service Worker (Background)](#43-service-worker-background)
   - 4.4 [Content Script (Automation Engine)](#44-content-script-automation-engine)
   - 4.5 [Storage Utility](#45-storage-utility)
   - 4.6 [Logger Utility](#46-logger-utility)
   - 4.7 [LinkedIn API Utility](#47-linkedin-api-utility)
5. [Data Models](#5-data-models)
6. [Message Protocol (Internal)](#6-message-protocol-internal)
7. [Execution Flow](#7-execution-flow)
8. [Rate Limiting Design](#8-rate-limiting-design)
9. [Deduplication Design](#9-deduplication-design)
10. [LinkedIn Voyager API Reference](#10-linkedin-voyager-api-reference)
11. [Security Design](#11-security-design)
12. [Default Configuration](#12-default-configuration)
13. [Storage Schema](#13-storage-schema)
14. [Known Risks & Dependencies](#14-known-risks--dependencies)

---

## 1. Project Overview

GrowLeads is a **Chrome Extension (Manifest V3)** that automates LinkedIn engagement-to-lead conversion. It monitors user-specified LinkedIn posts for new comments and automatically sends personalized direct messages to each commenter using a customizable message template with a lead magnet link.

The entire system runs **inside the browser** using the user's active, authenticated LinkedIn session. No external servers, no stored credentials, no proxies required.

**Core Value Proposition:**
When a LinkedIn post gets engagement (comments), GrowLeads captures that interest and turns it into a personal DM conversation — automatically, with deduplication, human-like delays, and daily caps to minimize detection risk.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Chrome Browser                               │
│                                                                     │
│  ┌────────────────────┐      ┌───────────────────────────────────┐  │
│  │  Extension Popup   │      │      Service Worker (Background)  │  │
│  │  (popup.html/js)   │◄────►│      (service-worker.js)          │  │
│  └────────────────────┘      └──────────────┬────────────────────┘  │
│                                             │ GL_POLL_CAMPAIGNS      │
│                                             ▼                        │
│                              ┌─────────────────────────────────┐    │
│                              │  Content Script (linkedin.js)   │    │
│                              │  Injected on linkedin.com pages  │    │
│                              └─────────────┬───────────────────┘    │
│                                            │ fetch()                 │
│                                            ▼                        │
│                              ┌─────────────────────────────────┐    │
│                              │   LinkedIn Voyager API          │    │
│                              │   (in-browser, same session)    │    │
│                              └─────────────────────────────────┘    │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                  chrome.storage.local                          │ │
│  │   gl_campaigns │ gl_sent_dms │ gl_logs │ gl_settings │ gl_daily│ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Design Principles:**
- **Session-only auth**: No passwords or tokens stored — relies entirely on the browser's authenticated LinkedIn session.
- **Content script as executor**: All LinkedIn API calls happen in the content script so cookies are automatically attached.
- **Service worker as orchestrator**: Manages alarms and routing but does not call LinkedIn APIs directly.
- **Storage as the single source of truth**: All campaign state, dedup records, logs, and settings persist in `chrome.storage.local`.

---

## 3. File Structure

```
extension/
├── manifest.json                    # Extension config (MV3)
├── README.md                        # User-facing readme
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── background/
    │   └── service-worker.js        # Alarm management, message routing
    ├── content/
    │   └── linkedin.js              # Poll cycle, DM queue, rate limiter
    ├── popup/
    │   ├── popup.html               # UI structure
    │   ├── popup.js                 # UI logic, form handling, stats
    │   └── popup.css                # Styling
    └── utils/
        ├── storage.js               # chrome.storage.local wrapper
        ├── linkedin-api.js          # Voyager API client
        └── logger.js                # Structured logging
```

---

## 4. Component Breakdown

### 4.1 Manifest

**File:** `manifest.json`
**Spec:** Manifest V3

| Field | Value |
|---|---|
| Name | GrowLeads - LinkedIn DM Automation |
| Version | 1.0.0 |
| Manifest version | 3 |
| Service worker | `src/background/service-worker.js` |
| Popup | `src/popup/popup.html` |
| Host permissions | `https://www.linkedin.com/*` |

**Permissions:**
- `storage` — persist campaigns, logs, settings
- `alarms` — periodic polling without keeping SW alive
- `cookies` — read JSESSIONID for CSRF token (fallback in SW)
- `notifications` — browser alerts (future use)
- `tabs` — find open LinkedIn tabs to inject poll trigger
- `scripting` — inject content scripts programmatically if needed

**Content Scripts:**
Loaded in this order at `document_idle` on `https://www.linkedin.com/*`:
1. `src/utils/storage.js`
2. `src/utils/logger.js`
3. `src/utils/linkedin-api.js`
4. `src/content/linkedin.js`

Load order matters — later scripts depend on earlier ones being available on `window`.

---

### 4.2 Popup UI

**Files:** `src/popup/popup.html`, `src/popup/popup.js`, `src/popup/popup.css`

#### Layout (HTML)

```
┌──────────────────────────────┐
│ [●] GrowLeads   [⚙] [↻]     │  ← Header (fixed)
├──────────────────────────────┤
│ Today: 0  Total: 0  Active: 0│  ← Stats bar (fixed)
├──────────────────────────────┤
│                              │
│   [Active view content]      │  ← Scrollable main area
│                              │
├──────────────────────────────┤
│  [Campaigns]  [Activity Log] │  ← Bottom nav (fixed)
└──────────────────────────────┘
```

**Views:**

| View ID | Description |
|---|---|
| `campaigns` | List of all campaign cards |
| `form` | Add / Edit campaign form |
| `settings` | Rate limiting & poll interval settings |
| `logs` | Activity log timeline |

#### popup.js — Key Functions

**View Management:**
```javascript
showView(name)              // Switches visible view panel
```

**Stats:**
```javascript
renderStats()               // Reads storage, updates Today/Total/Active counters
```

**Campaign CRUD:**
```javascript
renderCampaigns()           // Builds campaign card list from storage
buildCampaignCard(campaign) // Constructs DOM element for one campaign
toggleCampaign(id, isActive)// Flip status active ↔ paused
deleteCampaign(id, name)    // Confirmation + delete from storage
openAddForm()               // Show blank form
openEditForm(campaign)      // Pre-populate form for edit
```

**Form Submission Logic:**
```javascript
// Validates:
//   - postUrl must contain 'linkedin.com'
//   - messageTemplate must contain '{resourceUrl}'
// Upserts campaign: updates if id exists, creates new otherwise
// New campaign gets: id=_genId(), status='active', dmsSent=0, createdAt=Date.now()
```

**Settings:**
```javascript
loadSettings()              // Populates settings form from storage
// On submit: converts s→ms, validates min<max, saves, sends GL_UPDATE_ALARM_PERIOD
```

**Activity Log:**
```javascript
renderLogs()                // Fetches last 80 logs, renders with icon + message + time-ago
```

**Helpers:**
```javascript
_genId()                    // 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7)
_truncate(str, max)         // Ellipsis truncation, native title tooltip
_timeAgo(ts)                // 'just now' | 'Xm ago' | 'Xh ago' | 'Xd ago'
_mkBtn(label, classes)      // Safe button factory (no innerHTML)
_logIcon(action)            // Maps action → emoji
```

**Log Icons:**
| Action | Icon |
|---|---|
| `dm_sent` | ✅ |
| `dm_skipped` | ⏭ |
| `poll_start` | 🔍 |
| `poll_result` | 📊 |
| `rate_limit` | ⏳ |
| `api_error` | ❌ |

---

### 4.3 Service Worker (Background)

**File:** `src/background/service-worker.js`
**Context:** Manifest V3 service worker — ephemeral, event-driven

#### Alarm Management

```javascript
const ALARM_NAME   = 'growleads_poll'
const ALARM_PERIOD = 2  // minutes (default)

_ensureAlarm()
// Creates alarm if not already registered:
//   delayInMinutes: 0.5  (first poll 30s after install/startup)
//   periodInMinutes: from gl_settings.pollIntervalMinutes or ALARM_PERIOD
```

Alarm is created/verified on:
- `chrome.runtime.onInstalled`
- `chrome.runtime.onStartup`
- Proactively before each triggered poll (auto-healing)

#### Poll Trigger Flow

```
Alarm fires
    │
    ▼
Load gl_campaigns from storage
    │
    ▼
Any status='active'? ──No──► Stop
    │
   Yes
    │
    ▼
Query tabs: url='https://www.linkedin.com/*', status='complete'
    │
    ▼
For each tab (iterate):
    │
    ▼
Send GL_POLL_CAMPAIGNS message ──Success──► Done
    │
   Error (content script not ready)
    │
    ▼
Try next tab
```

#### Message Handlers

| Message | Handler |
|---|---|
| `GL_GET_CSRF_TOKEN` | Reads JSESSIONID cookie from LinkedIn domain, strips quotes, returns token |
| `GL_POLL_NOW` | Manual refresh from popup — immediately calls `_triggerPollInLinkedInTab()` |
| `GL_LOG` | Receives log entry from content script, prepends to `gl_logs`, caps at 300 |
| `GL_DM_SENT` | Increments campaign's `dmsSent`, updates `lastActive`, updates daily count |
| `GL_UPDATE_ALARM_PERIOD` | Clears old alarm, recreates with new `pollIntervalMinutes` |

---

### 4.4 Content Script (Automation Engine)

**File:** `src/content/linkedin.js`
**Context:** Runs on every `linkedin.com` page at `document_idle`

#### Startup

```javascript
// On load:
if (!GrowLeadsLinkedInAPI.isLoggedIn()) {
  // Log warning, do not attach listener
  return
}
// Otherwise attach message listener and wait for GL_POLL_CAMPAIGNS
```

#### RateLimiter Object

```javascript
const RateLimiter = {
  _hourlyLog: [],              // In-memory: timestamps of DMs sent in last 60 min

  canSend(settings, dailyCount) {
    // Returns false if dailyCount >= maxDmsPerDay
    // Filters _hourlyLog to last 60 min, returns false if >= maxDmsPerHour
    // Returns true otherwise
  },

  recordSend() {
    // Pushes Date.now() to _hourlyLog
  },

  randomDelay(settings) {
    // Returns random ms between minDelayMs and maxDelayMs
    // Logs the delay via GrowLeadsLogger.rateLimit()
  }
}
```

Note: `_hourlyLog` is in-memory — resets when the content script is reloaded (page navigation). This is expected behavior; it only causes a transient reset in rate tracking, not a data loss issue.

#### pollCampaign(campaign) → Array of jobs

```javascript
async function pollCampaign(campaign) {
  // 1. Extract activityId from campaign.postUrl
  // 2. Fetch all commenters via getAllCommenters(activityId)
  // 3. For each commenter:
  //    - isAlreadySent(campaignId, commenter.profileId) → skip if true
  //    - Build job: { campaignId, commenter, messageText }
  //    - messageText = buildMessage(template, { firstName, fullName, resourceUrl })
  // 4. Return jobs[]
}
```

#### processDMQueue(queue)

```javascript
async function processDMQueue(queue) {
  if (_isProcessing) return   // Guard against concurrent execution

  _isProcessing = true
  for (const job of queue) {
    const settings     = await GrowLeadsStorage.getSettings()
    const dailyCount   = await GrowLeadsStorage.getDailyCount()

    if (!RateLimiter.canSend(settings, dailyCount)) {
      // Log rate limit hit, break entire queue
      break
    }

    try {
      await GrowLeadsLinkedInAPI.sendDM(job.commenter.profileId, job.messageText)
      await GrowLeadsStorage.markSent(job.campaignId, job.commenter.profileId, job.commenter.fullName)
      await GrowLeadsStorage.incrementDailyCount()
      RateLimiter.recordSend()
      GrowLeadsLogger.dmSent(job.campaignId, job.commenter.fullName, job.commenter.profileId)
      // Send GL_DM_SENT to background for stats update
    } catch (err) {
      GrowLeadsLogger.apiError(job.campaignId, err)
      await _sleep(5000)   // Wait 5s before next attempt on error
      continue
    }

    const delay = RateLimiter.randomDelay(settings)
    await _sleep(delay)
  }
  _isProcessing = false
}
```

#### runPollCycle()

```javascript
async function runPollCycle() {
  const campaigns = await GrowLeadsStorage.getCampaigns()
  const active    = campaigns.filter(c => c.status === 'active')

  if (!active.length) return

  const allJobs = []
  for (const campaign of active) {
    const jobs = await pollCampaign(campaign)
    allJobs.push(...jobs)
    await _sleep(2000)   // 2s gap between campaigns
  }

  if (allJobs.length > 0) {
    await processDMQueue(allJobs)
  }
}
```

---

### 4.5 Storage Utility

**File:** `src/utils/storage.js`
**Pattern:** IIFE exposing `window.GrowLeadsStorage`

**Public API:**

```javascript
// Campaigns
getCampaigns()                           // → Campaign[]
saveCampaign(campaign)                   // Upsert by id
deleteCampaign(id)                       // Delete campaign + its sent DMs
updateCampaignStats(campaignId, delta)   // Increment dmsSent, set lastActive

// Sent DMs (Deduplication)
isAlreadySent(campaignId, profileId)     // → boolean
markSent(campaignId, profileId, name)    // Record { profileId, name, sentAt }
getSentCount(campaignId)                 // → number

// Logs
addLog(entry)                            // Prepend, keep last 300
getLogs(limit = 50)                      // → LogEntry[]

// Settings
getSettings()                            // → Settings (with defaults fallback)
saveSettings(settings)                   // Overwrite

// Daily counter
getDailyCount()                          // → number (0 if date changed since last write)
incrementDailyCount()                    // Increment, reset if new day
```

---

### 4.6 Logger Utility

**File:** `src/utils/logger.js`
**Pattern:** IIFE exposing `window.GrowLeadsLogger`

**Log Levels:** `DEBUG=0`, `INFO=1`, `WARN=2`, `ERROR=3`
**Default Threshold:** INFO (DEBUG not persisted to storage)

**Entry Schema:**
```javascript
{
  level:      string,   // 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  message:    string,
  action:     string?,  // e.g. 'dm_sent', 'poll_start'
  campaignId: string?,
  ts:         number,   // Date.now()
  source:     'extension'
}
```

**Structured Helpers:**
```javascript
GrowLeadsLogger.dmSent(campaignId, name, profileId)
GrowLeadsLogger.dmSkipped(campaignId, name, reason)
GrowLeadsLogger.pollStart(campaignId, postUrl)
GrowLeadsLogger.pollResult(campaignId, newCount, totalCount)
GrowLeadsLogger.rateLimit(campaignId, delayMs)
GrowLeadsLogger.apiError(campaignId, error)
```

---

### 4.7 LinkedIn API Utility

**File:** `src/utils/linkedin-api.js`
**Pattern:** IIFE exposing `window.GrowLeadsLinkedInAPI`

#### Authentication

```javascript
getCSRFToken()
// Reads document.cookie
// Matches: JSESSIONID="ajax:XXXX" or JSESSIONID=ajax:XXXX
// Returns token string or throws 'Not logged in'

buildHeaders()
// Returns headers object including:
//   csrf-token, accept, content-type,
//   x-li-lang, x-li-page-instance, x-li-track, x-restli-protocol-version
```

#### Activity ID Extraction

Post URLs come in two formats:
1. `https://www.linkedin.com/feed/update/urn:li:activity:7123456789/`
2. `https://www.linkedin.com/posts/username_some-slug-activity-7123456789-XXXX/`

```javascript
extractActivityId(postUrl)
// Pattern 1: urn:li:activity:(\d+) or urn%3Ali%3Aactivity%3A(\d+)
// Pattern 2: -activity-(\d+)[-/]? or -activity-(\d+)$
// Returns digit string or null
```

#### Comments Fetching

```javascript
fetchCommentPage(activityId, start = 0, count = 100)
// GET /voyager/api/feed/comments?updateId=urn%3Ali%3Aactivity%3A{id}&count={count}&start={start}
// Returns raw JSON

getAllCommenters(activityId)
// Paginates until no new results or start >= total
// Delays 1200ms between pages
// Returns: [{ profileId, firstName, fullName, profileUrn }]
```

**LinkedIn Normalized JSON Parsing:**

LinkedIn's API returns a "normalized" response with a `data.included[]` array containing mixed object types. The parser:
1. Iterates `included[]`, finds `MiniProfile` objects, builds a `Map<personUrn, profile>`
2. Iterates `included[]` again, finds `Comment` objects, extracts `actor` (person URN)
3. Looks up the profile from the map and builds commenter objects
4. Deduplicates by `profileId` using a `Map`

#### DM Sending

```javascript
sendDM(recipientProfileId, messageText)
// POST /voyager/api/messaging/conversations
// Body: {
//   keyVersion: 'LEGACY_INBOX',
//   conversationCreate: {
//     eventCreate: {
//       value: {
//         'com.linkedin.voyager.messaging.create.MessageCreate': {
//           attributedBody: { text: messageText, attributes: [] },
//           attachments: []
//         }
//       }
//     },
//     recipients: ['urn:li:person:{recipientProfileId}'],
//     subtype: 'MEMBER_TO_MEMBER'
//   }
// }
// Throws on non-200 with status + body snippet
```

#### Message Template Interpolation

```javascript
buildMessage(template, { firstName, fullName, resourceUrl })
// Replaces: {firstName}, {fullName}, {resourceUrl}  (case-insensitive)
// Fallbacks: firstName → 'there', fullName → firstName, resourceUrl → ''
```

---

## 5. Data Models

### Campaign
```javascript
{
  id:              string,           // 'c_<timestamp_base36><random>'
  name:            string,           // User-defined label
  postUrl:         string,           // LinkedIn post URL to monitor
  resourceUrl:     string,           // Lead magnet link (replaces {resourceUrl})
  messageTemplate: string,           // DM template with {firstName} etc.
  status:          'active'|'paused',
  dmsSent:         number,           // Total DMs sent from this campaign
  createdAt:       number,           // Unix timestamp (ms)
  lastActive:      number            // Last DM sent timestamp (ms)
}
```

### Sent DM Record
```javascript
// Stored in gl_sent_dms[campaignId][]
{
  profileId: string,   // LinkedIn member ID
  name:      string,   // Full name at time of sending
  sentAt:    number    // Unix timestamp (ms)
}
```

### Settings
```javascript
{
  minDelayMs:           number,   // Minimum ms between DMs
  maxDelayMs:           number,   // Maximum ms between DMs
  maxDmsPerHour:        number,   // Hourly cap
  maxDmsPerDay:         number,   // Daily cap
  pollIntervalMinutes:  number    // How often to check for new comments
}
```

### Log Entry
```javascript
{
  level:      'DEBUG'|'INFO'|'WARN'|'ERROR',
  message:    string,
  action:     string?,     // Structured action type
  campaignId: string?,
  ts:         number,      // Unix timestamp (ms)
  source:     'extension'
}
```

### Daily Counter
```javascript
{
  date:  string,   // 'YYYY-MM-DD' (local date string)
  count: number    // DMs sent today
}
```

---

## 6. Message Protocol (Internal)

Chrome runtime messages between components:

| Message Type | Direction | Payload | Response |
|---|---|---|---|
| `GL_POLL_CAMPAIGNS` | SW → Content | `{}` | `{ ok: true }` or `{ ok: false, error }` |
| `GL_POLL_NOW` | Popup → SW | `{}` | `{ ok: true }` or `{ ok: false, error }` |
| `GL_GET_CSRF_TOKEN` | Content → SW | `{}` | `{ token: string }` or `{ error: string }` |
| `GL_LOG` | Content → SW | `{ entry: LogEntry }` | — |
| `GL_DM_SENT` | Content → SW | `{ campaignId, profileId }` | — |
| `GL_UPDATE_ALARM_PERIOD` | Popup → SW | `{ minutes: number }` | — |

---

## 7. Execution Flow

### Full Automated Cycle

```
[Browser opens / alarm fires]
         │
         ▼
Service Worker wakes up
         │
         ▼
Read gl_campaigns → any active? ──No──► Sleep until next alarm
         │
        Yes
         │
         ▼
Find LinkedIn tabs (url=linkedin.com, status=complete)
         │
         ▼
Send GL_POLL_CAMPAIGNS to first responsive tab
         │
         ▼
Content Script: runPollCycle()
         │
    ┌────┴────────────────────────────┐
    │  For each active campaign:      │
    │                                 │
    │  extractActivityId(postUrl)     │
    │         │                       │
    │         ▼                       │
    │  getAllCommenters(activityId)   │
    │  [paginated, 1.2s between pages]│
    │         │                       │
    │         ▼                       │
    │  Filter: isAlreadySent?         │
    │         │                       │
    │         ▼                       │
    │  Build DM jobs[]                │
    │  Sleep 2s                       │
    └──────────── ────────────────────┘
         │
         ▼
processDMQueue(allJobs)
         │
    ┌────┴───────────────────────────────────┐
    │  For each job:                         │
    │                                        │
    │  RateLimiter.canSend() ──No──► break   │
    │         │                              │
    │        Yes                             │
    │         │                              │
    │  sendDM(profileId, message)            │
    │         │                              │
    │  markSent() + incrementDailyCount()    │
    │  RateLimiter.recordSend()              │
    │  GL_DM_SENT → Background              │
    │         │                              │
    │  Sleep random(minDelay, maxDelay)      │
    └────────────────────────────────────────┘
```

---

## 8. Rate Limiting Design

Two-layer rate limiting:

### Layer 1: Per-DM Delay (Human Simulation)
- Random delay between `minDelayMs` and `maxDelayMs` after every DM
- Default: 30,000ms – 90,000ms (30s – 90s)
- Purpose: Mimic human typing and sending speed

### Layer 2: Hard Caps
- **Hourly**: `maxDmsPerHour` (default: 15)
  Tracked via `RateLimiter._hourlyLog` — in-memory array of send timestamps, filtered to last 60 minutes on every `canSend()` check.
- **Daily**: `maxDmsPerDay` (default: 100)
  Tracked in `chrome.storage.local` as `gl_daily = { date, count }`. Resets automatically when the date string changes.

When either cap is hit, the **entire DM queue is paused** until the next poll cycle.

---

## 9. Deduplication Design

Dedup key: `(campaignId, profileId)`

- Before any DM is sent: `GrowLeadsStorage.isAlreadySent(campaignId, profileId)` is checked
- After a successful DM: `GrowLeadsStorage.markSent(campaignId, profileId, fullName)` is called
- Same person can receive DMs from **different campaigns** (different posts)
- Same person will **never** receive a second DM for the same campaign

**Storage:** `gl_sent_dms` in `chrome.storage.local`
```javascript
{
  "campaign_id_1": [
    { profileId: "abc123", name: "John Doe", sentAt: 1710000000000 },
    ...
  ]
}
```

Deleting a campaign also deletes its sent DMs record.

---

## 10. LinkedIn Voyager API Reference

These are **undocumented internal LinkedIn APIs**. They may change without notice.

### Get Comments

```
GET https://www.linkedin.com/voyager/api/feed/comments
  ?updateId=urn%3Ali%3Aactivity%3A{activityId}
  &count=100
  &start={offset}

Required Headers:
  csrf-token: {JSESSIONID value}
  accept: application/vnd.linkedin.normalized+json+2.1
  x-restli-protocol-version: 2.0.0
```

**Response shape (simplified):**
```javascript
{
  data: {
    paging: { total, count, start },
    included: [
      // MiniProfile objects:
      { $type: '...MiniProfile', objectUrn: 'urn:li:person:XXX', firstName, lastName, ... },
      // Comment objects:
      { $type: '...Comment', actor: 'urn:li:person:XXX', ... },
      ...
    ]
  }
}
```

### Send DM

```
POST https://www.linkedin.com/voyager/api/messaging/conversations

Required Headers:
  csrf-token: {JSESSIONID value}
  content-type: application/json
  x-restli-protocol-version: 2.0.0
```

**Request body:**
```javascript
{
  "keyVersion": "LEGACY_INBOX",
  "conversationCreate": {
    "eventCreate": {
      "value": {
        "com.linkedin.voyager.messaging.create.MessageCreate": {
          "attributedBody": { "text": "...", "attributes": [] },
          "attachments": []
        }
      }
    },
    "recipients": ["urn:li:person:{profileId}"],
    "subtype": "MEMBER_TO_MEMBER"
  }
}
```

---

## 11. Security Design

| Concern | Mitigation |
|---|---|
| XSS via user input | All user-supplied strings set via `.textContent`, never `innerHTML` |
| Stored credentials | None — session cookies are handled by browser, never read by extension |
| CSRF token | Read from `document.cookie` (available in content script context), used as request header |
| Data scope | `chrome.storage.local` — isolated to extension, not accessible to web pages |
| Host permissions | Scoped to `https://www.linkedin.com/*` only |
| API calls | All happen from content script context; cookies automatically attached by browser |

---

## 12. Default Configuration

| Setting | Default | Min | Max | Unit |
|---|---|---|---|---|
| minDelayMs | 30,000 | — | — | ms |
| maxDelayMs | 90,000 | — | — | ms |
| maxDmsPerHour | 15 | 1 | 50 | count |
| maxDmsPerDay | 100 | 1 | 200 | count |
| pollIntervalMinutes | 2 | 1 | 60 | minutes |
| First alarm delay | 0.5 | — | — | minutes |
| Inter-campaign delay | 2,000 | — | — | ms (hardcoded) |
| Error retry delay | 5,000 | — | — | ms (hardcoded) |
| Inter-page delay | 1,200 | — | — | ms (hardcoded) |

---

## 13. Storage Schema

**Namespace:** `chrome.storage.local`

| Key | Type | Description |
|---|---|---|
| `gl_campaigns` | `Campaign[]` | All campaigns |
| `gl_sent_dms` | `{ [campaignId]: SentRecord[] }` | Dedup records |
| `gl_logs` | `LogEntry[]` | Activity log (max 300) |
| `gl_settings` | `Settings` | User-configured settings |
| `gl_daily` | `{ date: string, count: number }` | Today's DM count |

---

## 14. Known Risks & Dependencies

### LinkedIn Voyager API (High Risk)
LinkedIn's Voyager API is **undocumented and internal**. LinkedIn can:
- Change endpoint paths
- Change response schema
- Add bot detection headers
- Rate-limit or block requests by IP/session

**Mitigation:** The API utility is isolated in one file (`linkedin-api.js`). If LinkedIn changes an endpoint, only that file needs updating.

### Manifest V3 Service Worker Lifecycle
MV3 service workers are terminated after ~30 seconds of inactivity. The alarm mechanism keeps the extension alive for its purpose, but:
- `RateLimiter._hourlyLog` (in-memory) resets on page navigations
- Service worker state is not persistent; all persistent state goes through `chrome.storage`

### LinkedIn ToS
Automated messaging on LinkedIn may violate their Terms of Service. This extension is intended for personal lead generation at conservative volumes. Using it at high volume or commercially may result in account restrictions.

### No External Server
This is a purely client-side extension. There is no backend server, no SaaS dashboard, no remote configuration. If Chrome is closed, polling stops. If LinkedIn is not open in a tab, polling cannot run.
