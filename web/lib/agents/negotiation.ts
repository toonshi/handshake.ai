import { User, NegotiationResult, AgentTurn, AgentScore } from '../types';
import { generateGeminiText, streamGeminiText } from '../gemini';
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
      headers: { 'User-Agent': 'handshake-ai' },
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

const DEMO_MODE = process.env.DEMO_MODE === 'true';

function buildDemoTurn(agent: 'A' | 'B', userA: User, userB: User, turn: number): string {
  const speaker = agent === 'A' ? userA : userB;
  const other = agent === 'A' ? userB : userA;
  const scripts: Record<string, string> = {
    A1: `Hi — I'm ${speaker.name}'s agent. ${speaker.name} is a ${speaker.role} actively looking to collaborate. Reading ${other.name}'s profile, the overlap here is real and specific. ${speaker.name} needs exactly what ${other.name} brings — the goals are complementary, not competing. Worth a deeper look?`,
    B2: `Worth it, yes. ${speaker.name}'s situation mirrors what ${other.name} is looking to solve — from the other side. I see a specific collaboration angle around their shared domain that neither could pursue as well solo. What's ${other.name}'s biggest constraint right now?`,
    A3: `${other.name}'s biggest constraint is precisely where ${speaker.name} has the most to offer. They've been in this exact space for years. The fit isn't generic — it's specific enough that the first conversation should produce something concrete. I'd call this a high-confidence match.`,
    B4: `Agreed — high confidence. The complementary skills, the aligned timing, and the mutual need make this exactly the kind of intro that actually goes somewhere. I'm recommending we connect ${speaker.name} and ${other.name}. Both will thank us for it.`,
  };
  return scripts[`${agent}${turn}`] ?? `${speaker.name}'s agent: This is a strong match.`;
}

function buildDemoScore(userA: User, userB: User): string {
  return JSON.stringify({
    match_score: 0.87,
    rationale: `${userA.name} and ${userB.name} are a strong complement: their goals align on the core problem, their challenges are mirror images of each other's strengths, and there's clear potential for mutual value. This is a high-confidence match.`,
    conversation_starter: `"I heard you're working on exactly the problem I've been trying to solve — want to grab 20 minutes this week?"`,
    collaboration_opportunities: [
      'Co-founder or technical partnership',
      'Shared pilot with existing customers',
      'Joint accelerator application',
    ],
    shared_tech_stack: ['Mobile', 'API integration', 'Early-stage product'],
  });
}

async function streamDemo(
  agent: 'A' | 'B',
  userA: User,
  userB: User,
  turn: number,
  onToken: (t: string) => void
): Promise<string> {
  const text = buildDemoTurn(agent, userA, userB, turn);
  const words = text.split(' ');
  for (const word of words) {
    onToken(word + ' ');
    await new Promise((r) => setTimeout(r, 40));
  }
  return text;
}

async function callGemini(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens = 500,
  demoFallback?: () => string
): Promise<string> {
  if (DEMO_MODE && demoFallback) return demoFallback();
  try {
    return await generateGeminiText(systemPrompt, messages, maxTokens);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if ((msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) && demoFallback) {
      console.warn('[negotiation] Gemini 429 — using demo fallback');
      return demoFallback();
    }
    throw err;
  }
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
  ], 500, () => buildDemoTurn('A', userA, userB, 1));
  transcript.push({ agent: 'A', content: turn1 });

  // Turn 2: Agent B responds with specific overlap
  const turn2Prompt = buildNegotiationTurn2Prompt(userB, turn1);
  const turn2 = await callGemini(agentBSystem, [
    { role: 'user', content: turn2Prompt },
  ], 500, () => buildDemoTurn('B', userA, userB, 2));
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
  ], 500, () => buildDemoTurn('A', userA, userB, 3));
  transcript.push({ agent: 'A', content: turn3 });

  // Turn 4: Agent B confirms or refines
  const conversationWithTurn3 = `${conversationSoFar}

Agent A (${userA.name}): ${turn3}`;

  const turn4Prompt = buildNegotiationTurn4Prompt(userB);
  const turn4 = await callGemini(agentBSystem, [
    { role: 'user', content: `${conversationWithTurn3}\n\n${turn4Prompt}` },
  ], 500, () => buildDemoTurn('B', userA, userB, 4));
  transcript.push({ agent: 'B', content: turn4 });

  // Full conversation context for scoring
  const fullConversation = `${conversationWithTurn3}

Agent B (${userB.name}): ${turn4}`;

  // Scoring: both agents independently score in parallel
  const [scoreARaw, scoreBRaw] = await Promise.all([
    callGemini(agentASystem, [
      { role: 'user', content: `${fullConversation}\n\n${buildScoringPrompt(userA, userB)}` },
    ], 600, () => buildDemoScore(userA, userB)),
    callGemini(agentBSystem, [
      { role: 'user', content: `${fullConversation}\n\n${buildScoringPrompt(userB, userA)}` },
    ], 600, () => buildDemoScore(userA, userB)),
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

export interface NegotiationCallbacks {
  onTurnStart: (agent: 'A' | 'B', name: string, turn: number) => void;
  onToken: (agent: 'A' | 'B', text: string) => void;
  onTurnEnd: (agent: 'A' | 'B', turn: number) => void;
  onScoring: () => void;
  onResult: (result: NegotiationResult) => void;
}

export async function runAgentNegotiationStreaming(
  userA: User,
  userB: User,
  callbacks: NegotiationCallbacks
): Promise<NegotiationResult> {
  const transcript: AgentTurn[] = [];

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

  async function doStream(
    agent: 'A' | 'B',
    system: string,
    msgs: Array<{ role: 'user' | 'assistant'; content: string }>,
    turn: number
  ): Promise<string> {
    if (DEMO_MODE) return streamDemo(agent, userA, userB, turn, (t) => callbacks.onToken(agent, t));
    try {
      return await streamGeminiText(system, msgs, (t) => callbacks.onToken(agent, t));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        console.warn('[negotiation] Gemini 429 — using demo fallback for streaming');
        return streamDemo(agent, userA, userB, turn, (t) => callbacks.onToken(agent, t));
      }
      throw err;
    }
  }

  // Turn 1: Agent A introduces
  callbacks.onTurnStart('A', userA.name, 1);
  const turn1 = await doStream('A', agentASystem,
    [{ role: 'user', content: buildNegotiationTurn1Prompt(userA, userB) }], 1);
  transcript.push({ agent: 'A', content: turn1 });
  callbacks.onTurnEnd('A', 1);

  // Turn 2: Agent B responds
  callbacks.onTurnStart('B', userB.name, 2);
  const turn2 = await doStream('B', agentBSystem,
    [{ role: 'user', content: buildNegotiationTurn2Prompt(userB, turn1) }], 2);
  transcript.push({ agent: 'B', content: turn2 });
  callbacks.onTurnEnd('B', 2);

  const conversationSoFar = `=== Conversation transcript so far ===
Agent A (${userA.name}): ${turn1}

Agent B (${userB.name}): ${turn2}
=== End transcript ===`;

  // Turn 3: Agent A proposes collaboration
  callbacks.onTurnStart('A', userA.name, 3);
  const turn3 = await doStream('A', agentASystem,
    [{ role: 'user', content: `${conversationSoFar}\n\n${buildNegotiationTurn3Prompt(userA)}` }], 3);
  transcript.push({ agent: 'A', content: turn3 });
  callbacks.onTurnEnd('A', 3);

  const conversationWithTurn3 = `${conversationSoFar}

Agent A (${userA.name}): ${turn3}`;

  // Turn 4: Agent B confirms or refines
  callbacks.onTurnStart('B', userB.name, 4);
  const turn4 = await doStream('B', agentBSystem,
    [{ role: 'user', content: `${conversationWithTurn3}\n\n${buildNegotiationTurn4Prompt(userB)}` }], 4);
  transcript.push({ agent: 'B', content: turn4 });
  callbacks.onTurnEnd('B', 4);

  const fullConversation = `${conversationWithTurn3}

Agent B (${userB.name}): ${turn4}`;

  callbacks.onScoring();

  const [scoreARaw, scoreBRaw] = await Promise.all([
    callGemini(agentASystem, [
      { role: 'user', content: `${fullConversation}\n\n${buildScoringPrompt(userA, userB)}` },
    ], 600, () => buildDemoScore(userA, userB)),
    callGemini(agentBSystem, [
      { role: 'user', content: `${fullConversation}\n\n${buildScoringPrompt(userB, userA)}` },
    ], 600, () => buildDemoScore(userA, userB)),
  ]);

  const scoreA = parseAgentScore(scoreARaw);
  const scoreB = parseAgentScore(scoreBRaw);

  const collaborationOpportunities = mergeUnique(
    scoreA.collaboration_opportunities,
    scoreB.collaboration_opportunities
  );
  const sharedTechStack = mergeUnique(
    scoreA.shared_tech_stack,
    scoreB.shared_tech_stack
  );

  const result: NegotiationResult = {
    agentAScore: scoreA.score,
    agentBScore: scoreB.score,
    rationale: scoreA.rationale || scoreB.rationale,
    conversationStarter: scoreA.conversation_starter || scoreB.conversation_starter,
    collaborationOpportunities,
    sharedTechStack,
    transcript,
  };

  callbacks.onResult(result);
  return result;
}
