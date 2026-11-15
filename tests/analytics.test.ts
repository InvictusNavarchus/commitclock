import { expect, test } from "bun:test";
import { summarize } from "../src/analytics.ts";
import type { SearchResult } from "../src/github.ts";
import { render } from "../src/render.ts";
import { dateWindow } from "../src/time.ts";

test("groups by repository and local hour with a half-open date window", () => {
  const result: SearchResult = {
    author: "me",
    matchedCount: 5,
    warnings: [],
    commits: [
      { sha: "1", repository: "me/b", authoredAt: "2026-11-14T17:00:00Z" },
      { sha: "2", repository: "me/a", authoredAt: "2026-11-15T01:00:00+07:00" },
      { sha: "2", repository: "me/b", authoredAt: "2026-11-14T18:00:00Z" },
      { sha: "3", repository: "me/a", authoredAt: "2026-11-15T17:00:00Z" },
      { sha: "4", repository: "me/a", authoredAt: "2026-11-14T16:59:59Z" },
    ],
  };
  const report = summarize(result, dateWindow("2026-11-15", "Asia/Jakarta"));
  expect(report.total).toBe(3);
  expect(report.repositories).toEqual([
    { repository: "me/b", commits: 2 },
    { repository: "me/a", commits: 1 },
  ]);
  expect(report.hours).toHaveLength(24);
  expect(report.hours[0]?.commits).toBe(1);
  expect(report.hours[1]?.commits).toBe(2);
  expect(report.hours.reduce((sum, row) => sum + row.commits, 0)).toBe(3);
  expect(render(report)).toContain("01:00");
});

test("combines repeated clock hours on fall-back day", () => {
  const report = summarize(
    {
      author: "me",
      matchedCount: 2,
      warnings: [],
      commits: [
        {
          sha: "1",
          repository: "me/a",
          authoredAt: "2026-11-01T01:30:00-04:00",
        },
        {
          sha: "2",
          repository: "me/a",
          authoredAt: "2026-11-01T01:30:00-05:00",
        },
      ],
    },
    dateWindow("2026-11-01", "America/New_York"),
  );
  expect(report.hours[1]?.commits).toBe(2);
});

test("renders zero activity and exposes partial status in report and text", () => {
  const report = summarize(
    {
      author: "me",
      matchedCount: 0,
      warnings: ["Incomplete search"],
      commits: [],
    },
    dateWindow("2026-11-15", "UTC"),
  );
  expect(report.searchComplete).toBe(false);
  expect(render(report)).toContain("PARTIAL RESULTS");
  expect(render(report)).toContain("No commits found");
  expect(render(report)).toContain("Warning: Incomplete search");
});
