import { Platform } from "react-native";

import type { TransactionTxnType } from "../../services/transactions";

export const IS_WEB = Platform.OS === "web";

export type TransactionEditState =
  | { mode: "create" }
  | { mode: "edit"; txn: import("../../services/transactions").Transaction };

export function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
}

export function txnTypeLabel(v: TransactionTxnType): string {
  return v
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
