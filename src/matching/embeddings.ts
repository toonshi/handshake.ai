import { generateGeminiEmbedding } from '../utils/gemini';

export async function generateEmbedding(text: string): Promise<number[]> {
  return generateGeminiEmbedding(text);
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
