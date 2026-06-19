import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { User, NegotiationResult, AgentTurn, AgentScore } from '../types';
import {
  buildAgentSystemPrompt,
  buildNegotiationTurn1Prompt,
  buildNegotiationTurn2Prompt,
  buildScoringPrompt,
} from './prompts';

let _genai: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!_genai) {
    _genai = new GoogleGenerativeAI(config.google.apiKey);
  }
  return _genai;
}

async function callGemini(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens = 500
): Promise<string> {
  const genai = getGenAI();
  const model = genai.getGenerativeModel({
    model: config.google.model,
    systemInstruction: systemPrompt,
  });

  // Convert to Gemini history format (all but last message)
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const lastMessage = messages[messages.length - 1];

  const chat = model.startChat({
    history,
    generationConfig: { maxOutputTokens: maxTokens },
  });

  const result = await chat.sendMessage(lastMessage.content);
  return result.response.text().trim();
}

function parseAgentScore(raw: string): AgentScore {
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      score: Math.min(1, Math.max(0, parseFloat(parsed.match_score) || 0)),
      rationale: String(parsed.rationale || ''),
      conversation_starter: String(parsed.conversation_starter || ''),
    };
  } catch {
    const scoreMatch = raw.match(/match_score["\s:]+([0-9.]+)/);
    return {
      score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
      rationale: raw,
      conversation_starter: '',
    };
  }
}

export async function runAgentNegotiation(
  userA: User,
  userB: User
): Promise<NegotiationResult> {
  const transcript: AgentTurn[] = [];

  const agentASystem = buildAgentSystemPrompt(userA);
  const agentBSystem = buildAgentSystemPrompt(userB);

  // Turn 1: Agent A introduces and asks
  const turn1Prompt = buildNegotiationTurn1Prompt(userA, userB);
  const turn1 = await callGemini(agentASystem, [
    { role: 'user', content: turn1Prompt },
  ]);
  transcript.push({ agent: 'A', content: turn1 });

  // Turn 2: Agent B responds
  const turn2Prompt = buildNegotiationTurn2Prompt(userB);
  const turn2 = await callGemini(agentBSystem, [
    {
      role: 'user',
      content: `Agent A (representing ${userA.name}) says:\n\n${turn1}\n\n${turn2Prompt}`,
    },
  ]);
  transcript.push({ agent: 'B', content: turn2 });

  // Turn 3: Independent scoring from both agents
  const conversationContext = `Agent A (${userA.name}): ${turn1}\n\nAgent B (${userB.name}): ${turn2}`;

  const [scoreARaw, scoreBRaw] = await Promise.all([
    callGemini(agentASystem, [
      { role: 'user', content: `${conversationContext}\n\n${buildScoringPrompt(userA, userB)}` },
    ], 400),
    callGemini(agentBSystem, [
      { role: 'user', content: `${conversationContext}\n\n${buildScoringPrompt(userB, userA)}` },
    ], 400),
  ]);

  const scoreA = parseAgentScore(scoreARaw);
  const scoreB = parseAgentScore(scoreBRaw);

  return {
    agentAScore: scoreA.score,
    agentBScore: scoreB.score,
    rationale: scoreA.rationale || scoreB.rationale,
    conversationStarter: scoreA.conversation_starter || scoreB.conversation_starter,
    transcript,
  };
}
