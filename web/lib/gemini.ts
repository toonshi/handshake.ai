import dns from 'dns';
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? 'gemini-2.5-flash';
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-2';
const GEMINI_EMBEDDING_DIMENSIONS = parseInt(process.env.GEMINI_EMBEDDING_DIMENSIONS ?? '1536', 10);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o';
const OPENROUTER_EMBEDDING_MODEL = process.env.OPENROUTER_EMBEDDING_MODEL ?? 'openai/text-embedding-3-small';

type GeminiRole = 'user' | 'model';

interface GeminiContent {
  role?: GeminiRole;
  parts: Array<{ text: string }>;
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

interface EmbedContentResponse {
  embedding?: {
    values?: number[];
  };
}

function modelName(model: string): string {
  return model.startsWith('models/') ? model.slice('models/'.length) : model;
}

async function postOpenRouter<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`https://openrouter.ai/api/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://github.com/toonshi/handshake.ai',
      'X-Title': 'Handshake AI',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

async function postGemini<T>(model: string, method: string, body: unknown): Promise<T> {
  const url = `${GEMINI_BASE_URL}/${modelName(model)}:${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY!,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

export async function generateGeminiText(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens = 500
): Promise<string> {
  if (OPENROUTER_API_KEY) {
    const formattedMessages = [];
    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    for (const msg of messages) {
      formattedMessages.push({ role: msg.role, content: msg.content });
    }

    interface OpenRouterChatResponse {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    }

    const data = await postOpenRouter<OpenRouterChatResponse>('chat/completions', {
      model: OPENROUTER_MODEL,
      messages: formattedMessages,
      max_tokens: maxTokens,
    });

    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response from OpenRouter');
    return text;
  }

  const contents: GeminiContent[] = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));

  const body = {
    ...(systemPrompt
      ? {
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
        }
      : {}),
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
    },
  };

  const data = await postGemini<GenerateContentResponse>(
    GEMINI_TEXT_MODEL,
    'generateContent',
    body
  );

  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

export async function streamGeminiText(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onToken: (text: string) => void,
  maxTokens = 500
): Promise<string> {
  if (OPENROUTER_API_KEY) {
    const formattedMessages = [];
    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    for (const msg of messages) {
      formattedMessages.push({ role: msg.role, content: msg.content });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://github.com/toonshi/handshake.ai',
        'X-Title': 'Handshake AI',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: formattedMessages,
        max_tokens: maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter streaming error ${response.status}: ${text}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const raw = trimmed.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const data = JSON.parse(raw);
          const text = data.choices?.[0]?.delta?.content ?? '';
          if (text) {
            fullText += text;
            onToken(text);
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    if (!fullText) throw new Error('Empty streaming response from OpenRouter');
    return fullText;
  }

  const contents: GeminiContent[] = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));

  const body = {
    ...(systemPrompt
      ? { systemInstruction: { parts: [{ text: systemPrompt }] } }
      : {}),
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };

  const url = `${GEMINI_BASE_URL}/${modelName(GEMINI_TEXT_MODEL)}:streamGenerateContent?alt=sse`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY!,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini streaming error ${response.status}: ${text}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      try {
        const data = JSON.parse(raw);
        const text = data.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text ?? '')
          .join('') ?? '';
        if (text) {
          fullText += text;
          onToken(text);
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  if (!fullText) throw new Error('Empty streaming response from Gemini');
  return fullText;
}

export async function generateGeminiEmbedding(text: string): Promise<number[]> {
  if (OPENROUTER_API_KEY) {
    interface OpenRouterEmbeddingResponse {
      data?: Array<{
        embedding?: number[];
      }>;
    }

    const data = await postOpenRouter<OpenRouterEmbeddingResponse>('embeddings', {
      model: OPENROUTER_EMBEDDING_MODEL,
      input: text,
    });

    const values = data.data?.[0]?.embedding;
    if (!values?.length) throw new Error('Empty embedding from OpenRouter');
    return values;
  }

  const data = await postGemini<EmbedContentResponse>(
    GEMINI_EMBEDDING_MODEL,
    'embedContent',
    {
      content: {
        parts: [{ text }],
      },
      output_dimensionality: GEMINI_EMBEDDING_DIMENSIONS,
    }
  );

  const values = data.embedding?.values;
  if (!values?.length) throw new Error('Empty embedding from Gemini');
  return values;
}
