import cron from 'node-cron';
import { config } from '../config';
import {
  getAllUsersWithEmbeddings,
  findCandidates,
  pairAlreadyProcessed,
  createMatch,
  getUserById,
} from '../db/supabase';
import { runAgentNegotiation } from '../agents/negotiation';
import { sendMatchNotification } from '../bot/notifications';
import { User } from '../types';

let isRunning = false;

export async function runMatchingCycle(): Promise<void> {
  if (isRunning) {
    console.log('[Matching] Cycle already in progress, skipping');
    return;
  }
  isRunning = true;
  console.log('[Matching] Starting matching cycle');

  try {
    const users = await getAllUsersWithEmbeddings();
    console.log(`[Matching] Found ${users.length} users with embeddings`);

    if (users.length < 2) {
      console.log('[Matching] Not enough users, skipping');
      return;
    }

    let matchesFound = 0;

    for (const userA of users) {
      if (!userA.goal_embedding) continue;

      const candidates = await findCandidates(
        userA.goal_embedding,
        userA.id,
        config.matching.similarityThreshold,
        config.matching.candidateCount
      );

      for (const candidate of candidates) {
        const userB = await getUserById(candidate.user_id);
        if (!userB) continue;

        const alreadyProcessed = await pairAlreadyProcessed(userA.id, userB.id);
        if (alreadyProcessed) continue;

        console.log(
          `[Matching] Running agent negotiation: ${userA.name} <-> ${userB.name} (similarity: ${candidate.similarity.toFixed(3)})`
        );

        try {
          const result = await runAgentNegotiation(userA, userB);

          const status =
            result.agentAScore > config.matching.scoreThreshold &&
            result.agentBScore > config.matching.scoreThreshold
              ? 'pending_consent'
              : 'rejected';

          const match = await createMatch({
            user_a_id: userA.id,
            user_b_id: userB.id,
            similarity_score: candidate.similarity,
            agent_a_score: result.agentAScore,
            agent_b_score: result.agentBScore,
            transcript: result.transcript,
            rationale: result.rationale,
            conversation_starter: result.conversationStarter,
            status,
            user_a_consent: false,
            user_b_consent: false,
          });

          if (status === 'pending_consent') {
            matchesFound++;
            console.log(
              `[Matching] HIGH-VALUE MATCH: ${userA.name} <-> ${userB.name} (A: ${result.agentAScore.toFixed(2)}, B: ${result.agentBScore.toFixed(2)})`
            );
            await sendMatchNotification(match, userA, userB);
          } else {
            console.log(
              `[Matching] Rejected: ${userA.name} <-> ${userB.name} (A: ${result.agentAScore.toFixed(2)}, B: ${result.agentBScore.toFixed(2)})`
            );
          }
        } catch (err) {
          console.error(
            `[Matching] Error negotiating ${userA.name} <-> ${userB.name}:`,
            err
          );
        }

        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    console.log(`[Matching] Cycle complete. ${matchesFound} new matches found.`);
  } catch (err) {
    console.error('[Matching] Cycle error:', err);
  } finally {
    isRunning = false;
  }
}

export function startMatchingScheduler(): void {
  const schedule = config.matching.cronSchedule;
  console.log(`[Matching] Scheduler starting with cron: ${schedule}`);

  cron.schedule(schedule, () => {
    runMatchingCycle().catch((err) =>
      console.error('[Matching] Unhandled error in matching cycle:', err)
    );
  });
}
