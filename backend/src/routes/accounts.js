/**
 * LinkedIn Account Routes
 * POST   /accounts      — connect a LinkedIn account via li_at cookie (auto-creates user)
 * GET    /accounts      — list connected accounts for a user
 * DELETE /accounts/:id  — remove account
 */

import { db }            from '../db/client.js'
import { getSession, invalidateSession } from '../linkedin/session.js'
import { verifySession } from '../linkedin/api.js'
import { logger }        from '../logger.js'

export async function accountRoutes(app) {

  // Connect LinkedIn account
  app.post('/accounts', async (req, reply) => {
    const { userId, liAt, jsessionId } = req.body

    if (!userId || !liAt) {
      return reply.code(400).send({ error: 'userId and liAt are required' })
    }

    // Verify the li_at is valid before saving
    const tempId  = 'verify_' + Date.now()
    const session = getSession(liAt, tempId, jsessionId)
    const profile = await verifySession(session)
    invalidateSession(tempId)

    if (!profile) {
      return reply.code(401).send({
        error: 'Invalid li_at cookie. Please log into LinkedIn and try again.'
      })
    }

    const profileName = `${profile.firstName} ${profile.lastName}`.trim()

    // Auto-create user on first connect — userId comes from the extension (UUID generated on install)
    await db.user.upsert({
      where:  { id: userId },
      create: { id: userId, email: `user_${userId}@growleads.local` },
      update: {}
    })

    // Upsert LinkedIn account (unique on userId + profileId)
    const account = await db.linkedInAccount.upsert({
      where:  { userId_profileId: { userId, profileId: profile.profileId } },
      create: { userId, liAt, jsessionId, profileName, profileId: profile.profileId, status: 'active', lastVerifiedAt: new Date() },
      update: { liAt, jsessionId, profileName, status: 'active', lastVerifiedAt: new Date() }
    })

    logger.info({ accountId: account.id, name: account.profileName }, 'LinkedIn account connected')
    return reply.send({ ok: true, account: _safeAccount(account) })
  })

  // List accounts for a user
  app.get('/accounts', async (req, reply) => {
    const { userId } = req.query
    if (!userId) return reply.code(400).send({ error: 'userId required' })

    const accounts = await db.linkedInAccount.findMany({
      where:   { userId },
      orderBy: { createdAt: 'asc' }
    })
    return reply.send({ accounts: accounts.map(_safeAccount) })
  })

  // Remove account
  app.delete('/accounts/:id', async (req, reply) => {
    await db.linkedInAccount.delete({ where: { id: req.params.id } }).catch(() => {})
    invalidateSession(req.params.id)
    return reply.send({ ok: true })
  })
}

// Never expose li_at in API responses
function _safeAccount(a) {
  return {
    id:             a.id,
    profileName:    a.profileName,
    profileId:      a.profileId,
    status:         a.status,
    lastVerifiedAt: a.lastVerifiedAt,
    createdAt:      a.createdAt
  }
}
