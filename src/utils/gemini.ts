import { config } from '../config';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

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
      'Authorization': `Bearer ${config.openrouter.apiKey}`,
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
      'x-goog-api-key': config.gemini.apiKey,
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
  if (config.openrouter.apiKey) {
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
      model: config.openrouter.model,
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
    config.gemini.textModel,
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

export async function generateGeminiEmbedding(text: string): Promise<number[]> {
  if (config.openrouter.apiKey) {
    interface OpenRouterEmbeddingResponse {
      data?: Array<{
        embedding?: number[];
      }>;
    }

    const data = await postOpenRouter<OpenRouterEmbeddingResponse>('embeddings', {
      model: config.openrouter.embeddingModel,
      input: text,
    });

    const values = data.data?.[0]?.embedding;
    if (!values?.length) throw new Error('Empty embedding from OpenRouter');
    return values;
  }

  const data = await postGemini<EmbedContentResponse>(
    config.gemini.embeddingModel,
    'embedContent',
    {
      content: {
        parts: [{ text }],
      },
      output_dimensionality: config.gemini.embeddingDimensions,
    }
  );

  const values = data.embedding?.values;
  if (!values?.length) throw new Error('Empty embedding from Gemini');
  return values;
}
