import { api } from "./api";

export const ACCOUNT_TYPES = ["bank", "wallet", "credit_card"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type Account = {
  id: number | string;
  name: string;
  account_type: AccountType;
};

export type AccountCreateInput = {
  name: string;
  account_type: AccountType;
};

export type AccountUpdateInput = Partial<AccountCreateInput>;

function normalizeAccount(raw: any): Account {
  const id = raw?.id ?? raw?.pk ?? raw?._id;
  const name = raw?.name;
  const account_type = raw?.account_type ?? raw?.accountType;

  if (id === undefined || id === null) {
    throw new Error("Account is missing id.");
  }
  if (typeof name !== "string") {
    throw new Error("Account is missing name.");
  }
  if (!ACCOUNT_TYPES.includes(account_type)) {
    throw new Error("Account has invalid account_type.");
  }

  return { id, name, account_type };
}

function normalizeAccountList(raw: any): Account[] {
  const items = Array.isArray(raw) ? raw : raw?.results;
  if (!Array.isArray(items)) return [];
  return items.map(normalizeAccount);
}

export async function listAccounts(): Promise<Account[]> {
  const res = await api.get("/accounts/");
  return normalizeAccountList(res.data);
}

export async function createAccount(
  input: AccountCreateInput
): Promise<Account> {
  const res = await api.post("/accounts/", input);
  return normalizeAccount(res.data);
}

export async function patchAccount(
  id: Account["id"],
  input: AccountUpdateInput
): Promise<Account> {
  const res = await api.patch(`/accounts/${id}/`, input);
  return normalizeAccount(res.data);
}

export async function putAccount(
  id: Account["id"],
  input: AccountCreateInput
): Promise<Account> {
  const res = await api.put(`/accounts/${id}/`, input);
  return normalizeAccount(res.data);
}

export async function deleteAccount(id: Account["id"]): Promise<void> {
  await api.delete(`/accounts/${id}/`);
}

export type AccountLedgerQuery = {
  year?: number | string;
  month?: number | string;
};

export type AccountLedgerRow = {
  id: number | string;
  txn_date: string;
  description: string;
  credit: string;
  debit: string;
  amount: string;
  type: "credit" | "debit";
  person: number | string | null;
  person_name: string;
  account: number | string;
  account_name: string;
};

export type AccountLedger = {
  account: number | string;
  account_name: string;
  person: number | string | null;
  year: number | null;
  month: number | null;
  total_credit: string;
  total_debit: string;
  net: string;
  transaction_count: number;
  transactions: AccountLedgerRow[];
};

function normalizeAccountLedgerRow(raw: any): AccountLedgerRow {
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
    person: raw?.person ?? raw?.person_id ?? null,
    person_name: String(raw?.person_name ?? raw?.personName ?? ""),
    account: raw?.account ?? raw?.account_id ?? "",
    account_name: String(raw?.account_name ?? raw?.accountName ?? ""),
  };
}

function normalizeAccountLedger(raw: any): AccountLedger {
  const txs = Array.isArray(raw?.transactions)
    ? raw.transactions.map(normalizeAccountLedgerRow)
    : [];
  return {
    account: raw?.account ?? raw?.account_id ?? "",
    account_name: String(raw?.account_name ?? raw?.accountName ?? ""),
    person: raw?.person ?? raw?.person_id ?? null,
    year: raw?.year ?? null,
    month: raw?.month ?? null,
    total_credit: String(raw?.total_credit ?? "0"),
    total_debit: String(raw?.total_debit ?? "0"),
    net: String(raw?.net ?? "0"),
    transaction_count:
      typeof raw?.transaction_count === "number" ? raw.transaction_count : txs.length,
    transactions: txs,
  };
}

export async function getAccountLedger(
  id: Account["id"],
  query: AccountLedgerQuery = {}
): Promise<AccountLedger> {
  const params: Record<string, string | number> = {};
  const y = query.year;
  const m = query.month;
  if (y !== undefined && y !== null && y !== "") {
    params.year = typeof y === "number" ? y : String(y).trim();
  }
  if (m !== undefined && m !== null && m !== "") {
    params.month = typeof m === "number" ? m : String(m).trim();
  }
  const res = await api.get(`/accounts/${id}/ledger/`, {
    params: Object.keys(params).length ? params : undefined,
  });
  return normalizeAccountLedger(res.data);
}

