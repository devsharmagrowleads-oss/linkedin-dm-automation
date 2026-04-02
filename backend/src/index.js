/**
 * GrowLeads Backend — Fastify Server
 * Starts the API server + BullMQ workers.
 * Workers run in the same process for simplicity (split into separate
 * processes / containers for production scale-out).
 */

import 'dotenv/config'
import Fastify       from 'fastify'
import cors          from '@fastify/cors'
import { logger }    from './logger.js'
import { accountRoutes }  from './routes/accounts.js'
import { campaignRoutes } from './routes/campaigns.js'
import { startPollWorker } from './queue/workers/pollWorker.js'
import { startDMWorker }   from './queue/workers/dmWorker.js'
import { db }              from './db/client.js'

const app = Fastify({ logger: false }) // using pino directly

// ── Plugins ────────────────────────────────────────────────────────────────

await app.register(cors, {
  origin:  process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
})

// ── Routes ─────────────────────────────────────────────────────────────────

await app.register(accountRoutes)
await app.register(campaignRoutes)

app.get('/health', async () => ({
  status: 'ok',
  ts:     new Date().toISOString()
}))

// ── Global error handler ────────────────────────────────────────────────────

app.setErrorHandler((err, req, reply) => {
  logger.error({ err: err.message, path: req.url }, 'Unhandled request error')
  reply.code(err.statusCode || 500).send({ error: err.message })
})

// ── Start ──────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3001

async function start() {
  try {
    // Verify DB connection
    await db.$connect()
    logger.info('Database connected')

    // Start workers — these run continuously in the background
    startPollWorker()
    startDMWorker()
    logger.info('BullMQ workers started')

    // Start HTTP server
    await app.listen({ port: PORT, host: '0.0.0.0' })
    logger.info({ port: PORT }, 'GrowLeads backend running')

  } catch (err) {
    logger.error({ err: err.message }, 'Failed to start server')
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down...')
  await app.close()
  await db.$disconnect()
  process.exit(0)
})

start()
