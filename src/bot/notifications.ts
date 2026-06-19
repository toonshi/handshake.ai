import TelegramBot from 'node-telegram-bot-api';
import { Match, User } from '../types';
import { updateMatch, getUserById } from '../db/supabase';
import { generateCallScripts } from '../introduction/callscript';
import { initiateOutboundCall } from '../introduction/elevenlabs';

let _bot: TelegramBot | null = null;

export function setBotInstance(bot: TelegramBot): void {
  _bot = bot;
}

function getBot(): TelegramBot {
  if (!_bot) throw new Error('Bot not initialized');
  return _bot;
}

export async function sendMatchNotification(
  match: Match,
  userA: User,
  userB: User
): Promise<void> {
  const bot = getBot();

  const scoreA = (match.agent_a_score * 100).toFixed(0);
  const scoreB = (match.agent_b_score * 100).toFixed(0);

  const messageA = `🤝 *Your agent found someone worth meeting.*

*${userB.name}* — ${userB.role}

📋 *Why your agent flagged this:*
${match.rationale}

💬 *Conversation starter your agents worked out:*
_"${match.conversation_starter}"_

🎯 Match confidence: ${scoreA}%

Want us to call you with the full intro?`;

  const messageB = `🤝 *Your agent found someone worth meeting.*

*${userA.name}* — ${userA.role}

📋 *Why your agent flagged this:*
${match.rationale}

💬 *Conversation starter your agents worked out:*
_"${match.conversation_starter}"_

🎯 Match confidence: ${scoreB}%

Want us to call you with the full intro?`;

  const inlineKeyboardA = {
    inline_keyboard: [
      [
        { text: '📞 Yes, call me', callback_data: `consent_yes_${match.id}_a` },
        { text: '⏭ Not now', callback_data: `consent_no_${match.id}_a` },
      ],
    ],
  };

  const inlineKeyboardB = {
    inline_keyboard: [
      [
        { text: '📞 Yes, call me', callback_data: `consent_yes_${match.id}_b` },
        { text: '⏭ Not now', callback_data: `consent_no_${match.id}_b` },
      ],
    ],
  };

  await Promise.all([
    bot.sendMessage(userA.telegram_id, messageA, {
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboardA,
    }),
    bot.sendMessage(userB.telegram_id, messageB, {
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboardB,
    }),
  ]);

  console.log(`[Notifications] Sent match notifications for match ${match.id}`);
}

export async function handleConsentCallback(
  bot: TelegramBot,
  callbackQuery: TelegramBot.CallbackQuery
): Promise<void> {
  const data = callbackQuery.data;
  if (!data) return;

  const match = data.match(/^consent_(yes|no)_([a-f0-9-]+)_(a|b)$/);
  if (!match) return;

  const [, decision, matchId, party] = match;
  const chatId = callbackQuery.message?.chat.id;
  if (!chatId) return;

  await bot.answerCallbackQuery(callbackQuery.id);

  if (decision === 'no') {
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: chatId, message_id: callbackQuery.message?.message_id }
    );
    await bot.sendMessage(
      chatId,
      '👍 No worries — your agent will keep looking. I\'ll message you when the next match comes through.'
    );

    if (party === 'a') {
      await updateMatch(matchId, { user_a_consent: false, status: 'declined' });
    } else {
      await updateMatch(matchId, { user_b_consent: false, status: 'declined' });
    }
    return;
  }

  // Consent given
  await bot.editMessageReplyMarkup(
    { inline_keyboard: [] },
    { chat_id: chatId, message_id: callbackQuery.message?.message_id }
  );
  await bot.sendMessage(
    chatId,
    '✅ Great! We\'ll call you once the other person also confirms. Sit tight — this will be worth it.'
  );

  // Update consent
  const { getMatchById, getUserById: getUserByIdFn } = await import('../db/supabase');
  const currentMatch = await getMatchById(matchId);
  if (!currentMatch) return;

  const updates: Partial<Match> =
    party === 'a' ? { user_a_consent: true } : { user_b_consent: true };
  await updateMatch(matchId, updates);

  const updatedMatch = await getMatchById(matchId);
  if (!updatedMatch) return;

  const bothConsented = updatedMatch.user_a_consent && updatedMatch.user_b_consent;

  if (bothConsented) {
    await updateMatch(matchId, { status: 'calling' });
    await initiateCallsForMatch(updatedMatch);
  }
}

async function initiateCallsForMatch(match: Match): Promise<void> {
  const bot = getBot();

  const [userA, userB] = await Promise.all([
    getUserById(match.user_a_id),
    getUserById(match.user_b_id),
  ]);

  if (!userA || !userB) {
    console.error(`[Notifications] Could not find users for match ${match.id}`);
    return;
  }

  let scripts;
  try {
    scripts = await generateCallScripts(match, userA, userB);
  } catch (err) {
    console.error('[Notifications] Failed to generate call scripts:', err);
    scripts = {
      personAScript: `Hi ${userA.name} — this is Kuzana Connector. Your agent found a match with ${userB.name}. Check your Telegram for details. Good luck.`,
      personBScript: `Hi ${userB.name} — this is Kuzana Connector. Your agent found a match with ${userA.name}. Check your Telegram for details. Good luck.`,
    };
  }

  // Send Telegram message with other person's contact
  const telegramMessageA = `📞 *The intro is confirmed!*

Here's ${userB.name}'s info:
${userB.telegram_username ? `Telegram: @${userB.telegram_username}` : 'No username — ask me if you need help connecting'}

💬 *Open with:*
_"${match.conversation_starter}"_

${userA.phone_number ? 'We\'ll call you shortly with a full briefing.' : 'Add your phone number with /setphone to receive voice introductions next time.'}`;

  const telegramMessageB = `📞 *The intro is confirmed!*

Here's ${userA.name}'s info:
${userA.telegram_username ? `Telegram: @${userA.telegram_username}` : 'No username — ask me if you need help connecting'}

💬 *Open with:*
_"${match.conversation_starter}"_

${userB.phone_number ? 'We\'ll call you shortly with a full briefing.' : 'Add your phone number with /setphone to receive voice introductions next time.'}`;

  await Promise.all([
    bot.sendMessage(userA.telegram_id, telegramMessageA, { parse_mode: 'Markdown' }),
    bot.sendMessage(userB.telegram_id, telegramMessageB, { parse_mode: 'Markdown' }),
  ]);

  // Initiate ElevenLabs calls for users who have phone numbers
  const callPromises: Promise<void>[] = [];

  if (userA.phone_number) {
    callPromises.push(
      initiateOutboundCall(userA.phone_number, scripts.personAScript)
        .then((convId) => {
          console.log(`[Calls] Call initiated for ${userA.name}: ${convId}`);
        })
        .catch((err) => {
          console.error(`[Calls] Failed to call ${userA.name}:`, err);
        })
    );
  }

  if (userB.phone_number) {
    callPromises.push(
      initiateOutboundCall(userB.phone_number, scripts.personBScript)
        .then((convId) => {
          console.log(`[Calls] Call initiated for ${userB.name}: ${convId}`);
        })
        .catch((err) => {
          console.error(`[Calls] Failed to call ${userB.name}:`, err);
        })
    );
  }

  await Promise.all(callPromises);
  await updateMatch(match.id, { status: 'called' });
}

export async function sendFeedbackRequest(
  match: Match,
  userA: User,
  userB: User
): Promise<void> {
  const bot = getBot();

  const keyboard = {
    inline_keyboard: [
      [
        { text: '👍 Useful intro', callback_data: `feedback_up_${match.id}` },
        { text: '👎 Not useful', callback_data: `feedback_down_${match.id}` },
      ],
    ],
  };

  const message = `How was your introduction with the person from yesterday?`;

  await Promise.all([
    bot.sendMessage(userA.telegram_id, message, { reply_markup: keyboard }),
    bot.sendMessage(userB.telegram_id, message, { reply_markup: keyboard }),
  ]);
}

export async function handleFeedbackCallback(
  bot: TelegramBot,
  callbackQuery: TelegramBot.CallbackQuery
): Promise<void> {
  const data = callbackQuery.data;
  if (!data) return;

  const match = data.match(/^feedback_(up|down)_([a-f0-9-]+)$/);
  if (!match) return;

  const [, vote, matchId] = match;
  const chatId = callbackQuery.message?.chat.id;
  const userId = callbackQuery.from.id;
  if (!chatId) return;

  await bot.answerCallbackQuery(callbackQuery.id);
  await bot.editMessageReplyMarkup(
    { inline_keyboard: [] },
    { chat_id: chatId, message_id: callbackQuery.message?.message_id }
  );

  const { getMatchById: getMById, getUserByTelegramId: getByTg } = await import('../db/supabase');
  const currentMatch = await getMById(matchId);
  if (!currentMatch) return;

  const userA = await getUserById(currentMatch.user_a_id);
  const userB = await getUserById(currentMatch.user_b_id);
  const isUserA = userA?.telegram_id === userId;

  const score = vote === 'up' ? 1 : -1;
  const updates: Partial<Match> = isUserA
    ? { user_a_feedback: score }
    : { user_b_feedback: score };

  await updateMatch(matchId, updates);

  const emoji = vote === 'up' ? '🙏' : '💡';
  await bot.sendMessage(
    chatId,
    `${emoji} Thanks for the feedback — it helps your agent get smarter over time.`
  );
}
