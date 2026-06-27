import TelegramBot from 'node-telegram-bot-api';
import { Match, User } from '../types';
import { updateMatch, getUserById, getUserByTelegramId, setUserAcceptAll } from '../db/supabase';

let _bot: TelegramBot | null = null;

export function setBotInstance(bot: TelegramBot): void {
  _bot = bot;
}

function getBot(): TelegramBot {
  if (!_bot) throw new Error('Bot not initialized');
  return _bot;
}

const esc = (unsafe: string) => unsafe
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

function buildMatchMessage(
  matchedUser: User,
  match: Match,
  party: 'a' | 'b'
): string {
  const rationaleText =
    match.rationale.length > 200
      ? match.rationale.slice(0, 200) + '…'
      : match.rationale;

  const techStack =
    match.shared_tech_stack && match.shared_tech_stack.length > 0
      ? match.shared_tech_stack.join(' · ')
      : 'none identified';

  const opportunities =
    match.collaboration_opportunities && match.collaboration_opportunities.length > 0
      ? match.collaboration_opportunities.map((o) => `→ ${o}`).join('\n')
      : '→ none identified';

  const matchIdParty = `${match.id}_${party}`;
  void matchIdParty;

  return `🤝 <b>Your agent found a match.</b>

<b>${esc(matchedUser.name)}</b> · ${esc(matchedUser.role)}

📋 <b>Why:</b>
${esc(rationaleText)}

🛠 <b>Shared / complementary tech:</b>
${esc(techStack)}

🎯 <b>Collaboration opportunities:</b>
${esc(opportunities)}

💬 <b>Open with:</b>
<i>"${esc(match.conversation_starter)}"</i>`;
}

export async function sendMatchNotification(
  match: Match,
  userA: User,
  userB: User
): Promise<void> {
  const bot = getBot();

  // Skip users who haven't messaged the bot (placeholder telegram_id < 0)
  if (userA.telegram_id < 0) {
    console.warn(`[Notifications] Skipping match notification to ${userA.name} — hasn't started the bot yet. ` +
      `Ask them to message the bot with /start to link their account.`);
    return;
  }
  if (userB.telegram_id < 0) {
    console.warn(`[Notifications] Skipping match notification to ${userB.name} — hasn't started the bot yet. ` +
      `Ask them to message the bot with /start to link their account.`);
    return;
  }

  const messageA = buildMatchMessage(userB, match, 'a');
  const messageB = buildMatchMessage(userA, match, 'b');

  const inlineKeyboardA = {
    inline_keyboard: [
      [
        { text: '✅ Connect', callback_data: `consent_yes_${match.id}_a` },
        { text: '✅ Accept All', callback_data: `accept_all_${match.id}_a` },
        { text: '❌ Pass', callback_data: `consent_no_${match.id}_a` },
      ],
    ],
  };

  const inlineKeyboardB = {
    inline_keyboard: [
      [
        { text: '✅ Connect', callback_data: `consent_yes_${match.id}_b` },
        { text: '✅ Accept All', callback_data: `accept_all_${match.id}_b` },
        { text: '❌ Pass', callback_data: `consent_no_${match.id}_b` },
      ],
    ],
  };

  await Promise.all([
    bot.sendMessage(userA.telegram_id, messageA, {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboardA,
    }).catch((err) =>
      console.error(`[Notifications] Failed to send match notification to User A (${userA.name}):`, err)
    ),
    bot.sendMessage(userB.telegram_id, messageB, {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboardB,
    }).catch((err) =>
      console.error(`[Notifications] Failed to send match notification to User B (${userB.name}):`, err)
    ),
  ]);

  console.log(`[Notifications] Sent match notifications for match ${match.id}`);
}

export async function sendMatchNotificationToUser(
  match: Match,
  notifyUser: User,
  matchedWithUser: User,
  party: 'a' | 'b'
): Promise<void> {
  const bot = getBot();

  // Skip users who haven't messaged the bot (placeholder telegram_id < 0)
  if (notifyUser.telegram_id < 0) {
    console.warn(`[Notifications] Skipping match notification to ${notifyUser.name} — hasn't started the bot yet. ` +
      `Ask them to message the bot with /start to link their account.`);
    return;
  }

  const message = buildMatchMessage(matchedWithUser, match, party);

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '✅ Connect', callback_data: `consent_yes_${match.id}_${party}` },
        { text: '✅ Accept All', callback_data: `accept_all_${match.id}_${party}` },
        { text: '❌ Pass', callback_data: `consent_no_${match.id}_${party}` },
      ],
    ],
  };

  await bot.sendMessage(notifyUser.telegram_id, message, {
    parse_mode: 'HTML',
    reply_markup: inlineKeyboard,
  });

  console.log(`[Notifications] Sent match notification to ${notifyUser.name} for match ${match.id}`);
}

export async function handleConsentCallback(
  bot: TelegramBot,
  callbackQuery: TelegramBot.CallbackQuery
): Promise<void> {
  const data = callbackQuery.data;
  if (!data) return;

  // Match both consent_yes/no and accept_all patterns
  const consentMatch = data.match(/^consent_(yes|no)_([a-f0-9-]+)_(a|b)$/);
  const acceptAllMatch = data.match(/^accept_all_([a-f0-9-]+)_(a|b)$/);

  if (!consentMatch && !acceptAllMatch) return;

  const chatId = callbackQuery.message?.chat.id;
  const telegramUserId = callbackQuery.from.id;
  if (!chatId) return;

  await bot.answerCallbackQuery(callbackQuery.id);

  // Handle Pass (no consent)
  if (consentMatch && consentMatch[1] === 'no') {
    const [, , matchId, party] = consentMatch;
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

  // Handle Accept All
  if (acceptAllMatch) {
    const [, matchId, party] = acceptAllMatch;

    // Look up the user and set accept_all_matches
    const triggeringUser = await getUserByTelegramId(telegramUserId);
    if (triggeringUser) {
      await setUserAcceptAll(triggeringUser.id);
    }

    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: chatId, message_id: callbackQuery.message?.message_id }
    );
    await bot.sendMessage(
      chatId,
      '✅ Done — you\'ll be auto-connected to all future high-confidence matches. No more prompts needed.'
    );

    // Also process as consent_yes for this match
    await processConsentYes(bot, chatId, matchId, party as 'a' | 'b', callbackQuery.message?.message_id);
    return;
  }

  // Handle Connect (consent yes)
  if (consentMatch && consentMatch[1] === 'yes') {
    const [, , matchId, party] = consentMatch;
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: chatId, message_id: callbackQuery.message?.message_id }
    );
    await bot.sendMessage(
      chatId,
      '✅ Great! We\'ll call you once the other person also confirms. Sit tight — this will be worth it.'
    );
    await processConsentYes(bot, chatId, matchId, party as 'a' | 'b', callbackQuery.message?.message_id);
  }
}

async function processConsentYes(
  bot: TelegramBot,
  chatId: number,
  matchId: string,
  party: 'a' | 'b',
  _messageId?: number
): Promise<void> {
  const { getMatchById } = await import('../db/supabase');
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

export async function initiateCallsForMatch(match: Match): Promise<void> {
  const bot = getBot();

  const [userA, userB] = await Promise.all([
    getUserById(match.user_a_id),
    getUserById(match.user_b_id),
  ]);

  if (!userA || !userB) {
    console.error(`[Notifications] Could not find users for match ${match.id}`);
    return;
  }

  // Skip users who haven't messaged the bot (placeholder telegram_id < 0)
  if (userA.telegram_id < 0) {
    console.warn(`[Notifications] Skipping intro to ${userA.name} — hasn't started the bot yet. ` +
      `Ask them to message the bot with /start to link their account.`);
    return;
  }
  if (userB.telegram_id < 0) {
    console.warn(`[Notifications] Skipping intro to ${userB.name} — hasn't started the bot yet. ` +
      `Ask them to message the bot with /start to link their account.`);
    return;
  }

  // Send Telegram message with other person's contact
  const telegramMessageA = `📞 <b>The intro is confirmed!</b>

Here's ${esc(userB.name)}'s info:
${userB.telegram_username ? `Telegram: @${esc(userB.telegram_username)}` : 'No username — ask me if you need help connecting'}${userB.wallet_address ? `\nAVAX wallet: <code>${esc(userB.wallet_address)}</code>` : ''}

💬 <b>Open with:</b>
<i>"${esc(match.conversation_starter)}"</i>
`;

  const telegramMessageB = `📞 <b>The intro is confirmed!</b>

Here's ${esc(userA.name)}'s info:
${userA.telegram_username ? `Telegram: @${esc(userA.telegram_username)}` : 'No username — ask me if you need help connecting'}${userA.wallet_address ? `\nAVAX wallet: <code>${esc(userA.wallet_address)}</code>` : ''}

💬 <b>Open with:</b>
<i>"${esc(match.conversation_starter)}"</i>
`;

  await Promise.all([
    bot.sendMessage(userA.telegram_id, telegramMessageA, { parse_mode: 'HTML' }).catch((err) =>
      console.error(`[Notifications] Failed to send intro A to ${userA.name}:`, err)
    ),
    bot.sendMessage(userB.telegram_id, telegramMessageB, { parse_mode: 'HTML' }).catch((err) =>
      console.error(`[Notifications] Failed to send intro B to ${userB.name}:`, err)
    ),
  ]);

  await updateMatch(match.id, { status: 'called' });
}

export async function sendFeedbackRequest(
  match: Match,
  userA: User,
  userB: User
): Promise<void> {
  const bot = getBot();

  // Skip users who haven't messaged the bot (placeholder telegram_id < 0)
  if (userA.telegram_id < 0) {
    console.warn(`[Notifications] Skipping feedback request to ${userA.name} — hasn't started the bot yet.`);
    return;
  }
  if (userB.telegram_id < 0) {
    console.warn(`[Notifications] Skipping feedback request to ${userB.name} — hasn't started the bot yet.`);
    return;
  }

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

  const { getMatchById: getMById } = await import('../db/supabase');
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
