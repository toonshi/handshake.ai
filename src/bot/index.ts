import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import {
  conductInterview,
  extractProfileFromHistory,
  getWelcomeMessage,
  getAlreadyRegisteredMessage,
} from './onboarding';
import { setBotInstance, handleConsentCallback, handleFeedbackCallback } from './notifications';
import {
  getUserByTelegramId,
  upsertUser,
  updateUserEmbeddings,
  getUserById,
  getMatchById,
} from '../db/supabase';
import { generateUserEmbeddings } from '../matching/embeddings';
import { runMatchingCycle } from '../matching/scheduler';
import { OnboardingSession } from '../types';

// In-memory session store (sufficient for hackathon scale)
const sessions = new Map<number, OnboardingSession>();

export function createBot(): TelegramBot {
  const bot = new TelegramBot(config.telegram.token, { polling: true });
  setBotInstance(bot);

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    try {
      const existing = await getUserByTelegramId(telegramId);
      if (existing) {
        await bot.sendMessage(chatId, getAlreadyRegisteredMessage(existing.name), {
          parse_mode: 'Markdown',
        });
        return;
      }

      // Start onboarding
      const session: OnboardingSession = {
        step: 'greeting',
        history: [],
        data: {},
      };
      sessions.set(telegramId, session);

      const welcome = getWelcomeMessage();
      session.history.push({ role: 'assistant', content: welcome });

      await bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[Bot] /start error:', err);
      await bot.sendMessage(chatId, 'Something went wrong. Please try /start again.');
    }
  });

  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    try {
      const user = await getUserByTelegramId(telegramId);
      if (!user) {
        await bot.sendMessage(
          chatId,
          "You're not registered yet. Use /start to create your profile."
        );
        return;
      }

      const profileText = `*Your Kuzana Connector Profile*

👤 *Name:* ${user.name}
🏷 *Role:* ${user.role}
🔨 *Working on:* ${user.description}
🎯 *Goals:* ${user.goals}
⚡ *Challenge:* ${user.challenges}
🎁 *Offers:* ${user.offers}

Your agent is actively matching. I'll notify you when it finds someone worth your time.`;

      await bot.sendMessage(chatId, profileText, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[Bot] /status error:', err);
    }
  });

  bot.onText(/\/setphone (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    if (!telegramId || !match) return;

    const phone = match[1].trim();
    // Basic E.164 format check
    if (!/^\+\d{7,15}$/.test(phone)) {
      await bot.sendMessage(
        chatId,
        '❌ Please use international format: `/setphone +254712345678`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      const user = await getUserByTelegramId(telegramId);
      if (!user) {
        await bot.sendMessage(chatId, 'Please register first with /start');
        return;
      }

      const { getSupabase } = await import('../db/supabase');
      const db = getSupabase();
      await db.from('users').update({ phone_number: phone }).eq('telegram_id', telegramId);

      await bot.sendMessage(
        chatId,
        `✅ Phone number saved: ${phone}\nYou'll receive voice calls when a match is confirmed.`
      );
    } catch (err) {
      console.error('[Bot] /setphone error:', err);
    }
  });

  bot.onText(/\/rematch/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    try {
      const user = await getUserByTelegramId(telegramId);
      if (!user) {
        await bot.sendMessage(chatId, 'Please register first with /start');
        return;
      }

      await bot.sendMessage(chatId, '🔄 Triggering matching cycle now...');
      runMatchingCycle().catch(console.error);
      await bot.sendMessage(chatId, "✅ Matching cycle started. I'll notify you if your agent finds a match.");
    } catch (err) {
      console.error('[Bot] /rematch error:', err);
    }
  });

  bot.onText(/\/help/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      `*Kuzana Connector Commands*

/start — Create your profile and activate your agent
/status — View your current profile
/setphone +254... — Add phone number for voice introductions
/rematch — Trigger a matching cycle now
/help — Show this message

_Your agent runs automatically every 2 hours._`,
      { parse_mode: 'Markdown' }
    );
  });

  // Handle callback queries (consent buttons, feedback buttons)
  bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    if (!data) return;

    try {
      if (data.startsWith('consent_')) {
        await handleConsentCallback(bot, callbackQuery);
      } else if (data.startsWith('feedback_')) {
        await handleFeedbackCallback(bot, callbackQuery);
      }
    } catch (err) {
      console.error('[Bot] Callback error:', err);
    }
  });

  // Handle regular messages (onboarding conversation)
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    // Skip commands
    if (msg.text?.startsWith('/')) return;
    if (!msg.text) return;

    const session = sessions.get(telegramId);
    if (!session) {
      // Check if registered
      const user = await getUserByTelegramId(telegramId).catch(() => null);
      if (!user) {
        await bot.sendMessage(
          chatId,
          "Use /start to create your profile and activate your agent."
        );
      }
      return;
    }

    try {
      await bot.sendChatAction(chatId, 'typing');

      const result = await conductInterview(session, msg.text);

      // Update history
      session.history.push({ role: 'user', content: msg.text });
      session.history.push({ role: 'assistant', content: result.response });

      await bot.sendMessage(chatId, result.response, { parse_mode: 'Markdown' });

      if (result.isComplete) {
        sessions.delete(telegramId);

        await bot.sendMessage(chatId, '⏳ _Building your profile and agent..._', {
          parse_mode: 'Markdown',
        });

        try {
          const profileData = await extractProfileFromHistory(session.history);

          const user = await upsertUser({
            telegram_id: telegramId,
            telegram_username: msg.from?.username,
            phone_number: undefined,
            name: profileData.name,
            role: profileData.role,
            description: profileData.description,
            goals: profileData.goals,
            challenges: profileData.challenges,
            offers: profileData.offers,
          });

          // Generate embeddings async
          const { goalEmbedding, challengeEmbedding } = await generateUserEmbeddings(
            profileData.goals,
            profileData.challenges
          );
          await updateUserEmbeddings(user.id, goalEmbedding, challengeEmbedding);

          await bot.sendMessage(
            chatId,
            `✅ *Profile created, ${profileData.name}!*

Your agent is now active and working the room.

🤖 It'll run every 2 hours searching for people worth your time.
📞 When it finds a match, you'll get a message — and optionally a call.

Add your phone for voice intros: \`/setphone +254...\`

_"Your agent works the room so you don't have to."_`,
            { parse_mode: 'Markdown' }
          );

          // Trigger immediate matching cycle for the new user
          setTimeout(() => {
            runMatchingCycle().catch(console.error);
          }, 2000);
        } catch (err) {
          console.error('[Bot] Profile creation error:', err);
          await bot.sendMessage(
            chatId,
            '❌ Something went wrong creating your profile. Please try /start again.'
          );
        }
      }
    } catch (err) {
      console.error('[Bot] Message handler error:', err);
      await bot.sendMessage(
        chatId,
        '❌ Something went wrong. Please try again or use /start.'
      );
    }
  });

  bot.on('polling_error', (err) => {
    console.error('[Bot] Polling error:', err);
  });

  return bot;
}
