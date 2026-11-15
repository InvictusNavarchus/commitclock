import { describe, expect, test } from "bun:test";
import { dateWindow, localHour } from "../src/time.ts";

describe("date windows", () => {
  test("uses Jakarta midnight and excludes the next day", () => {
    expect(dateWindow("2026-11-15", "Asia/Jakarta")).toEqual({
      date: "2026-11-15",
      timezone: "Asia/Jakarta",
      start: "2026-11-14T17:00:00.000Z",
      end: "2026-11-15T17:00:00.000Z",
      searchEnd: "2026-11-15T16:59:59.000Z",
    });
    expect(localHour("2026-11-14T18:30:00Z", "Asia/Jakarta")).toBe(1);
  });
  test("today follows the selected timezone", () => {
    expect(
      dateWindow(undefined, "Asia/Jakarta", new Date("2026-11-14T18:00:00Z"))
        .date,
    ).toBe("2026-11-15");
  });
  test.each([
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-1-01",
    "today",
    "",
  ])("rejects invalid date %s", (date) => {
    expect(() => dateWindow(date, "Asia/Jakarta")).toThrow("YYYY-MM-DD");
  });
  test("accepts leap day", () => {
    expect(dateWindow("2028-02-29", "UTC").date).toBe("2028-02-29");
  });
  test("rejects unknown timezone", () => {
    expect(() => dateWindow("2026-11-15", "Jakarta/nope")).toThrow(
      "Invalid timezone",
    );
  });
  test.each([
    ["2026-03-08", 23],
    ["2026-11-01", 25],
  ] as const)("handles DST on %s", (date, hours) => {
    const window = dateWindow(date, "America/New_York");
    expect(
      (Date.parse(window.end) - Date.parse(window.start)) / 3_600_000,
    ).toBe(hours);
  });
  test("rejects a skipped calendar day", () => {
    expect(() => dateWindow("2011-12-30", "Pacific/Apia")).toThrow(
      "does not exist",
    );
  });
});
