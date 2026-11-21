import 'dotenv/config';
import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { processDoseGeneration } from './jobs/dose-generator.job';
import { processDoseReminders } from './jobs/dose-reminders.job';
import { processCriticalEscalations } from './jobs/critical-escalation.job';
import { processLowStockAlerts } from './jobs/low-stock.job';

const logger = pino({
  name: 'eldercare-worker',
  level: process.env.LOG_LEVEL || 'info',
});

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const REMINDERS_QUEUE_NAME = 'eldercare-reminders';

export const reminderQueue = new Queue(REMINDERS_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export async function registerRepeatableJobs() {
  logger.info('Registering repeatable cron schedules...');

  // 1. Daily Dose Generation (00:00 UTC)
  await reminderQueue.add(
    'generate-daily-doses',
    {},
    {
      repeat: { pattern: '0 0 * * *' },
      jobId: 'daily-dose-generation-repeat',
    }
  );

  // 2. Scan Dose Reminders (Every minute)
  await reminderQueue.add(
    'scan-dose-reminders',
    {},
    {
      repeat: { pattern: '* * * * *' },
      jobId: 'scan-dose-reminders-repeat',
    }
  );

  // 3. Scan Critical Escalations (Every minute)
  await reminderQueue.add(
    'scan-critical-escalations',
    {},
    {
      repeat: { pattern: '* * * * *' },
      jobId: 'scan-critical-escalations-repeat',
    }
  );

  // 4. Scan Low Stock Alerts (Every 6 hours)
  await reminderQueue.add(
    'scan-low-stock',
    {},
    {
      repeat: { pattern: '0 */6 * * *' },
      jobId: 'scan-low-stock-repeat',
    }
  );

  logger.info('Repeatable cron schedules successfully registered.');
}

export function startWorker() {
  logger.info('Starting Elder Care background worker process...');

  const worker = new Worker(
    REMINDERS_QUEUE_NAME,
    async (job) => {
      logger.info({ jobId: job.id, jobName: job.name }, 'Processing job');

      switch (job.name) {
        case 'generate-daily-doses': {
          const generated = await processDoseGeneration();
          logger.info({ generated }, 'Generated rolling dose slots');
          return { generated };
        }

        case 'scan-dose-reminders': {
          const sent = await processDoseReminders();
          logger.info({ sent }, 'Processed dose reminders');
          return { sent };
        }

        case 'scan-critical-escalations': {
          const escalated = await processCriticalEscalations();
          logger.info({ escalated }, 'Processed critical dose escalations');
          return { escalated };
        }

        case 'scan-low-stock': {
          const alerts = await processLowStockAlerts();
          logger.info({ alerts }, 'Processed low stock inventory alerts');
          return { alerts };
        }

        default:
          logger.warn({ jobName: job.name }, 'Unknown job name');
      }
    },
    { connection, concurrency: 5 }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'Job completed successfully');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, error: err.message }, 'Job failed');
  });

  return worker;
}

if (process.env.NODE_ENV !== 'test') {
  registerRepeatableJobs().catch((err) => logger.error({ err }, 'Failed to register repeatable jobs'));
  startWorker();
}
