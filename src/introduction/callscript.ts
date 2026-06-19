import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { User, Match, CallScript } from '../types';

let _genai: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!_genai) {
    _genai = new GoogleGenerativeAI(config.google.apiKey);
  }
  return _genai;
}

export async function generateCallScripts(
  match: Match,
  userA: User,
  userB: User
): Promise<CallScript> {
  const genai = getGenAI();
  const model = genai.getGenerativeModel({ model: config.google.model });

  const prompt = `Generate two ultra-concise phone call scripts (under 30 seconds each when spoken aloud) for an AI voice agent introducing a high-confidence match.

Person A: ${userA.name} (${userA.role})
  Goals: ${userA.goals}
  Challenge: ${userA.challenges}

Person B: ${userB.name} (${userB.role})
  Goals: ${userB.goals}
  Offers: ${userB.offers}

Why they match: ${match.rationale}
Conversation starter: ${match.conversation_starter}

Rules:
- Start with: "Hi [Name] — this is Kuzana Connector."
- Mention the other person's name and ONE specific, concrete reason to connect
- Tell them to check Telegram for contact details and the conversation starter
- End with "Good luck."
- Maximum 60 words per script
- No generic networking language — be specific to these two people

Return as JSON only (no markdown):
{
  "personAScript": "script for calling ${userA.name}",
  "personBScript": "script for calling ${userB.name}"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const cleaned = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(cleaned) as CallScript;
  } catch {
    return {
      personAScript: `Hi ${userA.name} — this is Kuzana Connector. Your agent identified a high-confidence match. ${userB.name} may be able to help with your current challenge. Check your Telegram for their contact and a conversation starter. Good luck.`,
      personBScript: `Hi ${userB.name} — this is Kuzana Connector. Your agent identified a high-confidence match. ${userA.name} is working on something where your expertise is directly relevant. Check your Telegram for their contact and a conversation starter. Good luck.`,
    };
  }
}
