# GrowLeads — User Guide

**Version:** 1.0.0
**What it does:** Automatically DMs people who comment on your LinkedIn posts — with your custom message and lead magnet link.

---

## Table of Contents

1. [What Is GrowLeads?](#1-what-is-growleads)
2. [How It Works](#2-how-it-works)
3. [Installation](#3-installation)
4. [Setup Before First Use](#4-setup-before-first-use)
5. [Creating Your First Campaign](#5-creating-your-first-campaign)
6. [Writing Your Message Template](#6-writing-your-message-template)
7. [Managing Campaigns](#7-managing-campaigns)
8. [Adjusting Settings](#8-adjusting-settings)
9. [Reading the Activity Log](#9-reading-the-activity-log)
10. [Understanding the Stats Bar](#10-understanding-the-stats-bar)
11. [Restrictions & Limits](#11-restrictions--limits)
12. [Important Rules to Follow](#12-important-rules-to-follow)
13. [Troubleshooting](#13-troubleshooting)
14. [Frequently Asked Questions](#14-frequently-asked-questions)

---

## 1. What Is GrowLeads?

GrowLeads is a **Chrome browser extension** that automates your LinkedIn lead generation.

**The idea is simple:**
You post content on LinkedIn. People comment. Those comments are warm signals — those people are interested in what you shared. GrowLeads automatically sends each commenter a personalized DM with your lead magnet (a PDF, a free resource, a link, anything you want to give them).

**What you get:**
- Automatic DMs to every new commenter on your post
- Personalized messages using their first name
- Your resource link automatically included
- Zero double-sends — each person only gets one DM per campaign
- Full activity log so you can see what happened
- You stay in control of speed and daily limits

**What you don't need:**
- No external accounts or subscriptions
- No API keys or passwords
- No external servers
- Just Chrome and your LinkedIn login

---

## 2. How It Works

```
Your LinkedIn Post
       │
       │  Someone comments
       ▼
GrowLeads checks for new commenters (every 2 minutes)
       │
       │  New commenter found
       ▼
Sends them a DM using your template
       │
       │  {firstName} and {resourceUrl} filled in automatically
       ▼
Marks them as "sent" — they won't be messaged again for this campaign
```

GrowLeads runs entirely inside your browser. It uses your active LinkedIn session to read comments and send messages — the same way LinkedIn itself does.

**Important:** LinkedIn must be open in at least one Chrome tab for GrowLeads to work. It cannot operate in the background if LinkedIn is closed.

---

## 3. Installation

GrowLeads is a developer/unpacked extension. To install it:

1. Open Chrome and go to: `chrome://extensions/`
2. Turn on **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the `extension` folder from the GrowLeads files you received
5. The GrowLeads icon will appear in your Chrome toolbar

**Pinning the icon:**
- Click the puzzle-piece icon (Extensions) in Chrome toolbar
- Click the pin icon next to "GrowLeads"

---

## 4. Setup Before First Use

Before creating any campaigns:

1. **Log into LinkedIn** in Chrome — GrowLeads uses your active session
2. **Keep a LinkedIn tab open** — the extension needs an active LinkedIn tab to send DMs
3. **Prepare your content:**
   - The URL of the LinkedIn post you want to monitor
   - A link to your lead magnet or resource (PDF, landing page, etc.)
   - Your message template (see [Section 6](#6-writing-your-message-template))

---

## 5. Creating Your First Campaign

1. Click the GrowLeads icon in your Chrome toolbar
2. Click **"+ Add Campaign"**
3. Fill in the form:

| Field | What to enter | Example |
|---|---|---|
| Campaign Name | A label to identify this campaign | "My AI Tools Post" |
| LinkedIn Post URL | The full URL of the post to monitor | `https://www.linkedin.com/posts/...` |
| Lead Magnet URL | The link to send in the DM | `https://yourdomain.com/free-guide` |
| Message Template | Your DM text with placeholders | See below |

4. Click **"Save Campaign"**

The campaign starts immediately (status: Active). GrowLeads will check the post for new commenters every 2 minutes.

### Getting the Post URL

On LinkedIn:
- Open the post
- Click the three-dot menu (•••) on the post
- Click "Copy link to post"

Both URL formats work:
- `https://www.linkedin.com/feed/update/urn:li:activity:1234567890/`
- `https://www.linkedin.com/posts/yourname_some-title-activity-1234567890-XXXX/`

---

## 6. Writing Your Message Template

Your message template is the DM text that gets sent to each commenter. You can use **placeholders** that GrowLeads automatically replaces with real values:

| Placeholder | What it becomes | Required? |
|---|---|---|
| `{firstName}` | The commenter's first name | No (but recommended) |
| `{fullName}` | The commenter's full name | No |
| `{resourceUrl}` | Your lead magnet link | **Yes** |

**Note:** `{resourceUrl}` is required in every template. GrowLeads will not save the campaign without it.

### Example Templates

**Short & direct:**
```
Hey {firstName}, saw your comment! Here's the resource I mentioned: {resourceUrl}

Let me know if you have any questions!
```

**Warm & personal:**
```
Hi {firstName}! Thanks for engaging with my post.

I put together a free guide that goes deeper on this topic — thought you might find it useful: {resourceUrl}

Would love to hear your thoughts once you check it out!
```

**Concise CTA:**
```
Hey {firstName}, thanks for the comment!

I promised to share the full framework — grab it here: {resourceUrl}

It's free, no strings attached.
```

### Tips for Good Templates

- Keep it under 300 characters — shorter DMs get higher response rates
- Sound conversational, not salesy
- Reference that you're responding to their comment
- Make the link feel like a genuine gift, not a promotion
- Don't use your full lead magnet pitch — save that for their reply

---

## 7. Managing Campaigns

### Campaign Card

Each campaign shows:
- **Name** and status badge (Active / Paused)
- **Post URL** (truncated)
- **DMs Sent** count and time since last DM

### Actions

| Button | What it does |
|---|---|
| Pause | Stops DMs for this campaign. Polls continue but no messages are sent. |
| Resume | Re-activates the campaign. |
| Edit | Modify name, post URL, resource URL, or message template. |
| Delete | Permanently removes the campaign and all its sent-DM history. |

**Important:** Deleting a campaign also deletes its deduplication records. If you recreate the same campaign, GrowLeads will treat all previous commenters as new and may DM them again.

### Running Multiple Campaigns

You can have several campaigns active at the same time on different posts. GrowLeads polls them sequentially with a 2-second gap between each. All campaigns share the same daily DM cap.

---

## 8. Adjusting Settings

Click the gear icon (⚙) in the popup header to open Settings.

| Setting | Default | What it controls |
|---|---|---|
| Min delay between DMs | 30 seconds | Minimum wait before next DM is sent |
| Max delay between DMs | 90 seconds | Maximum wait before next DM is sent |
| Max DMs per hour | 15 | Hard hourly cap |
| Max DMs per day | 100 | Hard daily cap (resets at midnight) |
| Poll interval | 2 minutes | How often GrowLeads checks for new comments |

After changing settings, click **"Save Settings"**. The polling alarm updates immediately.

### Recommended Settings by Use Case

**Conservative (safest, for new accounts):**
- Min delay: 45s, Max delay: 120s
- Max per hour: 8
- Max per day: 50

**Default (balanced):**
- Min delay: 30s, Max delay: 90s
- Max per hour: 15
- Max per day: 100

**Aggressive (experienced users, established accounts only):**
- Min delay: 20s, Max delay: 60s
- Max per hour: 20
- Max per day: 150

---

## 9. Reading the Activity Log

Click **"Activity Log"** in the bottom navigation to see a timeline of everything GrowLeads has done.

### Log Entry Icons

| Icon | Meaning |
|---|---|
| ✅ | DM successfully sent |
| ⏭ | Commenter skipped (already received DM for this campaign) |
| 🔍 | Poll started for a campaign |
| 📊 | Poll finished — shows new vs total commenters found |
| ⏳ | Rate limit hit — waiting before next DM |
| ❌ | API error — LinkedIn returned an error |

The log shows the last 80 entries in the popup. Up to 300 entries are stored.

**Clear Logs:** Click "Clear Logs" to wipe the activity history.

---

## 10. Understanding the Stats Bar

The stats bar at the top of the popup shows three numbers:

| Stat | Description |
|---|---|
| **Today** | DMs sent so far today (resets at midnight) |
| **Total** | All-time DMs sent across all campaigns |
| **Active** | Number of campaigns currently set to Active |

**Status dot:**
- Green pulsing dot = at least one campaign is active
- Gray dot = all campaigns paused (or no campaigns)

**Manual refresh:**
- Click the ↻ button to trigger an immediate poll (instead of waiting for the next 2-minute alarm)
- The button disables for 3 seconds after clicking

---

## 11. Restrictions & Limits

### Technical Restrictions

**LinkedIn must be open in Chrome:**
GrowLeads can only send DMs when a LinkedIn tab is open and loaded. If you close LinkedIn, the polling alarm will still fire but won't be able to execute. Open LinkedIn again and it will resume.

**Chrome must be open:**
GrowLeads is a browser extension — it only runs while Chrome is open. It cannot run in the background as a standalone app.

**One LinkedIn account:**
GrowLeads uses whatever LinkedIn account is currently logged in. It does not support multiple LinkedIn accounts.

**No comment replies:**
GrowLeads sends DMs, not comment replies. It reads top-level comments on posts.

**Post must be publicly commentable:**
The post URL must be accessible with your LinkedIn account. Posts from connections or public profiles work. Private group posts or content you can't access will return API errors.

### DM Limits

| Limit | Value | Scope |
|---|---|---|
| Per-DM delay | 30–90 seconds (random) | Between each DM |
| Hourly cap | 15 DMs | Per 60 minutes (in-memory, resets on page reload) |
| Daily cap | 100 DMs | Per calendar day (persists across browser sessions) |

These defaults are conservative to avoid LinkedIn rate limits. You can adjust them in Settings, but raising them significantly increases risk.

### Deduplication

- Each person is DM'd **once per campaign**
- The same person can receive DMs from multiple campaigns (if they comment on multiple of your posts)
- Dedup records persist permanently in local storage — they do not expire

### Storage

All data is stored locally in Chrome's extension storage (`chrome.storage.local`):
- Campaigns
- Sent DM records
- Activity logs
- Settings
- Daily counters

This data does not sync across devices or Chrome profiles. If you clear Chrome's extension data or reinstall GrowLeads, all records are lost.

---

## 12. Important Rules to Follow

### LinkedIn Terms of Service

Automated messaging on LinkedIn **may violate their Terms of Service**. Using GrowLeads is at your own risk. To minimize risk:

- Use conservative rate limits (especially on new or smaller accounts)
- Do not exceed 50–80 DMs/day on accounts less than 1 year old
- Keep messages personal and non-spammy
- Do not send promotional or cold-pitch messages — focus on genuine value
- Pause campaigns if you notice any LinkedIn warnings or restrictions

### Do Not Use GrowLeads To:

- Send spam, phishing, or scam messages
- DM people who have not shown any interest (GrowLeads only DMs commenters — maintain this)
- Circumvent LinkedIn's messaging restrictions
- Run on multiple accounts simultaneously (it's not designed for this)

### Account Safety Tips

- Do not run GrowLeads 24/7 — typical human LinkedIn usage has natural gaps
- Take breaks on weekends or holidays to mimic human patterns
- If LinkedIn asks you to verify your identity, pause all campaigns immediately
- Start with low limits (20–30 DMs/day) and increase gradually

---

## 13. Troubleshooting

### GrowLeads is not sending DMs

**Check 1: Is LinkedIn open?**
GrowLeads needs an active LinkedIn tab. Open `https://www.linkedin.com` in Chrome.

**Check 2: Are you logged in?**
GrowLeads uses your LinkedIn session. If you're logged out, it will log a warning and stop.

**Check 3: Is the campaign Active?**
Open the popup, go to Campaigns — make sure the status badge shows "Active" not "Paused".

**Check 4: Are you at the daily limit?**
Check the "Today" stat in the popup. If it equals your "Max DMs per day" setting, GrowLeads will wait until midnight.

**Check 5: Check the Activity Log**
Open the Activity Log tab — look for ❌ API errors or any warning messages.

---

### The post URL is not working

Make sure the URL is a full LinkedIn post URL. Copy it directly from LinkedIn using the "Copy link to post" option.

Supported formats:
- `https://www.linkedin.com/feed/update/urn:li:activity:XXXXXXXXXX/`
- `https://www.linkedin.com/posts/username_title-activity-XXXXXXXXXX-XXXX/`

Profile URLs, article URLs, and company page URLs are **not** supported.

---

### DMs are sending but no one is responding

This is a message quality issue, not a GrowLeads issue. Tips:
- Make the message feel personal and timely
- Reference the post topic specifically
- Make the lead magnet obviously relevant to what they commented on
- Keep the message short — under 200 characters if possible

---

### Activity log shows ❌ errors repeatedly

LinkedIn may be returning errors because:
- You've exceeded LinkedIn's internal rate limits (reduce your Settings limits)
- Your session has expired (log back in to LinkedIn)
- The post is no longer accessible (check the URL manually)
- LinkedIn has changed their API (check for GrowLeads updates)

---

### GrowLeads stopped working after Chrome restart

The extension resumes automatically. Make sure:
- LinkedIn is open in a tab
- The extension is still enabled (`chrome://extensions/`)
- You are still logged into LinkedIn

---

## 14. Frequently Asked Questions

**Q: Will the people I DM know it's automated?**
The DMs appear as normal LinkedIn messages from your account. There is no "sent via GrowLeads" tag or indicator.

---

**Q: Can I run campaigns on other people's posts, not just mine?**
Yes — GrowLeads monitors any post URL you provide. You can run campaigns on other people's viral posts to DM commenters. Make sure you have access to view the post.

---

**Q: What happens if someone comments multiple times on the same post?**
GrowLeads deduplicates by person, not by comment. If someone comments twice, they still only get one DM.

---

**Q: Can I edit a campaign after it's started?**
Yes. Click Edit on any campaign card. Changes take effect on the next poll cycle.

---

**Q: What happens to the dedup records if I edit the message template?**
Nothing — dedup records are tied to the campaign ID and the commenter's profile ID. Editing the template does not reset who has been contacted.

---

**Q: If I delete and recreate a campaign for the same post, will it re-DM everyone?**
Yes. Deleting a campaign removes its dedup records. People who received a DM in the old campaign will be treated as new in the recreated one.

---

**Q: Does GrowLeads work if Chrome is minimized?**
Yes. Chrome extensions continue to run while Chrome is minimized (as long as Chrome is open and not suspended by the OS).

---

**Q: Can I export my campaign data or sent DM records?**
Not through the popup UI. Advanced users can access the raw data via Chrome DevTools:
```
DevTools Console (on linkedin.com) → Run:
chrome.storage.local.get(null, (data) => console.log(JSON.stringify(data, null, 2)))
```

---

**Q: Does GrowLeads store my LinkedIn password?**
No. GrowLeads never touches your password. It uses the cookies from your active browser session — the same way LinkedIn's own website does.

---

**Q: What is the maximum number of campaigns I can run?**
There is no hard limit in the software. Practically, running more than 5–10 concurrent campaigns will slow down each poll cycle and increase LinkedIn API call frequency. Keep it reasonable.

---

**Q: Can I use GrowLeads on a LinkedIn company page?**
GrowLeads is designed for personal accounts (member-to-member DMs). Company page messaging uses a different API and is not supported in this version.
