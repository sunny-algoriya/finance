export type LedgerMonthGroup<T> = {
  month: number;
  label: string;
  transactions: T[];
};

export type LedgerYearGroup<T> = {
  year: number;
  months: LedgerMonthGroup<T>[];
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function groupLedgerRowsByYearMonth<T extends { txn_date: string }>(
  rows: T[]
): LedgerYearGroup<T>[] {
  const years = new Map<number, Map<number, T[]>>();

  for (const row of rows) {
    const parts = String(row.txn_date ?? "").split("-");
    if (parts.length < 2) continue;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!Number.isFinite(y) || !Number.isFinite(m)) continue;

    if (!years.has(y)) years.set(y, new Map());
    const ym = years.get(y)!;
    if (!ym.has(m)) ym.set(m, []);
    ym.get(m)!.push(row);
  }

  const yearOrder = Array.from(years.keys()).sort((a, b) => b - a);
  const out: LedgerYearGroup<T>[] = [];
  for (const y of yearOrder) {
    const ym = years.get(y)!;
    const months = Array.from(ym.keys()).sort((a, b) => b - a);
    const monthsBlock: LedgerMonthGroup<T>[] = [];
    for (const m of months) {
      const txs = ym.get(m);
      if (!txs?.length) continue;
      monthsBlock.push({
        month: m,
        label: `${MONTH_NAMES[m - 1] ?? m} ${y}`,
        transactions: txs,
      });
    }
    if (monthsBlock.length) out.push({ year: y, months: monthsBlock });
  }
  return out;
}

