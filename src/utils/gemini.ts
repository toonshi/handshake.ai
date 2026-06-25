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

async function postGemini<T>(model: string, method: string, body: unknown, retries = 3, initialDelay = 2000): Promise<T> {
  const url = `${GEMINI_BASE_URL}/${modelName(model)}:${method}`;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.gemini.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429 && attempt < retries) {
        console.warn(`[Gemini] Hit 429 (Rate Limit). Retrying in ${delay}ms (Attempt ${attempt}/${retries})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${text}`);
      }

      return (await response.json()) as T;
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.warn(`[Gemini] Connection or rate limit error: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error('Gemini request failed after maximum retries');
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

function generateFallbackEmbedding(text: string, dimensions = 1536): number[] {
  const vector = new Array(dimensions).fill(0);
  
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);
    
  if (words.length === 0) {
    vector[0] = 1.0;
    return vector;
  }
  
  for (const word of words) {
    for (let seed = 0; seed < 3; seed++) {
      let hash = seed;
      for (let i = 0; i < word.length; i++) {
        hash = (hash * 33 + word.charCodeAt(i)) | 0;
      }
      const idx = Math.abs(hash) % dimensions;
      vector[idx] += 1.0;
    }
  }
  
  let sumSq = 0;
  for (let i = 0; i < dimensions; i++) {
    sumSq += vector[i] * vector[i];
  }
  
  const magnitude = Math.sqrt(sumSq);
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] /= magnitude;
    }
  } else {
    vector[0] = 1.0;
  }
  
  return vector;
}

export async function generateGeminiEmbedding(text: string): Promise<number[]> {
  try {
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
  } catch (err: any) {
    console.warn(`[Gemini Embedding] API failed (${err.message}). Using offline fallback vectorizer.`);
    return generateFallbackEmbedding(text, config.gemini.embeddingDimensions);
  }
}

