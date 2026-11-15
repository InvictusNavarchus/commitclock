#!/usr/bin/env bun
import { cac } from "cac";
import { z } from "zod";
import { version } from "../package.json";
import { summarize } from "./analytics.ts";
import { searchCommits } from "./github.ts";
import { render } from "./render.ts";
import { dateWindow } from "./time.ts";

const optionsSchema = z.object({
  date: z.string().optional(),
  timezone: z.string().min(1).default("Asia/Jakarta"),
  json: z.boolean().default(false),
});
const cli = cac("commitclock");
cli
  .command("", "Show daily GitHub commit totals and hourly activity")
  .option(
    "--date <YYYY-MM-DD>",
    "Report date (default: today in selected timezone)",
  )
  .option("--timezone <zone>", "IANA timezone (default: Asia/Jakarta)")
  .option("--json", "Print the report as JSON")
  .action(async (raw: unknown) => {
    const parsed = optionsSchema.safeParse(raw);
    if (!parsed.success)
      throw new Error(
        "Invalid options: --date and --timezone require single string values; --json is a boolean flag",
      );
    const options = parsed.data;
    const window = dateWindow(options.date, options.timezone);
    const report = summarize(await searchCommits(window), window);
    console.log(
      options.json ? JSON.stringify(report, null, 2) : render(report),
    );
    // Partial data remains usable, but scripts can distinguish it from a full search.
    if (!report.searchComplete) process.exitCode = 2;
  });
cli.help();
cli.version(version);
try {
  cli.parse(process.argv, { run: false });
  if (cli.args.length) throw new Error(`Unexpected argument: ${cli.args[0]}`);
  await cli.runMatchedCommand();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unexpected failure");
  process.exitCode = 1;
}
