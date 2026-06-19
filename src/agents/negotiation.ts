import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { User, NegotiationResult, AgentTurn, AgentScore } from '../types';
import {
  buildAgentSystemPrompt,
  buildNegotiationTurn1Prompt,
  buildNegotiationTurn2Prompt,
  buildScoringPrompt,
} from './prompts';

let _anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return _anthropic;
}

async function callClaude(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens = 500
): Promise<string> {
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  });
  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude');
  return block.text.trim();
}

function parseAgentScore(raw: string): AgentScore {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      score: Math.min(1, Math.max(0, parseFloat(parsed.match_score) || 0)),
      rationale: String(parsed.rationale || ''),
      conversation_starter: String(parsed.conversation_starter || ''),
    };
  } catch {
    // Fallback: extract score from text
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
  const turn1 = await callClaude(agentASystem, [
    { role: 'user', content: turn1Prompt },
  ]);
  transcript.push({ agent: 'A', content: turn1 });

  // Turn 2: Agent B responds
  const turn2Prompt = buildNegotiationTurn2Prompt(userB);
  const turn2 = await callClaude(agentBSystem, [
    {
      role: 'user',
      content: `Agent A (representing ${userA.name}) says:\n\n${turn1}\n\n${turn2Prompt}`,
    },
  ]);
  transcript.push({ agent: 'B', content: turn2 });

  // Conversation summary for scoring context
  const conversationContext = `Agent A (${userA.name}): ${turn1}\n\nAgent B (${userB.name}): ${turn2}`;

  // Turn 3: Independent scoring from both agents
  const [scoreARaw, scoreBRaw] = await Promise.all([
    callClaude(agentASystem, [
      { role: 'user', content: `${conversationContext}\n\n${buildScoringPrompt(userA, userB)}` },
    ], 400),
    callClaude(agentBSystem, [
      { role: 'user', content: `${conversationContext}\n\n${buildScoringPrompt(userB, userA)}` },
    ], 400),
  ]);

  const scoreA = parseAgentScore(scoreARaw);
  const scoreB = parseAgentScore(scoreBRaw);

  // Use Agent A's rationale and conversation starter as primary (it represents the "seeker")
  const primaryRationale = scoreA.rationale || scoreB.rationale;
  const primaryStarter = scoreA.conversation_starter || scoreB.conversation_starter;

  return {
    agentAScore: scoreA.score,
    agentBScore: scoreB.score,
    rationale: primaryRationale,
    conversationStarter: primaryStarter,
    transcript,
  };
}
