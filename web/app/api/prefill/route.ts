import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

function getGenAI() {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
}

export interface PrefillResult {
  name: string;
  role: string;
  description: string;
  goals: string;
  challenges: string;
  offers: string;
  github_username?: string;
  website_url?: string;
  source: string;
}

// ─── GitHub ──────────────────────────────────────────────────────────────────

function extractGitHubUsername(input: string): string | null {
  // Accept "torvalds", "github.com/torvalds", "https://github.com/torvalds"
  const urlMatch = input.match(/github\.com\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]+$/.test(input.trim())) return input.trim();
  return null;
}

async function fetchGitHubData(username: string): Promise<string> {
  const headers = { "User-Agent": "kuzana-connector", Accept: "application/vnd.github.v3+json" };
  const [userRes, reposRes, readmeRes] = await Promise.allSettled([
    fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers }),
    fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=8&type=owner`, { headers }),
    fetch(`https://api.github.com/users/${encodeURIComponent(username)}/readme`, { headers }),
  ]);

  if (userRes.status === "rejected" || !userRes.value.ok) {
    throw new Error(`GitHub user "${username}" not found`);
  }

  const user = await userRes.value.json();
  const repos = reposRes.status === "fulfilled" && reposRes.value.ok
    ? await reposRes.value.json() : [];

  // Try to get profile README
  let readmeText = "";
  if (readmeRes.status === "fulfilled" && readmeRes.value.ok) {
    try {
      const readmeData = await readmeRes.value.json();
      const decoded = Buffer.from(readmeData.content ?? "", "base64").toString("utf-8");
      readmeText = decoded.slice(0, 1500);
    } catch { /* ignore */ }
  }

  const ownRepos = repos.filter((r: { fork: boolean }) => !r.fork);
  const langCount: Record<string, number> = {};
  for (const r of ownRepos) {
    if (r.language) langCount[r.language] = (langCount[r.language] ?? 0) + 1;
  }
  const topLangs = Object.entries(langCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l]) => l);
  const topRepos = ownRepos.slice(0, 5).map((r: { name: string; description: string; stargazers_count: number; language: string }) =>
    `- ${r.name} (${r.stargazers_count}★, ${r.language ?? "unknown"}): ${r.description ?? "no description"}`
  ).join("\n");

  return `
GitHub Profile: @${username}
Name: ${user.name ?? username}
Bio: ${user.bio ?? "none"}
Company: ${user.company ?? "none"}
Location: ${user.location ?? "unknown"}
Public repos: ${user.public_repos}
Top languages: ${topLangs.join(", ") || "none"}
Top repos:\n${topRepos || "none"}
${readmeText ? `\nProfile README:\n${readmeText}` : ""}
`.trim();
}

// ─── Generic URL scraper ─────────────────────────────────────────────────────

async function fetchUrlData(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KuzanaConnector/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Could not fetch ${url} (HTTP ${res.status})`);

  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);

  return `URL: ${url}\n\n${text}`;
}

// ─── Gemini extraction ───────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are extracting a professional profile for a tech hackathon networking system in Kenya (MiniHack).

Based on the profile data below, fill in these 6 fields:

- name: their full name (from profile, not username)
- role: ONE of these exact values: "Founder / Co-founder", "Software Developer", "Designer / Product", "Investor / VC", "Mentor / Advisor", "Business / Operations", "Student / Researcher", "Other"
- description: what they're currently building or working on — 2 specific sentences
- goals: what they're likely seeking at a tech hackathon — be specific to their background (e.g. "Find a technical co-founder with mobile experience" not "network with people")
- challenges: their most likely current challenge given their role and work — be specific (e.g. "Getting first paying customers for a B2B SaaS" not "growing the business")
- offers: what concrete value they can offer others — specific skills, domain expertise, network, or resources

Return ONLY valid JSON, no markdown:
{
  "name": "...",
  "role": "...",
  "description": "...",
  "goals": "...",
  "challenges": "...",
  "offers": "..."
}

Profile data:
`;

async function extractWithGemini(profileData: string): Promise<Omit<PrefillResult, "github_username" | "website_url" | "source">> {
  const model = getGenAI().getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent(EXTRACTION_PROMPT + profileData);
  const raw = result.response.text().trim();
  const cleaned = raw.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("Could not parse profile data. Please fill in the form manually.");
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { input } = await req.json() as { input: string };

    if (!input?.trim()) {
      return NextResponse.json({ error: "No input provided" }, { status: 400 });
    }

    const trimmed = input.trim();
    let profileData: string;
    let github_username: string | undefined;
    let website_url: string | undefined;
    let source: string;

    // Detect GitHub
    const ghUsername = extractGitHubUsername(trimmed);
    const isGitHubUrl = trimmed.includes("github.com/");
    const isPlainUsername = /^[a-zA-Z0-9_-]+$/.test(trimmed) && !trimmed.includes(".");

    if (ghUsername && (isGitHubUrl || isPlainUsername)) {
      profileData = await fetchGitHubData(ghUsername);
      github_username = ghUsername;
      source = `github.com/${ghUsername}`;
    } else {
      // Treat as URL
      let url = trimmed;
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }
      profileData = await fetchUrlData(url);
      website_url = url;
      source = url;
    }

    const extracted = await extractWithGemini(profileData);

    const result: PrefillResult = {
      ...extracted,
      github_username,
      website_url,
      source,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch profile";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
