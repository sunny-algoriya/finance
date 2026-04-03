import { api } from "./api";

export type SplitGroup = {
  id: number | string;
  name: string;
  members: Array<number | string>;
  start_date: string;
  end_date: string;
};

export type SplitGroupCreateInput = {
  name: string;
  members: Array<number | string>;
  start_date: string;
  end_date: string;
};

export type SplitGroupUpdateInput = Partial<SplitGroupCreateInput>;

export type SplitGroupDebitTransaction = {
  id: number | string;
  txn_date: string;
  description: string;
  amount: string;
};

export type BulkAddSplitGroupTransactionsInput = {
  group: number | string;
  transactions: Array<number | string>;
};

export type SplitGroupTransactionExpanded = {
  id: number | string;
  group:
    | (number | string)
    | {
        id: number | string;
        name?: string;
        members?: Array<{ id: number | string; name?: string }>;
      };
  transaction: {
    id: number | string;
    txn_date?: string;
    description?: string;
    amount?: string | number;
    type?: string;
    txn_type?: string;
    split_items?: Array<{
      id: number | string;
      amount?: string | number;
      person?: { id: number | string; name?: string };
    }>;
  };
  members?: Array<number | string>;
};

function normalizeMemberId(raw: any): number | string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" || typeof raw === "string") return raw;
  return raw?.id ?? raw?.pk ?? raw?._id ?? null;
}

function normalizePeopleLite(raw: any): { id: number | string; name?: string } {
  const id = raw?.id ?? raw?.pk ?? raw?._id;
  const name = raw?.name;
  if (id === undefined || id === null) throw new Error("Member missing id.");
  return { id, ...(typeof name === "string" ? { name } : null) };
}

function toMoneyString(v: any): string {
  if (v === undefined || v === null || v === "") return "0.00";
  if (typeof v === "number") return v.toFixed(2);
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n.toFixed(2);
  }
  return "0.00";
}

function normalizeDebitTxn(raw: any): SplitGroupDebitTransaction {
  const id = raw?.id ?? raw?.pk ?? raw?._id;
  const txn_date = raw?.txn_date ?? raw?.txnDate ?? raw?.date ?? "";
  const description = raw?.description ?? "";
  const amount = toMoneyString(raw?.amount ?? raw?.debit ?? raw?.debit_amount);

  if (id === undefined || id === null) throw new Error("Transaction missing id.");
  if (typeof txn_date !== "string") throw new Error("Transaction missing txn_date.");

  return {
    id,
    txn_date: String(txn_date),
    description: String(description),
    amount,
  };
}

function normalizeDebitTxnList(raw: any): SplitGroupDebitTransaction[] {
  const items = Array.isArray(raw) ? raw : raw?.results;
  if (!Array.isArray(items)) return [];
  return items.map(normalizeDebitTxn);
}

function normalizeSplitGroup(raw: any): SplitGroup {
  const id = raw?.id ?? raw?.pk ?? raw?._id;
  const name = raw?.name;
  const start_date = raw?.start_date ?? raw?.startDate;
  const end_date = raw?.end_date ?? raw?.endDate;
  const membersRaw = Array.isArray(raw?.members) ? raw.members : [];
  const members = membersRaw
    .map((item: any) => normalizeMemberId(item))
    .filter((v: number | string | null): v is number | string => v !== null);

  if (id === undefined || id === null) throw new Error("Split group missing id.");
  if (typeof name !== "string") throw new Error("Split group missing name.");
  if (typeof start_date !== "string") throw new Error("Split group missing start_date.");
  if (typeof end_date !== "string") throw new Error("Split group missing end_date.");

  return {
    id,
    name,
    members,
    start_date,
    end_date,
  };
}

function normalizeSplitGroupList(raw: any): SplitGroup[] {
  const items = Array.isArray(raw) ? raw : raw?.results;
  if (!Array.isArray(items)) return [];
  return items.map(normalizeSplitGroup);
}

export async function listSplitGroups(): Promise<SplitGroup[]> {
  const res = await api.get("/split-groups/");
  return normalizeSplitGroupList(res.data);
}

export async function createSplitGroup(input: SplitGroupCreateInput): Promise<SplitGroup> {
  const payload = {
    name: input.name,
    members: input.members,
    start_date: input.start_date,
    end_date: input.end_date,
  };
  const res = await api.post("/split-groups/", payload);
  return normalizeSplitGroup(res.data);
}

export async function patchSplitGroup(
  id: SplitGroup["id"],
  input: SplitGroupUpdateInput
): Promise<SplitGroup> {
  const res = await api.patch(`/split-groups/${id}/`, input);
  return normalizeSplitGroup(res.data);
}

export async function putSplitGroup(
  id: SplitGroup["id"],
  input: SplitGroupCreateInput
): Promise<SplitGroup> {
  const res = await api.put(`/split-groups/${id}/`, input);
  return normalizeSplitGroup(res.data);
}

export async function deleteSplitGroup(id: SplitGroup["id"]): Promise<void> {
  await api.delete(`/split-groups/${id}/`);
}

export async function listDebitTransactionsForSplitGroup(
  groupId: SplitGroup["id"]
): Promise<SplitGroupDebitTransaction[]> {
  const res = await api.get(`/split-groups/${groupId}/debit-transactions/`);
  return normalizeDebitTxnList(res.data);
}

export async function bulkAddSplitGroupTransactions(
  input: BulkAddSplitGroupTransactionsInput
): Promise<void> {
  const payload = {
    group: input.group,
    transactions: input.transactions,
  };
  await api.post("/split-group-transactions/bulk-add/", payload);
}

function normalizeSplitGroupTxnExpanded(raw: any): SplitGroupTransactionExpanded {
  const id = raw?.id ?? raw?.pk ?? raw?._id;
  const groupRaw = raw?.group ?? raw?.group_id ?? raw?.groupId;
  const txn = raw?.transaction ?? raw?.txn ?? raw?.transaction_id ?? raw?.transactionId;
  const membersRaw = Array.isArray(raw?.members) ? raw.members : null;
  const members = membersRaw
    ? membersRaw
        .map((m: any) => normalizeMemberId(m))
        .filter((v: number | string | null): v is number | string => v !== null)
    : undefined;

  if (id === undefined || id === null) throw new Error("SplitGroupTransaction missing id.");
  if (groupRaw === undefined || groupRaw === null)
    throw new Error("SplitGroupTransaction missing group.");

  const group =
    typeof groupRaw === "object" && groupRaw !== null
      ? {
          id: groupRaw?.id ?? groupRaw?.pk ?? groupRaw?._id,
          name: typeof groupRaw?.name === "string" ? groupRaw.name : undefined,
          members: Array.isArray(groupRaw?.members)
            ? groupRaw.members.map(normalizePeopleLite)
            : undefined,
        }
      : groupRaw;

  const txnObj =
    typeof txn === "object" && txn !== null
      ? txn
      : {
          id: txn,
        };

  const txnId = txnObj?.id ?? txnObj?.pk ?? txnObj?._id;
  if (txnId === undefined || txnId === null)
    throw new Error("SplitGroupTransaction missing transaction id.");

  return {
    id,
    group,
    transaction: {
      id: txnId,
      txn_date: txnObj?.txn_date ?? txnObj?.txnDate ?? txnObj?.date,
      description: txnObj?.description,
      amount: txnObj?.amount,
      type: txnObj?.type,
      txn_type: txnObj?.txn_type ?? txnObj?.txnType,
      split_items: Array.isArray(txnObj?.split_items)
        ? txnObj.split_items.map((si: any) => ({
            id: si?.id ?? si?.pk ?? si?._id,
            amount: si?.amount,
            person:
              si?.person && typeof si.person === "object"
                ? normalizePeopleLite(si.person)
                : undefined,
          }))
        : undefined,
    },
    members,
  };
}

function normalizeSplitGroupTxnExpandedList(raw: any): SplitGroupTransactionExpanded[] {
  const items = Array.isArray(raw) ? raw : raw?.results;
  if (!Array.isArray(items)) return [];
  return items.map(normalizeSplitGroupTxnExpanded);
}

export async function listSplitGroupTransactionsExpanded(): Promise<
  SplitGroupTransactionExpanded[]
> {
  const res = await api.get("/split-group-transactions/", {
    params: {
      expand: "transaction,transaction.split_items,transaction.split_items.person,group,group.members",
    },
  });
  return normalizeSplitGroupTxnExpandedList(res.data);
}

export async function patchSplitGroupTransaction(
  id: SplitGroupTransactionExpanded["id"],
  input: Partial<{
    members: Array<number | string>;
  }>
): Promise<SplitGroupTransactionExpanded> {
  const res = await api.patch(`/split-group-transactions/${id}/`, input);
  return normalizeSplitGroupTxnExpanded(res.data);
}

export async function createSplitItem(input: {
  transaction: number | string;
  person: number | string;
}): Promise<void> {
  await api.post("/split-items/", input);
}

export async function deleteSplitItem(id: number | string): Promise<void> {
  await api.delete(`/split-items/${id}/`);
}

