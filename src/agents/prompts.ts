import { User, ProfileEnrichments } from '../types';

function buildEnrichmentContext(enrichments?: ProfileEnrichments): string {
  if (!enrichments) return '';

  const sections: string[] = [];

  if (enrichments.github) {
    const g = enrichments.github;
    const langs = g.topLanguages.length > 0 ? g.topLanguages.join(', ') : 'not specified';
    const repos = g.topRepos
      .map((r) => `  - ${r.name} (${r.stars}⭐, ${r.language}): ${r.description}`)
      .join('\n');
    sections.push(
      `GitHub (@${g.username}):
  Bio: ${g.bio || 'none'}
  Top languages: ${langs}
  Notable repos:\n${repos}`
    );
  }

  if (enrichments.websites.length > 0) {
    for (const site of enrichments.websites) {
      const points = site.keyPoints.length > 0
        ? '\n  ' + site.keyPoints.map((p) => `• ${p}`).join('\n  ')
        : '';
      sections.push(
        `${site.type === 'startup' ? 'Startup/Company' : site.type === 'portfolio' ? 'Portfolio' : 'Website'} (${site.url}):
  ${site.summary}${points}`
      );
    }
  }

  if (enrichments.resume) {
    const r = enrichments.resume;
    const skills = r.skills.length > 0 ? r.skills.join(', ') : 'not listed';
    const highlights = r.experienceHighlights.length > 0
      ? '\n  ' + r.experienceHighlights.map((h) => `• ${h}`).join('\n  ')
      : '';
    sections.push(
      `Resume:
  Summary: ${r.summary}
  Skills: ${skills}${highlights}`
    );
  }

  if (sections.length === 0) return '';

  return `\nVerified background (from their public profiles and documents):
${sections.join('\n\n')}`;
}

export function buildAgentSystemPrompt(user: User): string {
  const enrichmentContext = buildEnrichmentContext(user.enrichments);

  return `You are an intelligent agent representing ${user.name} in the Kuzana/MiniHack community in Kenya.

Their profile:
- Role: ${user.role}
- What they're building or working on: ${user.description}
- Their top goals right now: ${user.goals}
- Their biggest current challenge: ${user.challenges}
- What they can offer others: ${user.offers}${enrichmentContext}

You are having a structured conversation with another person's agent to determine whether there is genuine, specific value in connecting your human with theirs.

Be honest and precise. A bad introduction wastes both people's time. Focus on concrete, specific overlap — not vague potential. When you have verified background data (GitHub, resume, websites), use it to make specific, evidence-based assessments.

After the conversation, you will be asked to return a JSON assessment with:
- match_score: 0.0 to 1.0 (how valuable would this connection be for your human?)
- rationale: one paragraph explaining the specific overlap or why it's not a good match
- conversation_starter: one concrete, specific opening question or topic for the humans to use if they do connect

Be critical. Only scores above 0.72 will result in an introduction being made.`;
}

export function buildNegotiationTurn1Prompt(agentAUser: User, agentBUser: User): string {
  return `You are Agent A, representing ${agentAUser.name}.

Introduce your human's context and primary need to Agent B (representing ${agentBUser.name}) in 2-3 sentences. Be specific about what challenge or goal you're seeking help with — reference their actual work and background where relevant. Then ask one direct question to understand if Agent B's human can genuinely help.`;
}

export function buildNegotiationTurn2Prompt(agentBUser: User): string {
  return `You are Agent B. Respond to Agent A's introduction. Assess honestly whether your human (${agentBUser.name}) can specifically address Agent A's need. Describe what your human offers that's relevant — use specific evidence from their background. Be concrete — if there's no real overlap, say so.`;
}

export function buildScoringPrompt(myUser: User, otherUser: User): string {
  return `Based on the conversation above, assess the value of introducing ${myUser.name} to ${otherUser.name}.

Return your assessment as valid JSON (no markdown, no code blocks) in exactly this format:
{
  "match_score": 0.0,
  "rationale": "one paragraph explanation referencing specific, concrete evidence",
  "conversation_starter": "specific opening for the humans — mention a real project, skill, or shared context"
}

match_score should be 0.0-1.0. Only score above 0.72 if there is clear, specific, actionable overlap.`;
}
