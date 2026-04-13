import { api } from "./api";

export type PersonPersonalSummary = {
  gave: string;
  got: string;
  settled: string;
  balance: string;
};

export type People = {
  id: number | string;
  name: string;
  /** Present when API returns `personal_summary` (e.g. list with serializer). */
  personal_summary?: PersonPersonalSummary;
};

export type PeopleListParams = {
  search?: string;
};

export type PeopleCreateInput = {
  name: string;
};

export type PeopleUpdateInput = Partial<PeopleCreateInput>;

function normalizePeople(raw: any): People {
  const id = raw?.id ?? raw?.pk ?? raw?._id;
  const name = raw?.name;

  if (id === undefined || id === null) {
    throw new Error("People is missing id.");
  }
  if (typeof name !== "string") {
    throw new Error("People is missing name.");
  }

  const ps = raw?.personal_summary;
  const personal_summary =
    ps &&
    typeof ps === "object" &&
    ps.gave != null &&
    ps.got != null &&
    ps.settled != null &&
    ps.balance != null
      ? {
          gave: String(ps.gave),
          got: String(ps.got),
          settled: String(ps.settled),
          balance: String(ps.balance),
        }
      : undefined;

  return { id, name, ...(personal_summary ? { personal_summary } : {}) };
}

function normalizePeopleList(raw: any): People[] {
  const items = Array.isArray(raw) ? raw : raw?.results;
  if (!Array.isArray(items)) return [];
  return items.map(normalizePeople);
}

export async function listPeoples(params: PeopleListParams = {}): Promise<People[]> {
  const search = params.search?.trim();
  const res = await api.get("/people/?page_size=1000", {
    params: search ? { search } : undefined,
  });
  return normalizePeopleList(res.data);
}

export async function createPeople(input: PeopleCreateInput): Promise<People> {
  const res = await api.post("/people/", input);
  return normalizePeople(res.data);
}

export async function patchPeople(
  id: People["id"],
  input: PeopleUpdateInput
): Promise<People> {
  const res = await api.patch(`/people/${id}/`, input);
  return normalizePeople(res.data);
}

export async function putPeople(
  id: People["id"],
  input: PeopleCreateInput
): Promise<People> {
  const res = await api.put(`/people/${id}/`, input);
  return normalizePeople(res.data);
}

export async function deletePeople(id: People["id"]): Promise<void> {
  await api.delete(`/people/${id}/`);
}

export type PersonLedgerQuery = {
  year?: number | string;
  month?: number | string;
  /** Omit or null = all; "none" = uncategorized; otherwise category id */
  category?: number | string | "none" | null;
  group_by_category?: boolean;
};

/** Distinct categories in the ledger period (before category filter), with totals. */
export type PersonLedgerCategory = {
  id: number | string | null;
  name: string | null;
  transaction_count: number;
  total_credit: string;
  total_debit: string;
  net: string;
};

export type PersonLedgerRow = {
  id: number | string;
  txn_date: string;
  remark: string | null;
  description: string;
  credit: string;
  debit: string;
  amount: string;
  type: "credit" | "debit";
  account: number | string;
  account_name: string;
  category: number | string | null;
  category_name: string | null;
};

export type PersonLedger = {
  person: number | string;
  person_name: string;
  year: number | null;
  month: number | null;
  account: number | string | null;
  /** Active category filter echoed from the API */
  category: number | "none" | null;
  total_credit: string;
  total_debit: string;
  net: string;
  /** Sum of total credit and total debit for the filtered rows (gross volume). */
  gross_total: string;
  transaction_count: number;
  categories: PersonLedgerCategory[];
  transactions: PersonLedgerRow[];
};

function normalizeLedgerRow(raw: any): PersonLedgerRow {
  const id = raw?.id ?? raw?.pk;
  if (id === undefined || id === null) throw new Error("Ledger row missing id.");
  const type = raw?.type === "credit" ? "credit" : "debit";
  const remarkRaw = raw?.remark;
  const catRaw = raw?.category ?? raw?.category_id ?? null;
  return {
    id,
    txn_date: String(raw?.txn_date ?? raw?.txnDate ?? ""),
    remark:
      remarkRaw === undefined || remarkRaw === null || remarkRaw === ""
        ? null
        : String(remarkRaw),
    description: String(raw?.description ?? ""),
    credit: String(raw?.credit ?? "0"),
    debit: String(raw?.debit ?? "0"),
    amount: String(raw?.amount ?? "0"),
    type,
    account: raw?.account ?? raw?.account_id ?? "",
    account_name: String(raw?.account_name ?? raw?.accountName ?? ""),
    category: catRaw === undefined || catRaw === null || catRaw === "" ? null : catRaw,
    category_name:
      raw?.category_name === undefined || raw?.category_name === null
        ? null
        : String(raw.category_name),
  };
}

function normalizeLedgerCategory(raw: any): PersonLedgerCategory {
  const id = raw?.id ?? raw?.category_id ?? null;
  return {
    id: id === undefined || id === null || id === "" ? null : id,
    name:
      raw?.name === undefined || raw?.name === null
        ? null
        : String(raw.name),
    transaction_count: typeof raw?.transaction_count === "number" ? raw.transaction_count : 0,
    total_credit: String(raw?.total_credit ?? "0"),
    total_debit: String(raw?.total_debit ?? "0"),
    net: String(raw?.net ?? "0"),
  };
}

function normalizeLedger(raw: any): PersonLedger {
  const txs = Array.isArray(raw?.transactions) ? raw.transactions.map(normalizeLedgerRow) : [];
  const catEcho = raw?.category;
  let categoryEcho: PersonLedger["category"] = null;
  if (catEcho === "none" || catEcho === null) {
    categoryEcho = catEcho === "none" ? "none" : null;
  } else if (catEcho !== undefined && catEcho !== "") {
    categoryEcho = typeof catEcho === "number" ? catEcho : Number(catEcho);
    if (!Number.isFinite(categoryEcho)) categoryEcho = null;
  }
  const cats = Array.isArray(raw?.categories)
    ? raw.categories.map(normalizeLedgerCategory)
    : [];
  const tcStr = String(raw?.total_credit ?? "0");
  const tdStr = String(raw?.total_debit ?? "0");
  const grossRaw = raw?.gross_total;
  const grossStr =
    grossRaw !== undefined && grossRaw !== null && grossRaw !== ""
      ? String(grossRaw)
      : (() => {
          const a = Number(String(tcStr).replace(/,/g, "").trim());
          const b = Number(String(tdStr).replace(/,/g, "").trim());
          const s = (Number.isFinite(a) ? a : 0) + (Number.isFinite(b) ? b : 0);
          return s.toFixed(2);
        })();
  return {
    person: raw?.person ?? raw?.person_id ?? "",
    person_name: String(raw?.person_name ?? raw?.personName ?? ""),
    year: raw?.year ?? null,
    month: raw?.month ?? null,
    account: raw?.account ?? null,
    category: categoryEcho,
    total_credit: tcStr,
    total_debit: tdStr,
    net: String(raw?.net ?? "0"),
    gross_total: grossStr,
    transaction_count: typeof raw?.transaction_count === "number" ? raw.transaction_count : txs.length,
    categories: cats,
    transactions: txs,
  };
}

export async function getPersonLedger(
  id: People["id"],
  query: PersonLedgerQuery = {}
): Promise<PersonLedger> {
  const params: Record<string, string | number> = {};
  const y = query.year;
  const m = query.month;
  if (y !== undefined && y !== null && y !== "") {
    params.year = typeof y === "number" ? y : String(y).trim();
  }
  if (m !== undefined && m !== null && m !== "") {
    params.month = typeof m === "number" ? m : String(m).trim();
  }
  const cat = query.category;
  if (cat === "none") {
    params.category = "none";
  } else if (cat !== undefined && cat !== null && cat !== "") {
    params.category = typeof cat === "number" ? cat : String(cat).trim();
  }
  if (query.group_by_category) {
    params.group_by_category = "true";
  }
  const res = await api.get(`/people/${id}/ledger/`, {
    params: Object.keys(params).length ? params : undefined,
  });
  return normalizeLedger(res.data);
}

export const PERSONAL_TYPES = ["gave", "got", "settle"] as const;

export type PersonalType = (typeof PERSONAL_TYPES)[number];

type LoanTypeSummary = {
  side: "debit" | "credit" | "settle";
  sum: string;
  count: number;
};

type LoanReportTxn = {
  id: number | string;
  txn_date: string;
  description: string;
  amount: string;
  type: "credit" | "debit";
  account: number | string;
  category: number | string | null;
  hidden: boolean;
};

export type PersonLoanReport = {
  person: { id: number | string; user?: number | string; name: string };
  filters: {
    year: number | null;
    month: number | null;
    types: PersonalType[];
    account: number | string | null;
  };
  summary: {
    balance_lifetime: PersonPersonalSummary;
    balance_period: PersonPersonalSummary;
    totals_by_type: Record<PersonalType, LoanTypeSummary>;
  };
  by_type: Record<PersonalType, LoanReportTxn[]>;
};

export type PersonLoanReportQuery = {
  types?: PersonalType[] | "all";
  year?: number | string;
  month?: number | string;
  year_month?: string;
  account?: number | string | null;
};

function toMoneyString(v: any): string {
  const raw =
    typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(raw)) return "0.00";
  return raw.toFixed(2);
}

function normalizeLoanTxn(raw: any): LoanReportTxn {
  const id = raw?.id ?? raw?.pk ?? raw?._id;
  if (id === undefined || id === null) throw new Error("Loan txn missing id.");
  return {
    id,
    txn_date: String(raw?.txn_date ?? ""),
    description: String(raw?.description ?? ""),
    amount: toMoneyString(raw?.amount),
    type: raw?.type === "debit" ? "debit" : "credit",
    account: raw?.account ?? "",
    category: raw?.category ?? null,
    hidden: Boolean(raw?.hidden),
  };
}

function normalizeTypeSummary(raw: any): LoanTypeSummary {
  const s = raw?.side;
  const side: LoanTypeSummary["side"] =
    s === "debit" ? "debit" : s === "settle" ? "settle" : "credit";
  return {
    side,
    sum: toMoneyString(raw?.sum),
    count: Number(raw?.count ?? 0),
  };
}

export async function getPersonLoanReport(
  id: People["id"],
  query: PersonLoanReportQuery = {}
): Promise<PersonLoanReport> {
  const params: Record<string, string | number> = {};
  if (query.types && query.types !== "all") {
    params.types = query.types.join(",");
  }
  if (query.year !== undefined && query.year !== null && query.year !== "") {
    params.year =
      typeof query.year === "number" ? query.year : String(query.year).trim();
  }
  if (query.month !== undefined && query.month !== null && query.month !== "") {
    params.month =
      typeof query.month === "number" ? query.month : String(query.month).trim();
  }
  if (query.year_month && String(query.year_month).trim()) {
    params.year_month = String(query.year_month).trim();
  }
  if (query.account !== undefined && query.account !== null && query.account !== "") {
    params.account =
      typeof query.account === "number"
        ? query.account
        : String(query.account).trim();
  }

  const res = await api.get(`/people/${id}/loan-report/`, {
    params: Object.keys(params).length ? params : undefined,
  });
  const raw = res.data ?? {};
  const byTypeRaw = raw?.by_type ?? {};
  const totalsRaw = raw?.summary?.totals_by_type ?? {};
  const selectedTypes = PERSONAL_TYPES.filter((t) =>
    Array.isArray(raw?.filters?.types) ? raw.filters.types.includes(t) : true,
  );

  const by_type = PERSONAL_TYPES.reduce(
    (acc, t) => {
      const items = Array.isArray(byTypeRaw?.[t]) ? byTypeRaw[t] : [];
      acc[t] = items.map(normalizeLoanTxn);
      return acc;
    },
    {} as Record<PersonalType, LoanReportTxn[]>,
  );

  const totals_by_type = PERSONAL_TYPES.reduce(
    (acc, t) => {
      acc[t] = normalizeTypeSummary(totalsRaw?.[t]);
      return acc;
    },
    {} as Record<PersonalType, LoanTypeSummary>,
  );

  const bl = raw?.summary?.balance_lifetime ?? {};
  const bp = raw?.summary?.balance_period ?? {};

  return {
    person: {
      id: raw?.person?.id ?? id,
      user: raw?.person?.user,
      name: String(raw?.person?.name ?? ""),
    },
    filters: {
      year:
        typeof raw?.filters?.year === "number" ? raw.filters.year : raw?.filters?.year ?? null,
      month:
        typeof raw?.filters?.month === "number" ? raw.filters.month : raw?.filters?.month ?? null,
      types: selectedTypes.length ? selectedTypes : [...PERSONAL_TYPES],
      account: raw?.filters?.account ?? null,
    },
    summary: {
      balance_lifetime: {
        gave: toMoneyString(bl.gave),
        got: toMoneyString(bl.got),
        settled: toMoneyString(bl.settled),
        balance: toMoneyString(bl.balance),
      },
      balance_period: {
        gave: toMoneyString(bp.gave),
        got: toMoneyString(bp.got),
        settled: toMoneyString(bp.settled),
        balance: toMoneyString(bp.balance),
      },
      totals_by_type,
    },
    by_type,
  };
}

