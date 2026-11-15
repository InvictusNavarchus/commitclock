import type { SearchResult } from "./github.ts";
import { localHour, type DateWindow } from "./time.ts";

export function summarize(result: SearchResult, window: DateWindow) {
  const repositories = new Map<string, number>();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, commits: 0 }));
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  let total = 0;
  for (const commit of result.commits) {
    const instant = Date.parse(commit.authoredAt);
    if (instant < start || instant >= end) continue;
    total++;
    repositories.set(
      commit.repository,
      (repositories.get(commit.repository) ?? 0) + 1,
    );
    const bucket = hours[localHour(commit.authoredAt, window.timezone)];
    if (bucket) bucket.commits++;
  }
  return {
    date: window.date,
    timezone: window.timezone,
    author: result.author,
    timestampBasis: "author" as const,
    coverage: "github-default-branch-search" as const,
    searchComplete: result.warnings.length === 0,
    warnings: result.warnings,
    matchedCount: result.matchedCount,
    total,
    repositories: [...repositories]
      .map(([repository, commits]) => ({ repository, commits }))
      .sort(
        (a, b) =>
          b.commits - a.commits || a.repository.localeCompare(b.repository),
      ),
    hours,
  };
}

export type Report = ReturnType<typeof summarize>;
