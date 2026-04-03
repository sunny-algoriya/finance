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

