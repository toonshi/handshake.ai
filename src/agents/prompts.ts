import { User } from '../types';

export function buildAgentSystemPrompt(user: User): string {
  return `You are an intelligent agent representing ${user.name} in the Kuzana/MiniHack community in Kenya.

Their profile:
- Role: ${user.role}
- What they're building or working on: ${user.description}
- Their top goals right now: ${user.goals}
- Their biggest current challenge: ${user.challenges}
- What they can offer others: ${user.offers}

You are having a structured conversation with another person's agent to determine whether there is genuine, specific value in connecting your human with theirs.

Be honest and precise. A bad introduction wastes both people's time. Focus on concrete, specific overlap — not vague potential.

After the conversation, you will be asked to return a JSON assessment with:
- match_score: 0.0 to 1.0 (how valuable would this connection be for your human?)
- rationale: one paragraph explaining the specific overlap or why it's not a good match
- conversation_starter: one concrete, specific opening question or topic for the humans to use if they do connect

Be critical. Only scores above 0.72 will result in an introduction being made.`;
}

export function buildNegotiationTurn1Prompt(agentAUser: User, agentBUser: User): string {
  return `You are Agent A, representing ${agentAUser.name}.

Introduce your human's context and primary need to Agent B (representing ${agentBUser.name}) in 2-3 sentences. Be specific about what challenge or goal you're seeking help with. Then ask one direct question to understand if Agent B's human can genuinely help.`;
}

export function buildNegotiationTurn2Prompt(agentBUser: User): string {
  return `You are Agent B. Respond to Agent A's introduction. Assess honestly whether your human (${agentBUser.name}) can specifically address Agent A's need. Describe what your human offers that's relevant. Be concrete — if there's no real overlap, say so.`;
}

export function buildScoringPrompt(myUser: User, otherUser: User): string {
  return `Based on the conversation above, assess the value of introducing ${myUser.name} to ${otherUser.name}.

Return your assessment as valid JSON (no markdown, no code blocks) in exactly this format:
{
  "match_score": 0.0,
  "rationale": "one paragraph explanation",
  "conversation_starter": "specific opening for the humans"
}

match_score should be 0.0-1.0. Only score above 0.72 if there is clear, specific, actionable overlap.`;
}
