import { User, NegotiationResult, AgentTurn, AgentScore } from '../types';
import { generateGeminiText } from '../utils/gemini';
import {
  buildAgentSystemPrompt,
  buildNegotiationTurn1Prompt,
  buildNegotiationTurn2Prompt,
  buildNegotiationTurn3Prompt,
  buildNegotiationTurn4Prompt,
  buildScoringPrompt,
} from './prompts';

interface LiveRepo {
  name: string;
  description: string;
  stars: number;
  language: string;
}

async function fetchLiveGitHubRepos(username: string): Promise<LiveRepo[]> {
  try {
    const url = `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=8&type=owner`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'kuzana-connector' },
    });
    if (!response.ok) return [];
    const data = await response.json() as Array<{
      name: string;
      description: string | null;
      stargazers_count: number;
      language: string | null;
      fork: boolean;
    }>;
    return data
      .filter((r) => !r.fork)
      .map((r) => ({
        name: r.name,
        description: r.description ?? '',
        stars: r.stargazers_count,
        language: r.language ?? '',
      }));
  } catch {
    return [];
  }
}

async function callGemini(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens = 500
): Promise<string> {
  return generateGeminiText(systemPrompt, messages, maxTokens);
}

function parseAgentScore(raw: string): AgentScore {
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      score: Math.min(1, Math.max(0, parseFloat(parsed.match_score) || 0)),
      rationale: String(parsed.rationale || ''),
      conversation_starter: String(parsed.conversation_starter || ''),
      collaboration_opportunities: Array.isArray(parsed.collaboration_opportunities)
        ? parsed.collaboration_opportunities.map(String)
        : [],
      shared_tech_stack: Array.isArray(parsed.shared_tech_stack)
        ? parsed.shared_tech_stack.map(String)
        : [],
    };
  } catch {
    const scoreMatch = raw.match(/match_score["\s:]+([0-9.]+)/);
    return {
      score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
      rationale: raw,
      conversation_starter: '',
      collaboration_opportunities: [],
      shared_tech_stack: [],
    };
  }
}

function mergeUnique(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of [...a, ...b]) {
    const key = item.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export async function runAgentNegotiation(
  userA: User,
  userB: User
): Promise<NegotiationResult> {
  const transcript: AgentTurn[] = [];

  // Fetch live GitHub repos for both users in parallel
  const [liveReposA, liveReposB] = await Promise.all([
    userA.enrichments?.github?.username
      ? fetchLiveGitHubRepos(userA.enrichments.github.username)
      : Promise.resolve([] as LiveRepo[]),
    userB.enrichments?.github?.username
      ? fetchLiveGitHubRepos(userB.enrichments.github.username)
      : Promise.resolve([] as LiveRepo[]),
  ]);

  const agentASystem = buildAgentSystemPrompt(userA, liveReposA);
  const agentBSystem = buildAgentSystemPrompt(userB, liveReposB);

  // Turn 1: Agent A introduces and asks
  const turn1Prompt = buildNegotiationTurn1Prompt(userA, userB);
  const turn1 = await callGemini(agentASystem, [
    { role: 'user', content: turn1Prompt },
  ]);
  transcript.push({ agent: 'A', content: turn1 });

  // Turn 2: Agent B responds with specific overlap
  const turn2Prompt = buildNegotiationTurn2Prompt(userB, turn1);
  const turn2 = await callGemini(agentBSystem, [
    { role: 'user', content: turn2Prompt },
  ]);
  transcript.push({ agent: 'B', content: turn2 });

  // Build conversation context for continuing agents
  const conversationSoFar = `=== Conversation transcript so far ===
Agent A (${userA.name}): ${turn1}

Agent B (${userB.name}): ${turn2}
=== End transcript ===`;

  // Turn 3: Agent A proposes specific collaboration
  const turn3Prompt = buildNegotiationTurn3Prompt(userA);
  const turn3 = await callGemini(agentASystem, [
    { role: 'user', content: `${conversationSoFar}\n\n${turn3Prompt}` },
  ]);
  transcript.push({ agent: 'A', content: turn3 });

  // Turn 4: Agent B confirms or refines
  const conversationWithTurn3 = `${conversationSoFar}

Agent A (${userA.name}): ${turn3}`;

  const turn4Prompt = buildNegotiationTurn4Prompt(userB);
  const turn4 = await callGemini(agentBSystem, [
    { role: 'user', content: `${conversationWithTurn3}\n\n${turn4Prompt}` },
  ]);
  transcript.push({ agent: 'B', content: turn4 });

  // Full conversation context for scoring
  const fullConversation = `${conversationWithTurn3}

Agent B (${userB.name}): ${turn4}`;

  // Scoring: both agents independently score in parallel
  const [scoreARaw, scoreBRaw] = await Promise.all([
    callGemini(agentASystem, [
      { role: 'user', content: `${fullConversation}\n\n${buildScoringPrompt(userA, userB)}` },
    ], 600),
    callGemini(agentBSystem, [
      { role: 'user', content: `${fullConversation}\n\n${buildScoringPrompt(userB, userA)}` },
    ], 600),
  ]);

  const scoreA = parseAgentScore(scoreARaw);
  const scoreB = parseAgentScore(scoreBRaw);

  // Merge collaboration opportunities and tech stack from both agents
  const collaborationOpportunities = mergeUnique(
    scoreA.collaboration_opportunities,
    scoreB.collaboration_opportunities
  );
  const sharedTechStack = mergeUnique(
    scoreA.shared_tech_stack,
    scoreB.shared_tech_stack
  );

  return {
    agentAScore: scoreA.score,
    agentBScore: scoreB.score,
    rationale: scoreA.rationale || scoreB.rationale,
    conversationStarter: scoreA.conversation_starter || scoreB.conversation_starter,
    collaborationOpportunities,
    sharedTechStack,
    transcript,
  };
}
