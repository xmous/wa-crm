import { createServer } from './server';
import { config } from './config';
import { QueueDispatcher } from './queue/dispatcher';

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
