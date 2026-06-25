import { OnboardingSession, ProfileData } from '../types';
import { generateGeminiText } from '../utils/gemini';

const INTERVIEWER_SYSTEM = `You are the Handshake onboarding assistant. You're conducting a brief, friendly interview to build someone's profile for an AI-powered networking system at MiniHack Kenya.

You need to collect these 6 pieces of information (in order):
1. Their name
2. Their role (e.g., founder, developer, investor, mentor, designer)
3. What they're building or working on (2-3 sentences)
4. Their top goals right now at MiniHack (be specific)
5. Their biggest current challenge (the thing they most need help with)
6. What they can offer others (skills, knowledge, network, resources)

Guidelines:
- Ask one question at a time
- Be warm and conversational, not clinical
- Keep your messages short (1-3 sentences max)
- After collecting all 6 pieces, confirm the profile and signal completion
- When you have enough info for a field, move on — don't probe endlessly
- This is for a hackathon so people are busy; keep it efficient

When you have all 6 pieces confirmed, end your message with exactly:
[PROFILE_COMPLETE]`;

export interface InterviewResult {
  response: string;
  isComplete: boolean;
}

export async function conductInterview(
  session: OnboardingSession,
  userMessage: string
): Promise<InterviewResult> {
  const updatedHistory = [
    ...session.history,
    { role: 'user' as const, content: userMessage },
  ];

  const text = await generateGeminiText(INTERVIEWER_SYSTEM, updatedHistory, 300);
  const isComplete = text.includes('[PROFILE_COMPLETE]');
  const cleanResponse = text.replace('[PROFILE_COMPLETE]', '').trim();

  return { response: cleanResponse, isComplete };
}

const EXTRACTOR_SYSTEM = `Extract structured profile data from this onboarding conversation. Return valid JSON only (no markdown, no code blocks):

{
  "name": "person's full name",
  "role": "their role/title",
  "description": "what they're building or working on",
  "goals": "their top goals right now",
  "challenges": "their biggest current challenge",
  "offers": "what they can offer others"
}

If any field is unclear, use your best inference from context. All fields are required.`;

export async function extractProfileFromHistory(
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<ProfileData> {
  const conversationText = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Interviewer'}: ${m.content}`)
    .join('\n\n');

  const text = await generateGeminiText('', [
    {
      role: 'user',
      content: `${EXTRACTOR_SYSTEM}\n\nConversation:\n${conversationText}`,
    },
  ], 500);

  const cleaned = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(cleaned) as ProfileData;
  } catch {
    throw new Error(`Failed to parse profile from conversation: ${cleaned}`);
  }
}

export function getWelcomeMessage(): string {
  return `👋 Welcome to *Handshake* — AI-powered matchmaking for MiniHack Kenya.

I'm going to ask you a few quick questions to build your profile. Your AI agent will then work the room on your behalf, finding people worth your time.

This takes about 5 minutes. Ready? Let's start — *what's your name?*`;
}

export function getAlreadyRegisteredMessage(name: string): string {
  return `Hey ${name}! You're already registered 🎉

Your agent is actively looking for matches. I'll message you when it finds someone worth your time.

Use /status to see your current profile, or /rematch to trigger matching manually.`;
}

const ENRICH_PROFILE_SYSTEM = `You are a profile synthesis assistant. You are given a user's current profile details (Name, Role, Working On/Description, Goals, Challenges, Offers) and a list of new event-specific questions and responses they just answered.
Your task is to merge the event responses into their profile details. 
- Retain existing details if they are still relevant.
- Enrich details (especially Goals, Challenges, and Offers) with their specific event answers. E.g. if they say they use PETAL stack or need helper connections, integrate that into their offers or challenges.
- Modify the 'description' to briefly sum up what they are pitching/working on right now at this event.

Return valid JSON only (no markdown formatting, no code blocks):
{
  "name": "their full name",
  "role": "their role",
  "description": "updated description summarizing what they are working on, incorporating any new event pitch/project info",
  "goals": "updated specific goals incorporating any new event goals/needs",
  "challenges": "updated challenges incorporating any new huddles/struggles",
  "offers": "updated offers incorporating any new skills/value they bring"
}

All fields are required. If no changes are needed for a field, keep it exactly as it is.`;

export async function enrichProfileWithEventResponses(
  currentUser: any,
  responses: Array<{ prompt_id: string; prompt_text: string; response_text: string }>
): Promise<ProfileData> {
  const currentProfile = `Current Profile:
Name: ${currentUser.name}
Role: ${currentUser.role}
Working On: ${currentUser.description}
Goals: ${currentUser.goals}
Challenges: ${currentUser.challenges}
Offers: ${currentUser.offers}`;

  const eventResponsesText = responses
    .map((r) => `Q: ${r.prompt_text}\nA: ${r.response_text}`)
    .join('\n\n');

  const userMessage = `${currentProfile}\n\nEvent Responses:\n${eventResponsesText}`;

  const text = await generateGeminiText(ENRICH_PROFILE_SYSTEM, [
    { role: 'user', content: userMessage }
  ], 800);

  const cleaned = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(cleaned) as ProfileData;
  } catch {
    throw new Error(`Failed to parse enriched profile: ${cleaned}`);
  }
}

