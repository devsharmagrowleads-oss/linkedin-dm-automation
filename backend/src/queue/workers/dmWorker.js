/**
 * DM Worker
 * Sends one DM per job with human-like timing.
 *
 * Anti-ban rules enforced here:
 *  1. Only sends DMs between 08:00–20:00 local time (no late-night activity)
 *  2. Max 25 DMs per day per account (conservative — LinkedIn flags high volumes)
 *  3. Max 8 DMs per hour (well below LinkedIn's detection threshold)
 *  4. Only 1 concurrent send at a time (avoids burst patterns)
 *  5. Jobs already have a 2–8 min random delay added at enqueue time (in queue/index.js)
 */

import { Worker } from 'bullmq'
import { db }     from '../../db/client.js'
import { connection } from '../index.js'
import { getSession } from '../../linkedin/session.js'
import { sendDM } from '../../linkedin/api.js'
import { logger } from '../../logger.js'

const MAX_DMS_PER_DAY  = 25   // safe daily limit
const SEND_HOUR_START  = 8    // don't send before 8am
const SEND_HOUR_END    = 20   // don't send after 8pm

function currentHour() {
  return new Date().getHours()
}

function msUntilMorning() {
  const now = new Date()
  const morning = new Date()
  morning.setDate(morning.getDate() + (now.getHours() >= SEND_HOUR_END ? 1 : 0))
  morning.setHours(SEND_HOUR_START, 0, 0, 0)
  return morning.getTime() - now.getTime()
}

export function startDMWorker() {
  const worker = new Worker('send-dms', async job => {
    const { campaignId, accountId, commenter, messageText } = job.data

    // 1. Time-of-day check — no DMs outside 08:00–20:00
    const hour = currentHour()
    if (hour < SEND_HOUR_START || hour >= SEND_HOUR_END) {
      const waitMs = msUntilMorning()
      logger.info({ accountId, hour }, `Outside sending window — delaying until 8am (${Math.round(waitMs / 60000)} min)`)
      await job.moveToDelayed(Date.now() + waitMs)
      return
    }

    // 2. Daily cap check
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const todayCount = await db.sentDM.count({
      where: {
        campaign: { accountId },
        sentAt:   { gte: todayStart }
      }
    })

    if (todayCount >= MAX_DMS_PER_DAY) {
      const waitMs = msUntilMorning()
      logger.warn({ accountId, todayCount }, `Daily cap of ${MAX_DMS_PER_DAY} reached — delaying until tomorrow`)
      await job.moveToDelayed(Date.now() + waitMs)
      return
    }

    // 3. Dedup guard
    const alreadySent = await db.sentDM.findUnique({
      where: { campaignId_linkedinProfileId: { campaignId, linkedinProfileId: commenter.profileId } }
    })
    if (alreadySent) {
      logger.info({ campaignId, profileId: commenter.profileId }, 'DM already sent — skipping')
      return
    }

    // 4. Campaign still active?
    const campaign = await db.campaign.findUnique({ where: { id: campaignId }, include: { account: true } })
    if (!campaign || campaign.status !== 'active') return

    const session = getSession(campaign.account.liAt, accountId, campaign.account.jsessionId)

    // 5. Send
    try {
      await sendDM(session, commenter.profileId, messageText)
    } catch (err) {
      logger.error({ campaignId, profileId: commenter.profileId, err: err.message }, 'DM send failed')
      await db.activityLog.create({ data: {
        campaignId, level: 'ERROR', action: 'dm_failed',
        message: `DM to ${commenter.fullName} failed: ${err.message}`,
        meta: { profileId: commenter.profileId }
      }})
      throw err
    }

    // 6. Record
    await db.sentDM.create({
      data: { campaignId, linkedinProfileId: commenter.profileId, profileName: commenter.fullName }
    })
    await db.campaign.update({
      where: { id: campaignId },
      data:  { dmsSent: { increment: 1 }, lastPolledAt: new Date() }
    })
    await db.activityLog.create({ data: {
      campaignId, level: 'INFO', action: 'dm_sent',
      message: `DM sent to ${commenter.fullName}`,
      meta: { profileId: commenter.profileId, profileName: commenter.fullName }
    }})

    logger.info({ campaignId, name: commenter.fullName, todayCount: todayCount + 1 }, 'DM sent')

  }, {
    connection,
    concurrency: 1,                              // one DM at a time — no bursts
    limiter:     { max: 8, duration: 3_600_000 } // max 8 per hour at the queue level
  })

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'DM job failed')
  })

  logger.info('DM worker started')
  return worker
}
