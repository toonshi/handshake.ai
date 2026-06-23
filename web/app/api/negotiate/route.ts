export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { NextRequest } from "next/server";
import { getUserById, createMatch } from "@/lib/db";
import { runAgentNegotiationStreaming } from "@/lib/agents/negotiation";
import type { User } from "@/lib/types";

const SCORE_THRESHOLD = parseFloat(process.env.MATCH_SCORE_THRESHOLD ?? '0.72');

export async function POST(req: NextRequest) {
  const enc = new TextEncoder();

  function sseEvent(event: string, data: unknown): Uint8Array {
    return enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const { userAId, userBId } = await req.json() as { userAId: string; userBId: string };

  const stream = new ReadableStream({
    start(controller) {
      void (async () => {
        try {
          const [userA, userB] = await Promise.all([
            getUserById(userAId),
            getUserById(userBId),
          ]);

          if (!userA || !userB) {
            controller.enqueue(sseEvent("error", { message: "Users not found" }));
            controller.close();
            return;
          }

          controller.enqueue(sseEvent("phase", { phase: "scanning", userA: { name: userA.name, role: userA.role }, userB: { name: userB.name, role: userB.role } }));

          await new Promise((r) => setTimeout(r, 800));

          controller.enqueue(sseEvent("phase", { phase: "negotiating" }));

          let savedMatchId: string | null = null;

          await runAgentNegotiationStreaming(userA as User, userB as User, {
            onTurnStart: (agent, name, turn) => {
              controller.enqueue(sseEvent("turn_start", { agent, name, turn }));
            },
            onToken: (agent, text) => {
              controller.enqueue(sseEvent("token", { agent, text }));
            },
            onTurnEnd: (agent, turn) => {
              controller.enqueue(sseEvent("turn_end", { agent, turn }));
            },
            onScoring: () => {
              controller.enqueue(sseEvent("phase", { phase: "scoring" }));
            },
            onResult: async (result) => {
              const isHighConfidence =
                result.agentAScore > SCORE_THRESHOLD && result.agentBScore > SCORE_THRESHOLD;

              if (isHighConfidence) {
                try {
                  const match = await createMatch({
                    user_a_id: userAId,
                    user_b_id: userBId,
                    similarity_score: 0,
                    agent_a_score: result.agentAScore,
                    agent_b_score: result.agentBScore,
                    transcript: result.transcript,
                    rationale: result.rationale,
                    conversation_starter: result.conversationStarter,
                    collaboration_opportunities: result.collaborationOpportunities,
                    shared_tech_stack: result.sharedTechStack,
                    status: 'pending_consent',
                    user_a_consent: false,
                    user_b_consent: false,
                  });
                  savedMatchId = match.id;
                } catch (err) {
                  console.error('[negotiate] Failed to save match:', err);
                }
              }

              controller.enqueue(sseEvent("result", {
                agentAScore: result.agentAScore,
                agentBScore: result.agentBScore,
                rationale: result.rationale,
                conversationStarter: result.conversationStarter,
                collaborationOpportunities: result.collaborationOpportunities,
                sharedTechStack: result.sharedTechStack,
                matchId: savedMatchId,
              }));
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          controller.enqueue(sseEvent("error", { message }));
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Connection": "keep-alive",
    },
  });
}
