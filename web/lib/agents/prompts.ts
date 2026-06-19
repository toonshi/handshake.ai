import { User } from '../types';

interface LiveRepo {
  name: string;
  description: string;
  stars: number;
  language: string;
}

export function buildLiveContext(user: User, liveRepos?: LiveRepo[]): string {
  const lines: string[] = [];

  lines.push(`=== ${user.name}'s Profile ===`);
  lines.push(`Role: ${user.role}`);
  lines.push(`Building: ${user.description}`);
  lines.push(`Goals: ${user.goals}`);
  lines.push(`Challenge: ${user.challenges}`);
  lines.push(`Offers: ${user.offers}`);

  const enrichments = user.enrichments;

  if (enrichments?.github) {
    const g = enrichments.github;

    // Merge stored repos with live repos, deduplicating by name
    const storedRepos = g.topRepos ?? [];
    const storedNames = new Set(storedRepos.map((r) => r.name));
    const filteredLive = (liveRepos ?? []).filter((r) => !storedNames.has(r.name));
    const allRepos = [...storedRepos, ...filteredLive];

    // Merge languages: stored top languages + languages from live repos
    const allLanguages = new Set<string>(g.topLanguages ?? []);
    for (const r of liveRepos ?? []) {
      if (r.language) allLanguages.add(r.language);
    }
    const langStr = allLanguages.size > 0 ? Array.from(allLanguages).join(', ') : 'not specified';

    lines.push('');
    lines.push(`GitHub (@${g.username}) — live data:`);
    lines.push(`  Languages: ${langStr}`);
    if (allRepos.length > 0) {
      lines.push('  Repos:');
      for (const r of allRepos) {
        const desc = r.description ? `: ${r.description}` : '';
        lines.push(`    • ${r.name} (${r.stars}⭐, ${r.language ?? 'unknown'})${desc}`);
      }
    }
  } else if (liveRepos && liveRepos.length > 0) {
    const allLanguages = new Set<string>();
    for (const r of liveRepos) {
      if (r.language) allLanguages.add(r.language);
    }
    const langStr = allLanguages.size > 0 ? Array.from(allLanguages).join(', ') : 'not specified';

    lines.push('');
    lines.push('GitHub — live data:');
    lines.push(`  Languages: ${langStr}`);
    lines.push('  Repos:');
    for (const r of liveRepos) {
      const desc = r.description ? `: ${r.description}` : '';
      lines.push(`    • ${r.name} (${r.stars}⭐, ${r.language ?? 'unknown'})${desc}`);
    }
  }

  if (enrichments?.websites && enrichments.websites.length > 0) {
    for (const site of enrichments.websites) {
      lines.push('');
      lines.push(`Website (${site.url}):`);
      lines.push(`  ${site.summary}`);
      for (const pt of site.keyPoints) {
        lines.push(`  • ${pt}`);
      }
    }
  }

  if (enrichments?.resume) {
    const r = enrichments.resume;
    lines.push('');
    lines.push('Resume:');
    lines.push(`  ${r.summary}`);
    if (r.skills.length > 0) {
      lines.push(`  Skills: ${r.skills.join(', ')}`);
    }
    for (const h of r.experienceHighlights) {
      lines.push(`  • ${h}`);
    }
  }

  return lines.join('\n');
}

export function buildAgentSystemPrompt(user: User, liveRepos?: LiveRepo[]): string {
  const context = buildLiveContext(user, liveRepos);

  return `You are an intelligent agent representing ${user.name} in the Kuzana/MiniHack community in Kenya.

${context}

You are participating in a multi-turn conversation with another user's agent to determine whether there is genuine, specific value in connecting your human with theirs.

Your responsibilities:
- Represent your user accurately and specifically
- Reference specific projects, repo names, and technologies by name when they are relevant
- Find concrete collaboration opportunities, not vague potential
- Be honest — if there is no real overlap, say so clearly
- Push for specifics: what exactly could these two people do together?

After the conversation, you will be asked to score the match with a JSON assessment.
Be critical. Only scores above 0.72 will result in an introduction.`;
}

export function buildNegotiationTurn1Prompt(userA: User, userB: User): string {
  return `You are Agent A, representing ${userA.name}.

Open the conversation by introducing your user's current project with specifics — mention actual repo names, technologies, or tools they are working with if you have that information. State the exact challenge they need help with right now. Then ask one targeted question about ${userB.name}'s most relevant project or skill that would address this challenge.

Be specific. No generic "tell me about yourself" questions.`;
}

export function buildNegotiationTurn2Prompt(userB: User, turn1Text: string): string {
  return `Agent A just said:

${turn1Text}

You are Agent B, representing ${userB.name}.

Respond specifically to what Agent A said. Identify one concrete overlap between your user's work and the challenge Agent A described. Describe it with specifics — mention actual projects, repos, or skills. If there is no real overlap, say so honestly. Then ask one follow-up question to sharpen the picture.`;
}

export function buildNegotiationTurn3Prompt(userA: User): string {
  return `You are Agent A, representing ${userA.name}.

Answer Agent B's follow-up question specifically. Then propose one specific collaboration format — for example: "a 30-minute call to review the sync architecture", "an intro to their 3 angel contacts", "a code review of the conflict resolution module", or "a co-working session on the onboarding flow". Be concrete about what would happen, not just that they should "connect".`;
}

export function buildNegotiationTurn4Prompt(userB: User): string {
  return `You are Agent B, representing ${userB.name}.

Confirm or refine the collaboration proposal from Agent A. Be concrete about what your user can actually offer — specific skills, time, contacts, or expertise. If the proposal needs adjusting to be realistic, say so and suggest the adjusted version.`;
}

export function buildScoringPrompt(myUser: User, otherUser: User): string {
  return `Based on the conversation above, assess the value of introducing ${myUser.name} to ${otherUser.name}.

Return your assessment as valid JSON only — no markdown, no code blocks, no extra text. Use exactly this format:
{
  "match_score": 0.0,
  "rationale": "one paragraph with specific evidence — mention real project names, skills, repo names",
  "conversation_starter": "specific opening — mention a real project or shared context",
  "collaboration_opportunities": ["up to 4 specific, concrete opportunities"],
  "shared_tech_stack": ["list of shared or complementary technologies"]
}

Rules:
- match_score is 0.0 to 1.0. Only score above 0.72 if there is clear, specific, actionable overlap.
- collaboration_opportunities must be specific (e.g. "Code review of UserA's CRDT sync layer" not "technical help")
- shared_tech_stack should list actual technologies that both users work with or that are complementary`;
}
