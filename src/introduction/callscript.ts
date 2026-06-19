import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { User, Match, CallScript } from '../types';

let _anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return _anthropic;
}

export async function generateCallScripts(
  match: Match,
  userA: User,
  userB: User
): Promise<CallScript> {
  const anthropic = getAnthropic();

  const context = `
Match details:
- Person A: ${userA.name} (${userA.role})
  Goals: ${userA.goals}
  Challenge: ${userA.challenges}

- Person B: ${userB.name} (${userB.role})
  Goals: ${userB.goals}
  Offers: ${userB.offers}

Why they match: ${match.rationale}

Conversation starter: ${match.conversation_starter}
`;

  const prompt = `Generate two ultra-concise phone call scripts (under 30 seconds each when spoken aloud) for an AI voice agent introducing a high-confidence match.

${context}

Rules:
- Start with: "Hi [Name] — this is Kuzana Connector."
- Mention the other person's name and ONE specific, concrete reason to connect
- Reference what the match agent worked out
- Tell them to check Telegram for contact details and the conversation starter
- End with "Good luck."
- Maximum 60 words per script
- No generic networking language — be specific to these two people

Return as JSON (no markdown):
{
  "personAScript": "script for calling ${userA.name}",
  "personBScript": "script for calling ${userB.name}"
}`;

  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected Claude response');

  const cleaned = block.text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(cleaned) as CallScript;
  } catch {
    // Fallback scripts if parsing fails
    return {
      personAScript: `Hi ${userA.name} — this is Kuzana Connector. Your agent identified a high-confidence match. ${userB.name} may be able to help with your current challenge. Check your Telegram for their contact and a conversation starter. Good luck.`,
      personBScript: `Hi ${userB.name} — this is Kuzana Connector. Your agent identified a high-confidence match. ${userA.name} is working on something where your expertise is directly relevant. Check your Telegram for their contact and a conversation starter. Good luck.`,
    };
  }
}
