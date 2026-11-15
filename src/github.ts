import { z } from "zod";
import type { DateWindow } from "./time.ts";

const userSchema = z.object({ login: z.string().regex(/^[a-z\d-]+$/i) });
const pageSchema = z.object({
  total_count: z.number().int().nonnegative(),
  incomplete_results: z.boolean(),
  items: z
    .array(
      z.object({
        sha: z.string().min(1),
        repository: z.object({ full_name: z.string().min(1) }),
        commit: z.object({
          author: z.object({ date: z.iso.datetime({ offset: true }) }),
        }),
      }),
    )
    .max(100),
});

export type Commit = { sha: string; repository: string; authoredAt: string };
export type SearchResult = {
  author: string;
  commits: Commit[];
  matchedCount: number;
  warnings: string[];
};
type RunGh = (args: string[]) => Promise<unknown>;

export async function ghJson(args: string[]): Promise<unknown> {
  if (!Bun.which("gh"))
    throw new Error(
      "GitHub CLI (gh) is required. Install it and run gh auth login.",
    );
  const child = Bun.spawn(["gh", ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
    timeout: 60_000,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(
      `gh failed (${code}): ${stderr.trim() || "request failed or timed out"}`,
    );
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error("gh returned invalid JSON");
  }
}

export async function searchCommits(
  window: DateWindow,
  run: RunGh = ghJson,
): Promise<SearchResult> {
  // Explicit host keeps account lookup and search consistent regardless of cwd/GH_HOST.
  const base = ["api", "--hostname", "github.com", "--method", "GET"];
  const user = userSchema.safeParse(await run([...base, "user"]));
  if (!user.success) throw new Error("Unexpected GitHub user response");
  const author = user.data.login;
  const query = `author:${author} author-date:${window.start}..${window.searchEnd}`;
  const commits: Commit[] = [];
  const warnings = new Set<string>();
  const seen = new Set<string>();
  let matchedCount = 0;
  for (let page = 1; page <= 10; page++) {
    const parsed = pageSchema.safeParse(
      await run([
        ...base,
        "search/commits",
        "-f",
        `q=${query}`,
        "-f",
        "per_page=100",
        "-f",
        `page=${page}`,
        "-f",
        "sort=author-date",
        "-f",
        "order=asc",
        "-H",
        "Accept: application/vnd.github+json",
      ]),
    );
    if (!parsed.success)
      throw new Error(
        `Unexpected GitHub commit search response on page ${page}`,
      );
    const data = parsed.data;
    if (page > 1 && data.total_count !== matchedCount) {
      warnings.add(
        "Search totals changed during pagination; run again for a fresh report.",
      );
    }
    matchedCount = data.total_count;
    if (data.incomplete_results)
      warnings.add("GitHub marked the search results as incomplete.");
    if (matchedCount > 1000)
      warnings.add(
        "GitHub search exposes at most 1,000 results; this report is partial.",
      );
    for (const item of data.items) {
      const key = `${item.repository.full_name}:${item.sha}`;
      if (seen.has(key)) {
        warnings.add(
          "Duplicate results occurred during pagination; counts may be incomplete.",
        );
        continue;
      }
      seen.add(key);
      commits.push({
        sha: item.sha,
        repository: item.repository.full_name,
        authoredAt: item.commit.author.date,
      });
    }
    if (data.items.length < 100 || page * 100 >= Math.min(matchedCount, 1000))
      break;
  }
  if (commits.length < matchedCount)
    warnings.add("Retrieved fewer unique results than GitHub reported.");
  return { author, commits, matchedCount, warnings: [...warnings] };
}
