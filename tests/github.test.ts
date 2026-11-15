import { expect, test } from "bun:test";
import { searchCommits } from "../src/github.ts";
import { dateWindow } from "../src/time.ts";

const window = dateWindow("2026-11-15", "Asia/Jakarta");
const item = (sha: string, repo = "me/repo") => ({
  sha,
  repository: { full_name: repo },
  commit: { author: { date: "2026-11-15T01:00:00+07:00" } },
});
const page = (
  items: ReturnType<typeof item>[],
  count = items.length,
  incomplete = false,
) => ({ items, total_count: count, incomplete_results: incomplete });

function mock(responses: unknown[]) {
  const calls: string[][] = [];
  return {
    calls,
    run: async (args: string[]) => {
      calls.push(args);
      if (!responses.length) throw new Error("Unexpected extra API request");
      return responses.shift();
    },
  };
}

test("fetches identity and paginates with an explicit GET and author-date window", async () => {
  const gh = mock([
    { login: "me" },
    page(
      Array.from({ length: 100 }, (_, i) => item(String(i))),
      101,
    ),
    page([item("100")], 101),
  ]);
  const result = await searchCommits(window, gh.run);
  expect(result.commits).toHaveLength(101);
  expect(result.warnings).toEqual([]);
  expect(gh.calls).toHaveLength(3);
  expect(gh.calls[1]).toContain("GET");
  expect(gh.calls[1]).toContain(
    "q=author:me author-date:2026-11-14T17:00:00.000Z..2026-11-15T16:59:59.000Z",
  );
  expect(gh.calls[2]).toContain("page=2");
});

test("deduplicates repository-SHA pairs while preserving cross-repository counts", async () => {
  const gh = mock([
    { login: "me" },
    page([item("1"), item("1"), item("1", "me/other")]),
  ]);
  const result = await searchCommits(window, gh.run);
  expect(result.commits).toHaveLength(2);
  expect(result.warnings.join(" ")).toContain("Duplicate");
});

test("marks incomplete and unexpectedly short results", async () => {
  const gh = mock([{ login: "me" }, page([item("1")], 2, true)]);
  const result = await searchCommits(window, gh.run);
  expect(result.warnings.join(" ")).toContain("incomplete");
  expect(result.warnings.join(" ")).toContain("fewer unique");
});

test("stops at 1,000 results and marks the cap", async () => {
  const responses = Array.from({ length: 10 }, (_, p) =>
    page(
      Array.from({ length: 100 }, (_, i) => item(String(p * 100 + i))),
      1001,
    ),
  );
  const gh = mock([{ login: "me" }, ...responses]);
  const result = await searchCommits(window, gh.run);
  expect(result.commits).toHaveLength(1000);
  expect(gh.calls).toHaveLength(11);
  expect(result.warnings.join(" ")).toContain("1,000");
});

test("exactly 1,000 results can be complete", async () => {
  const gh = mock([
    { login: "me" },
    ...Array.from({ length: 10 }, (_, p) =>
      page(
        Array.from({ length: 100 }, (_, i) => item(String(p * 100 + i))),
        1000,
      ),
    ),
  ]);
  expect((await searchCommits(window, gh.run)).warnings).toEqual([]);
});

test("detects changing totals between pages", async () => {
  const gh = mock([
    { login: "me" },
    page(
      Array.from({ length: 100 }, (_, i) => item(String(i))),
      101,
    ),
    page([item("100"), item("101")], 102),
  ]);
  expect((await searchCommits(window, gh.run)).warnings.join(" ")).toContain(
    "changed",
  );
});

test("validates identity and response timestamps", async () => {
  await expect(
    searchCommits(window, mock([{ login: "me author:other" }]).run),
  ).rejects.toThrow("user response");
  await expect(
    searchCommits(window, mock([{ login: "me" }, { items: [] }]).run),
  ).rejects.toThrow("search response");
  const bad = item("1");
  bad.commit.author.date = "no timestamp";
  await expect(
    searchCommits(window, mock([{ login: "me" }, page([bad])]).run),
  ).rejects.toThrow("search response");
});

test("propagates request failures instead of returning zero commits", async () => {
  await expect(
    searchCommits(window, async () => {
      throw new Error("HTTP 403 rate limited");
    }),
  ).rejects.toThrow("rate limited");
});
