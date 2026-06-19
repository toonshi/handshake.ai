import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';

let _genai: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!_genai) {
    _genai = new GoogleGenerativeAI(config.google.apiKey);
  }
  return _genai;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const genai = getGenAI();
  const model = genai.getGenerativeModel({ model: config.google.embeddingModel });
  const result = await model.embedContent(text);
  return result.embedding.values;
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
