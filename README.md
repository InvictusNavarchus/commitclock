# commitclock

Daily and hourly GitHub commit analytics, built with Bun, TypeScript, Zod, cac,
and Day.js. Uses the authenticated GitHub CLI to retrieve commits and groups
them by repository and local clock hour.

## Setup

Requires Bun 1.4.4 or newer and an installed, authenticated
[GitHub CLI](https://cli.github.com/).

```bash
bun install --frozen-lockfile
gh auth login --hostname github.com
bun run start
```

## Usage

```bash
# Today in Asia/Jakarta (the default timezone)
bun run start

# A specific day, interpreted in the selected timezone
bun run start --date 2026-11-15
bun run start --date 2026-11-15 --timezone America/New_York

# Machine-readable output
bun run start --date 2026-11-15 --json
```

The terminal report shows the author, total commits, repository counts, and all
24 clock-hour buckets with proportional bars. Day.js converts author timestamps
to the selected timezone. On daylight-saving fall-back days the repeated hour is
combined into one bucket; on spring-forward days the skipped hour has zero commits.

To build a local executable:

```bash
bun run build
./dist/commitclock --help
```

The compiled executable still requires `gh`. It does not require a separate Bun
installation at runtime. The source entrypoint also has a Bun shebang and a
package `bin` entry for local linking if desired.

### Options

| Option                | Meaning                                                         |
| --------------------- | --------------------------------------------------------------- |
| `--date <YYYY-MM-DD>` | Valid calendar date; defaults to today in the selected timezone |
| `--timezone <zone>`   | IANA timezone; defaults to `Asia/Jakarta`                       |
| `--json`              | Write a JSON report instead of terminal output                  |
| `--help`              | Show usage                                                      |
| `--version`           | Show version                                                    |

### Counting and coverage

- Uses the active `gh` account on **github.com**, independently of the current
  repository or `GH_HOST`. Switch accounts with `gh auth switch --hostname github.com`.
- Selects commits by **author date**, from local midnight inclusive to the next
  local midnight exclusive. These timestamps indicate commit activity, not hours worked.
- Counts each repository–SHA pair once. A SHA found in two repositories counts
  once in each, so repository totals add up to the report total.
- GitHub commit search covers default-branch history. Feature-branch-only commits,
  unpushed commits, repositories the account cannot access, and commits not yet
  indexed by GitHub may be absent. Private repositories require suitable credentials.
- Merge strategy affects history: squash merges contribute the squash commit;
  preserved commits can appear under their earlier author dates after merging.
  There is no persistent cache, and historical totals can change.
- Search provides at most 1,000 results per query. The tool retrieves up to ten
  pages and marks results partial when the cap is exceeded, GitHub reports
  `incomplete_results`, or pagination shows inconsistent results. It does not
  fetch individual commit details or implement automatic retries.

JSON includes `date`, `timezone`, `author`, `timestampBasis`, `coverage`,
`searchComplete`, `warnings`, `matchedCount`, `total`, `repositories`, and `hours`.
`matchedCount` is the last total reported by GitHub; `total` counts retrieved
commits within the selected window. `searchComplete` refers to search retrieval
only, subject to the coverage limits above.

Exit codes: **0** successful search, **1** invalid input or failed request,
**2** partial report. Partial reports are printed with warnings; request failures
produce no report and print an error to stderr. JSON stdout contains only JSON.

API references: [gh api](https://cli.github.com/manual/gh_api),
[commit search](https://docs.github.com/en/rest/search/search#search-commits),
[commit search coverage](https://docs.github.com/en/search-github/searching-on-github/searching-commits).

## Development

```bash
bun run test
bun run typecheck
```

Tests use fixtures and a fake `gh` executable; they do not contact GitHub or
require authentication. Coverage includes date boundaries, DST, aggregation,
pagination, partial results, malformed responses, CLI options, and subprocess failures.

`src/cli.ts` orchestrates arguments and output; `src/github.ts` owns the subprocess
and API schemas; `src/time.ts` owns Day.js setup and date windows;
`src/analytics.ts` aggregates validated data; `src/render.ts` produces terminal text.
Imports refer directly to their source modules.
