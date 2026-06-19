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
