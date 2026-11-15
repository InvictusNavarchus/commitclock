import { afterAll, expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "commitclock-test-"));
const cli = new URL("../src/cli.ts", import.meta.url).pathname;
// A real subprocess fixture verifies argument passing, JSON handling, and exit codes.
await Bun.write(
  join(directory, "gh"),
  `#!${process.execPath}
const args = process.argv.slice(2);
const mode = process.env.COMMITCLOCK_TEST_MODE;
if (mode === "failure") { console.error("HTTP 403: API rate limit exceeded"); process.exit(1); }
if (mode === "bad-json") { console.log("invalid"); process.exit(0); }
if (args.includes("user")) { console.log(JSON.stringify({ login: "tester" })); process.exit(0); }
if (!args.includes("search/commits") || !args.includes("GET") || !args.includes("page=1")) process.exit(9);
console.log(JSON.stringify({total_count: 1, incomplete_results: mode === "partial", items: [
  {sha: "abc", repository: {full_name: "tester/project"}, commit: {author: {date: "2026-11-15T10:30:00+07:00"}}}
]}));
`,
);
await chmod(join(directory, "gh"), 0o755);
afterAll(() => rm(directory, { recursive: true, force: true }));

async function run(args: readonly string[], mode = "ok", path = directory) {
  const child = Bun.spawn([process.execPath, cli, ...args], {
    env: { ...process.env, PATH: path, COMMITCLOCK_TEST_MODE: mode },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

test("JSON mode writes only a structured report to stdout", async () => {
  const result = await run(["--date", "2026-11-15", "--json"]);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  const report = JSON.parse(result.stdout);
  expect(report.total).toBe(1);
  expect(report.hours[10].commits).toBe(1);
  expect(report.searchComplete).toBe(true);
});

test("terminal report includes repository counts and all hour labels", async () => {
  const result = await run(["--date", "2026-11-15"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("tester/project");
  expect(result.stdout).toContain("00:00");
  expect(result.stdout).toContain("23:00");
});

test("partial reports have structured warnings and exit 2", async () => {
  const result = await run(["--date", "2026-11-15", "--json"], "partial");
  expect(result.code).toBe(2);
  expect(JSON.parse(result.stdout).searchComplete).toBe(false);
});

test.each(["failure", "bad-json"])(
  "%s exits with an error and no report",
  async (mode) => {
    const result = await run(["--date", "2026-11-15"], mode);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.length).toBeGreaterThan(0);
  },
);

test("missing gh produces installation guidance", async () => {
  const result = await run([], "ok", "/nonexistent");
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("gh auth login");
});

test.each(
  [
    ["--date", "2026-02-30"],
    ["--timezone", "invalid/zone"],
    ["--unknown"],
    ["oops"],
    ["--date"],
    ["--date", "2026-11-15", "--date", "2026-11-14"],
  ].map((args) => ({ args })),
)("invalid arguments %j fail before API access", async ({ args }) => {
  const result = await run(args, "failure");
  expect(result.code).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).not.toContain("HTTP 403");
});

test.each([{ args: ["--help"] }, { args: ["--version"] }])(
  "%j succeeds without gh",
  async ({ args }) => {
    const result = await run(args, "ok", "/nonexistent");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("0.1.0");
  },
);
