/**
 * GrowLeads Storage Utility
 * Chrome storage wrapper for campaigns, DM logs, and settings.
 * Loaded as a classic content script — exposes GrowLeadsStorage globally.
 */
const GrowLeadsStorage = (() => {
  const KEYS = {
    CAMPAIGNS: 'gl_campaigns',
    SENT_DMS:  'gl_sent_dms',
    LOGS:      'gl_logs',
    SETTINGS:  'gl_settings'
  }

  // ── Campaigns ────────────────────────────────────────────────────────────

  async function getCampaigns() {
    const r = await chrome.storage.local.get(KEYS.CAMPAIGNS)
    return r[KEYS.CAMPAIGNS] || []
  }

  async function saveCampaign(campaign) {
    const campaigns = await getCampaigns()
    const idx = campaigns.findIndex(c => c.id === campaign.id)
    if (idx >= 0) campaigns[idx] = campaign
    else campaigns.push(campaign)
    await chrome.storage.local.set({ [KEYS.CAMPAIGNS]: campaigns })
    return campaign
  }

  async function updateCampaignStats(campaignId, delta = {}) {
    const campaigns = await getCampaigns()
    const idx = campaigns.findIndex(c => c.id === campaignId)
    if (idx < 0) return
    const c = campaigns[idx]
    if (delta.dmsSent)  c.dmsSent  = (c.dmsSent  || 0) + delta.dmsSent
    if (delta.lastActive) c.lastActive = delta.lastActive
    campaigns[idx] = c
    await chrome.storage.local.set({ [KEYS.CAMPAIGNS]: campaigns })
  }

  async function deleteCampaign(id) {
    const campaigns = await getCampaigns()
    await chrome.storage.local.set({
      [KEYS.CAMPAIGNS]: campaigns.filter(c => c.id !== id)
    })
    // Clean up sent DM log for this campaign
    const r = await chrome.storage.local.get(KEYS.SENT_DMS)
    const all = r[KEYS.SENT_DMS] || {}
    delete all[id]
    await chrome.storage.local.set({ [KEYS.SENT_DMS]: all })
  }

  // ── Sent DMs (dedup per campaign) ────────────────────────────────────────

  async function isAlreadySent(campaignId, profileId) {
    const r = await chrome.storage.local.get(KEYS.SENT_DMS)
    const sent = (r[KEYS.SENT_DMS] || {})[campaignId] || []
    return sent.some(s => s.profileId === profileId)
  }

  async function markSent(campaignId, profileId, name) {
    const r = await chrome.storage.local.get(KEYS.SENT_DMS)
    const all = r[KEYS.SENT_DMS] || {}
    if (!all[campaignId]) all[campaignId] = []
    all[campaignId].push({ profileId, name, sentAt: Date.now() })
    await chrome.storage.local.set({ [KEYS.SENT_DMS]: all })
  }

  async function getSentCount(campaignId) {
    const r = await chrome.storage.local.get(KEYS.SENT_DMS)
    return ((r[KEYS.SENT_DMS] || {})[campaignId] || []).length
  }

  // ── Activity Logs ─────────────────────────────────────────────────────────

  async function addLog(entry) {
    const r = await chrome.storage.local.get(KEYS.LOGS)
    const logs = r[KEYS.LOGS] || []
    logs.unshift({ ...entry, ts: Date.now() })
    await chrome.storage.local.set({ [KEYS.LOGS]: logs.slice(0, 300) })
  }

  async function getLogs(limit = 50) {
    const r = await chrome.storage.local.get(KEYS.LOGS)
    return (r[KEYS.LOGS] || []).slice(0, limit)
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async function getSettings() {
    const r = await chrome.storage.local.get(KEYS.SETTINGS)
    return r[KEYS.SETTINGS] || {
      minDelayMs:          30000,  // 30s min between DMs
      maxDelayMs:          90000,  // 90s max between DMs
      maxDmsPerHour:       15,
      maxDmsPerDay:        100,
      pollIntervalMinutes: 2
    }
  }

  async function saveSettings(settings) {
    await chrome.storage.local.set({ [KEYS.SETTINGS]: settings })
  }

  // ── Daily DM counter ──────────────────────────────────────────────────────

  async function getDailyCount() {
    const r = await chrome.storage.local.get('gl_daily')
    const data = r.gl_daily || { date: '', count: 0 }
    const today = new Date().toISOString().slice(0, 10)
    if (data.date !== today) return 0
    return data.count
  }

  async function incrementDailyCount() {
    const today = new Date().toISOString().slice(0, 10)
    const r = await chrome.storage.local.get('gl_daily')
    const data = r.gl_daily || { date: '', count: 0 }
    const count = data.date === today ? data.count + 1 : 1
    await chrome.storage.local.set({ gl_daily: { date: today, count } })
    return count
  }

  return {
    KEYS,
    getCampaigns,
    saveCampaign,
    updateCampaignStats,
    deleteCampaign,
    isAlreadySent,
    markSent,
    getSentCount,
    addLog,
    getLogs,
    getSettings,
    saveSettings,
    getDailyCount,
    incrementDailyCount
  }
})()
