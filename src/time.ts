import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export type DateWindow = {
  date: string;
  timezone: string;
  start: string;
  end: string;
  searchEnd: string;
};

export function dateWindow(
  date: string | undefined,
  zone: string,
  now = new Date(),
): DateWindow {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    throw new Error(`Invalid timezone: ${zone}`);
  }
  const selected = date ?? dayjs(now).tz(zone).format("YYYY-MM-DD");
  // Validate in UTC so the machine's own DST rules cannot affect parsing.
  const parsed = dayjs.utc(selected, "YYYY-MM-DD", true);
  if (!parsed.isValid())
    throw new Error("--date must be a valid YYYY-MM-DD date");
  const start = dayjs.tz(`${selected}T00:00:00`, zone);
  const nextDate = parsed.add(1, "day").format("YYYY-MM-DD");
  // Construct both boundaries in the zone: adding 24 hours fails across DST.
  const end = dayjs.tz(`${nextDate}T00:00:00`, zone);
  if (start.format("YYYY-MM-DD") !== selected || !end.isAfter(start)) {
    throw new Error(`Date ${selected} does not exist in ${zone}`);
  }
  return {
    date: selected,
    timezone: zone,
    start: start.toISOString(),
    end: end.toISOString(),
    searchEnd: end.subtract(1, "second").toISOString(),
  };
}

export function localHour(timestamp: string, zone: string): number {
  return dayjs(timestamp).tz(zone).hour();
}
