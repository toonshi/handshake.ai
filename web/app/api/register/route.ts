import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  );
}

function getGenAI() {
  return new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
}

async function generateEmbedding(text: string): Promise<number[]> {
  const model = getGenAI().getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

async function fetchGitHubSummary(username: string): Promise<string> {
  try {
    const [userRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
        headers: { "User-Agent": "kuzana-connector" },
      }),
      fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=5&type=owner`,
        { headers: { "User-Agent": "kuzana-connector" } }
      ),
    ]);
    if (!userRes.ok) return "";
    const user = await userRes.json();
    const repos = reposRes.ok ? await reposRes.json() : [];
    const langs: Record<string, number> = {};
    for (const r of repos) if (!r.fork && r.language) langs[r.language] = (langs[r.language] ?? 0) + 1;
    const topLangs = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l]) => l);
    const topRepos = repos.filter((r: { fork: boolean }) => !r.fork).slice(0, 3)
      .map((r: { name: string; description: string; stargazers_count: number }) =>
        `${r.name} (${r.stargazers_count}⭐): ${r.description ?? ""}`
      ).join("; ");
    return `GitHub @${username}: ${user.bio ?? ""}. Languages: ${topLangs.join(", ")}. Repos: ${topRepos}`;
  } catch {
    return "";
  }
}

async function scrapeWebsite(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KuzanaConnector/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);

    const model = getGenAI().getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(
      `In 2 sentences, what does this person or company do?\n${text}`
    );
    return `Website (${url}): ${result.response.text().trim()}`;
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const name = form.get("name")?.toString().trim();
    const telegram_username = form.get("telegram_username")?.toString().trim();
    const role = form.get("role")?.toString().trim();
    const description = form.get("description")?.toString().trim();
    const goals = form.get("goals")?.toString().trim();
    const challenges = form.get("challenges")?.toString().trim();
    const offers = form.get("offers")?.toString().trim();
    const github_username = form.get("github_username")?.toString().trim();
    const website_url = form.get("website_url")?.toString().trim();
    const phone_number = form.get("phone_number")?.toString().trim();

    if (!name || !telegram_username || !role || !description || !goals || !challenges || !offers) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Check if already registered by telegram username
    const { data: existing } = await supabase
      .from("users")
      .select("id, name")
      .eq("telegram_username", telegram_username)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: `@${telegram_username} is already registered as ${existing.name}` },
        { status: 409 }
      );
    }

    // Gather enrichment context for embedding
    const enrichmentParts: string[] = [];
    const enrichments: Record<string, unknown> = { websites: [] };

    if (github_username) {
      const summary = await fetchGitHubSummary(github_username);
      if (summary) {
        enrichmentParts.push(summary);
        enrichments.github = { username: github_username, fetchedAt: new Date().toISOString() };
      }
    }

    if (website_url) {
      const summary = await scrapeWebsite(website_url);
      if (summary) {
        enrichmentParts.push(summary);
        (enrichments.websites as unknown[]).push({
          url: website_url,
          summary,
          fetchedAt: new Date().toISOString(),
        });
      }
    }

    // Generate embeddings
    const goalsText = [goals, ...enrichmentParts].join(". ");
    const challengesText = [challenges, ...enrichmentParts].join(". ");

    const [goalEmbedding, challengeEmbedding] = await Promise.all([
      generateEmbedding(goalsText),
      generateEmbedding(challengesText),
    ]);

    // Use a large random number as a placeholder telegram_id for web users
    // The Telegram bot will update this when the user messages it
    const placeholderTelegramId = -(Date.now() % 2147483647);

    const { data: user, error } = await supabase
      .from("users")
      .insert({
        telegram_id: placeholderTelegramId,
        telegram_username,
        phone_number: phone_number || null,
        name,
        role,
        description,
        goals,
        challenges,
        offers,
        enrichments,
        goal_embedding: goalEmbedding,
        challenge_embedding: challengeEmbedding,
      })
      .select()
      .single();

    if (error) {
      console.error("[register]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, userId: user.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[register]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
