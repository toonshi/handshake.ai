import { GitHubEnrichment } from '../types';

interface GitHubUser {
  login: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  public_repos: number;
}

interface GitHubRepo {
  name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  fork: boolean;
}

export async function fetchGitHubProfile(username: string): Promise<GitHubEnrichment> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'handshake-ai',
  };

  const [userRes, reposRes] = await Promise.all([
    fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers }),
    fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=10&type=owner`,
      { headers }
    ),
  ]);

  if (!userRes.ok) {
    if (userRes.status === 404) throw new Error(`GitHub user "${username}" not found`);
    throw new Error(`GitHub API error: ${userRes.status}`);
  }

  const user = (await userRes.json()) as GitHubUser;
  const repos = reposRes.ok ? ((await reposRes.json()) as GitHubRepo[]) : [];

  // Filter out forks, take top 5 by stars
  const ownRepos = repos
    .filter((r) => !r.fork)
    .slice(0, 5)
    .map((r) => ({
      name: r.name,
      description: r.description ?? '',
      stars: r.stargazers_count,
      language: r.language ?? 'unknown',
    }));

  // Count languages across repos
  const langCount: Record<string, number> = {};
  for (const repo of repos.filter((r) => !r.fork && r.language)) {
    langCount[repo.language!] = (langCount[repo.language!] ?? 0) + 1;
  }
  const topLanguages = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang]) => lang);

  return {
    username,
    bio: user.bio ?? '',
    company: user.company ?? '',
    location: user.location ?? '',
    topLanguages,
    topRepos: ownRepos,
    fetchedAt: new Date().toISOString(),
  };
}
