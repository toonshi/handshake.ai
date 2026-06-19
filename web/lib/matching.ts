import {
  getAllUsersWithEmbeddings,
  findCandidates,
  pairAlreadyProcessed,
  createMatch,
  getUserById,
  updateMatch,
} from './db';
import { runAgentNegotiation } from './agents/negotiation';
import {
  sendMatchNotification,
  sendMatchNotificationToUser,
  initiateCallsForMatch,
} from './bot/notifications';

const SCORE_THRESHOLD = parseFloat(process.env.MATCH_SCORE_THRESHOLD ?? '0.72');
const SIMILARITY_THRESHOLD = parseFloat(process.env.SIMILARITY_THRESHOLD ?? '0.65');
const CANDIDATE_COUNT = parseInt(process.env.SIMILARITY_CANDIDATE_COUNT ?? '5', 10);

export async function runMatchingCycle(): Promise<{ matched: number; processed: number }> {
  console.log('[Matching] Starting matching cycle');

  const users = await getAllUsersWithEmbeddings();
  console.log(`[Matching] Found ${users.length} users with embeddings`);

  if (users.length < 2) {
    console.log('[Matching] Not enough users, skipping');
    return { matched: 0, processed: 0 };
  }

  let matchesFound = 0;
  let pairsProcessed = 0;

  for (const userA of users) {
    if (!userA.goal_embedding) continue;

    const candidates = await findCandidates(
      userA.goal_embedding,
      userA.id,
      SIMILARITY_THRESHOLD,
      CANDIDATE_COUNT
    );

    for (const candidate of candidates) {
      const userB = await getUserById(candidate.user_id);
      if (!userB) continue;

      const alreadyProcessed = await pairAlreadyProcessed(userA.id, userB.id);
      if (alreadyProcessed) continue;

      pairsProcessed++;
      console.log(
        `[Matching] Running agent negotiation: ${userA.name} <-> ${userB.name} (similarity: ${candidate.similarity.toFixed(3)})`
      );

      try {
        const result = await runAgentNegotiation(userA, userB);

        const status =
          result.agentAScore > SCORE_THRESHOLD &&
          result.agentBScore > SCORE_THRESHOLD
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
          collaboration_opportunities: result.collaborationOpportunities,
          shared_tech_stack: result.sharedTechStack,
          status,
          user_a_consent: false,
          user_b_consent: false,
        });

        if (status === 'pending_consent') {
          matchesFound++;
          console.log(
            `[Matching] HIGH-VALUE MATCH: ${userA.name} <-> ${userB.name} (A: ${result.agentAScore.toFixed(2)}, B: ${result.agentBScore.toFixed(2)})`
          );

          // Check accept_all_matches for both users
          const aConsent = userA.accept_all_matches === true;
          const bConsent = userB.accept_all_matches === true;

          if (aConsent || bConsent) {
            await updateMatch(match.id, {
              user_a_consent: aConsent,
              user_b_consent: bConsent,
            });
          }

          if (aConsent && bConsent) {
            // Both auto-consented — skip notifications and trigger calls directly
            console.log(
              `[Matching] Both users have accept_all — initiating calls directly for match ${match.id}`
            );
            await updateMatch(match.id, { status: 'calling' });
            await initiateCallsForMatch(match);
          } else if (aConsent) {
            // Only A auto-consented — notify B only
            console.log(`[Matching] UserA has accept_all — notifying only UserB for match ${match.id}`);
            await sendMatchNotificationToUser(match, userB, userA, 'b');
          } else if (bConsent) {
            // Only B auto-consented — notify A only
            console.log(`[Matching] UserB has accept_all — notifying only UserA for match ${match.id}`);
            await sendMatchNotificationToUser(match, userA, userB, 'a');
          } else {
            // Neither auto-consented — notify both
            await sendMatchNotification(match, userA, userB);
          }
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

  console.log(`[Matching] Cycle complete. ${matchesFound} new matches found, ${pairsProcessed} pairs processed.`);
  return { matched: matchesFound, processed: pairsProcessed };
}
