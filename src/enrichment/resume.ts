// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { ResumeEnrichment } from '../types';

let _genai: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!_genai) _genai = new GoogleGenerativeAI(config.google.apiKey);
  return _genai;
}

export async function parseResume(fileBuffer: Buffer): Promise<ResumeEnrichment> {
  // Extract text from PDF
  const pdf = await pdfParse(fileBuffer);
  const text = pdf.text.replace(/\s+/g, ' ').trim().slice(0, 5000);

  if (!text || text.length < 50) {
    throw new Error('Could not extract readable text from this PDF');
  }

  // Gemini extraction
  const genai = getGenAI();
  const model = genai.getGenerativeModel({ model: config.google.model });

  const prompt = `Extract structured information from this resume/CV for a professional networking system.

Resume text:
${text}

Return JSON only (no markdown):
{
  "summary": "2-3 sentence professional summary of this person",
  "skills": ["up to 10 specific technical or professional skills"],
  "experienceHighlights": ["up to 5 notable roles, projects, or achievements with brief context"],
  "education": ["degrees or certifications, institution, year if available"]
}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();

  let extracted: {
    summary: string;
    skills: string[];
    experienceHighlights: string[];
    education: string[];
  };

  try {
    extracted = JSON.parse(cleaned);
  } catch {
    extracted = {
      summary: 'Resume uploaded but could not be fully parsed.',
      skills: [],
      experienceHighlights: [],
      education: [],
    };
  }

  return {
    summary: extracted.summary ?? '',
    skills: extracted.skills ?? [],
    experienceHighlights: extracted.experienceHighlights ?? [],
    education: extracted.education ?? [],
    fetchedAt: new Date().toISOString(),
  };
}

export async function downloadTelegramFile(
  fileUrl: string
): Promise<Buffer> {
  const response = await fetch(fileUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to download file: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
