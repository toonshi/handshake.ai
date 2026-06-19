const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? 'gemini-2.5-flash';
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-2';
const GEMINI_EMBEDDING_DIMENSIONS = parseInt(process.env.GEMINI_EMBEDDING_DIMENSIONS ?? '1536', 10);

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
