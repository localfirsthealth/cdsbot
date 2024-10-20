// services/cdsbot/src/routes/health.js

import { Router } from 'oak';
import { database } from '../utils/database.js';

const router = new Router();

// Simple health check endpoint
router.get('/healthz', (ctx) => {
  ctx.response.status = 200;
  ctx.response.body = { status: 'OK', message: 'Service is up and running' };
});

// Readiness check endpoint
router.get('/readyz', async (ctx) => {
  try {
    // Check database connection
    const dbStatus = await database.ping();

    if (dbStatus.status === 'ok') {
      ctx.response.status = 200;
      ctx.response.body = { status: 'OK', message: 'Service is ready', checks: { database: 'Connected' } };
    } else {
      ctx.response.status = 503;
      ctx.response.body = { status: 'Error', message: 'Service is not ready', checks: { database: 'Disconnected' } };
    }
  } catch (error) {
    console.error('Error in readiness check:', error);
    ctx.response.status = 500;
    ctx.response.body = { status: 'Error', message: 'Internal server error during readiness check' };
  }
});

export default function configure (app) {
  app.use(router.routes());
  app.use(router.allowedMethods());
}
