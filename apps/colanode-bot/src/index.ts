import { startBot } from '@colanode/bot/bot';

startBot().catch((error) => {
  console.error('colanode-bot failed to start:', error);
  process.exit(1);
});
