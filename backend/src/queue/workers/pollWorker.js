/**
 * Poll Worker
 * Runs every N minutes per campaign.
 * Fetches new commenters → enqueues DM jobs for each new one.
 */

import { Worker } from 'bullmq'
import { db }     from '../../db/client.js'
import { connection, enqueueDM } from '../index.js'
import { getSession } from '../../linkedin/session.js'
import { getAllCommenters, extractActivityId, buildMessage } from '../../linkedin/api.js'
import { logger } from '../../logger.js'
import { sendAlert } from '../../email.js'

export function startPollWorker() {
  const worker = new Worker('poll-campaigns', async job => {
    const { campaignId } = job.data

    // Load campaign + account from DB
    const campaign = await db.campaign.findUnique({
      where:   { id: campaignId },
      include: { account: true }
    })

    if (!campaign || campaign.status !== 'active') {
      logger.info({ campaignId }, 'Campaign inactive or not found — skipping poll')
      return
    }

    const { account } = campaign
    logger.info({ campaignId, activityId: campaign.activityId }, 'Poll started')

    await db.activityLog.create({ data: {
      campaignId, level: 'INFO', action: 'poll_start',
      message: `Poll started for "${campaign.name}"`
    }})

    // Get LinkedIn session for this account (seed with stored JSESSIONID if available)
    const session = getSession(account.liAt, account.id, account.jsessionId)

    // Fetch all current commenters
    let allCommenters
    try {
      allCommenters = await getAllCommenters(session, campaign.activityId)
    } catch (err) {
      logger.error({ campaignId, err: err.message }, 'getAllCommenters failed')
      await db.activityLog.create({ data: {
        campaignId, level: 'ERROR', action: 'api_error',
        message: `Comments fetch failed: ${err.message}`
      }})
      // Mark account as potentially invalid if auth error
      if (err.message.includes('401') || err.message.includes('403')) {
        await db.linkedInAccount.update({
          where: { id: account.id },
          data:  { status: 'invalid' }
        })
        await sendAlert(
          `LinkedIn account invalid: ${account.profileName}`,
          `The LinkedIn session for "${account.profileName}" has expired or been revoked.\n\nCampaign: "${campaign.name}"\nError: ${err.message}\n\nTo fix: open the GrowLeads Chrome extension and reconnect your LinkedIn account.`
        )
      }
      throw err
    }

    if (allCommenters.length === 0) {
      logger.info({ campaignId }, 'No commenters found on post')
      await db.campaign.update({
        where: { id: campaignId },
        data:  { lastPolledAt: new Date() }
      })
      return
    }

    // Dedup: find commenters not yet DM'd in this campaign
    const alreadySent = await db.sentDM.findMany({
      where:  { campaignId },
      select: { linkedinProfileId: true }
    })
    const sentIds = new Set(alreadySent.map(s => s.linkedinProfileId))

    const newCommenters = allCommenters.filter(c => !sentIds.has(c.profileId))

    logger.info({ campaignId, total: allCommenters.length, newCount: newCommenters.length }, 'Poll result')

    await db.activityLog.create({ data: {
      campaignId, level: 'INFO', action: 'poll_result',
      message: `${newCommenters.length} new commenter(s) found (${allCommenters.length} total)`,
      meta: { total: allCommenters.length, newCount: newCommenters.length }
    }})

    // Enqueue a DM job for each new commenter
    for (const commenter of newCommenters) {
      const messageText = buildMessage(campaign.messageTemplate, {
        firstName:   commenter.firstName,
        lastName:    commenter.lastName,
        fullName:    commenter.fullName,
        resourceUrl: campaign.resourceUrl
      })
      await enqueueDM(campaignId, account.id, commenter, messageText)
    }

    await db.campaign.update({
      where: { id: campaignId },
      data:  { lastPolledAt: new Date() }
    })

  }, { connection, concurrency: 5 })

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Poll job failed')
  })

  logger.info('Poll worker started')
  return worker
}
