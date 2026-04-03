/** Format a numeric amount string or number for display with exactly two decimal places. */
export function formatMoney2(s: string | number | null | undefined): string {
  const raw =
    typeof s === "number" ? s : Number(String(s ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(raw)) return "0.00";
  return raw.toFixed(2);
}
