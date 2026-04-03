/** Show weekday (Mon–Sun) and day of month; full YYYY-MM-DD is omitted since period is in filters. */
export function formatShortWeekdayDay(isoDate: string): string {
  const trimmed = String(isoDate).trim();
  if (!trimmed) return "—";
  const d = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00` : trimmed
  );
  if (Number.isNaN(d.getTime())) return trimmed;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[d.getDay()]} ${d.getDate()}`;
}

/** Weekday + full calendar date (YYYY-MM-DD) for “view all” lists. */
export function formatFullDateWithWeekday(isoDate: string): string {
  const trimmed = String(isoDate).trim();
  if (!trimmed) return "—";
  const d = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00` : trimmed
  );
  if (Number.isNaN(d.getTime())) return trimmed;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${days[d.getDay()]}, ${y}-${m}-${day}`;
}
