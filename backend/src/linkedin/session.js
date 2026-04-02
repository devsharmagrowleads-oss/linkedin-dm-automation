/**
 * LinkedIn Session Manager
 *
 * Manages LinkedIn authentication entirely server-side using the li_at cookie.
 * No browser required. No extension required.
 *
 * How it works:
 *   1. User provides their li_at cookie (30-second one-time setup)
 *   2. We make a lightweight GET to linkedin.com to obtain a fresh JSESSIONID
 *   3. JSESSIONID value = CSRF token for all subsequent Voyager API calls
 *   4. Session refreshes automatically every 25 minutes
 *
 * Why li_at works:
 *   li_at is LinkedIn's persistent auth token (valid for ~1 year).
 *   JSESSIONID is the short-lived CSRF token derived from it.
 *   We refresh JSESSIONID on the server without any browser interaction.
 */

import { logger } from '../logger.js'

const SESSION_TTL_MS    = 25 * 60 * 1000 // refresh every 25 min
const LINKEDIN_BASE_URL = 'https://www.linkedin.com'

// Base headers that mimic a real Chrome browser on Windows
const BASE_HEADERS = {
  'user-agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  'accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'sec-fetch-site':  'none',
  'sec-fetch-mode':  'navigate',
  'sec-fetch-user':  '?1',
  'sec-ch-ua':       '"Chromium";v="124", "Google Chrome";v="124"',
  'sec-ch-ua-mobile':'?0',
  'sec-ch-ua-platform': '"Windows"'
}

export class LinkedInSession {
  constructor(liAt, accountId, jsessionId = null) {
    this.liAt        = liAt
    this.accountId   = accountId
    this.jsessionId  = jsessionId
    this.lastRefresh = jsessionId ? Date.now() : 0  // treat pre-seeded JSESSIONID as fresh
  }

  // ── Session Initialization ─────────────────────────────────────────────────

  /**
   * Initializes or refreshes the session.
   * Makes a GET to linkedin.com and extracts JSESSIONID from Set-Cookie.
   * Must be called before any API requests.
   */
  async refresh() {
    logger.info({ accountId: this.accountId }, 'Refreshing LinkedIn session')

    // /uas/authenticate is a lightweight endpoint that reliably sets JSESSIONID
    // without redirect loops that occur when hitting the root LinkedIn URL server-side.
    const endpoints = [
      `${LINKEDIN_BASE_URL}/uas/authenticate`,
      `${LINKEDIN_BASE_URL}/voyager/api/voyagerIdentityDashProfileComponents?q=me`,
    ]

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method:   'GET',
          headers:  { ...BASE_HEADERS, cookie: `li_at=${this.liAt}` },
          redirect: 'manual'   // avoid redirect loops
        })
        const jsessionId = this._extractJsessionId(res)
        if (jsessionId) {
          this.jsessionId  = jsessionId
          this.lastRefresh = Date.now()
          logger.info({ accountId: this.accountId }, 'LinkedIn session refreshed successfully')
          return this.jsessionId
        }
      } catch (_) {}
    }

    const err = new Error('Could not obtain JSESSIONID — li_at may be expired')
    logger.error({ accountId: this.accountId, err: err.message }, 'Session refresh failed')
    throw err
  }

  _extractJsessionId(res) {
    // Node 18+ — getSetCookie() returns all Set-Cookie headers as an array
    const setCookies = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie') || '']

    for (const header of setCookies) {
      const match = header.match(/JSESSIONID="?([^";,\s]+)"?/i)
      if (match) return match[1]
    }
    return null
  }

  // ── Session Validity ───────────────────────────────────────────────────────

  isExpired() {
    return !this.jsessionId || (Date.now() - this.lastRefresh) > SESSION_TTL_MS
  }

  async ensureValid() {
    if (this.isExpired()) await this.refresh()
  }

  // ── Headers for Voyager API calls ─────────────────────────────────────────

  getApiHeaders() {
    if (!this.jsessionId) throw new Error('Session not initialized — call refresh() first')

    return {
      'accept':                    'application/vnd.linkedin.normalized+json+2.1',
      'content-type':              'application/json',
      'csrf-token':                this.jsessionId,
      'cookie':                    `li_at=${this.liAt}; JSESSIONID="${this.jsessionId}"`,
      'user-agent':                BASE_HEADERS['user-agent'],
      'accept-language':           BASE_HEADERS['accept-language'],
      'x-li-lang':                 'en_US',
      'x-li-track':                JSON.stringify({
        clientVersion:    '1.13.14450',
        mpVersion:        '1.13.14450',
        osName:           'web',
        timezoneOffset:   0,
        timezone:         'UTC',
        deviceFormFactor: 'DESKTOP',
        mpName:           'voyager-web'
      }),
      'x-li-page-instance':        `urn:li:page:d_flagship3_feed;${_randomId()}`,
      'x-restli-protocol-version': '2.0.0',
      'referer':                   'https://www.linkedin.com/feed/'
    }
  }
}

// In-memory session pool — one session object per LinkedIn account
const _sessionPool = new Map()

export function getSession(liAt, accountId, jsessionId = null) {
  if (!_sessionPool.has(accountId)) {
    _sessionPool.set(accountId, new LinkedInSession(liAt, accountId, jsessionId))
  }
  const session = _sessionPool.get(accountId)
  // Update credentials in case they were rotated
  session.liAt = liAt
  if (jsessionId) {
    session.jsessionId  = jsessionId
    session.lastRefresh = Date.now()
  }
  return session
}

export function invalidateSession(accountId) {
  _sessionPool.delete(accountId)
}

function _randomId() {
  return Math.random().toString(36).slice(2, 18)
}
