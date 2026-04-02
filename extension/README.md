# GrowLeads — LinkedIn DM Automation Extension

Chrome extension (Manifest V3) that monitors LinkedIn post comments and automatically DMs each new commenter with a personalized lead magnet link.

## How it works

1. You create a **campaign** in the popup — paste a LinkedIn post URL and your lead magnet URL.
2. The extension polls that post every 2 minutes (configurable) for new comments.
3. Each new commenter gets a personalized DM using your message template with `{firstName}` and `{resourceUrl}` interpolated.
4. Dedup is enforced per campaign — each person is DM'd only once per campaign.
5. Rate limiting applies: configurable min/max delay between DMs and hourly/daily caps.

## Install (Development)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked** → select this `extension/` folder
4. Navigate to `https://www.linkedin.com` and log in
5. Click the GrowLeads icon in your toolbar

## Message Template Variables

| Variable | Replaced with |
|---|---|
| `{firstName}` | Commenter's first name |
| `{fullName}` | Commenter's full name |
| `{resourceUrl}` | The lead magnet URL you set in the campaign |

## File Structure

```
extension/
├── manifest.json                   # Extension config (MV3)
├── src/
│   ├── background/
│   │   └── service-worker.js       # Alarm management, message bridge
│   ├── content/
│   │   └── linkedin.js             # Core automation engine
│   ├── utils/
│   │   ├── storage.js              # Chrome storage wrapper
│   │   ├── linkedin-api.js         # LinkedIn Voyager API client
│   │   └── logger.js               # Structured logger
│   └── popup/
│       ├── popup.html              # Popup UI
│       ├── popup.js                # Popup logic (XSS-safe DOM methods)
│       └── popup.css               # Styles
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Default Safety Settings

| Setting | Default | Notes |
|---|---|---|
| Min delay between DMs | 30s | Randomised — looks human |
| Max delay between DMs | 90s | |
| Max DMs per hour | 15 | |
| Max DMs per day | 100 | Hard cap |
| Poll interval | 2 min | How often new comments are checked |

All configurable via the popup Settings screen.

## Permissions Used

| Permission | Why |
|---|---|
| `storage` | Saves campaigns, DM logs, settings locally |
| `alarms` | Periodic polling trigger |
| `cookies` | CSRF token fallback via service worker |
| `tabs` | Find active LinkedIn tabs for poll trigger |
| `scripting` | Future: inject helper scripts if needed |
| `notifications` | (reserved) Daily summary notifications |
| `host_permissions: linkedin.com` | Make API requests to LinkedIn's Voyager endpoints |

## Important Notes

- This extension uses LinkedIn's **internal (undocumented) Voyager API**. LinkedIn may change these endpoints at any time.
- LinkedIn's ToS prohibits automated messaging. Use responsibly with conservative rate limits.
- No credentials are stored — the extension uses your active browser session only.
