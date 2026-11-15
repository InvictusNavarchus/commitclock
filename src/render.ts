import type { Report } from "./analytics.ts";

export function render(report: Report): string {
  const lines = [
    `commitclock | ${report.date} | ${report.timezone}`,
    `Author: ${report.author}`,
    `${report.total} commits across ${report.repositories.length} repositories${report.searchComplete ? "" : " (PARTIAL RESULTS)"}`,
    "",
    "Repositories",
  ];
  const width = Math.max(
    10,
    ...report.repositories.map((r) => r.repository.length),
  );
  for (const row of report.repositories)
    lines.push(`  ${row.repository.padEnd(width)}  ${row.commits}`);
  if (!report.total) lines.push("  No commits found for this date.");
  lines.push("", "Commits by hour (author time)");
  const peak = Math.max(1, ...report.hours.map((r) => r.commits));
  for (const row of report.hours) {
    const bar = "#".repeat(
      row.commits ? Math.max(1, Math.round((row.commits / peak) * 24)) : 0,
    );
    lines.push(
      `  ${String(row.hour).padStart(2, "0")}:00  ${String(row.commits).padStart(4)}  ${bar}`,
    );
  }
  lines.push(
    "",
    "Coverage: GitHub default-branch search; timestamps do not measure hours worked.",
  );
  for (const warning of report.warnings) lines.push(`Warning: ${warning}`);
  return lines.join("\n");
}
