/**
 * GrowLeads LinkedIn API Utility
 *
 * Wraps LinkedIn's internal Voyager API endpoints.
 * All requests are made from the content script context so LinkedIn session
 * cookies are automatically attached — no credential storage needed.
 *
 * IMPORTANT: LinkedIn's internal API is undocumented and may change.
 * These endpoints mirror what LinkedIn's own frontend uses.
 */
const GrowLeadsLinkedInAPI = (() => {

  // ── CSRF Token ─────────────────────────────────────────────────────────────
  //
  // LinkedIn's JSESSIONID is httpOnly — document.cookie CANNOT read it.
  // We fetch it via the background service worker which uses chrome.cookies API
  // (the only way to read httpOnly cookies from an extension).
  // Call refreshCSRF() once before any poll cycle to populate the cache.

  let _csrfCache = null

  /**
   * Refreshes the CSRF token cache.
   * 1. Tries document.cookie first (works in some LinkedIn regions / older sessions)
   * 2. Falls back to background service worker chrome.cookies API (handles httpOnly)
   * Must be called (and awaited) before making any API requests.
   */
  async function refreshCSRF() {
    // Attempt 1: document.cookie (non-httpOnly environments)
    const cookieMatch = document.cookie.match(/JSESSIONID=(?:"([^"]+)"|([^;]+))/)
    if (cookieMatch) {
      _csrfCache = (cookieMatch[1] || cookieMatch[2]).trim()
      GrowLeadsLogger.debug('CSRF token read from document.cookie')
      return _csrfCache
    }

    // Attempt 2: ask background service worker (handles httpOnly JSESSIONID)
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'GL_GET_CSRF_TOKEN' }, res => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
          else resolve(res)
        })
      })
      if (response?.token) {
        _csrfCache = response.token
        GrowLeadsLogger.debug('CSRF token fetched from service worker (httpOnly fallback)')
        return _csrfCache
      }
    } catch (err) {
      GrowLeadsLogger.warn('Service worker CSRF fallback failed', { error: err.message })
    }

    _csrfCache = null
    GrowLeadsLogger.error('CSRF token unavailable — are you logged in to LinkedIn?')
    return null
  }

  function getCSRFToken() {
    return _csrfCache
  }

  function buildHeaders() {
    const csrf = _csrfCache
    if (!csrf) throw new Error('CSRF token not in cache — call refreshCSRF() first.')

    return {
      'accept':                      'application/vnd.linkedin.normalized+json+2.1',
      'content-type':                'application/json',
      'csrf-token':                  csrf,
      'x-li-lang':                   'en_US',
      'x-li-page-instance':          `urn:li:page:d_flagship3_feed;${_randomId()}`,
      'x-li-track':                  JSON.stringify({
        clientVersion:    '1.13.14450',
        mpVersion:        '1.13.14450',
        osName:           'web',
        timezoneOffset:   new Date().getTimezoneOffset() / -60,
        timezone:         Intl.DateTimeFormat().resolvedOptions().timeZone,
        deviceFormFactor: 'DESKTOP',
        mpName:           'voyager-web'
      }),
      'x-restli-protocol-version':   '2.0.0'
    }
  }

  function _randomId() {
    return Math.random().toString(36).slice(2, 18)
  }

  // ── Post URL → Activity ID ────────────────────────────────────────────────

  /**
   * Extracts the LinkedIn activity ID from a post URL.
   *
   * Supported formats:
   *   https://www.linkedin.com/feed/update/urn:li:activity:7123456789/
   *   https://www.linkedin.com/posts/john-doe_keywords-activity-7123456789-XXXX/
   *   https://www.linkedin.com/posts/john-doe_keywords-activity-7123456789/   (no trailing suffix)
   */
  function extractActivityId(postUrl) {
    // urn:li:activity:DIGITS — handles both raw colons and %3A encoding
    const urnMatch = postUrl.match(/urn(?::|%3A)li(?::|%3A)activity(?::|%3A)(\d+)/i)
    if (urnMatch) return urnMatch[1]

    // -activity-DIGITS- OR -activity-DIGITS (end/slash)
    const postsMatch = postUrl.match(/[_-]activity-(\d+)(?:-|\/|$)/)
    if (postsMatch) return postsMatch[1]

    return null
  }

  // ── Comments API ──────────────────────────────────────────────────────────

  async function fetchCommentPage(activityId, start = 0, count = 100) {
    const urn = encodeURIComponent(`urn:li:activity:${activityId}`)
    const url  = `/voyager/api/feed/comments?updateId=${urn}&count=${count}&start=${start}`

    const res = await fetch(url, {
      method:      'GET',
      headers:     buildHeaders(),
      credentials: 'include'
    })

    if (!res.ok) {
      // Log partial body to help diagnose 401/403/429 etc.
      const errBody = await res.text().catch(() => '')
      GrowLeadsLogger.error('Comments API error', {
        status:     res.status,
        activityId,
        bodySnippet: errBody.slice(0, 200)
      })
      throw new Error(`Comments API ${res.status} — ${errBody.slice(0, 100)}`)
    }

    return res.json()
  }

  /**
   * Fetches ALL comments for a post, handling pagination automatically.
   * Returns an array of commenter objects: { profileId, firstName, fullName, profileUrn }
   *
   * LinkedIn normalized JSON structure:
   *   data.data.elements  → array of URN strings (NOT objects — common mistake)
   *   data.included[]     → mixed array of Comment + MiniProfile objects
   *     Comment:     { $type: "...Comment", actor: "urn:li:person:XXX", ... }
   *     MiniProfile: { $type: "...MiniProfile", objectUrn: "urn:li:person:XXX",
   *                    firstName: "John", lastName: "Doe" }
   *
   * actor in a Comment is a plain URN string — names must be looked up
   * from the MiniProfile objects by matching objectUrn.
   */
  async function getAllCommenters(activityId) {
    const commenters = new Map()
    let start = 0
    const count = 100

    while (true) {
      let data
      try {
        data = await fetchCommentPage(activityId, start, count)
      } catch (err) {
        GrowLeadsLogger.error('fetchCommentPage failed', { activityId, start, error: err.message })
        break
      }

      const included = data?.included || []

      // Step 1: Build a lookup map of person profiles keyed by person URN
      // MiniProfile.$type examples:
      //   "com.linkedin.voyager.identity.shared.MiniProfile"
      //   "com.linkedin.voyager.dash.identity.profile.Profile"
      const profileMap = new Map()
      for (const item of included) {
        const type = item['$type'] || ''
        if (!type.toLowerCase().includes('profile')) continue

        // objectUrn is the canonical person URN: urn:li:person:XXX
        const personUrn = item.objectUrn || item.entityUrn || ''
        if (!personUrn.includes('urn:li:person:')) continue

        profileMap.set(personUrn, {
          firstName: item.firstName || 'there',
          lastName:  item.lastName  || '',
          fullName:  `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'there'
        })
      }

      // Step 2: Find all Comment objects in included[]
      // Comment.$type examples:
      //   "com.linkedin.voyager.feed.Comment"
      //   "com.linkedin.voyager.dash.feed.Comment"
      const commentsBefore = commenters.size
      for (const item of included) {
        const type = item['$type'] || ''
        if (!type.toLowerCase().includes('comment')) continue

        // actor is a plain URN string: "urn:li:person:ABC123"
        const actorUrn = typeof item.actor === 'string'
          ? item.actor
          : (item.actor?.entityUrn || item.actor?.urn || '')

        const profileIdMatch = actorUrn.match(/urn:li:person:([^,)]+)/)
        if (!profileIdMatch) continue

        const profileId  = profileIdMatch[1]
        const personUrn  = `urn:li:person:${profileId}`
        const profile    = profileMap.get(personUrn)

        commenters.set(profileId, {
          profileId,
          firstName:  profile?.firstName || 'there',
          fullName:   profile?.fullName  || profile?.firstName || 'there',
          profileUrn: personUrn
        })
      }

      const total      = data?.data?.paging?.total ?? data?.paging?.total ?? 0
      const foundInPage = commenters.size - commentsBefore
      start += count

      GrowLeadsLogger.debug('Comment page parsed', {
        activityId, start, foundInPage, total,
        includedCount: included.length
      })

      if (foundInPage === 0 || start >= total) break

      await _sleep(1200)
    }

    return Array.from(commenters.values())
  }

  // ── Messaging API ─────────────────────────────────────────────────────────

  /**
   * Sends a DM to a LinkedIn member via the Voyager messaging API.
   * Uses the authenticated user's existing session — no OAuth needed.
   */
  async function sendDM(recipientProfileId, messageText) {
    const recipientUrn = recipientProfileId.startsWith('urn:li:person:')
      ? recipientProfileId
      : `urn:li:person:${recipientProfileId}`

    const payload = {
      keyVersion: 'LEGACY_INBOX',
      conversationCreate: {
        eventCreate: {
          value: {
            'com.linkedin.voyager.messaging.create.MessageCreate': {
              attributedBody: {
                text:       messageText,
                attributes: []
              },
              attachments: []
            }
          }
        },
        recipients: [recipientUrn],
        subtype:    'MEMBER_TO_MEMBER'
      }
    }

    const res = await fetch('/voyager/api/messaging/conversations', {
      method:      'POST',
      headers:     buildHeaders(),
      credentials: 'include',
      body:        JSON.stringify(payload)
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Messaging API returned ${res.status}: ${body.slice(0, 200)}`)
    }

    return res.json()
  }

  // ── Message Template ──────────────────────────────────────────────────────

  /**
   * Interpolates a message template with commenter data.
   * Supported variables: {firstName}, {fullName}, {resourceUrl}
   */
  function buildMessage(template, vars = {}) {
    return template
      .replace(/\{firstName\}/gi,   vars.firstName   || 'there')
      .replace(/\{fullName\}/gi,    vars.fullName    || vars.firstName || 'there')
      .replace(/\{resourceUrl\}/gi, vars.resourceUrl || '')
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  function isLoggedIn() {
    return !!getCSRFToken()
  }

  /**
   * Debug helper — call from DevTools console to inspect the raw API response
   * for a given post URL and check what LinkedIn actually returns.
   *
   * Usage (in LinkedIn DevTools console):
   *   GrowLeadsLinkedInAPI.debugPost('https://www.linkedin.com/posts/...')
   */
  async function debugPost(postUrl) {
    const activityId = extractActivityId(postUrl)
    if (!activityId) {
      console.error('[GrowLeads Debug] Could not extract activity ID from:', postUrl)
      return null
    }
    console.log('[GrowLeads Debug] Activity ID:', activityId)
    console.log('[GrowLeads Debug] CSRF token:', getCSRFToken())

    try {
      const data = await fetchCommentPage(activityId, 0, 10)
      console.log('[GrowLeads Debug] Raw API response:', data)
      console.log('[GrowLeads Debug] included count:', data?.included?.length ?? 0)
      console.log('[GrowLeads Debug] paging total:', data?.data?.paging?.total ?? data?.paging?.total ?? 0)

      const commenters = await getAllCommenters(activityId)
      console.log('[GrowLeads Debug] Parsed commenters:', commenters)
      return { activityId, raw: data, commenters }
    } catch (err) {
      console.error('[GrowLeads Debug] Error:', err)
      return null
    }
  }

  return {
    extractActivityId,
    getAllCommenters,
    sendDM,
    buildMessage,
    isLoggedIn,
    getCSRFToken,
    refreshCSRF,
    debugPost
  }
})()
