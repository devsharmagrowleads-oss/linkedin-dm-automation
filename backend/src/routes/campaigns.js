/**
 * Campaign Routes
 * POST   /campaigns         — create campaign
 * GET    /campaigns         — list campaigns for user
 * PATCH  /campaigns/:id     — update (pause/resume/edit)
 * DELETE /campaigns/:id     — delete
 * GET    /campaigns/:id/logs — activity logs
 * GET    /campaigns/:id/stats — DM stats
 */

import { db }             from '../db/client.js'
import { extractActivityId } from '../linkedin/api.js'
import { scheduleCampaignPoll, unscheduleCampaignPoll } from '../queue/index.js'
import { logger }         from '../logger.js'

export async function campaignRoutes(app) {

  // Create campaign
  app.post('/campaigns', async (req, reply) => {
    const { userId, accountId, name, postUrl, resourceUrl, messageTemplate } = req.body

    if (!userId || !accountId || !postUrl || !resourceUrl || !messageTemplate) {
      return reply.code(400).send({ error: 'Missing required fields' })
    }

    const activityId = extractActivityId(postUrl)
    if (!activityId) {
      return reply.code(400).send({
        error: 'Could not extract LinkedIn activity ID from post URL. Make sure it is a valid LinkedIn post link.'
      })
    }

    const campaign = await db.campaign.create({
      data: {
        userId, accountId, name,
        postUrl, activityId,
        resourceUrl, messageTemplate,
        status: 'active'
      }
    })

    // Schedule repeating poll job immediately
    await scheduleCampaignPoll(campaign.id, 2)

    logger.info({ campaignId: campaign.id, activityId }, 'Campaign created')
    return reply.code(201).send({ campaign })
  })

  // List campaigns
  app.get('/campaigns', async (req, reply) => {
    const { userId } = req.query
    if (!userId) return reply.code(400).send({ error: 'userId required' })

    const campaigns = await db.campaign.findMany({
      where:   { userId },
      include: {
        account: { select: { profileName: true, status: true } },
        _count:  { select: { sentDms: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return reply.send({ campaigns })
  })

  // Update campaign (pause/resume/edit)
  app.patch('/campaigns/:id', async (req, reply) => {
    const { id } = req.params
    const update = req.body

    const current = await db.campaign.findUnique({ where: { id } })
    if (!current) return reply.code(404).send({ error: 'Campaign not found' })

    const updated = await db.campaign.update({ where: { id }, data: update })

    // Handle status change
    if (update.status === 'paused') {
      await unscheduleCampaignPoll(id)
    } else if (update.status === 'active' && current.status !== 'active') {
      await scheduleCampaignPoll(id, 2)
    }

    return reply.send({ campaign: updated })
  })

  // Delete campaign
  app.delete('/campaigns/:id', async (req, reply) => {
    const { id } = req.params
    await unscheduleCampaignPoll(id)
    await db.campaign.delete({ where: { id } }).catch(() => {})
    return reply.send({ ok: true })
  })

  // Activity logs for a campaign
  app.get('/campaigns/:id/logs', async (req, reply) => {
    const { id } = req.params
    const limit  = Math.min(Number(req.query.limit) || 50, 200)

    const logs = await db.activityLog.findMany({
      where:   { campaignId: id },
      orderBy: { createdAt: 'desc' },
      take:    limit
    })
    return reply.send({ logs })
  })

  // Stats for a campaign
  app.get('/campaigns/:id/stats', async (req, reply) => {
    const { id } = req.params

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [campaign, todayCount] = await Promise.all([
      db.campaign.findUnique({ where: { id } }),
      db.sentDM.count({ where: { campaignId: id, sentAt: { gte: todayStart } } })
    ])

    if (!campaign) return reply.code(404).send({ error: 'Not found' })

    return reply.send({
      totalDmsSent: campaign.dmsSent,
      dmsSentToday: todayCount,
      status:       campaign.status,
      lastPolledAt: campaign.lastPolledAt
    })
  })
}
