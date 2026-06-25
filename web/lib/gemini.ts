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

async function postGemini<T>(model: string, method: string, body: unknown, retries = 3, initialDelay = 2000): Promise<T> {
  const url = `${GEMINI_BASE_URL}/${modelName(model)}:${method}`;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY!,
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

function getModelRotation(requestedModel: string): string[] {
  const defaults = [
    'google/gemma-4-26b-a4b-it:free',
    'google/gemma-4-31b-it:free',
    'qwen/qwen3-coder:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'liquid/lfm-2.5-1.2b-instruct:free'
  ];
  if (defaults.includes(requestedModel)) {
    return [requestedModel, ...defaults.filter(m => m !== requestedModel)];
  }
  return [requestedModel, ...defaults];
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

    const models = getModelRotation(OPENROUTER_MODEL);
    let lastError: any = null;

    for (const model of models) {
      try {
        console.log(`[OpenRouter] Trying model: ${model}`);
        const data = await postOpenRouter<OpenRouterChatResponse>('chat/completions', {
          model,
          messages: formattedMessages,
          max_tokens: maxTokens,
        });

        const text = data.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error('Empty response from OpenRouter');
        return text;
      } catch (err: any) {
        lastError = err;
        console.warn(`[OpenRouter] Model ${model} failed: ${err.message}. Retrying next model...`);
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    throw new Error(`All OpenRouter models failed. Last error: ${lastError?.message}`);
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

    const models = getModelRotation(OPENROUTER_MODEL);
    let lastError: any = null;

    for (const model of models) {
      try {
        console.log(`[OpenRouter Stream] Trying model: ${model}`);
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://github.com/toonshi/handshake.ai',
            'X-Title': 'Handshake AI',
          },
          body: JSON.stringify({
            model,
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
            
            let parsedData: any = null;
            try {
              parsedData = JSON.parse(raw);
            } catch {
              continue;
            }

            if (parsedData) {
              if (parsedData.error) {
                throw new Error(`OpenRouter streaming error: ${parsedData.error.message || JSON.stringify(parsedData.error)}`);
              }
              const text = parsedData.choices?.[0]?.delta?.content ?? '';
              if (text) {
                fullText += text;
                onToken(text);
              }
            }
          }
        }

        if (!fullText) throw new Error('Empty streaming response from OpenRouter');
        return fullText;
      } catch (err: any) {
        lastError = err;
        console.warn(`[OpenRouter Stream] Model ${model} failed: ${err.message}. Retrying next model...`);
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    throw new Error(`All OpenRouter streaming models failed. Last error: ${lastError?.message}`);
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
  let response: Response | null = null;
  let retries = 3;
  let delay = 2000;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY!,
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      });

      if (response.status === 429 && attempt < retries) {
        console.warn(`[Gemini Stream] Hit 429 (Rate Limit). Retrying in ${delay}ms (Attempt ${attempt}/${retries})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
        continue;
      }
      break;
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.warn(`[Gemini Stream] Connection or rate limit error: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }

  if (!response || !response.ok) {
    const text = response ? await response.text() : 'No response';
    throw new Error(`Gemini streaming error ${response?.status || 'unknown'}: ${text}`);
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
  } catch (err: any) {
    console.warn(`[Gemini Embedding] API failed (${err.message}). Using offline fallback vectorizer.`);
    return generateFallbackEmbedding(text, GEMINI_EMBEDDING_DIMENSIONS);
  }
}

