import { Match, User } from '../types';
import { updateMatch, getUserById, getUserByTelegramId, getMatchById, setUserAcceptAll } from '../db';
import { sendMessage, editMessageReplyMarkup, answerCallbackQuery } from '../telegram';
import { recordConnectionOnChain, snowtraceUrl } from '../avalanche';

interface CallbackQuery {
  id: string;
  from: { id: number; username?: string };
  message?: { chat: { id: number }; message_id: number };
  data?: string;
}

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

  // party param is used to label the callback data
  void party;

  return `🤝 *Your agent found a match.*

*${matchedUser.name}* · ${matchedUser.role}

📋 *Why:*
${rationaleText}

🛠 *Shared / complementary tech:*
${techStack}

🎯 *Collaboration opportunities:*
${opportunities}

💬 *Open with:*
_"${match.conversation_starter}"_`;
}

export async function sendMatchNotification(
  match: Match,
  userA: User,
  userB: User
): Promise<void> {
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
    sendMessage(userA.telegram_id, messageA, {
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboardA,
    }),
    sendMessage(userB.telegram_id, messageB, {
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboardB,
    }),
  ]);

  console.log(`[Notifications] Sent match notifications for match ${match.id}`);
}

export async function sendMatchNotificationToUser(
  match: Match,
  notifyUser: User,
  matchedWithUser: User,
  party: 'a' | 'b'
): Promise<void> {
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

  await sendMessage(notifyUser.telegram_id, message, {
    parse_mode: 'Markdown',
    reply_markup: inlineKeyboard,
  });

  console.log(`[Notifications] Sent match notification to ${notifyUser.name} for match ${match.id}`);
}

export async function initiateCallsForMatch(match: Match): Promise<void> {
  const [userA, userB] = await Promise.all([
    getUserById(match.user_a_id),
    getUserById(match.user_b_id),
  ]);

  if (!userA || !userB) {
    console.error(`[Notifications] Could not find users for match ${match.id}`);
    return;
  }

  // Record on Avalanche — best-effort, never blocks the intro
  const txHash = await recordConnectionOnChain(userA.wallet_address, userB.wallet_address, match.id);
  if (txHash) {
    await updateMatch(match.id, { tx_hash: txHash }).catch(() => {/* non-fatal */});
  }

  // Send Telegram message with other person's contact
  const chainLine = txHash
    ? `\n⛓ *On Avalanche:* [View transaction](${snowtraceUrl(txHash)})`
    : '';

  const telegramMessageA = `📞 *The intro is confirmed!*

Here's ${userB.name}'s info:
${userB.telegram_username ? `Telegram: @${userB.telegram_username}` : 'No username — ask me if you need help connecting'}${userB.wallet_address ? `\nAVAX wallet: \`${userB.wallet_address}\`` : ''}${chainLine}

💬 *Open with:*
_"${match.conversation_starter}"_

`;

  const telegramMessageB = `📞 *The intro is confirmed!*

Here's ${userA.name}'s info:
${userA.telegram_username ? `Telegram: @${userA.telegram_username}` : 'No username — ask me if you need help connecting'}${userA.wallet_address ? `\nAVAX wallet: \`${userA.wallet_address}\`` : ''}${chainLine}

💬 *Open with:*
_"${match.conversation_starter}"_
`;

  await Promise.all([
    sendMessage(userA.telegram_id, telegramMessageA, { parse_mode: 'Markdown' }),
    sendMessage(userB.telegram_id, telegramMessageB, { parse_mode: 'Markdown' }),
  ]);

  await updateMatch(match.id, { status: 'called' });
}

async function processConsentYes(
  chatId: number,
  matchId: string,
  party: 'a' | 'b'
): Promise<void> {
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

  // suppress unused variable warning
  void chatId;
}

export async function handleConsentCallback(callbackQuery: CallbackQuery): Promise<void> {
  const data = callbackQuery.data;
  if (!data) return;

  const consentMatch = data.match(/^consent_(yes|no)_([a-f0-9-]+)_(a|b)$/);
  const acceptAllMatch = data.match(/^accept_all_([a-f0-9-]+)_(a|b)$/);

  if (!consentMatch && !acceptAllMatch) return;

  const chatId = callbackQuery.message?.chat.id;
  const telegramUserId = callbackQuery.from.id;
  if (!chatId) return;

  await answerCallbackQuery(callbackQuery.id);

  // Handle Pass (no consent)
  if (consentMatch && consentMatch[1] === 'no') {
    const [, , matchId, party] = consentMatch;
    await editMessageReplyMarkup(chatId, callbackQuery.message!.message_id, { inline_keyboard: [] });
    await sendMessage(
      chatId,
      "👍 No worries — your agent will keep looking. I'll message you when the next match comes through."
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

    const triggeringUser = await getUserByTelegramId(telegramUserId);
    if (triggeringUser) {
      await setUserAcceptAll(triggeringUser.id);
    }

    await editMessageReplyMarkup(chatId, callbackQuery.message!.message_id, { inline_keyboard: [] });
    await sendMessage(
      chatId,
      "✅ Done — you'll be auto-connected to all future high-confidence matches. No more prompts needed."
    );

    await processConsentYes(chatId, matchId, party as 'a' | 'b');
    return;
  }

  // Handle Connect (consent yes)
  if (consentMatch && consentMatch[1] === 'yes') {
    const [, , matchId, party] = consentMatch;
    await editMessageReplyMarkup(chatId, callbackQuery.message!.message_id, { inline_keyboard: [] });
    await sendMessage(
      chatId,
      "✅ Great! We'll call you once the other person also confirms. Sit tight — this will be worth it."
    );
    await processConsentYes(chatId, matchId, party as 'a' | 'b');
  }
}
