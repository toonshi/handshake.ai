export interface User {
  id: string;
  telegram_id: number;
  telegram_username?: string;
  phone_number?: string;
  accept_all_matches: boolean;
  name: string;
  role: string;
  description: string;
  goals: string;
  challenges: string;
  offers: string;
  enrichments?: ProfileEnrichments;
  goal_embedding?: number[];
  challenge_embedding?: number[];
  created_at: string;
  updated_at: string;
}

export interface Match {
  id: string;
  user_a_id: string;
  user_b_id: string;
  similarity_score: number;
  agent_a_score: number;
  agent_b_score: number;
  transcript: AgentTurn[];
  rationale: string;
  conversation_starter: string;
  collaboration_opportunities: string[];
  shared_tech_stack: string[];
  status: MatchStatus;
  user_a_consent: boolean;
  user_b_consent: boolean;
  user_a_feedback?: number;
  user_b_feedback?: number;
  created_at: string;
  updated_at: string;
}

export type MatchStatus =
  | 'negotiating'
  | 'rejected'
  | 'pending_consent'
  | 'partial_consent'
  | 'calling'
  | 'called'
  | 'completed'
  | 'declined';

export interface AgentTurn {
  agent: 'A' | 'B';
  content: string;
}

export interface NegotiationResult {
  agentAScore: number;
  agentBScore: number;
  rationale: string;
  conversationStarter: string;
  collaborationOpportunities: string[];
  sharedTechStack: string[];
  transcript: AgentTurn[];
}

export interface AgentScore {
  score: number;
  rationale: string;
  conversation_starter: string;
  collaboration_opportunities: string[];
  shared_tech_stack: string[];
}

export type OnboardingStep =
  | 'greeting'
  | 'name'
  | 'role'
  | 'description'
  | 'goals'
  | 'challenges'
  | 'offers'
  | 'confirmation'
  | 'complete';

export interface OnboardingSession {
  step: OnboardingStep;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  data: Partial<ProfileData>;
}

export interface ProfileData {
  name: string;
  role: string;
  description: string;
  goals: string;
  challenges: string;
  offers: string;
}

export interface CallScript {
  personAScript: string;
  personBScript: string;
}

// ─── Profile enrichment ───────────────────────────────────────────────────────

export interface GitHubEnrichment {
  username: string;
  bio: string;
  company: string;
  location: string;
  topLanguages: string[];
  topRepos: Array<{
    name: string;
    description: string;
    stars: number;
    language: string;
  }>;
  fetchedAt: string;
}

export interface WebsiteEnrichment {
  url: string;
  type: 'portfolio' | 'startup' | 'social' | 'other';
  summary: string;
  keyPoints: string[];
  fetchedAt: string;
}

export interface ResumeEnrichment {
  summary: string;
  skills: string[];
  experienceHighlights: string[];
  education: string[];
  fetchedAt: string;
}

export interface ProfileEnrichments {
  github?: GitHubEnrichment;
  websites: WebsiteEnrichment[];
  resume?: ResumeEnrichment;
}
