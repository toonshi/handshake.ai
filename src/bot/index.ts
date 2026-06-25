import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import { createPollingErrorLogger } from './polling';
import {
  conductInterview,
  extractProfileFromHistory,
  getWelcomeMessage,
  getAlreadyRegisteredMessage,
  enrichProfileWithEventResponses,
} from './onboarding';
import { setBotInstance, handleConsentCallback, handleFeedbackCallback } from './notifications';
import {
  getUserByTelegramId,
  upsertUser,
  updateUserEmbeddings,
  updateUserEnrichments,
  getUserById,
  getMatchById,
  getDb,
  getEventByCode,
  getEventPrompts,
  saveUserEventResponses,
} from '../db/supabase';
import { generateUserEmbeddings } from '../matching/embeddings';
import { runMatchingCycle } from '../matching/scheduler';
import { fetchGitHubProfile } from '../enrichment/github';
import { scrapeAndExtract } from '../enrichment/scraper';
import { parseResume, downloadTelegramFile } from '../enrichment/resume';
import { OnboardingSession, ProfileEnrichments, EventResponseSession } from '../types';

type BotSession = OnboardingSession | EventResponseSession;
const sessions = new Map<number, BotSession>();

const ENRICHMENT_PROMPT = `
🚀 *Supercharge your agent* — the more context it has, the better your matches:

• \`/github <username>\` — pull your GitHub profile & repos
• \`/website <url>\` — share your portfolio, startup, or LinkedIn
• Send a *PDF* — upload your resume or CV directly

_You can add as many as you like. Each one makes your agent smarter._`;

export async function createBot(): Promise<TelegramBot> {
  if (!config.telegram.usePolling) {
    console.log('[Bot] Polling disabled (TELEGRAM_USE_POLLING=false). Use webhook /api/bot.');
    const bot = new TelegramBot(config.telegram.token);
    setBotInstance(bot);
    return bot;
  }

  const bot = new TelegramBot(config.telegram.token, {
    polling: {
      interval: 1000,
      autoStart: false,
      params: { timeout: 20 },
    },
  });
  setBotInstance(bot);

  // Polling and webhook cannot run at the same time on one bot token
  try {
    await bot.deleteWebHook();
    console.log('[Bot] Webhook cleared — starting long-polling');
  } catch (err) {
    console.warn('[Bot] Could not clear webhook (continuing):', err);
  }

  await bot.startPolling();

  // ─── /start ────────────────────────────────────────────────────────────────

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

      // Check if registered via web form (placeholder telegram_id, matched by username)
      if (msg.from?.username) {
        const sql = getDb();
        const rows = await sql`
          SELECT * FROM users
          WHERE telegram_username = ${msg.from.username} AND telegram_id < 0 LIMIT 1
        `;
        const webUser = rows[0] as import('../types').User | undefined;

        if (webUser) {
          await sql`UPDATE users SET telegram_id = ${telegramId} WHERE id = ${webUser.id}`;
          await bot.sendMessage(
            chatId,
            `✅ *Linked! Welcome ${webUser.name}.*\n\nYour web profile is now connected. Your agent is active — I'll message you when it finds a match.`,
            { parse_mode: 'Markdown' }
          );
          return;
        }
      }

      const session: OnboardingSession = { step: 'greeting', history: [], data: {} };
      sessions.set(telegramId, session);

      const welcome = getWelcomeMessage();
      session.history.push({ role: 'assistant', content: welcome });
      await bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[Bot] /start error:', err);
      await bot.sendMessage(chatId, 'Something went wrong. Please try /start again.');
    }
  });

  // ─── /status ───────────────────────────────────────────────────────────────

  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    try {
      const user = await getUserByTelegramId(telegramId);
      if (!user) {
        await bot.sendMessage(chatId, "You're not registered yet. Use /start to create your profile.");
        return;
      }

      const e = user.enrichments;
      const enrichmentLines: string[] = [];
      if (e?.github) enrichmentLines.push(`✅ GitHub: @${e.github.username}`);
      if (e?.websites?.length) {
        for (const w of e.websites) enrichmentLines.push(`✅ Website: ${w.url}`);
      }
      if (e?.resume) enrichmentLines.push(`✅ Resume: uploaded`);
      const enrichmentStatus =
        enrichmentLines.length > 0
          ? '\n\n*Profile enrichments:*\n' + enrichmentLines.join('\n')
          : '\n\n_No enrichments yet — use /github, /website, or send a PDF._';

      await bot.sendMessage(
        chatId,
        `*Your Handshake Profile*

👤 *Name:* ${user.name}
🏷 *Role:* ${user.role}
🔨 *Working on:* ${user.description}
🎯 *Goals:* ${user.goals}
⚡ *Challenge:* ${user.challenges}
🎁 *Offers:* ${user.offers}${enrichmentStatus}

Your agent is actively matching.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[Bot] /status error:', err);
    }
  });

  // ─── /github <username> ────────────────────────────────────────────────────

  bot.onText(/\/github(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    const username = match?.[1]?.trim();
    if (!username) {
      await bot.sendMessage(chatId, '❌ Usage: `/github your-username`', {
        parse_mode: 'Markdown',
      });
      return;
    }

    try {
      const user = await getUserByTelegramId(telegramId);
      if (!user) {
        await bot.sendMessage(chatId, 'Please register first with /start');
        return;
      }

      await bot.sendChatAction(chatId, 'typing');
      await bot.sendMessage(chatId, `⏳ Fetching GitHub profile for @${username}...`);

      const github = await fetchGitHubProfile(username);

      const current: ProfileEnrichments = user.enrichments ?? { websites: [] };
      const updated: ProfileEnrichments = { ...current, github };
      await updateUserEnrichments(user.id, updated);

      const langs = github.topLanguages.length > 0
        ? github.topLanguages.join(', ')
        : 'not detected';
      const repoList = github.topRepos
        .map((r) => `  • ${r.name} (${r.stars}⭐) — ${r.description || 'no description'}`)
        .join('\n');

      await bot.sendMessage(
        chatId,
        `✅ *GitHub profile added!*

Your agent now knows about your repos and tech stack.

🔤 *Top languages:* ${langs}
📦 *Top repos:*
${repoList || '  (none found)'}

This makes your agent's introductions much more specific.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await bot.sendMessage(chatId, `❌ ${message}`);
    }
  });

  // ─── /website <url> ────────────────────────────────────────────────────────

  bot.onText(/\/website(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    const url = match?.[1]?.trim();
    if (!url) {
      await bot.sendMessage(
        chatId,
        '❌ Usage: `/website https://yoursite.com`',
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

      await bot.sendChatAction(chatId, 'typing');
      await bot.sendMessage(chatId, `⏳ Reading ${url}...`);

      const website = await scrapeAndExtract(url);

      const current: ProfileEnrichments = user.enrichments ?? { websites: [] };
      // Replace existing entry for same URL or append
      const websites = current.websites.filter((w) => w.url !== url);
      websites.push(website);
      const updated: ProfileEnrichments = { ...current, websites };
      await updateUserEnrichments(user.id, updated);

      const points = website.keyPoints.length > 0
        ? '\n' + website.keyPoints.map((p) => `  • ${p}`).join('\n')
        : '';

      await bot.sendMessage(
        chatId,
        `✅ *Website added!*

📋 *What your agent learned:*
${website.summary}${points}

Your agent will reference this in introductions.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await bot.sendMessage(chatId, `❌ ${message}`);
    }
  });

  // ─── /setphone ─────────────────────────────────────────────────────────────

  bot.onText(/\/setphone(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    const phone = match?.[1]?.trim();
    if (!phone || !/^\+\d{7,15}$/.test(phone)) {
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

      const sql = getDb();
      await sql`UPDATE users SET phone_number = ${phone} WHERE telegram_id = ${telegramId}`;
      await bot.sendMessage(
        chatId,
        `✅ Phone number saved: ${phone}\nYou'll receive voice calls when a match is confirmed.`
      );
    } catch (err) {
      console.error('[Bot] /setphone error:', err);
    }
  });

  // ─── /rematch ──────────────────────────────────────────────────────────────

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

  // ─── /join <event_code> ────────────────────────────────────────────────────

  bot.onText(/\/join(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    const eventCode = match?.[1]?.trim()?.toUpperCase();
    if (!eventCode) {
      await bot.sendMessage(chatId, '❌ Usage: `/join <event_code>`\nExample: `/join MINIHACK`', {
        parse_mode: 'Markdown',
      });
      return;
    }

    try {
      const user = await getUserByTelegramId(telegramId);
      if (!user) {
        await bot.sendMessage(
          chatId,
          '👋 You need to create your profile first before joining an event.\nUse `/start` to register!'
        );
        return;
      }

      const event = await getEventByCode(eventCode);
      if (!event) {
        await bot.sendMessage(chatId, `❌ Event *${eventCode}* not found. Please double-check the code.`, {
          parse_mode: 'Markdown',
        });
        return;
      }

      const prompts = await getEventPrompts(event.id);
      if (prompts.length === 0) {
        await saveUserEventResponses(user.id, event.id, []);
        await bot.sendMessage(
          chatId,
          `🎉 *Successfully joined event: ${event.name}!*\nThere are no custom prompt questions for this event, so you are good to go.`
        );
        return;
      }

      const session: EventResponseSession = {
        type: 'event_response',
        eventId: event.id,
        eventCode: event.code,
        eventName: event.name,
        currentPromptIndex: 0,
        prompts: prompts.map((p) => ({ id: p.id, prompt_text: p.prompt_text })),
        responses: [],
      };
      sessions.set(telegramId, session);

      await bot.sendMessage(
        chatId,
        `🎟️ *Joining event: ${event.name}*\n\nThe organizer *${event.organizer_name}* has requested you to answer a few quick questions.\n\n*Question 1:* ${prompts[0].prompt_text}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[Bot] /join error:', err);
      await bot.sendMessage(chatId, '❌ Something went wrong while trying to join the event. Please try again.');
    }
  });

  // ─── /help ─────────────────────────────────────────────────────────────────

  bot.onText(/\/help/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      `*Handshake Commands*

/start — Create your profile and activate your agent
/status — View your profile and enrichments
/github <username> — Add your GitHub profile
/website <url> — Add your portfolio, startup, or social profile
/setphone +254... — Add phone number for voice introductions
/join <event_code> — Join a custom event and respond to organizer prompts
/rematch — Trigger a matching cycle now
/help — Show this message

_Send a PDF to add your resume or CV._
_Your agent runs automatically every 2 hours._`,
      { parse_mode: 'Markdown' }
    );
  });

  // ─── PDF resume handler ────────────────────────────────────────────────────

  bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    if (!telegramId || !msg.document) return;

    const doc = msg.document;

    if (doc.mime_type !== 'application/pdf') {
      await bot.sendMessage(
        chatId,
        '❌ Please send a PDF file for your resume or CV.'
      );
      return;
    }

    if (doc.file_size && doc.file_size > 10 * 1024 * 1024) {
      await bot.sendMessage(chatId, '❌ File too large. Please send a PDF under 10MB.');
      return;
    }

    try {
      const user = await getUserByTelegramId(telegramId);
      if (!user) {
        await bot.sendMessage(chatId, 'Please register first with /start');
        return;
      }

      await bot.sendChatAction(chatId, 'typing');
      await bot.sendMessage(chatId, '⏳ Reading your resume...');

      // Download file from Telegram
      const file = await bot.getFile(doc.file_id);
      if (!file.file_path) throw new Error('Could not get file path from Telegram');

      const fileUrl = `https://api.telegram.org/file/bot${config.telegram.token}/${file.file_path}`;
      const buffer = await downloadTelegramFile(fileUrl);

      const resume = await parseResume(buffer);

      const current: ProfileEnrichments = user.enrichments ?? { websites: [] };
      const updated: ProfileEnrichments = { ...current, resume };
      await updateUserEnrichments(user.id, updated);

      const skills = resume.skills.length > 0 ? resume.skills.join(', ') : 'not listed';
      const highlights = resume.experienceHighlights.length > 0
        ? '\n' + resume.experienceHighlights.map((h) => `  • ${h}`).join('\n')
        : '';

      await bot.sendMessage(
        chatId,
        `✅ *Resume processed!*

📋 *Summary:* ${resume.summary}
🛠 *Skills:* ${skills}${highlights}

Your agent will use this in introductions.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Bot] PDF error:', err);
      await bot.sendMessage(chatId, `❌ Could not process resume: ${message}`);
    }
  });

  // ─── Callback queries ──────────────────────────────────────────────────────

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

  // ─── Onboarding conversation ───────────────────────────────────────────────

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    if (!telegramId) return;
    if (msg.text?.startsWith('/')) return;
    if (msg.document) return; // handled above
    if (!msg.text) return;

    const session = sessions.get(telegramId);
    if (!session) {
      const user = await getUserByTelegramId(telegramId).catch(() => null);
      if (!user) {
        await bot.sendMessage(chatId, 'Use /start to create your profile and activate your agent.');
      }
      return;
    }

    if ('type' in session && session.type === 'event_response') {
      try {
        await bot.sendChatAction(chatId, 'typing');
        const currentPrompt = session.prompts[session.currentPromptIndex];
        session.responses.push({
          prompt_id: currentPrompt.id,
          prompt_text: currentPrompt.prompt_text,
          response_text: msg.text,
        });

        const nextIndex = session.currentPromptIndex + 1;
        if (nextIndex < session.prompts.length) {
          session.currentPromptIndex = nextIndex;
          await bot.sendMessage(
            chatId,
            `*Question ${nextIndex + 1}:* ${session.prompts[nextIndex].prompt_text}`,
            { parse_mode: 'Markdown' }
          );
        } else {
          sessions.delete(telegramId);
          const user = await getUserByTelegramId(telegramId);
          if (user) {
            await saveUserEventResponses(user.id, session.eventId, session.responses);
            await bot.sendMessage(
              chatId,
              `🎉 *Event Registration Complete!*\n\nThank you for responding. Your details have been submitted to the event organizers for *${session.eventName}*.`,
              { parse_mode: 'Markdown' }
            );

            // Synthesize responses with profile and regenerate embeddings
            try {
              await bot.sendChatAction(chatId, 'typing');
              await bot.sendMessage(chatId, '🧠 _Updating your matchmaking agent with event-specific context..._');
              
              const enriched = await enrichProfileWithEventResponses(user, session.responses);
              
              const sql = getDb();
              await sql`
                UPDATE users SET
                  name = ${enriched.name},
                  role = ${enriched.role},
                  description = ${enriched.description},
                  goals = ${enriched.goals},
                  challenges = ${enriched.challenges},
                  offers = ${enriched.offers},
                  updated_at = now()
                WHERE id = ${user.id}
              `;

              const { goalEmbedding, challengeEmbedding } = await generateUserEmbeddings(
                enriched.goals,
                enriched.challenges
              );
              await updateUserEmbeddings(user.id, goalEmbedding, challengeEmbedding);

              await bot.sendMessage(
                chatId,
                `🧠 *Agent Upgraded!* Your matchmaking agent is now actively matching you at *${session.eventName}* using this new context. 🚀`,
                { parse_mode: 'Markdown' }
              );
            } catch (enrichErr) {
              console.error('[Bot] Event profile enrichment failed:', enrichErr);
            }
          } else {
            await bot.sendMessage(
              chatId,
              `❌ Failed to save your responses: user profile not found. Please do /start first.`
            );
          }
        }
      } catch (err) {
        console.error('[Bot] Event message processing error:', err);
        await bot.sendMessage(chatId, '❌ Something went wrong while saving your response. Please try again.');
      }
      return;
    }

    try {
      await bot.sendChatAction(chatId, 'typing');

      const onboardingSession = session as OnboardingSession;
      const result = await conductInterview(onboardingSession, msg.text);

      onboardingSession.history.push({ role: 'user', content: msg.text });
      onboardingSession.history.push({ role: 'assistant', content: result.response });

      await bot.sendMessage(chatId, result.response, { parse_mode: 'Markdown' });

      if (result.isComplete) {
        sessions.delete(telegramId);

        await bot.sendMessage(chatId, '⏳ _Building your profile and agent..._', {
          parse_mode: 'Markdown',
        });

        try {
          const profileData = await extractProfileFromHistory(onboardingSession.history);

          const user = await upsertUser({
            telegram_id: telegramId,
            telegram_username: msg.from?.username,
            phone_number: undefined,
            accept_all_matches: false,
            enrichments: { websites: [] },
            name: profileData.name,
            role: profileData.role,
            description: profileData.description,
            goals: profileData.goals,
            challenges: profileData.challenges,
            offers: profileData.offers,
          });

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

Add your phone for voice intros: \`/setphone +254...\``,
            { parse_mode: 'Markdown' }
          );

          // Prompt user to enrich their profile
          await bot.sendMessage(chatId, ENRICHMENT_PROMPT, { parse_mode: 'Markdown' });

          setTimeout(() => runMatchingCycle().catch(console.error), 2000);
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
      await bot.sendMessage(chatId, '❌ Something went wrong. Please try again or use /start.');
    }
  });

  bot.on('polling_error', createPollingErrorLogger('[Bot]'));

  return bot;
}
