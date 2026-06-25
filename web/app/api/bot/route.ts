export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserByTelegramId, upsertUser, updateUserEnrichments, updateUserEmbeddings, getOnboardingSession, saveOnboardingSession, deleteOnboardingSession } from '@/lib/db';
import { generateGeminiEmbedding } from '@/lib/gemini';
import { sendMessage, getFile, getFileUrl } from '@/lib/telegram';
import { handleConsentCallback } from '@/lib/bot/notifications';
import {
  conductInterview,
  extractProfileFromHistory,
  getWelcomeMessage,
  getAlreadyRegisteredMessage,
} from '@/lib/bot/onboarding';
import { fetchGitHubProfile } from '@/lib/enrichment/github';
import { scrapeAndExtract } from '@/lib/enrichment/scraper';
import { parseResume } from '@/lib/enrichment/resume';
import { OnboardingSession } from '@/lib/types';

export async function POST(req: NextRequest) {
  // Verify secret token
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const update = await req.json();

  try {
    if (update.message) {
      await handleMessage(update.message);
    }

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }
  } catch (err) {
    console.error('[Bot] Unhandled error:', err);
  }

  return NextResponse.json({ ok: true });
}

async function handleMessage(message: {
  chat: { id: number };
  from?: { id: number; username?: string };
  text?: string;
  document?: { file_id: string; mime_type?: string; file_name?: string };
}) {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const username = message.from?.username;
  const text = message.text;

  if (!userId) return;

  // Handle PDF document upload
  if (message.document?.mime_type === 'application/pdf') {
    await handleResumeUpload(chatId, userId, message.document.file_id);
    return;
  }

  // Handle commands
  if (text?.startsWith('/')) {
    await handleCommand(chatId, userId, username, text);
    return;
  }

  // Handle conversational messages
  if (text) {
    await handleConversation(chatId, userId, username, text);
  }
}

async function handleResumeUpload(chatId: number, userId: number, fileId: string): Promise<void> {
  const user = await getUserByTelegramId(userId);
  if (!user) {
    await sendMessage(chatId, 'Please complete onboarding first by sending /start.');
    return;
  }

  try {
    await sendMessage(chatId, '📄 Got your resume — parsing it now...');

    const { file_path } = await getFile(fileId);
    const fileUrl = getFileUrl(file_path);

    const response = await fetch(fileUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Failed to download file: HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const resumeEnrichment = await parseResume(buffer);

    const current = user.enrichments ?? { websites: [] };
    await updateUserEnrichments(user.id, { ...current, resume: resumeEnrichment });

    await sendMessage(
      chatId,
      `✅ Resume parsed and added to your profile.\n\n*Summary:* ${resumeEnrichment.summary}\n\n*Skills:* ${resumeEnrichment.skills.slice(0, 6).join(', ')}`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[Bot] Resume upload error:', err);
    await sendMessage(chatId, '❌ Could not parse your resume. Make sure it\'s a readable PDF.');
  }
}

async function handleCommand(
  chatId: number,
  userId: number,
  username: string | undefined,
  text: string
): Promise<void> {
  const parts = text.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (command === '/start') {
    const existingUser = await getUserByTelegramId(userId);

    if (existingUser) {
      await sendMessage(chatId, getAlreadyRegisteredMessage(existingUser.name), {
        parse_mode: 'Markdown',
      });
      return;
    }

    // Check if a web-registered user has matching telegram_username
    if (username) {
      const { default: postgres } = await import('postgres');
      const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
      const db = postgres(process.env.DATABASE_URL!, { ssl: isProd ? 'require' : false, max: 2 });
      try {
        const rows = await db`
          SELECT * FROM users
          WHERE telegram_username = ${username} AND telegram_id < 0
          LIMIT 1
        `;
        const webUser = rows[0];
        if (webUser) {
          await db`UPDATE users SET telegram_id = ${userId}, updated_at = now() WHERE id = ${webUser.id}`;
          await sendMessage(
            chatId,
            `Welcome back, ${webUser.name}! Your web registration has been linked to this Telegram account. Your agent is active.`,
            { parse_mode: 'Markdown' }
          );
          return;
        }
      } finally {
        await db.end();
      }
    }

    // Start fresh onboarding
    const session: OnboardingSession = {
      step: 'greeting',
      history: [],
      data: {},
    };
    await saveOnboardingSession(userId, { history: session.history });
    await sendMessage(chatId, getWelcomeMessage(), { parse_mode: 'Markdown' });
    return;
  }

  if (command === '/status') {
    const user = await getUserByTelegramId(userId);
    if (!user) {
      await sendMessage(chatId, 'You\'re not registered yet. Send /start to begin.');
      return;
    }
    const enrichmentStatus = [
      user.enrichments?.github ? `✅ GitHub (@${user.enrichments.github.username})` : '❌ GitHub (use /github username)',
      user.enrichments?.websites?.length ? `✅ Website (${user.enrichments.websites.length})` : '❌ Website (use /website URL)',
      user.enrichments?.resume ? '✅ Resume' : '❌ Resume (send a PDF)',
    ].join('\n');

    const message = `*Your Profile*

*Name:* ${user.name}
*Role:* ${user.role}
*Building:* ${user.description}
*Goals:* ${user.goals}
*Challenges:* ${user.challenges}
*Offers:* ${user.offers}

*Enrichments:*
${enrichmentStatus}

*Embeddings:* ${user.goal_embedding ? '✅ Active' : '❌ Not set'}`;

    await sendMessage(chatId, message, { parse_mode: 'Markdown' });
    return;
  }

  if (command === '/github') {
    const ghUsername = args[0];
    if (!ghUsername) {
      await sendMessage(chatId, 'Usage: /github username');
      return;
    }
    const user = await getUserByTelegramId(userId);
    if (!user) {
      await sendMessage(chatId, 'Please complete onboarding first by sending /start.');
      return;
    }
    try {
      await sendMessage(chatId, `🔍 Fetching GitHub profile for @${ghUsername}...`);
      const github = await fetchGitHubProfile(ghUsername);
      const current = user.enrichments ?? { websites: [] };
      await updateUserEnrichments(user.id, { ...current, github });
      await sendMessage(
        chatId,
        `✅ GitHub profile added.\n\n*Top languages:* ${github.topLanguages.join(', ') || 'none'}\n*Top repos:* ${github.topRepos.map((r) => r.name).join(', ') || 'none'}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await sendMessage(chatId, `❌ ${msg}`);
    }
    return;
  }

  if (command === '/website') {
    const url = args[0];
    if (!url) {
      await sendMessage(chatId, 'Usage: /website https://yoursite.com');
      return;
    }
    const user = await getUserByTelegramId(userId);
    if (!user) {
      await sendMessage(chatId, 'Please complete onboarding first by sending /start.');
      return;
    }
    try {
      await sendMessage(chatId, `🔍 Scraping ${url}...`);
      const website = await scrapeAndExtract(url);
      const current = user.enrichments ?? { websites: [] };
      const websites = [...(current.websites ?? []), website];
      await updateUserEnrichments(user.id, { ...current, websites });
      await sendMessage(
        chatId,
        `✅ Website added.\n\n*Summary:* ${website.summary}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await sendMessage(chatId, `❌ ${msg}`);
    }
    return;
  }

  if (command === '/setphone') {
    const phone = args[0];
    if (!phone) {
      await sendMessage(chatId, 'Usage: /setphone +254712345678');
      return;
    }
    const user = await getUserByTelegramId(userId);
    if (!user) {
      await sendMessage(chatId, 'Please complete onboarding first by sending /start.');
      return;
    }
    const { default: postgres } = await import('postgres');
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
    const db = postgres(process.env.DATABASE_URL!, { ssl: isProd ? 'require' : false, max: 2 });
    try {
      await db`UPDATE users SET phone_number = ${phone}, updated_at = now() WHERE id = ${user.id}`;
    } finally {
      await db.end();
    }
    await sendMessage(chatId, `✅ Phone number saved. You'll receive voice introductions when matches are confirmed.`);
    return;
  }

  if (command === '/rematch') {
    await sendMessage(chatId, 'Your agent will run in the next matching cycle (every 2 hours).');
    return;
  }

  if (command === '/help') {
    await sendMessage(
      chatId,
      `*Handshake Commands*

/start — register or check your status
/status — view your current profile
/github username — add your GitHub profile
/website https://... — add your website or portfolio
/setphone +254... — add phone number for voice intros
/rematch — queue yourself for the next matching cycle
/help — show this message

*To upload your resume:* just send a PDF file.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  await sendMessage(chatId, 'Unknown command. Send /help to see available commands.');
}

async function handleConversation(
  chatId: number,
  userId: number,
  username: string | undefined,
  text: string
): Promise<void> {
  // Check if there's an active onboarding session
  const sessionData = await getOnboardingSession(userId);

  if (sessionData) {
    // Continue onboarding interview
    const session: OnboardingSession = {
      step: 'greeting',
      history: sessionData.history,
      data: {},
    };

    const result = await conductInterview(session, text);

    // Update history
    const updatedHistory = [
      ...session.history,
      { role: 'user' as const, content: text },
      { role: 'assistant' as const, content: result.response },
    ];

    if (result.isComplete) {
      // Extract profile and create user
      try {
        const profile = await extractProfileFromHistory(updatedHistory);
        const [goalEmbedding, challengeEmbedding] = await Promise.all([
          generateGeminiEmbedding(profile.goals),
          generateGeminiEmbedding(profile.challenges),
        ]);

        await upsertUser({
          telegram_id: userId,
          telegram_username: username,
          name: profile.name,
          role: profile.role,
          description: profile.description,
          goals: profile.goals,
          challenges: profile.challenges,
          offers: profile.offers,
          accept_all_matches: false,
          goal_embedding: goalEmbedding,
          challenge_embedding: challengeEmbedding,
        });

        await deleteOnboardingSession(userId);

        await sendMessage(chatId, result.response, { parse_mode: 'Markdown' });
        await sendMessage(
          chatId,
          `✅ *You're in the network.*

Your agent is active and will start looking for matches in the next cycle (runs every 2 hours).

*Boost your agent's introductions:*
• /github username — add your GitHub profile
• /website https://yoursite.com — add your portfolio or startup site
• Send a PDF — upload your resume

The more context your agent has, the more specific and credible its introductions will be.`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        console.error('[Bot] Profile extraction error:', err);
        await saveOnboardingSession(userId, { history: updatedHistory });
        await sendMessage(chatId, result.response);
      }
    } else {
      await saveOnboardingSession(userId, { history: updatedHistory });
      await sendMessage(chatId, result.response);
    }
    return;
  }

  // User is registered, not in onboarding
  const user = await getUserByTelegramId(userId);
  if (user) {
    await sendMessage(chatId, 'Use /help to see available commands, or send /status to check your profile.');
    return;
  }

  // Not registered, not in onboarding
  await sendMessage(chatId, 'Send /start to register with Handshake.');
}

async function handleCallbackQuery(callbackQuery: {
  id: string;
  from: { id: number; username?: string };
  message?: { chat: { id: number }; message_id: number };
  data?: string;
}) {
  await handleConsentCallback(callbackQuery);
}
