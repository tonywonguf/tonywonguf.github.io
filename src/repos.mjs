// Select the repositories that the site lists.
// The site lists a repository only if GitHub reports it as public.
// If the config has an include list, the site lists only the repositories in it.

export function isPublic(repo) {
  return repo.private === false && repo.visibility === "public";
}

export function selectRepos(repos, config, now = new Date()) {
  const exclude = new Set(config.exclude ?? []);
  const include = config.include ? new Set(config.include) : null;
  const blurbs = config.blurbs ?? {};
  const recentMs = (config.recentDays ?? 120) * 24 * 60 * 60 * 1000;
  const recent = [];
  const earlier = [];
  const refused = [];

  for (const repo of repos) {
    if (!isPublic(repo)) {
      refused.push(repo.name);
      continue;
    }
    if (repo.fork || repo.archived || exclude.has(repo.name)) continue;
    if (include && !include.has(repo.name)) continue;

    const pushed = new Date(repo.pushed_at);
    const item = {
      name: repo.name,
      url: repo.html_url,
      homepage: repo.homepage || null,
      description: blurbs[repo.name] || repo.description || "",
      language: repo.language || null,
      pushed,
    };
    (now - pushed <= recentMs ? recent : earlier).push(item);
  }

  const byPushed = (a, b) => b.pushed - a.pushed;
  return {
    recent: recent.sort(byPushed),
    earlier: earlier.sort(byPushed),
    refused,
  };
}
