import { api } from "./api";

export type People = {
  id: number | string;
  name: string;
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

  return { id, name };
}

function normalizePeopleList(raw: any): People[] {
  const items = Array.isArray(raw) ? raw : raw?.results;
  if (!Array.isArray(items)) return [];
  return items.map(normalizePeople);
}

export async function listPeoples(params: PeopleListParams = {}): Promise<People[]> {
  const search = params.search?.trim();
  const res = await api.get("/people/", {
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
};

export type PersonLedgerRow = {
  id: number | string;
  txn_date: string;
  description: string;
  credit: string;
  debit: string;
  amount: string;
  type: "credit" | "debit";
  account: number | string;
  account_name: string;
};

export type PersonLedger = {
  person: number | string;
  person_name: string;
  year: number | null;
  month: number | null;
  account: number | string | null;
  total_credit: string;
  total_debit: string;
  net: string;
  transaction_count: number;
  transactions: PersonLedgerRow[];
};

function normalizeLedgerRow(raw: any): PersonLedgerRow {
  const id = raw?.id ?? raw?.pk;
  if (id === undefined || id === null) throw new Error("Ledger row missing id.");
  const type = raw?.type === "credit" ? "credit" : "debit";
  return {
    id,
    txn_date: String(raw?.txn_date ?? raw?.txnDate ?? ""),
    description: String(raw?.description ?? ""),
    credit: String(raw?.credit ?? "0"),
    debit: String(raw?.debit ?? "0"),
    amount: String(raw?.amount ?? "0"),
    type,
    account: raw?.account ?? raw?.account_id ?? "",
    account_name: String(raw?.account_name ?? raw?.accountName ?? ""),
  };
}

function normalizeLedger(raw: any): PersonLedger {
  const txs = Array.isArray(raw?.transactions) ? raw.transactions.map(normalizeLedgerRow) : [];
  return {
    person: raw?.person ?? raw?.person_id ?? "",
    person_name: String(raw?.person_name ?? raw?.personName ?? ""),
    year: raw?.year ?? null,
    month: raw?.month ?? null,
    account: raw?.account ?? null,
    total_credit: String(raw?.total_credit ?? "0"),
    total_debit: String(raw?.total_debit ?? "0"),
    net: String(raw?.net ?? "0"),
    transaction_count: typeof raw?.transaction_count === "number" ? raw.transaction_count : txs.length,
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
  const res = await api.get(`/people/${id}/ledger/`, {
    params: Object.keys(params).length ? params : undefined,
  });
  return normalizeLedger(res.data);
}

export const PERSON_LOAN_TYPES = [
  "repayment_in",
  "repayment_out",
  "loan_given",
  "loan_taken",
] as const;

export type PersonLoanType = (typeof PERSON_LOAN_TYPES)[number];

type LoanTypeSummary = {
  side: "debit" | "credit";
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
    types: PersonLoanType[];
    account: number | string | null;
  };
  summary: {
    balance_lifetime: {
      they_owe_you: string;
      you_owe_them: string;
      net: string;
    };
    balance_period: {
      they_owe_you: string;
      you_owe_them: string;
      net: string;
    };
    totals_by_type: Record<PersonLoanType, LoanTypeSummary>;
  };
  by_type: Record<PersonLoanType, LoanReportTxn[]>;
};

export type PersonLoanReportQuery = {
  types?: PersonLoanType[] | "all";
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
  return {
    side: raw?.side === "debit" ? "debit" : "credit",
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
  const selectedTypes = PERSON_LOAN_TYPES.filter((t) => Array.isArray(raw?.filters?.types)
    ? raw.filters.types.includes(t)
    : true);

  const by_type = PERSON_LOAN_TYPES.reduce(
    (acc, t) => {
      const items = Array.isArray(byTypeRaw?.[t]) ? byTypeRaw[t] : [];
      acc[t] = items.map(normalizeLoanTxn);
      return acc;
    },
    {} as Record<PersonLoanType, LoanReportTxn[]>
  );

  const totals_by_type = PERSON_LOAN_TYPES.reduce(
    (acc, t) => {
      acc[t] = normalizeTypeSummary(totalsRaw?.[t]);
      return acc;
    },
    {} as Record<PersonLoanType, LoanTypeSummary>
  );

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
      types: selectedTypes.length ? selectedTypes : [...PERSON_LOAN_TYPES],
      account: raw?.filters?.account ?? null,
    },
    summary: {
      balance_lifetime: {
        they_owe_you: toMoneyString(raw?.summary?.balance_lifetime?.they_owe_you),
        you_owe_them: toMoneyString(raw?.summary?.balance_lifetime?.you_owe_them),
        net: toMoneyString(raw?.summary?.balance_lifetime?.net),
      },
      balance_period: {
        they_owe_you: toMoneyString(raw?.summary?.balance_period?.they_owe_you),
        you_owe_them: toMoneyString(raw?.summary?.balance_period?.you_owe_them),
        net: toMoneyString(raw?.summary?.balance_period?.net),
      },
      totals_by_type,
    },
    by_type,
  };
}

