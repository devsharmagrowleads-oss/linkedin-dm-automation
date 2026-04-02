/**
 * GrowLeads Content Script — Core Automation Engine
 *
 * Injected on every linkedin.com page. Handles:
 *  1. Receiving poll triggers from the background service worker
 *  2. Fetching comments for each active campaign's post
 *  3. Filtering out already-DM'd commenters (dedup)
 *  4. Sending DMs with human-like random delays (rate limiting)
 *  5. Logging every action for the popup activity feed
 *
 * Dependencies (loaded before this file via manifest content_scripts order):
 *  - GrowLeadsStorage   (src/utils/storage.js)
 *  - GrowLeadsLogger    (src/utils/logger.js)
 *  - GrowLeadsLinkedInAPI (src/utils/linkedin-api.js)
 */

;(async () => {

  // ── Guard: only run if logged in ──────────────────────────────────────────

  if (!GrowLeadsLinkedInAPI.isLoggedIn()) {
    GrowLeadsLogger.warn('Not logged in to LinkedIn — automation paused.')
    return
  }

  // ── In-memory rate limiter ────────────────────────────────────────────────

  const RateLimiter = {
    _hourlyLog: [],   // timestamps of DMs sent in the last 60min

    async canSend() {
      const settings  = await GrowLeadsStorage.getSettings()
      const dailyCount = await GrowLeadsStorage.getDailyCount()

      if (dailyCount >= settings.maxDmsPerDay) {
        GrowLeadsLogger.warn('Daily DM limit reached', { dailyCount, max: settings.maxDmsPerDay })
        return false
      }

      const oneHourAgo = Date.now() - 3_600_000
      this._hourlyLog  = this._hourlyLog.filter(t => t > oneHourAgo)

      if (this._hourlyLog.length >= settings.maxDmsPerHour) {
        GrowLeadsLogger.warn('Hourly DM limit reached', {
          hourlyCount: this._hourlyLog.length,
          max: settings.maxDmsPerHour
        })
        return false
      }

      return true
    },

    recordSend() {
      this._hourlyLog.push(Date.now())
    },

    async randomDelay() {
      const settings = await GrowLeadsStorage.getSettings()
      const min  = settings.minDelayMs
      const max  = settings.maxDelayMs
      const delay = Math.floor(Math.random() * (max - min) + min)
      GrowLeadsLogger.rateLimit(null, delay)
      return delay
    }
  }

  // ── DM Queue — processes one DM at a time with delays ────────────────────

  let _isProcessing = false

  async function processDMQueue(queue) {
    if (_isProcessing) {
      GrowLeadsLogger.debug('DM queue already running — skipping duplicate trigger.')
      return
    }

    _isProcessing = true

    for (const job of queue) {
      const { campaignId, commenter, messageText } = job

      try {
        const canSend = await RateLimiter.canSend()
        if (!canSend) break // stop processing — limits hit

        // Send the DM
        await GrowLeadsLinkedInAPI.sendDM(commenter.profileId, messageText)

        // Record success
        await GrowLeadsStorage.markSent(campaignId, commenter.profileId, commenter.fullName)
        await GrowLeadsStorage.incrementDailyCount()
        RateLimiter.recordSend()

        GrowLeadsLogger.dmSent(campaignId, commenter.fullName, commenter.profileId)

        // Notify background to update campaign stats
        chrome.runtime.sendMessage({
          type:       'GL_DM_SENT',
          campaignId,
          profileId:  commenter.profileId
        })

        // Human-like delay before next DM
        const delay = await RateLimiter.randomDelay()
        await _sleep(delay)

      } catch (err) {
        GrowLeadsLogger.apiError(campaignId, err.message)
        // Continue with next job — one failure shouldn't stop the queue
        await _sleep(5000) // brief pause after error
      }
    }

    _isProcessing = false
  }

  // ── Poll a single campaign ─────────────────────────────────────────────────

  async function pollCampaign(campaign) {
    GrowLeadsLogger.pollStart(campaign.id, campaign.postUrl)

    const activityId = GrowLeadsLinkedInAPI.extractActivityId(campaign.postUrl)
    if (!activityId) {
      GrowLeadsLogger.error('Could not extract activity ID from post URL', {
        campaignId: campaign.id,
        postUrl:    campaign.postUrl
      })
      return []
    }

    let allCommenters
    try {
      allCommenters = await GrowLeadsLinkedInAPI.getAllCommenters(activityId)
    } catch (err) {
      GrowLeadsLogger.apiError(campaign.id, `getAllCommenters: ${err.message}`)
      return []
    }

    GrowLeadsLogger.pollResult(campaign.id, allCommenters.length, allCommenters.length)

    // Filter: remove people we already DM'd in this campaign
    const newCommenters = []
    for (const commenter of allCommenters) {
      const sent = await GrowLeadsStorage.isAlreadySent(campaign.id, commenter.profileId)
      if (!sent) newCommenters.push(commenter)
      else GrowLeadsLogger.dmSkipped(campaign.id, commenter.fullName, 'already sent')
    }

    if (newCommenters.length === 0) {
      GrowLeadsLogger.debug('No new commenters found', { campaignId: campaign.id })
      return []
    }

    GrowLeadsLogger.info(`${newCommenters.length} new commenter(s) queued for DM`, {
      campaignId: campaign.id
    })

    // Build DM queue jobs
    return newCommenters.map(commenter => ({
      campaignId: campaign.id,
      commenter,
      messageText: GrowLeadsLinkedInAPI.buildMessage(campaign.messageTemplate, {
        firstName:   commenter.firstName,
        fullName:    commenter.fullName,
        resourceUrl: campaign.resourceUrl
      })
    }))
  }

  // ── Main poll cycle — runs on every alarm tick ────────────────────────────

  async function runPollCycle() {
    // Always refresh CSRF token before any LinkedIn API calls.
    // JSESSIONID is httpOnly so we must go through the service worker.
    const csrf = await GrowLeadsLinkedInAPI.refreshCSRF()
    if (!csrf) {
      GrowLeadsLogger.error('Poll aborted — CSRF token unavailable. Ensure you are logged in to LinkedIn.')
      return
    }

    const campaigns = await GrowLeadsStorage.getCampaigns()
    const active    = campaigns.filter(c => c.status === 'active')

    if (active.length === 0) {
      GrowLeadsLogger.debug('No active campaigns — nothing to poll.')
      return
    }

    const allJobs = []

    for (const campaign of active) {
      const jobs = await pollCampaign(campaign)
      allJobs.push(...jobs)
      // Small pause between campaigns to avoid API hammering
      if (active.indexOf(campaign) < active.length - 1) {
        await _sleep(2000)
      }
    }

    if (allJobs.length > 0) {
      await processDMQueue(allJobs)
    }
  }

  // ── Message listener — receives triggers from service worker ──────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GL_POLL_CAMPAIGNS') {
      runPollCycle()
        .then(() => sendResponse({ ok: true }))
        .catch(err => {
          GrowLeadsLogger.error('Poll cycle failed', { error: err.message })
          sendResponse({ ok: false, error: err.message })
        })
      return true // async response
    }
  })

  // ── Debug bridge — receives commands from MAIN world (window.__GL__) ──────
  // CustomEvents are shared between ISOLATED + MAIN worlds via the window object.

  window.addEventListener('__GL_CMD__', async e => {
    const { cmd, args = {}, replyId } = e.detail || {}
    if (!replyId) return

    function reply(result, error) {
      window.dispatchEvent(new CustomEvent(replyId, {
        detail: error ? { error: String(error) } : { result }
      }))
    }

    try {
      switch (cmd) {
        case 'ping':
          reply({ ok: true, version: '1.0.0', loggedIn: GrowLeadsLinkedInAPI.isLoggedIn() })
          break

        case 'debug': {
          const activityId = GrowLeadsLinkedInAPI.extractActivityId(args.postUrl || '')
          if (!activityId) { reply(null, 'Could not extract activity ID from URL'); break }
          const commenters = await GrowLeadsLinkedInAPI.getAllCommenters(activityId)
          reply({ activityId, commenters, csrfToken: !!GrowLeadsLinkedInAPI.getCSRFToken() })
          break
        }

        case 'campaigns':
          reply(await GrowLeadsStorage.getCampaigns())
          break

        case 'logs':
          reply(await GrowLeadsStorage.getLogs(args.limit || 50))
          break

        case 'settings':
          reply(await GrowLeadsStorage.getSettings())
          break

        case 'poll':
          await runPollCycle()
          reply({ ok: true })
          break

        case 'healthCheck': {
          const csrf = await GrowLeadsLinkedInAPI.refreshCSRF()
          const [campaigns, settings, logs, daily] = await Promise.all([
            GrowLeadsStorage.getCampaigns(),
            GrowLeadsStorage.getSettings(),
            GrowLeadsStorage.getLogs(5),
            GrowLeadsStorage.getDailyCount()
          ])
          reply({
            csrfTokenFound:  !!csrf,
            csrfSource:      csrf ? (document.cookie.includes('JSESSIONID') ? 'cookie' : 'serviceWorker') : 'none',
            campaignCount:   campaigns.length,
            activeCampaigns: campaigns.filter(c => c.status === 'active').length,
            dmsSentToday:    daily,
            maxDmsPerDay:    settings.maxDmsPerDay,
            pollEvery:       settings.pollIntervalMinutes + ' min',
            recentLogs:      logs.map(l => `[${l.level}] ${l.message}`)
          })
          break
        }

        default:
          reply(null, `Unknown command: ${cmd}`)
      }
    } catch (err) {
      reply(null, err.message)
    }
  })

  // ── Helper ────────────────────────────────────────────────────────────────

  function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ── Boot: run once immediately when tab loads, then wait for alarms ───────

  GrowLeadsLogger.info('GrowLeads content script loaded. Waiting for poll triggers.')

})()
