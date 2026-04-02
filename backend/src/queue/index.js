/**
 * GrowLeads Job Queue
 *
 * Two queues:
 *   poll-queue  — fired every N minutes per campaign, fetches new comments
 *   dm-queue    — one job per commenter, sends the DM with rate limiting
 *
 * Rate limiting is enforced at the dm-queue level via BullMQ's built-in
 * rate limiter: max 15 jobs per hour per LinkedIn account.
 */

import { Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'
import { logger } from '../logger.js'

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null // required by BullMQ
})

// ── Queue Definitions ─────────────────────────────────────────────────────────

export const pollQueue = new Queue('poll-campaigns', {
  connection,
  defaultJobOptions: {
    attempts:    3,
    backoff:     { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 50 }
  }
})

export const dmQueue = new Queue('send-dms', {
  connection,
  defaultJobOptions: {
    attempts:    2,
    backoff:     { type: 'fixed', delay: 60_000 },
    removeOnComplete: { count: 500 },
    removeOnFail:     { count: 100 }
  }
})

// ── Scheduler: repeat poll jobs for every active campaign ────────────────────

export async function scheduleCampaignPoll(campaignId, intervalMinutes = 2) {
  const jobId = `poll:${campaignId}`

  // Remove existing repeatable job if present (handles interval changes)
  await pollQueue.removeRepeatable(jobId, {
    every: intervalMinutes * 60 * 1000
  }).catch(() => {})

  await pollQueue.add(
    'poll-campaign',
    { campaignId },
    {
      jobId,
      repeat: { every: intervalMinutes * 60 * 1000 }
    }
  )

  logger.info({ campaignId, intervalMinutes }, 'Poll job scheduled')
}

export async function unscheduleCampaignPoll(campaignId) {
  await pollQueue.removeRepeatable(`poll:${campaignId}`, {
    every: 2 * 60 * 1000  // best-effort — remove all periods
  }).catch(() => {})
  logger.info({ campaignId }, 'Poll job unscheduled')
}

// ── Enqueue a single DM job ───────────────────────────────────────────────────

export async function enqueueDM(campaignId, accountId, commenter, messageText) {
  const jobId = `dm:${campaignId}:${commenter.profileId}`

  await dmQueue.add(
    'send-dm',
    { campaignId, accountId, commenter, messageText },
    {
      jobId,
      // Human-like delay: 2–8 minutes between DMs (random, avoids bot patterns)
      delay: 120_000 + Math.floor(Math.random() * 360_000)
    }
  )
}

export { connection }
