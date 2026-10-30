export type DateInputType = "date" | "datetime-local";

/** UI text only. Wire values stay ISO dates/local datetimes, with no timezone conversion. */
export function displayDateValue(value: string, type: DateInputType): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!match) return "";
  const date = `${match[3]}/${match[2]}/${match[1]}`;
  return type === "datetime-local" && match[4] ? `${date} ${match[4]}:${match[5]}` : date;
}

export function parseDateValue(text: string, type: DateInputType): string | null {
  if (!text.trim()) return "";
  const pattern = type === "date"
    ? /^(\d{2})\/(\d{2})\/(\d{4})$/
    : /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/;
  const match = pattern.exec(text.trim());
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number(year) < 1 || Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) ||
      date.getUTCDate() !== Number(day)) return null;
  if (type === "datetime-local") {
    if (Number(hour) > 23 || Number(minute) > 59) return null;
    return `${iso}T${hour}:${minute}`;
  }
  return iso;
}
