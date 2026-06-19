import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { WebsiteEnrichment } from '../types';

let _genai: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!_genai) _genai = new GoogleGenerativeAI(config.google.apiKey);
  return _genai;
}

function stripHtml(html: string): string {
  // Remove script/style blocks entirely
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');

  // Replace tags with spaces
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Collapse whitespace
  return text.replace(/\s+/g, ' ').trim();
}

function detectSiteType(url: string, content: string): WebsiteEnrichment['type'] {
  const lower = url.toLowerCase() + content.slice(0, 500).toLowerCase();
  if (lower.includes('linkedin.com')) return 'social';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'social';
  if (lower.includes('github.com')) return 'social';
  if (
    lower.includes('portfolio') ||
    lower.includes('my work') ||
    lower.includes('projects')
  )
    return 'portfolio';
  if (
    lower.includes('startup') ||
    lower.includes('we are building') ||
    lower.includes('our product') ||
    lower.includes('saas')
  )
    return 'startup';
  return 'other';
}

export async function scrapeAndExtract(url: string): Promise<WebsiteEnrichment> {
  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP/HTTPS URLs are supported');
  }

  // Fetch page
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; KuzanaConnector/1.0; +https://kuzana.co)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const text = stripHtml(html).slice(0, 4000); // cap at 4k chars for Gemini

  const type = detectSiteType(url, text);

  // Gemini extraction
  const genai = getGenAI();
  const model = genai.getGenerativeModel({ model: config.google.model });

  const prompt = `You are extracting professional profile information from a webpage for a networking/matchmaking system.

URL: ${url}
Page content (truncated):
${text}

Extract the following as JSON only (no markdown):
{
  "summary": "2-3 sentence summary of who this person/company is and what they do",
  "keyPoints": ["up to 5 specific, concrete facts: skills, projects, achievements, technologies, or offerings"]
}

Focus on what's professionally relevant. If the page is behind a login or has no useful content, set summary to "Content not accessible" and keyPoints to [].`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();

  let extracted: { summary: string; keyPoints: string[] };
  try {
    extracted = JSON.parse(cleaned);
  } catch {
    extracted = { summary: 'Could not extract content from this page.', keyPoints: [] };
  }

  return {
    url,
    type,
    summary: extracted.summary ?? '',
    keyPoints: extracted.keyPoints ?? [],
    fetchedAt: new Date().toISOString(),
  };
}
