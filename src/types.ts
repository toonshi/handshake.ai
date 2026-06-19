export interface User {
  id: string;
  telegram_id: number;
  telegram_username?: string;
  phone_number?: string;
  name: string;
  role: string;
  description: string;
  goals: string;
  challenges: string;
  offers: string;
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
  transcript: AgentTurn[];
}

export interface AgentScore {
  score: number;
  rationale: string;
  conversation_starter: string;
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
