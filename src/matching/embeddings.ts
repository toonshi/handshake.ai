import OpenAI from 'openai';
import { config } from '../config';

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return _openai;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: config.openai.embeddingModel,
    input: text,
    dimensions: config.openai.embeddingDimensions,
  });
  return response.data[0].embedding;
}

export async function generateUserEmbeddings(
  goals: string,
  challenges: string
): Promise<{ goalEmbedding: number[]; challengeEmbedding: number[] }> {
  const [goalEmbedding, challengeEmbedding] = await Promise.all([
    generateEmbedding(goals),
    generateEmbedding(challenges),
  ]);
  return { goalEmbedding, challengeEmbedding };
}
