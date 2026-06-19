const BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function sendMessage(
  chatId: number,
  text: string,
  options?: {
    parse_mode?: 'Markdown' | 'HTML';
    reply_markup?: object;
  }
): Promise<void> {
  const response = await fetch(`${BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...options }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage error ${response.status}: ${body}`);
  }
}

export async function editMessageReplyMarkup(
  chatId: number,
  messageId: number,
  replyMarkup: object
): Promise<void> {
  const response = await fetch(`${BASE}/editMessageReplyMarkup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram editMessageReplyMarkup error ${response.status}: ${body}`);
  }
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  const response = await fetch(`${BASE}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram answerCallbackQuery error ${response.status}: ${body}`);
  }
}

export async function getFile(fileId: string): Promise<{ file_path: string }> {
  const response = await fetch(`${BASE}/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram getFile error ${response.status}: ${body}`);
  }
  const data = (await response.json()) as { result: { file_path: string } };
  return { file_path: data.result.file_path };
}

export function getFileUrl(filePath: string): string {
  return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
}
