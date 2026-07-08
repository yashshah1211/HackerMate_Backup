/**
 * Parses the GitHub username from a URL or raw input string.
 */
export function parseGithubUsername(url: string): string | null {
  if (!url) return null;
  let clean = url.trim();
  if (!clean) return null;

  // If it doesn't look like a URL or domain, treat it as a raw username
  if (!clean.includes("/") && !clean.includes("github.com")) {
    return clean;
  }

  try {
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = "https://" + clean;
    }
    const parsed = new URL(clean);
    if (parsed.hostname.includes("github.com")) {
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      if (pathParts.length > 0) {
        return pathParts[0];
      }
    }
  } catch {
    const match = clean.match(/github\.com\/([^/]+)/i);
    if (match) return match[1];
  }
  return null;
}

export type GithubStats = {
  followers: number;
  public_repos: number;
  top_languages: Record<string, number>;
  repos: Array<{
    name: string;
    description: string | null;
    language: string | null;
    stars: number;
    url: string;
  }>;
};

/**
 * Fetches user profile info and top repository stats from GitHub's public API.
 */
export async function fetchGithubStats(username: string): Promise<GithubStats> {
  const userRes = await fetch(`https://api.github.com/users/${username}`);
  if (!userRes.ok) {
    throw new Error(`Failed to fetch user profile: ${userRes.statusText}`);
  }
  const userData = await userRes.json();

  const reposRes = await fetch(
    `https://api.github.com/users/${username}/repos?sort=updated&per_page=15`
  );
  if (!reposRes.ok) {
    throw new Error(`Failed to fetch user repositories: ${reposRes.statusText}`);
  }
  const reposData = await reposRes.json();

  // Aggregate languages
  const languageCounts: Record<string, number> = {};
  interface GithubRepoResponse {
    name: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    html_url: string;
  }

  const repos = (reposData || []).map((r: GithubRepoResponse) => {
    if (r.language) {
      languageCounts[r.language] = (languageCounts[r.language] || 0) + 1;
    }
    return {
      name: r.name,
      description: r.description || null,
      language: r.language || null,
      stars: r.stargazers_count || 0,
      url: r.html_url,
    };
  });

  // Sort languages descending and take top 5
  const topLanguages = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .reduce((acc, [lang, count]) => {
      acc[lang] = count;
      return acc;
    }, {} as Record<string, number>);

  // Sort repos by stars first, then take top 4
  const featuredRepos = [...repos]
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 4);

  return {
    followers: userData.followers || 0,
    public_repos: userData.public_repos || 0,
    top_languages: topLanguages,
    repos: featuredRepos,
  };
}
