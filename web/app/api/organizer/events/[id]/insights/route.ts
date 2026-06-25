import { NextRequest, NextResponse } from "next/server";
import { getUserEventResponses, updateEventInsights } from "@/lib/db";
import { generateGeminiText } from "@/lib/gemini";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { ssl: false, max: 5 });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Fetch participants and their responses
    const participants = await sql`
      SELECT 
        u.name,
        u.role,
        u.description,
        u.goals,
        u.challenges,
        u.offers,
        uer.responses
      FROM user_event_responses uer
      JOIN users u ON uer.user_id = u.id
      WHERE uer.event_id = ${id}
    `;

    if (participants.length === 0) {
      return NextResponse.json({ 
        error: "No responses collected yet. AI insights require participants." 
      }, { status: 400 });
    }

    // 2. Format participant details for Gemini
    const formattedParticipants = participants.map((p, index) => {
      const respStr = Array.isArray(p.responses) 
        ? p.responses.map((r: any) => `Q: ${r.prompt_text}\nA: ${r.response_text}`).join("\n")
        : "No responses";
      return `Participant #${index + 1}:
Name: ${p.name}
Role: ${p.role}
Summary: ${p.description}
Core Goals: ${p.goals}
Core Challenges: ${p.challenges}
Core Offers: ${p.offers}
Event-Specific Responses:
${respStr}
------------------------------`;
    }).join("\n\n");

    const systemPrompt = `You are an expert event network curator and community manager. 
You are given a list of participants at an event, including their roles, goals, challenges, offers, and their event-specific responses to organizer questions.

Analyze the participants and generate a structured markdown report containing:
1. **Event Overview & Insights**: Summarize the collective talent pool, top industries/roles, and core themes of the event.
2. **Top Technical/Business Challenges**: Highlight common pain points or areas where participants need help.
3. **High-Value Connection Pathways**: Suggest 3-5 specific, highly beneficial introductions between participants. For each recommendation, provide:
   - Who should meet whom (e.g., Dennis meets Alice).
   - **Why they should meet** (their matching rationale based on goals/offers/challenges).
   - **A suggested conversation starter** for them.
4. **Organizer Action Items**: Recommendations for the event host to facilitate better connections (e.g. "Create a channel for Avalanche builders since 40% are working on it").

Format the output as clean, professional markdown with emojis, bold headers, and bullet points. Do not wrap the response in markdown code blocks (e.g. do not start with \`\`\`markdown).`;

    const userMessage = `Here are the event participants:\n\n${formattedParticipants}`;

    const text = await generateGeminiText(systemPrompt, [{ role: "user", content: userMessage }], 1500);

    // 3. Cache the insights in the event row
    await updateEventInsights(id, text);

    return NextResponse.json({ success: true, insights: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[insights]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
