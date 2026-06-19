import { createBot } from './bot';
import { startMatchingScheduler, runMatchingCycle } from './matching/scheduler';

async function main(): Promise<void> {
  console.log('🚀 Kuzana Connector starting...');
  console.log('"Your agent works the room so you don\'t have to."');
  console.log('');

  // Validate config early
  const { config } = await import('./config');
  console.log(`[Config] Telegram bot token: ...${config.telegram.token.slice(-6)}`);
  console.log(`[Config] Gemini text model: ${config.gemini.textModel}`);
  console.log(`[Config] Match threshold: ${config.matching.scoreThreshold}`);
  console.log(`[Config] Matching cron: ${config.matching.cronSchedule}`);
  console.log('');

  // Start Telegram bot
  const bot = createBot();
  console.log('✅ Telegram bot started (polling)');

  // Start matching scheduler
  startMatchingScheduler();
  console.log('✅ Matching scheduler started');

  // Run an initial matching cycle after 10 seconds (let bot settle)
  setTimeout(() => {
    console.log('[Matching] Running initial cycle...');
    runMatchingCycle().catch((err) =>
      console.error('[Matching] Initial cycle error:', err)
    );
  }, 10_000);

  console.log('');
  console.log('✅ Kuzana Connector is live. Waiting for users...');

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    bot.stopPolling();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down...');
    bot.stopPolling();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
