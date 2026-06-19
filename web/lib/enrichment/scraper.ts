import { generateGeminiText } from '../gemini';
import { WebsiteEnrichment } from '../types';

function stripHtml(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');

  text = text.replace(/<[^>]+>/g, ' ');

  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

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
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP/HTTPS URLs are supported');
  }

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
  const text = stripHtml(html).slice(0, 4000);
  const type = detectSiteType(url, text);

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

  const raw = await generateGeminiText('', [{ role: 'user', content: prompt }], 400);
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
