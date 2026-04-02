/**
 * LinkedIn Voyager API Client (Server-Side)
 *
 * All calls run on the backend using li_at + JSESSIONID session.
 * No browser. No extension. Pure HTTP.
 */

import { logger } from '../logger.js'

const BASE_URL = 'https://www.linkedin.com'

// ── Activity ID Extraction ───────────────────────────────────────────────────

export function extractActivityId(postUrl) {
  // https://www.linkedin.com/feed/update/urn:li:activity:7123456789/
  const urnMatch = postUrl.match(/urn(?::|%3A)li(?::|%3A)activity(?::|%3A)(\d+)/i)
  if (urnMatch) return urnMatch[1]

  // https://www.linkedin.com/posts/...-activity-7123456789-XXXX/
  const postsMatch = postUrl.match(/[_-]activity-(\d+)(?:-|\/|$)/)
  if (postsMatch) return postsMatch[1]

  return null
}

// ── Comments API ─────────────────────────────────────────────────────────────

/**
 * Fetches all commenters for a LinkedIn post.
 *
 * LinkedIn normalized JSON response structure:
 *   data.data.elements  → array of URN strings (NOT comment objects)
 *   data.included[]     → mix of Comment + MiniProfile objects
 *     Comment:     { $type: "...Comment", actor: "urn:li:person:XXX" }
 *     MiniProfile: { $type: "...MiniProfile", objectUrn: "urn:li:person:XXX",
 *                    firstName, lastName }
 *
 * Returns: Array<{ profileId, firstName, fullName, profileUrn }>
 */
export async function getAllCommenters(session, activityId) {
  await session.ensureValid()

  const commenters = new Map()
  let start = 0
  const count = 100

  while (true) {
    const urn  = encodeURIComponent(`urn:li:activity:${activityId}`)
    const url  = `${BASE_URL}/voyager/api/feed/comments?updateId=${urn}&count=${count}&start=${start}`

    let data
    try {
      const res = await fetch(url, {
        method:  'GET',
        headers: session.getApiHeaders()
      })

      if (res.status === 401 || res.status === 403) {
        // Session expired — force refresh and retry once
        logger.warn({ activityId, status: res.status }, 'Session expired, refreshing...')
        await session.refresh()
        const retryRes = await fetch(url, { method: 'GET', headers: session.getApiHeaders() })
        if (!retryRes.ok) {
          const body = await retryRes.text().catch(() => '')
          throw new Error(`Comments API ${retryRes.status} after session refresh: ${body.slice(0, 150)}`)
        }
        data = await retryRes.json()
      } else if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Comments API ${res.status}: ${body.slice(0, 150)}`)
      } else {
        data = await res.json()
      }

    } catch (err) {
      logger.error({ activityId, start, err: err.message }, 'fetchCommentPage failed')
      break
    }

    const included = data?.included || []

    // Step 1: Build profile lookup map from MiniProfile entries
    // MiniProfile.$type: "com.linkedin.voyager.identity.shared.MiniProfile"
    const profileMap = new Map()
    for (const item of included) {
      const type = item['$type'] || ''
      if (!type.toLowerCase().includes('profile')) continue
      const personUrn = item.objectUrn || item.entityUrn || ''
      if (!personUrn.includes('urn:li:person:')) continue
      profileMap.set(personUrn, {
        firstName: item.firstName || 'there',
        lastName:  item.lastName  || '',
        fullName:  `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'there'
      })
    }

    // Step 2: Extract commenter URNs from Comment entries
    // Comment.actor is a plain URN string: "urn:li:person:ABC123"
    let newInPage = 0
    for (const item of included) {
      const type = item['$type'] || ''
      if (!type.toLowerCase().includes('comment')) continue

      const actorUrn = typeof item.actor === 'string'
        ? item.actor
        : (item.actor?.entityUrn || item.actor?.urn || '')

      const profileIdMatch = actorUrn.match(/urn:li:person:([^,)]+)/)
      if (!profileIdMatch) continue

      const profileId = profileIdMatch[1]
      const personUrn = `urn:li:person:${profileId}`
      const profile   = profileMap.get(personUrn)

      if (!commenters.has(profileId)) {
        commenters.set(profileId, {
          profileId,
          firstName:  profile?.firstName || 'there',
          lastName:   profile?.lastName  || '',
          fullName:   profile?.fullName  || profile?.firstName || 'there',
          profileUrn: personUrn
        })
        newInPage++
      }
    }

    const total = data?.data?.paging?.total ?? data?.paging?.total ?? 0
    start += count

    logger.debug({ activityId, start, newInPage, total, includedCount: included.length }, 'Comment page parsed')

    if (newInPage === 0 || start >= total) break
    await _sleep(1200)
  }

  return Array.from(commenters.values())
}

// ── Messaging API ─────────────────────────────────────────────────────────────

export async function sendDM(session, profileId, messageText) {
  await session.ensureValid()

  const recipientUrn = profileId.startsWith('urn:li:person:')
    ? profileId
    : `urn:li:person:${profileId}`

  const payload = {
    keyVersion: 'LEGACY_INBOX',
    conversationCreate: {
      eventCreate: {
        value: {
          'com.linkedin.voyager.messaging.create.MessageCreate': {
            attributedBody: { text: messageText, attributes: [] },
            attachments:    []
          }
        }
      },
      recipients: [recipientUrn],
      subtype:    'MEMBER_TO_MEMBER'
    }
  }

  const res = await fetch(`${BASE_URL}/voyager/api/messaging/conversations`, {
    method:  'POST',
    headers: session.getApiHeaders(),
    body:    JSON.stringify(payload)
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Messaging API ${res.status}: ${body.slice(0, 200)}`)
  }

  return res.json()
}

// ── Profile Verification ──────────────────────────────────────────────────────

/**
 * Verifies a li_at token is valid by calling /voyager/api/me.
 * Returns the user's profile info on success, null on failure.
 */
export async function verifySession(session) {
  try {
    await session.refresh()
    const res = await fetch(`${BASE_URL}/voyager/api/me`, {
      method:  'GET',
      headers: session.getApiHeaders()
    })
    if (!res.ok) return null
    const data = await res.json()
    const profile = data?.included?.find(i =>
      (i['$type'] || '').toLowerCase().includes('miniprofile')
    )
    if (!profile) return null
    return {
      firstName:  profile.firstName || '',
      lastName:   profile.lastName  || '',
      profileId:  (profile.objectUrn || '').split(':').pop() || null
    }
  } catch {
    return null
  }
}

// ── Message Template ──────────────────────────────────────────────────────────

export function buildMessage(template, vars = {}) {
  return template
    .replace(/\{firstName\}/gi,   vars.firstName   || 'there')
    .replace(/\{lastName\}/gi,    vars.lastName    || '')
    .replace(/\{fullName\}/gi,    vars.fullName    || vars.firstName || 'there')
    .replace(/\{resourceUrl\}/gi, vars.resourceUrl || '')
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}
