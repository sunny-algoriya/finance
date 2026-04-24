import { api } from "./api";

export const TRANSACTION_TXN_TYPES = ["income", "expense", "transfer"] as const;

export type TransactionTxnType = (typeof TRANSACTION_TXN_TYPES)[number];

export const TRANSACTION_PERSONAL_TYPES = ["gave", "got", "settle"] as const;

export type TransactionPersonalType = (typeof TRANSACTION_PERSONAL_TYPES)[number];

export type Transaction = {
  id: number | string;
  account: number | string;
  person: number | string | null;
  category: number | string | null;
  txn_date: string; // YYYY-MM-DD
  remark: string | null;
  description: string;
  ref_no_or_cheque_no: string | null;
  amount: string; // keep as string for exactness
  type: "credit" | "debit";
  txn_type: TransactionTxnType;
  personal_type: TransactionPersonalType | null;
  hidden: boolean;
};

export type TransactionCreateInput = {
  account: Transaction["account"];
  person?: Transaction["person"];
  category?: Transaction["category"];
  txn_date: string;
  remark?: string | null;
  description: string;
  ref_no_or_cheque_no?: string | null;
  amount: string | number;
  type: Transaction["type"];
  txn_type: Transaction["txn_type"];
  personal_type?: Transaction["personal_type"];
};

export type TransactionUpdateInput = Partial<TransactionCreateInput> & {
  hidden?: boolean;
};

function toMoneyString(v: any): string {
  if (v === undefined || v === null || v === "") return "0.00";
  if (typeof v === "number") return v.toFixed(2);
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n.toFixed(2);
  }
  return "0.00";
}

function normalizeTxn(raw: any): Transaction {
  const id = raw?.id ?? raw?.pk ?? raw?._id;
  const account =
    raw?.account_id ??
    raw?.accountId ??
    raw?.account ??
    raw?.account?.id ??
    raw?.account?.pk;
  const person =
    raw?.person_id ??
    raw?.personId ??
    raw?.person ??
    raw?.person?.id ??
    raw?.person?.pk ??
    null;
  const category =
    raw?.category_id ??
    raw?.categoryId ??
    raw?.category ??
    raw?.category?.id ??
    raw?.category?.pk ??
    null;

  const txn_date = raw?.txn_date ?? raw?.txnDate ?? raw?.date;
  const remarkRaw = raw?.remark;
  const remark =
    remarkRaw === undefined || remarkRaw === null || remarkRaw === ""
      ? null
      : String(remarkRaw);
  const description = raw?.description ?? "";
  const ref_no_or_cheque_no =
    raw?.ref_no_or_cheque_no ??
    raw?.refNoOrChequeNo ??
    raw?.ref_no ??
    raw?.ref ??
    null;
  const amount = toMoneyString(raw?.amount);
  const type = raw?.type === "debit" ? "debit" : "credit";
  const txn_type_raw = raw?.txn_type ?? raw?.txnType ?? "expense";
  const txn_type = (TRANSACTION_TXN_TYPES as readonly string[]).indexOf(txn_type_raw as TransactionTxnType) !== -1
    ? (txn_type_raw as TransactionTxnType)
    : "expense";
  const ptRaw = raw?.personal_type ?? raw?.personalType ?? null;
  const personal_type =
    ptRaw != null &&
    (TRANSACTION_PERSONAL_TYPES as readonly string[]).indexOf(ptRaw as TransactionPersonalType) !== -1
      ? (ptRaw as TransactionPersonalType)
      : null;

  return {
    id,
    account,
    person,
    category,
    txn_date,
    remark,
    description,
    ref_no_or_cheque_no,
    amount,
    type,
    txn_type,
    personal_type,
    hidden: Boolean(raw?.hidden ?? false),
  };
}

function normalizeTxnList(raw: any): Transaction[] {
  const items = Array.isArray(raw) ? raw : raw?.results;
  if (!Array.isArray(items)) return [];
  return items.map(normalizeTxn);
}

export type TransactionListParams = {
  year?: string | number;
  month?: string | number;
  start_date?: string;
  end_date?: string;
  specific_date?: string;
  amount_min?: string | number;
  amount_max?: string | number;
  amount?: string | number;
  account?: string | number;
  person?: string | number | null;
  category?: string | number | "none" | null;
  categories?: Array<string | number | "none"> | null;
  type?: Transaction["type"] | null;
  txn_type?: TransactionTxnType | null;
  txn_types?: TransactionTxnType[] | null;
  show?: "hidden" | "all" | null;
  include_hidden?: boolean;
  ispersonthere?: "linked" | "unlinked" | "all" | null;
  isremarkthere?: "linked" | "unlinked" | "all" | null;
  description?: string;
  personal_types?: Array<TransactionPersonalType | "none"> | null;
  page?: number;
  page_size?: number;
};

export type TotalsByTxnType = {
  income: string;
  expense: string;
  transfer: string;
};

export type PaginatedTransactionList = {
  results: Transaction[];
  count: number;
  next: string | null;
  previous: string | null;
  total_credit: string;
  total_debit: string;
  total_flow: string;
  totals_by_txn_type: TotalsByTxnType;
};

function buildTransactionFilterQuery(
  params: TransactionListParams,
  options: { includePage: boolean }
): Record<string, string | number | boolean | undefined> | undefined {
  const {
    year,
    month,
    start_date,
    end_date,
    specific_date,
    amount_min,
    amount_max,
    amount,
    account,
    person,
    category,
    categories,
    type,
    txn_type,
    show,
    include_hidden,
    ispersonthere,
    isremarkthere,
    page = 1,
    page_size,
    description,
    txn_types,
    personal_types,
  } = params;

  const normalized: Record<string, string | number | boolean | undefined> = {
    year: year ?? undefined,
    month: month ?? undefined,
    start_date: start_date ?? undefined,
    end_date: end_date ?? undefined,
    specific_date: specific_date ?? undefined,
    amount_min: amount_min ?? undefined,
    amount_max: amount_max ?? undefined,
    account: account ?? undefined,
    person: person ?? undefined,
    type: type ?? undefined,
  };

  if (txn_types && txn_types.length > 0) {
    normalized.txn_types = txn_types.join(",");
  } else if (txn_type) {
    normalized.txn_type = txn_type;
  }

  if (personal_types && personal_types.length > 0) {
    normalized.personal_types = personal_types
      .map((p) => (p === "none" ? "none" : p))
      .join(",");
  }

  if (categories && categories.length > 0) {
    normalized.categories = categories
      .map((c) => (c === "none" ? "none" : String(c).trim()))
      .filter((s) => s !== "")
      .join(",");
  } else if (category !== undefined && category !== null && String(category).trim() !== "") {
    normalized.category = category === "none" ? "none" : String(category).trim();
  }

  if (options.includePage) {
    normalized.page = page;
  }

  if (
    page_size !== undefined &&
    page_size !== null &&
    Number.isFinite(Number(page_size)) &&
    Number(page_size) > 0
  ) {
    normalized.page_size = Number(page_size);
  }

  const descTrim = typeof description === "string" ? description.trim() : "";
  if (descTrim) normalized.description = descTrim;

  const amountTrim =
    amount !== undefined && amount !== null && String(amount).trim() !== ""
      ? String(amount).trim()
      : "";
  if (amountTrim) normalized.amount = amountTrim;

  if (show === "hidden") {
    normalized.show = "hidden";
  } else if (show === "all" || include_hidden === true) {
    normalized.show = "all";
  }

  if (ispersonthere === "linked" || ispersonthere === "unlinked") {
    normalized.ispersonthere = ispersonthere;
  }
  if (isremarkthere === "linked" || isremarkthere === "unlinked") {
    normalized.isremarkthere = isremarkthere;
  }

  const hasParams = Object.values(normalized).some((v) => v !== undefined);
  return hasParams ? normalized : undefined;
}

export async function listTransactionsByYearMonth(
  params: TransactionListParams
): Promise<PaginatedTransactionList> {
  const normalized = buildTransactionFilterQuery(params, { includePage: true });
  const res = await api.get("/transactions/", { params: normalized });
  const data = res.data;
  const results = normalizeTxnList(data);
  const count =
    typeof data?.count === "number" && Number.isFinite(data.count)
      ? data.count
      : results.length;
  const next = data?.next == null || data.next === "" ? null : String(data.next);
  const previous =
    data?.previous == null || data.previous === "" ? null : String(data.previous);

  const rawBy = data?.totals_by_txn_type;
  const totals_by_txn_type: TotalsByTxnType = {
    income: toMoneyString(rawBy?.income),
    expense: toMoneyString(rawBy?.expense),
    transfer: toMoneyString(rawBy?.transfer),
  };

  return {
    results,
    count,
    next,
    previous,
    total_credit: toMoneyString(data?.total_credit),
    total_debit: toMoneyString(data?.total_debit),
    total_flow: toMoneyString(data?.total_flow),
    totals_by_txn_type,
  };
}

export async function getTransactions(
  params?: TransactionListParams
): Promise<{ results: Transaction[]; count: number; next?: string | null; previous?: string | null }> {
  const out = await listTransactionsByYearMonth(params ?? {});
  return {
    results: out.results,
    count: out.count,
    next: out.next,
    previous: out.previous,
  };
}

export async function createTransaction(data: TransactionCreateInput): Promise<Transaction> {
  const res = await api.post("/transactions/", data);
  return normalizeTxn(res.data);
}

export async function patchTransaction(
  id: string | number,
  data: TransactionUpdateInput
): Promise<Transaction> {
  const res = await api.patch(`/transactions/${id}/`, data);
  return normalizeTxn(res.data);
}

export const updateTransaction = patchTransaction;

export async function deleteTransaction(id: string | number): Promise<void> {
  await api.delete(`/transactions/${id}/`);
}

export async function bulkUpdateTransactions(input: {
  ids: Array<string | number>;
  person?: string | number | null;
  category?: string | number | null;
  txn_type?: TransactionTxnType;
  personal_type?: Transaction["personal_type"];
}): Promise<Transaction[]> {
  const payload: Record<string, any> = {
    ids: input.ids.map((v) => String(v)),
  };
  if ("person" in input) payload.person = input.person ?? null;
  if ("category" in input) payload.category = input.category ?? null;
  if ("txn_type" in input) payload.txn_type = input.txn_type;
  if ("personal_type" in input) payload.personal_type = input.personal_type ?? null;
  const res = await api.post("/transactions/bulk-update/", payload);
  const items = Array.isArray(res.data) ? res.data : res.data?.results;
  if (!Array.isArray(items)) return [];
  return items.map(normalizeTxn);
}

export async function bulkDeleteTransactions(input: {
  ids: Array<string | number>;
}): Promise<{ deleted: number }> {
  const res = await api.post("/transactions/bulk-delete/", {
    ids: input.ids.map((v) => String(v)),
  });
  return { deleted: Number(res.data?.deleted ?? 0) };
}

export async function uploadTransactionsExcel(input: {
  account: Transaction["account"];
  file: {
    uri: string;
    name: string;
    mimeType?: string;
    fileObject?: any;
  };
}): Promise<void> {
  const form = new FormData();
  form.append("account", String(input.account));
  if (input.file.fileObject) {
    form.append("file", input.file.fileObject, input.file.name);
  } else {
    form.append(
      "file",
      {
        uri: input.file.uri,
        name: input.file.name,
        type: input.file.mimeType ?? "application/octet-stream",
      } as any
    );
  }
  await api.post("/transactions/upload/", form);
}

export type TransactionUpload = {
  file: string;
  account: number | string;
  uploaded_at: string;
  total_rows: number;
  created_count: number;
  duplicate_count: number;
  error_count: number;
  processed: boolean;
};

function normalizeUpload(raw: any): TransactionUpload {
  return {
    file: String(raw?.file ?? ""),
    account: raw?.account ?? raw?.account_id ?? raw?.accountId,
    uploaded_at: String(raw?.uploaded_at ?? raw?.uploadedAt ?? ""),
    total_rows: Number(raw?.total_rows ?? raw?.totalRows ?? 0),
    created_count: Number(raw?.created_count ?? raw?.createdCount ?? 0),
    duplicate_count: Number(raw?.duplicate_count ?? raw?.duplicateCount ?? 0),
    error_count: Number(raw?.error_count ?? raw?.errorCount ?? 0),
    processed: Boolean(raw?.processed),
  };
}

export async function listTransactionUploads(): Promise<TransactionUpload[]> {
  const res = await api.get("/transactions/upload/list/");
  const items = Array.isArray(res.data) ? res.data : res.data?.results;
  if (!Array.isArray(items)) return [];
  return items.map(normalizeUpload);
}

export async function listTransactionYearMonthOptions(): Promise<string[]> {
  const res = await api.get("/transactions/year-month/");
  const data = res.data;
  const rawItems = Array.isArray(data)
    ? data
    : Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data?.year_month)
        ? data.year_month
        : [];
  return rawItems.map((v: any) => String(v));
}

export async function listTransactionYearsOptions(): Promise<string[]> {
  const values = await listTransactionYearMonthOptions();
  const years = values
    .map((v) => String(v))
    .map((v) => (v.includes("-") ? v.split("-")[0] : v))
    .filter((v) => /^\d{4}$/.test(v));
  const unique = Array.from(new Set(years));
  unique.sort();
  return unique;
}
