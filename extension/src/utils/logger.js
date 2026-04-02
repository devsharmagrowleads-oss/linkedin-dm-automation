/**
 * GrowLeads Structured Logger
 * Writes to console (structured JSON) and persists to chrome.storage for
 * the popup activity feed. Designed as the observability foundation —
 * every automation action produces a log entry with campaign context.
 */
const GrowLeadsLogger = (() => {
  const PREFIX = '[GrowLeads]'

  const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }
  let currentLevel = LEVELS.INFO

  function format(level, message, meta = {}) {
    return {
      level,
      message,
      ...meta,
      ts: Date.now(),
      source: 'extension'
    }
  }

  function toConsole(level, entry) {
    const line = `${PREFIX} [${level}] ${entry.message}`
    const meta = { ...entry }
    delete meta.message
    delete meta.level
    delete meta.source

    if (level === 'ERROR') console.error(line, meta)
    else if (level === 'WARN')  console.warn(line, meta)
    else if (level === 'DEBUG') console.debug(line, meta)
    else                        console.log(line, meta)
  }

  async function persist(entry) {
    // Only persist INFO and above to storage (avoid flooding with DEBUG)
    if (LEVELS[entry.level] < LEVELS.INFO) return
    try {
      // GrowLeadsStorage may not be available in service worker context
      if (typeof GrowLeadsStorage !== 'undefined') {
        await GrowLeadsStorage.addLog(entry)
      } else {
        // Fallback: write directly
        const r = await chrome.storage.local.get('gl_logs')
        const logs = r.gl_logs || []
        logs.unshift(entry)
        await chrome.storage.local.set({ gl_logs: logs.slice(0, 300) })
      }
    } catch (_) { /* non-critical */ }
  }

  function log(level, message, meta = {}) {
    if (LEVELS[level] < currentLevel) return
    const entry = format(level, message, meta)
    toConsole(level, entry)
    persist(entry)
    return entry
  }

  return {
    setLevel(level) { currentLevel = LEVELS[level] ?? LEVELS.INFO },
    debug: (msg, meta) => log('DEBUG', msg, meta),
    info:  (msg, meta) => log('INFO',  msg, meta),
    warn:  (msg, meta) => log('WARN',  msg, meta),
    error: (msg, meta) => log('ERROR', msg, meta),

    // Shorthand helpers for common automation events
    dmSent:      (campaignId, name, profileId) =>
      log('INFO', `DM sent to ${name}`, { campaignId, profileId, action: 'dm_sent' }),
    dmSkipped:   (campaignId, name, reason) =>
      log('INFO', `Skipped ${name}: ${reason}`, { campaignId, action: 'dm_skipped', reason }),
    pollStart:   (campaignId, postUrl) =>
      log('DEBUG', 'Poll started', { campaignId, postUrl, action: 'poll_start' }),
    pollResult:  (campaignId, newCount, totalCount) =>
      log('INFO', `Poll: ${newCount} new commenter(s) found`, { campaignId, newCount, totalCount, action: 'poll_result' }),
    rateLimit:   (campaignId, delayMs) =>
      log('WARN', `Rate limit delay: ${Math.round(delayMs / 1000)}s`, { campaignId, delayMs, action: 'rate_limit' }),
    apiError:    (campaignId, error) =>
      log('ERROR', `API error: ${error}`, { campaignId, error, action: 'api_error' })
  }
})()
