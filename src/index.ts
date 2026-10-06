import { createServer } from './server';
import { config } from './config';
import { QueueDispatcher } from './queue/dispatcher';

// Prevent Baileys WebSocket network timeouts from crashing Node.js
process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ Safe Catch - Unhandled Rejection:', (reason as any)?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ Safe Catch - Uncaught Exception:', err.message);
});

const { server } = createServer();

server.listen(config.port, () => {
  console.log(`🚀 WA Web CRM Server running on http://localhost:${config.port}`);

  // Background queue loop runner
  setInterval(async () => {
    try {
      await QueueDispatcher.processNext();
    } catch (e) {
      console.error('Queue runner cycle error:', e);
    }
  }, 2000);
});
