/**
 * Email alerts for critical events (e.g. LinkedIn account going invalid).
 *
 * Configure via .env:
 *   ALERT_EMAIL   — where to send alerts
 *   SMTP_HOST     — e.g. smtp.gmail.com
 *   SMTP_PORT     — default 587
 *   SMTP_USER     — sender address
 *   SMTP_PASS     — sender password / app password
 *
 * If SMTP is not configured, alerts are logged instead of emailed.
 */

import nodemailer from 'nodemailer'
import { logger } from './logger.js'

let transporter = null

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  })
}

export async function sendAlert(subject, body) {
  if (!transporter || !process.env.ALERT_EMAIL) {
    logger.warn({ subject }, 'Email alert (SMTP not configured): ' + body)
    return
  }
  try {
    await transporter.sendMail({
      from:    process.env.SMTP_USER,
      to:      process.env.ALERT_EMAIL,
      subject: `[GrowLeads] ${subject}`,
      text:    body
    })
    logger.info({ subject }, 'Alert email sent')
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to send alert email')
  }
}
