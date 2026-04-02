/**
 * GrowLeads Debug Bridge — runs in MAIN world
 *
 * Exposes window.__GL__ so external tools (Claude browser automation,
 * DevTools console) can call GrowLeads functions that live in the
 * ISOLATED world content script.
 *
 * Communication: CustomEvents on window (shared between MAIN + ISOLATED worlds)
 *   MAIN  → ISOLATED:  window.dispatchEvent('__GL_CMD__',  { cmd, ...args, replyId })
 *   ISOLATED → MAIN:   window.dispatchEvent('__GL_REPLY_${replyId}', { result, error })
 */

window.__GL__ = (() => {
  function _call(cmd, args = {}) {
    return new Promise((resolve, reject) => {
      const replyId = '__GL_REPLY_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)

      window.addEventListener(replyId, e => {
        if (e.detail?.error) reject(new Error(e.detail.error))
        else resolve(e.detail?.result)
      }, { once: true })

      window.dispatchEvent(new CustomEvent('__GL_CMD__', {
        detail: { cmd, args, replyId }
      }))

      // Timeout after 15s
      setTimeout(() => reject(new Error(`GL command "${cmd}" timed out`)), 15000)
    })
  }

  return {
    /** Debug a post URL — returns { activityId, commenters, raw } */
    debug: (postUrl) => _call('debug', { postUrl }),

    /** Get all campaigns from storage */
    campaigns: () => _call('campaigns'),

    /** Get activity logs */
    logs: (limit = 50) => _call('logs', { limit }),

    /** Trigger a full poll cycle immediately */
    poll: () => _call('poll'),

    /** Get current settings */
    settings: () => _call('settings'),

    /** Run full automated health check */
    healthCheck: () => _call('healthCheck'),

    /** Check if the extension is connected (bridge is live) */
    ping: () => _call('ping')
  }
})()

console.log('[GrowLeads] Debug bridge ready. Use window.__GL__ to interact.')
