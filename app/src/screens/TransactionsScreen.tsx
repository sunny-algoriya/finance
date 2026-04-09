import React from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";

import { listAccounts, type Account } from "../services/accounts";
import { listCategories, type Category } from "../services/categories";
import { listPeoples, type People } from "../services/peoples";
import {
  formatFullDateWithWeekday,
  formatShortWeekdayDay,
} from "../utils/date";
import { formatMoney2 } from "../utils/money";
import AppTabScreen from "../components/AppTabScreen";
import {
  bulkDeleteTransactions,
  bulkUpdateTransactions,
  deleteTransaction,
  listTransactionsByYearMonth,
  TRANSACTION_TXN_TYPES,
  listTransactionUploads,
  listTransactionYearsOptions,
  patchTransaction,
  type TransactionTxnType,
  uploadTransactionsExcel,
  type Transaction,
  type TransactionUpload,
} from "../services/transactions";
import {
  TransactionBulkEditModal,
  TransactionBulkSelectionBar,
  TransactionFormModal,
  type BulkUpdatePatch,
  type TransactionEditState,
} from "../components/transactions";

/** RN may define `window` without `location`; only use URL APIs on web. */
const IS_WEB = Platform.OS === "web";

/** Must match backend `DefaultPagination.page_size`. */
const TXN_PAGE_SIZE = 50;

type TxnVisibilityFilter = "visible" | "hidden" | "all";

type TxnPersonLinkedFilter = "all" | "linked" | "unlinked";

function parseTxnPersonLinkedFromSearch(search: string): TxnPersonLinkedFilter {
  try {
    const qp = new URLSearchParams(search);
    const v = (qp.get("ispersonthere") || "").trim().toLowerCase();
    if (!v) return "unlinked";
    if (v === "linked" || v === "true" || v === "1" || v === "yes") {
      return "linked";
    }
    if (v === "unlinked" || v === "false" || v === "0" || v === "no") {
      return "unlinked";
    }
    if (v === "all" || v === "both" || v === "any") {
      return "all";
    }
    return "unlinked";
  } catch {
    return "unlinked";
  }
}

function parseTxnVisibilityFromSearch(search: string): TxnVisibilityFilter {
  try {
    const qp = new URLSearchParams(search);
    const inc = qp.get("include_hidden");
    if (inc === "true" || inc === "1") return "all";
    const sh = qp.get("show");
    if (sh === "hidden") return "hidden";
    if (sh === "all") return "all";
    return "visible";
  } catch {
    return "visible";
  }
}

function normalizeAmountFilterInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("")}`;
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return false;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function isZeroMoney(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  const n = Number(String(v).trim());
  return Number.isFinite(n) && n === 0;
}

function txnTypeLabel(v: TransactionTxnType): string {
  return v
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function txnTypePillStyles(v: TransactionTxnType) {
  switch (v) {
    case "income":
      return {
        wrap: styles.cellTypePillIncome,
        text: styles.cellTypePillIncomeText,
      };
    case "expense":
      return {
        wrap: styles.cellTypePillExpense,
        text: styles.cellTypePillExpenseText,
      };
    case "transfer":
      return {
        wrap: styles.cellTypePillTransfer,
        text: styles.cellTypePillTransferText,
      };
    case "loan_given":
      return {
        wrap: styles.cellTypePillLoanGiven,
        text: styles.cellTypePillLoanGivenText,
      };
    case "loan_taken":
      return {
        wrap: styles.cellTypePillLoanTaken,
        text: styles.cellTypePillLoanTakenText,
      };
    case "repayment_in":
      return {
        wrap: styles.cellTypePillRepaymentIn,
        text: styles.cellTypePillRepaymentInText,
      };
    case "repayment_out":
      return {
        wrap: styles.cellTypePillRepaymentOut,
        text: styles.cellTypePillRepaymentOutText,
      };
    default:
      return {
        wrap: undefined,
        text: undefined,
      };
  }
}

export default function TransactionsScreen() {
  function getQueryParam(name: string): string | null {
    if (!IS_WEB) return null;
    try {
      const qp = new URLSearchParams(window.location.search);
      return qp.get(name);
    } catch {
      return null;
    }
  }

  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
  const currentYearMonth = `${currentYear}-${currentMonth}`;

  const [txns, setTxns] = React.useState<Transaction[]>([]);
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [people, setPeople] = React.useState<People[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editState, setEditState] = React.useState<TransactionEditState>({
    mode: "create",
  });
  const [hidingTxnId, setHidingTxnId] = React.useState<string | null>(null);
  const [listPersonPickerTxn, setListPersonPickerTxn] =
    React.useState<Transaction | null>(null);
  const [listPersonPatchingId, setListPersonPatchingId] = React.useState<
    string | null
  >(null);

  const [isUploadAccountPickerOpen, setIsUploadAccountPickerOpen] =
    React.useState(false);
  const [filterPersonPickerQuery, setFilterPersonPickerQuery] =
    React.useState("");
  const [isUploadOpen, setIsUploadOpen] = React.useState(false);
  const [uploadAccountId, setUploadAccountId] = React.useState<
    string | number | null
  >(null);
  const [uploadFile, setUploadFile] = React.useState<{
    uri: string;
    name: string;
    mimeType?: string;
    fileObject?: any;
  } | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isUploadListOpen, setIsUploadListOpen] = React.useState(false);
  const [uploads, setUploads] = React.useState<TransactionUpload[]>([]);
  const [isUploadsLoading, setIsUploadsLoading] = React.useState(false);
  const [isUploadMenuOpen, setIsUploadMenuOpen] = React.useState(false);

  const [yearOptions, setYearOptions] = React.useState<string[]>([]);
  const [selectedYear, setSelectedYear] = React.useState<string>(currentYear);
  const [selectedMonth, setSelectedMonth] = React.useState<string>(
    String(currentMonth).padStart(2, "0"),
  );
  const [txnPage, setTxnPage] = React.useState(1);
  const [txnTotalCount, setTxnTotalCount] = React.useState(0);
  const [txnHasNext, setTxnHasNext] = React.useState(false);
  const [txnHasPrev, setTxnHasPrev] = React.useState(false);
  const [totalsAccordionOpen, setTotalsAccordionOpen] = React.useState(true);
  const [isYearPickerOpen, setIsYearPickerOpen] = React.useState(false);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = React.useState(false);
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] =
    React.useState(false);
  const [selectedTxnIds, setSelectedTxnIds] = React.useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = React.useState(false);
  const [isBulkSaving, setIsBulkSaving] = React.useState(false);

  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = React.useState(false);
  const [filterAccountId, setFilterAccountId] = React.useState<string | null>(
    () => getQueryParam("account"),
  );
  const [filterPersonId, setFilterPersonId] = React.useState<string | null>(
    () => getQueryParam("person"),
  );
  const [filterTxnType, setFilterTxnType] = React.useState<
    "credit" | "debit" | null
  >(() => {
    const q = getQueryParam("type");
    return q === "credit" || q === "debit" ? q : null;
  });
  const [filterTxnKind, setFilterTxnKind] =
    React.useState<TransactionTxnType | null>(() => {
      const q = getQueryParam("txn_type");
      return TRANSACTION_TXN_TYPES.includes(q as TransactionTxnType)
        ? (q as TransactionTxnType)
        : null;
    });
  const [filterVisibility, setFilterVisibility] =
    React.useState<TxnVisibilityFilter>(() => {
      if (!IS_WEB) return "visible";
      try {
        return parseTxnVisibilityFromSearch(window.location.search);
      } catch {
        return "visible";
      }
    });
  const [filterPersonLinked, setFilterPersonLinked] =
    React.useState<TxnPersonLinkedFilter>(() => {
      if (!IS_WEB) return "unlinked";
      try {
        return parseTxnPersonLinkedFromSearch(window.location.search);
      } catch {
        return "unlinked";
      }
    });
  const [isFilterAccountPickerOpen, setIsFilterAccountPickerOpen] =
    React.useState(false);
  const [isFilterPersonPickerOpen, setIsFilterPersonPickerOpen] =
    React.useState(false);

  const [txnSearchInput, setTxnSearchInput] = React.useState("");
  const [txnSearchDebounced, setTxnSearchDebounced] = React.useState("");
  const [filterAmountMinInput, setFilterAmountMinInput] = React.useState("");
  const [filterAmountMaxInput, setFilterAmountMaxInput] = React.useState("");
  const [filterAmountMinDebounced, setFilterAmountMinDebounced] =
    React.useState("");
  const [filterAmountMaxDebounced, setFilterAmountMaxDebounced] =
    React.useState("");

  const [dateFilterMode, setDateFilterMode] = React.useState<
    "period" | "all" | "custom"
  >("period");
  const [customStartDateInput, setCustomStartDateInput] = React.useState("");
  const [customEndDateInput, setCustomEndDateInput] = React.useState("");
  const [customStartDateInputDebounced, setCustomStartDateInputDebounced] =
    React.useState("");
  const [customEndDateInputDebounced, setCustomEndDateInputDebounced] =
    React.useState("");
  const [customStartDate, setCustomStartDate] = React.useState<string | null>(
    null,
  );
  const [customEndDate, setCustomEndDate] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      setTxnSearchDebounced(txnSearchInput.trim());
    }, 400);
    return () => clearTimeout(handle);
  }, [txnSearchInput]);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      setFilterAmountMinDebounced(filterAmountMinInput.trim());
    }, 400);
    return () => clearTimeout(handle);
  }, [filterAmountMinInput]);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      setFilterAmountMaxDebounced(filterAmountMaxInput.trim());
    }, 400);
    return () => clearTimeout(handle);
  }, [filterAmountMaxInput]);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      setCustomStartDateInputDebounced(customStartDateInput.trim());
    }, 400);
    return () => clearTimeout(handle);
  }, [customStartDateInput]);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      setCustomEndDateInputDebounced(customEndDateInput.trim());
    }, 400);
    return () => clearTimeout(handle);
  }, [customEndDateInput]);

  React.useEffect(() => {
    if (dateFilterMode !== "custom") return;
    const nextStart = customStartDateInputDebounced;
    const nextEnd = customEndDateInputDebounced;
    if (nextStart && !isValidISODate(nextStart)) return;
    if (nextEnd && !isValidISODate(nextEnd)) return;
    if (nextStart && nextEnd && nextStart > nextEnd) return;

    const normalizedStart = nextStart || null;
    const normalizedEnd = nextEnd || null;
    if (
      customStartDate === normalizedStart &&
      customEndDate === normalizedEnd
    ) {
      return;
    }
    setCustomStartDate(normalizedStart);
    setCustomEndDate(normalizedEnd);
    setTxnPage(1);
  }, [
    dateFilterMode,
    customStartDateInputDebounced,
    customEndDateInputDebounced,
    customStartDate,
    customEndDate,
  ]);

  const txnFilterKey = React.useMemo(
    () =>
      [
        selectedYear,
        selectedMonth,
        filterAccountId ?? "",
        filterPersonId ?? "",
        filterTxnType ?? "",
        filterTxnKind ?? "",
        filterVisibility,
        filterPersonLinked,
        txnSearchDebounced,
        dateFilterMode,
        customStartDate ?? "",
        customEndDate ?? "",
        filterAmountMinDebounced,
        filterAmountMaxDebounced,
      ].join("|"),
    [
      selectedYear,
      selectedMonth,
      filterAccountId,
      filterPersonId,
      filterTxnType,
      filterTxnKind,
      filterVisibility,
      filterPersonLinked,
      txnSearchDebounced,
      dateFilterMode,
      customStartDate,
      customEndDate,
      filterAmountMinDebounced,
      filterAmountMaxDebounced,
    ],
  );

  const accountById = React.useMemo(() => {
    const m = new Map<string, Account>();
    for (const a of accounts) m.set(String(a.id), a);
    return m;
  }, [accounts]);

  const peopleById = React.useMemo(() => {
    const m = new Map<string, People>();
    for (const p of people) m.set(String(p.id), p);
    return m;
  }, [people]);

  const categoryById = React.useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(String(c.id), c);
    return m;
  }, [categories]);

  const [filterTotals, setFilterTotals] = React.useState<{
    total_credit: string;
    total_debit: string;
  } | null>(null);

  const peopleFilteredForSidebar = React.useMemo(() => {
    const q = filterPersonPickerQuery.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.name.toLowerCase().includes(q));
  }, [people, filterPersonPickerQuery]);

  const monthOptions = React.useMemo(
    () => [
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
      "12",
    ],
    [],
  );

  const [isMetaLoaded, setIsMetaLoaded] = React.useState(false);

  async function loadMeta(): Promise<string | null> {
    const [accRes, catRes, pplRes, yearsRes] = await Promise.all([
      listAccounts(),
      listCategories(),
      listPeoples(),
      listTransactionYearsOptions(),
    ]);

    setAccounts(accRes);
    setCategories(catRes);
    setPeople(pplRes);
    setYearOptions(yearsRes);

    // If current year isn't in options, pick first year.
    let yearToUse: string | null = selectedYear;
    if (yearsRes.length > 0 && !yearsRes.includes(selectedYear)) {
      yearToUse = yearsRes[0];
      setSelectedYear(yearToUse);
    }

    return yearToUse;
  }

  const txnFilterKeyRef = React.useRef("");

  const loadTxns = React.useCallback(
    async (
      showLoading: boolean,
      yearOverride?: string,
      monthOverride?: string,
      pageOverride?: number,
      dateModeOverride?: "period" | "all" | "custom",
      customStartDateOverride?: string | null,
      customEndDateOverride?: string | null,
    ) => {
      if (showLoading) setIsLoading(true);
      try {
        const page = pageOverride ?? txnPage;
        const effectiveDateMode = dateModeOverride ?? dateFilterMode;
        const usePeriod = effectiveDateMode === "period";
        const useCustom = effectiveDateMode === "custom";
        const effectiveCustomStart = customStartDateOverride ?? customStartDate;
        const effectiveCustomEnd = customEndDateOverride ?? customEndDate;
        const txnRes = await listTransactionsByYearMonth({
          year: usePeriod ? (yearOverride ?? selectedYear) : undefined,
          month: usePeriod ? (monthOverride ?? selectedMonth) : undefined,
          start_date: useCustom
            ? (effectiveCustomStart ?? undefined)
            : undefined,
          end_date: useCustom ? (effectiveCustomEnd ?? undefined) : undefined,
          amount_min: filterAmountMinDebounced || undefined,
          amount_max: filterAmountMaxDebounced || undefined,
          account: filterAccountId ?? undefined,
          person: filterPersonId ?? undefined,
          type: filterTxnType ?? undefined,
          txn_type: filterTxnKind ?? undefined,
          ...(filterVisibility === "hidden"
            ? { show: "hidden" as const }
            : filterVisibility === "all"
              ? { show: "all" as const }
              : {}),
          ...(filterPersonLinked !== "all"
            ? { ispersonthere: filterPersonLinked }
            : {}),
          page,
          ...(txnSearchDebounced ? { search: txnSearchDebounced } : {}),
        });
        setTxns(txnRes.results);
        setTxnTotalCount(txnRes.count);
        setTxnHasNext(Boolean(txnRes.next));
        setTxnHasPrev(Boolean(txnRes.previous));
        setFilterTotals({
          total_credit: txnRes.total_credit,
          total_debit: txnRes.total_debit,
        });
      } catch (err: any) {
        setFilterTotals(null);
        const message =
          err?.response?.data?.detail ??
          err?.response?.data?.message ??
          err?.message ??
          "Failed to load transactions.";
        Alert.alert("Error", String(message));
      } finally {
        if (showLoading) setIsLoading(false);
      }
    },
    [
      txnPage,
      selectedYear,
      selectedMonth,
      filterAccountId,
      filterPersonId,
      filterTxnType,
      filterTxnKind,
      filterVisibility,
      filterPersonLinked,
      txnSearchDebounced,
      dateFilterMode,
      customStartDate,
      customEndDate,
      filterAmountMinDebounced,
      filterAmountMaxDebounced,
    ],
  );

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const yearToUse = await loadMeta();
        if (!mounted) return;
        setIsMetaLoaded(true);
        await loadTxns(true, yearToUse ?? undefined, selectedMonth, 1);
      } catch (err: any) {
        Alert.alert("Error", String(err?.message ?? "Failed to load."));
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!isMetaLoaded) return;
    const fk = txnFilterKey;
    const filtersJustChanged = txnFilterKeyRef.current !== fk;
    if (filtersJustChanged) {
      txnFilterKeyRef.current = fk;
    }
    const pageToLoad = filtersJustChanged ? 1 : txnPage;
    if (filtersJustChanged && txnPage !== 1) {
      setTxnPage(1);
      return;
    }
    void loadTxns(false, undefined, undefined, pageToLoad);
  }, [isMetaLoaded, txnFilterKey, txnPage, loadTxns]);

  async function onRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const yearToUse = await loadMeta();
      await loadTxns(false, yearToUse ?? undefined, selectedMonth);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to refresh.";
      Alert.alert("Error", String(message));
    } finally {
      setIsRefreshing(false);
    }
  }

  function openUpload() {
    setUploadAccountId(accounts[0]?.id ?? null);
    setUploadFile(null);
    setIsUploadOpen(true);
  }

  async function pickExcel() {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/octet-stream",
      ],
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (res.canceled) return;
    const file = res.assets?.[0];
    if (!file?.uri) return;

    setUploadFile({
      uri: file.uri,
      name: file.name ?? "transactions.xlsx",
      mimeType: file.mimeType ?? undefined,
      fileObject: Platform.OS === "web" ? (file as any).file : undefined,
    });
  }

  async function onUpload() {
    if (isUploading) return;
    if (
      uploadAccountId === null ||
      uploadAccountId === undefined ||
      uploadAccountId === ""
    ) {
      Alert.alert("Validation", "Account is required.");
      return;
    }
    if (!uploadFile) {
      Alert.alert("Validation", "Please choose an Excel file.");
      return;
    }

    setIsUploading(true);
    try {
      await uploadTransactionsExcel({
        account: uploadAccountId,
        file: uploadFile,
      });
      setIsUploadOpen(false);
      if (txnPage !== 1) {
        setTxnPage(1);
      } else {
        await loadTxns(false, undefined, undefined, 1);
      }
      Alert.alert("Uploaded", "Transactions uploaded successfully.");
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Upload failed.";
      Alert.alert("Error", String(message));
    } finally {
      setIsUploading(false);
    }
  }

  async function openUploadList() {
    setIsUploadListOpen(true);
    if (isUploadsLoading) return;
    setIsUploadsLoading(true);
    try {
      const data = await listTransactionUploads();
      setUploads(data);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to load uploads.";
      Alert.alert("Error", String(message));
    } finally {
      setIsUploadsLoading(false);
    }
  }

  function openCreate() {
    setEditState({ mode: "create" });
    setIsModalOpen(true);
  }

  function openEdit(txn: Transaction) {
    setEditState({ mode: "edit", txn });
    setIsModalOpen(true);
  }

  async function onToggleTransactionHidden(txn: Transaction) {
    const key = String(txn.id);
    if (hidingTxnId) return;
    setHidingTxnId(key);
    try {
      const updated = await patchTransaction(txn.id, { hidden: !txn.hidden });
      setTxns((prev) => {
        if (filterVisibility === "hidden" && !updated.hidden) {
          return prev.filter((t) => String(t.id) !== key);
        }
        if (filterVisibility === "visible" && updated.hidden) {
          return prev.filter((t) => String(t.id) !== key);
        }
        return prev.map((t) => (String(t.id) === key ? updated : t));
      });
      setEditState((s) =>
        s.mode === "edit" && String(s.txn.id) === key
          ? { mode: "edit", txn: updated }
          : s,
      );
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to update visibility.";
      Alert.alert("Error", String(message));
    } finally {
      setHidingTxnId(null);
    }
  }

  async function onListPersonPick(personId: string | number | null) {
    if (!listPersonPickerTxn) return;
    const tid = String(listPersonPickerTxn.id);
    if (listPersonPatchingId) return;
    setListPersonPatchingId(tid);
    try {
      const updated = await patchTransaction(listPersonPickerTxn.id, {
        person: personId,
      });
      setTxns((prev) => prev.map((x) => (String(x.id) === tid ? updated : x)));
      setListPersonPickerTxn(null);
      setEditState((s) =>
        s.mode === "edit" && String(s.txn.id) === tid
          ? { mode: "edit", txn: updated }
          : s,
      );
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to update person.";
      Alert.alert("Error", String(message));
    } finally {
      setListPersonPatchingId(null);
    }
  }

  async function onDelete(
    txn: Transaction,
    opts?: { afterDelete?: () => void; confirm?: boolean },
  ) {
    const shouldConfirm = opts?.confirm ?? false;

    const doDelete = async () => {
      try {
        await deleteTransaction(txn.id);
        setTxns((prev) => prev.filter((t) => t.id !== txn.id));
        opts?.afterDelete?.();
      } catch (err: any) {
        const message =
          err?.response?.data?.detail ??
          err?.response?.data?.message ??
          err?.message ??
          "Failed to delete.";
        Alert.alert("Error", String(message));
      }
    };

    if (shouldConfirm) {
      const title = "Delete transaction";
      const message = "Delete this transaction? This cannot be undone.";
      if (IS_WEB) {
        if (window.confirm("Delete this transaction?")) {
          void doDelete();
        }
        return;
      }
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void doDelete();
          },
        },
      ]);
      return;
    }

    await doDelete();
  }

  const allVisibleTxnIds = React.useMemo(
    () => txns.map((t) => String(t.id)),
    [txns],
  );
  const areAllVisibleSelected =
    allVisibleTxnIds.length > 0 &&
    allVisibleTxnIds.every((id) => selectedTxnIds.includes(id));

  function toggleTxnSelection(id: string | number) {
    const key = String(id);
    setSelectedTxnIds((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  }

  function toggleSelectAllVisible() {
    setSelectedTxnIds((prev) => {
      if (areAllVisibleSelected) {
        return prev.filter((id) => !allVisibleTxnIds.includes(id));
      }
      const merged = new Set([...prev, ...allVisibleTxnIds]);
      return Array.from(merged);
    });
  }

  async function onBulkDeleteSelected() {
    if (selectedTxnIds.length === 0 || isBulkSaving) return;
    const doDelete = async () => {
      setIsBulkSaving(true);
      try {
        await bulkDeleteTransactions({ ids: selectedTxnIds });
        setTxns((prev) =>
          prev.filter((t) => !selectedTxnIds.includes(String(t.id))),
        );
        setSelectedTxnIds([]);
      } catch (err: any) {
        const message =
          err?.response?.data?.detail ??
          err?.response?.data?.message ??
          err?.message ??
          "Failed bulk delete.";
        Alert.alert("Error", String(message));
      } finally {
        setIsBulkSaving(false);
      }
    };
    if (IS_WEB) {
      if (window.confirm(`Delete ${selectedTxnIds.length} transactions?`)) {
        void doDelete();
      }
      return;
    }
    Alert.alert(
      "Delete selected",
      `Delete ${selectedTxnIds.length} transactions? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void doDelete(),
        },
      ],
    );
  }

  async function onApplyBulkUpdate(patch: BulkUpdatePatch) {
    if (selectedTxnIds.length === 0 || isBulkSaving) return;
    setIsBulkSaving(true);
    try {
      await bulkUpdateTransactions({
        ids: selectedTxnIds,
        person: patch.person,
        category: patch.category,
        txn_type: patch.txn_type,
      });
      setIsBulkEditOpen(false);
      setSelectedTxnIds([]);
      await loadTxns(false, undefined, undefined, 1);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed bulk update.";
      Alert.alert("Error", String(message));
    } finally {
      setIsBulkSaving(false);
    }
  }

  React.useEffect(() => {
    const visible = new Set(allVisibleTxnIds);
    setSelectedTxnIds((prev) => prev.filter((id) => visible.has(id)));
  }, [allVisibleTxnIds]);

  const monthShortLabel = React.useMemo(() => {
    const m = Number.parseInt(selectedMonth, 10);
    const names = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return Number.isFinite(m) && m >= 1 && m <= 12
      ? names[m - 1]
      : selectedMonth;
  }, [selectedMonth]);

  const filterTotalsHint = React.useMemo(() => {
    if (dateFilterMode === "all") {
      return "Totals (all dates)";
    }
    if (dateFilterMode === "custom") {
      if (
        customStartDate &&
        customEndDate &&
        isValidISODate(customStartDate) &&
        isValidISODate(customEndDate) &&
        customStartDate <= customEndDate
      ) {
        return `Totals for ${customStartDate} → ${customEndDate}`;
      }
      return "Totals (custom range)";
    }
    return `Totals for ${selectedYear} · ${monthShortLabel}`;
  }, [
    dateFilterMode,
    selectedYear,
    monthShortLabel,
    customStartDate,
    customEndDate,
  ]);

  const txnListMetaLine = React.useMemo(() => {
    if (txnTotalCount <= 0) {
      return txnTotalCount === 0 ? "0 transactions" : "";
    }
    const totalPages = Math.max(1, Math.ceil(txnTotalCount / TXN_PAGE_SIZE));
    const hasPagination =
      txnHasNext || txnHasPrev || txnTotalCount > txns.length;
    if (hasPagination) {
      return `${txnTotalCount} total · ${txns.length} listed · page ${txnPage} of ${totalPages}`;
    }
    return txnTotalCount === 1
      ? "1 transaction"
      : `${txnTotalCount} transactions`;
  }, [txnTotalCount, txnHasNext, txnHasPrev, txns.length, txnPage]);

  return (
    <AppTabScreen>
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.kicker}>SplitApp</Text>
          <Text style={styles.heroTitle}>Transactions</Text>
          <Text style={styles.periodSubtitle}>
            {dateFilterMode === "all"
              ? "All dates"
              : dateFilterMode === "custom"
                ? `${customStartDate ?? "-"} to ${customEndDate ?? "-"}`
                : `${selectedYear} · ${monthShortLabel}`}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Pressable
            onPress={() => setIsUploadMenuOpen(true)}
            style={({ pressed }) => [
              styles.outlineBtn,
              pressed && styles.outlineBtnPressed,
            ]}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text style={styles.outlineBtnText}>Uploads</Text>
              <Feather name="chevron-down" size={16} color="#0B0B0B" />
            </View>
          </Pressable>
          <Pressable
            onPress={openCreate}
            style={({ pressed }) => [
              styles.addBtn,
              pressed && styles.addBtnPressed,
            ]}
          >
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.filterCard}>
        <View style={styles.filterRowInner}>
          <View style={styles.filterField}>
            <Pressable
              onPress={() => setIsYearPickerOpen(true)}
              disabled={yearOptions.length === 0}
              style={({ pressed }) => [
                styles.filterBtn,
                pressed && styles.filterBtnPressed,
                yearOptions.length === 0 && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Select year"
            >
              <Text style={styles.filterValue} numberOfLines={1}>
                {dateFilterMode !== "period" ? "All" : selectedYear || "Select"}
              </Text>
              <Feather name="chevron-down" size={15} color="#0B0B0B" />
            </Pressable>
          </View>
          <View style={styles.filterField}>
            <Pressable
              onPress={() => setIsMonthPickerOpen(true)}
              style={({ pressed }) => [
                styles.filterBtn,
                pressed && styles.filterBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Select month"
            >
              <Text style={styles.filterValue} numberOfLines={1}>
                {dateFilterMode !== "period" ? "All" : monthShortLabel}
              </Text>
              <Feather name="chevron-down" size={15} color="#0B0B0B" />
            </Pressable>
          </View>
          <View style={styles.filterField}>
            <Pressable
              onPress={() => {
                setFilterAccountId(getQueryParam("account"));
                setFilterPersonId(getQueryParam("person"));
                const qType = getQueryParam("type");
                setFilterTxnType(
                  qType === "credit" || qType === "debit" ? qType : null,
                );
                const qTxnType = getQueryParam("txn_type");
                setFilterTxnKind(
                  TRANSACTION_TXN_TYPES.includes(qTxnType as TransactionTxnType)
                    ? (qTxnType as TransactionTxnType)
                    : null,
                );
                setFilterVisibility(
                  IS_WEB
                    ? parseTxnVisibilityFromSearch(window.location.search)
                    : "visible",
                );
                setFilterPersonLinked(
                  IS_WEB
                    ? parseTxnPersonLinkedFromSearch(window.location.search)
                    : filterPersonLinked,
                );
                setIsFilterSidebarOpen(true);
              }}
              style={({ pressed }) => [
                styles.filterBtn,
                pressed && styles.filterBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open filters sidebar"
            >
              <View style={styles.filterBtnWithIcon}>
                <Feather name="sliders" size={14} color="#0B0B0B" />
                <Text style={styles.filterValue} numberOfLines={1}>
                  Filters
                </Text>
              </View>
              <Feather name="chevron-down" size={15} color="#0B0B0B" />
            </Pressable>
          </View>
        </View>
        <View style={styles.filterRowInner}>
          <View style={styles.filterField}>
            <Pressable
              onPress={() => {
                setDateFilterMode("all");
                setTxnPage(1);
                setIsCustomDateModalOpen(false);
              }}
              style={({ pressed }) => [
                styles.viewAllBtn,
                pressed && styles.viewAllBtnPressed,
                dateFilterMode === "all" && styles.rangeModeBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel="View all transactions without month filter"
            >
              <Feather name="calendar" size={14} color="#0B0B0B" />
              <Text style={styles.viewAllBtnText} numberOfLines={1}>
                All
              </Text>
            </Pressable>
          </View>
          <View style={styles.filterField}>
            <Pressable
              onPress={() => {
                const today = todayISO();
                const nextStart =
                  customStartDateInput || customStartDate || today;
                const nextEnd = customEndDateInput || customEndDate || today;
                setCustomStartDateInput(nextStart);
                setCustomEndDateInput(nextEnd);
                setCustomStartDate(nextStart);
                setCustomEndDate(nextEnd);
                setDateFilterMode("custom");
                setTxnPage(1);
                setIsCustomDateModalOpen(true);
              }}
              style={({ pressed }) => [
                styles.viewAllBtn,
                pressed && styles.viewAllBtnPressed,
                dateFilterMode === "custom" && styles.customDateBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Use custom start and end date"
            >
              <Feather name="calendar" size={14} color="#0B0B0B" />
              <Text style={styles.viewAllBtnText} numberOfLines={1}>
                Custom
              </Text>
            </Pressable>
          </View>
        </View>
        {dateFilterMode === "custom" ? (
          <Pressable
            onPress={() => {
              const today = todayISO();
              setCustomStartDateInput(customStartDate ?? today);
              setCustomEndDateInput(customEndDate ?? today);
              setIsCustomDateModalOpen(true);
            }}
            style={({ pressed }) => [
              styles.customDateSummaryRow,
              pressed && styles.customDateSummaryRowPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Edit custom date range"
          >
            <Text style={styles.customDateSummaryText} numberOfLines={1}>
              {customStartDate && customEndDate
                ? `${customStartDate} → ${customEndDate}`
                : "Tap to set dates"}
            </Text>
            <Feather name="edit-2" size={14} color="#6B6B6B" />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.periodTotalsSection}>
        <Pressable
          onPress={() => setTotalsAccordionOpen((o) => !o)}
          style={({ pressed }) => [
            styles.periodTotalsAccordionHeader,
            pressed && styles.periodTotalsAccordionHeaderPressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ expanded: totalsAccordionOpen }}
          accessibilityLabel={
            totalsAccordionOpen
              ? "Collapse credit and debit totals"
              : "Expand credit and debit totals"
          }
        >
          <Text style={styles.periodTotalsRangeHint} numberOfLines={2}>
            {filterTotalsHint}
          </Text>
          <Feather
            name={totalsAccordionOpen ? "chevron-up" : "chevron-down"}
            size={18}
            color="#6B6B6B"
          />
        </Pressable>
        {totalsAccordionOpen ? (
          <View style={styles.periodTotalsRow}>
            <View style={[styles.periodTotalBox, styles.periodTotalBoxCredit]}>
              <Text style={styles.periodTotalLabel}>Credit</Text>
              <Text style={[styles.periodTotalAmount, styles.creditText]}>
                {formatMoney2(filterTotals?.total_credit ?? "0")}
              </Text>
            </View>
            <View style={[styles.periodTotalBox, styles.periodTotalBoxDebit]}>
              <Text style={styles.periodTotalLabel}>Debit</Text>
              <Text style={[styles.periodTotalAmount, styles.debitText]}>
                {formatMoney2(filterTotals?.total_debit ?? "0")}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      <Modal
        visible={isUploadMenuOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsUploadMenuOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsUploadMenuOpen(false)}
        />
        <View style={styles.menuSheet}>
          <Pressable
            onPress={() => {
              setIsUploadMenuOpen(false);
              openUpload();
            }}
            style={({ pressed }) => [
              styles.menuRow,
              pressed && styles.menuRowPressed,
            ]}
          >
            <Feather name="upload" size={16} color="#0B0B0B" />
            <Text style={styles.menuRowText}>Upload Excel</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setIsUploadMenuOpen(false);
              openUploadList();
            }}
            style={({ pressed }) => [
              styles.menuRow,
              pressed && styles.menuRowPressed,
            ]}
          >
            <Feather name="list" size={16} color="#0B0B0B" />
            <Text style={styles.menuRowText}>Uploaded files</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal
        visible={isYearPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsYearPickerOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsYearPickerOpen(false)}
        />
        <View style={styles.pickerSheet}>
          <Text style={styles.pickerTitle}>Select year</Text>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            {yearOptions.length === 0 ? (
              <View style={{ paddingVertical: 10 }}>
                <Text style={styles.pickerRowText}>No years found</Text>
              </View>
            ) : (
              yearOptions.map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => {
                    setDateFilterMode("period");
                    setSelectedYear(opt);
                    setIsYearPickerOpen(false);
                    setIsCustomDateModalOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.pickerRow,
                    pressed && styles.pickerRowPressed,
                  ]}
                >
                  <Text style={styles.pickerRowText}>{opt}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={isMonthPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsMonthPickerOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsMonthPickerOpen(false)}
        />
        <View style={styles.pickerSheet}>
          <Text style={styles.pickerTitle}>Select month</Text>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            {monthOptions.map((opt) => (
              <Pressable
                key={opt}
                onPress={() => {
                  setDateFilterMode("period");
                  setSelectedMonth(opt);
                  setIsMonthPickerOpen(false);
                  setIsCustomDateModalOpen(false);
                }}
                style={({ pressed }) => [
                  styles.pickerRow,
                  pressed && styles.pickerRowPressed,
                ]}
              >
                <Text style={styles.pickerRowText}>{opt}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={isCustomDateModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsCustomDateModalOpen(false)}
      >
        <View style={styles.customDateModalRoot}>
          <Pressable
            style={styles.customDateModalBackdrop}
            onPress={() => setIsCustomDateModalOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View style={styles.customDateModalSheet} pointerEvents="box-none">
            <View style={styles.pickerTitleRow}>
              <Text style={styles.pickerTitle}>Custom date range</Text>
              <Pressable
                onPress={() => setIsCustomDateModalOpen(false)}
                style={({ pressed }) => [
                  styles.customDateModalCloseBtn,
                  pressed && styles.customDateModalCloseBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.customDateModalCloseText}>Close</Text>
              </Pressable>
            </View>
            <View style={styles.customDateModalField}>
              <Text style={styles.customDateModalLabel}>
                Start (YYYY-MM-DD)
              </Text>
              <TextInput
                value={customStartDateInput}
                onChangeText={setCustomStartDateInput}
                placeholder="2026-01-01"
                placeholderTextColor="#9A9A9A"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.customDateInputFull}
              />
            </View>
            <View style={styles.customDateModalField}>
              <Text style={styles.customDateModalLabel}>End (YYYY-MM-DD)</Text>
              <TextInput
                value={customEndDateInput}
                onChangeText={setCustomEndDateInput}
                placeholder="2026-01-31"
                placeholderTextColor="#9A9A9A"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.customDateInputFull}
              />
            </View>
            <Pressable
              onPress={() => {
                const s = customStartDateInput.trim();
                const e = customEndDateInput.trim();
                if (!isValidISODate(s) || !isValidISODate(e)) {
                  Alert.alert(
                    "Validation",
                    "Enter valid dates using YYYY-MM-DD for both fields.",
                  );
                  return;
                }
                if (s > e) {
                  Alert.alert(
                    "Validation",
                    "Start date must be on or before end date.",
                  );
                  return;
                }
                setDateFilterMode("custom");
                setCustomStartDate(s);
                setCustomEndDate(e);
                setTxnPage(1);
                setIsCustomDateModalOpen(false);
              }}
              style={({ pressed }) => [
                styles.customDateApplyBtn,
                pressed && styles.customDateApplyBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Apply custom date range"
            >
              <Text style={styles.customDateApplyBtnText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isFilterSidebarOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsFilterSidebarOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsFilterSidebarOpen(false)}
        />
        <View style={styles.sidebar}>
          <View style={styles.sidebarHeader}>
            <Text style={styles.sidebarTitle}>Filters</Text>
            <Pressable
              onPress={() => setIsFilterSidebarOpen(false)}
              style={({ pressed }) => [
                styles.closeMiniBtn,
                pressed && styles.closeMiniBtnPressed,
              ]}
            >
              <Feather name="x" size={16} color="#0B0B0B" />
            </Pressable>
          </View>

          <View style={{ gap: 12 }}>
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Account</Text>
              <Pressable
                onPress={() => setIsFilterAccountPickerOpen(true)}
                style={({ pressed }) => [
                  styles.pickerBtn,
                  pressed && styles.pickerBtnPressed,
                ]}
              >
                <Text style={styles.pickerBtnText}>
                  {filterAccountId
                    ? (accountById.get(String(filterAccountId))?.name ??
                      `Account ${filterAccountId}`)
                    : "All"}
                </Text>
              </Pressable>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Person</Text>
              <Pressable
                onPress={() => setIsFilterPersonPickerOpen(true)}
                style={({ pressed }) => [
                  styles.pickerBtn,
                  pressed && styles.pickerBtnPressed,
                ]}
              >
                <Text style={styles.pickerBtnText}>
                  {filterPersonId
                    ? (peopleById.get(String(filterPersonId))?.name ??
                      `Person ${filterPersonId}`)
                    : "All"}
                </Text>
              </Pressable>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Type</Text>
              <View style={styles.sidebarTypeRow}>
                <Pressable
                  onPress={() => {
                    setFilterTxnType(null);
                    if (IS_WEB) {
                      const url = new URL(window.location.href);
                      url.searchParams.delete("type");
                      window.history.replaceState(null, "", url.toString());
                    }
                  }}
                  style={({ pressed }) => [
                    styles.sidebarTypePill,
                    filterTxnType === null &&
                      styles.sidebarTypePillActiveNeutral,
                    pressed && filterTxnType !== null && styles.typePillPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.sidebarTypePillText,
                      filterTxnType === null && styles.typePillTextActive,
                    ]}
                  >
                    All
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setFilterTxnType("credit");
                    if (IS_WEB) {
                      const url = new URL(window.location.href);
                      url.searchParams.set("type", "credit");
                      window.history.replaceState(null, "", url.toString());
                    }
                  }}
                  style={({ pressed }) => [
                    styles.sidebarTypePill,
                    filterTxnType === "credit" && styles.typePillCreditActive,
                    pressed &&
                      filterTxnType !== "credit" &&
                      styles.typePillPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.sidebarTypePillText,
                      filterTxnType === "credit" && styles.typePillTextActive,
                    ]}
                  >
                    Credit
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setFilterTxnType("debit");
                    if (IS_WEB) {
                      const url = new URL(window.location.href);
                      url.searchParams.set("type", "debit");
                      window.history.replaceState(null, "", url.toString());
                    }
                  }}
                  style={({ pressed }) => [
                    styles.sidebarTypePill,
                    filterTxnType === "debit" && styles.typePillDebitActive,
                    pressed &&
                      filterTxnType !== "debit" &&
                      styles.typePillPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.sidebarTypePillText,
                      filterTxnType === "debit" && styles.typePillTextActive,
                    ]}
                  >
                    Debit
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Txn type</Text>
              <View style={styles.sidebarTxnTypeWrap}>
                <Pressable
                  onPress={() => {
                    setFilterTxnKind(null);
                    if (IS_WEB) {
                      const url = new URL(window.location.href);
                      url.searchParams.delete("txn_type");
                      window.history.replaceState(null, "", url.toString());
                    }
                  }}
                  style={({ pressed }) => [
                    styles.sidebarTxnTypePill,
                    filterTxnKind === null &&
                      styles.sidebarTypePillActiveNeutral,
                    pressed && filterTxnKind !== null && styles.typePillPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.sidebarTxnTypePillText,
                      filterTxnKind === null && styles.typePillTextActive,
                    ]}
                  >
                    All
                  </Text>
                </Pressable>
                {TRANSACTION_TXN_TYPES.map((opt) => (
                  <Pressable
                    key={opt}
                    onPress={() => {
                      setFilterTxnKind(opt);
                      if (IS_WEB) {
                        const url = new URL(window.location.href);
                        url.searchParams.set("txn_type", opt);
                        window.history.replaceState(null, "", url.toString());
                      }
                    }}
                    style={({ pressed }) => [
                      styles.sidebarTxnTypePill,
                      filterTxnKind === opt &&
                        styles.sidebarTypePillActiveNeutral,
                      pressed &&
                        filterTxnKind !== opt &&
                        styles.typePillPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.sidebarTxnTypePillText,
                        filterTxnKind === opt && styles.typePillTextActive,
                      ]}
                    >
                      {txnTypeLabel(opt)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Visibility</Text>
              <View style={styles.sidebarTypeRow}>
                <Pressable
                  onPress={() => {
                    setFilterVisibility("visible");
                    if (IS_WEB) {
                      const url = new URL(window.location.href);
                      url.searchParams.delete("show");
                      url.searchParams.delete("include_hidden");
                      window.history.replaceState(null, "", url.toString());
                    }
                  }}
                  style={({ pressed }) => [
                    styles.sidebarTypePill,
                    filterVisibility === "visible" &&
                      styles.sidebarTypePillActiveNeutral,
                    pressed &&
                      filterVisibility !== "visible" &&
                      styles.typePillPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.sidebarTypePillText,
                      filterVisibility === "visible" &&
                        styles.typePillTextActive,
                    ]}
                  >
                    Visible
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setFilterVisibility("hidden");
                    if (IS_WEB) {
                      const url = new URL(window.location.href);
                      url.searchParams.set("show", "hidden");
                      url.searchParams.delete("include_hidden");
                      window.history.replaceState(null, "", url.toString());
                    }
                  }}
                  style={({ pressed }) => [
                    styles.sidebarTypePill,
                    filterVisibility === "hidden" &&
                      styles.sidebarTypePillActiveNeutral,
                    pressed &&
                      filterVisibility !== "hidden" &&
                      styles.typePillPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.sidebarTypePillText,
                      filterVisibility === "hidden" &&
                        styles.typePillTextActive,
                    ]}
                  >
                    Hidden
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setFilterVisibility("all");
                    if (IS_WEB) {
                      const url = new URL(window.location.href);
                      url.searchParams.set("show", "all");
                      url.searchParams.delete("include_hidden");
                      window.history.replaceState(null, "", url.toString());
                    }
                  }}
                  style={({ pressed }) => [
                    styles.sidebarTypePill,
                    filterVisibility === "all" &&
                      styles.sidebarTypePillActiveNeutral,
                    pressed &&
                      filterVisibility !== "all" &&
                      styles.typePillPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.sidebarTypePillText,
                      filterVisibility === "all" && styles.typePillTextActive,
                    ]}
                  >
                    All
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Person linked</Text>
              <View style={styles.sidebarTypeRow}>
                <Pressable
                  onPress={() => {
                    setFilterPersonLinked("all");
                    if (IS_WEB) {
                      const url = new URL(window.location.href);
                      url.searchParams.set("ispersonthere", "all");
                      window.history.replaceState(null, "", url.toString());
                    }
                  }}
                  style={({ pressed }) => [
                    styles.sidebarTypePill,
                    filterPersonLinked === "all" &&
                      styles.sidebarTypePillActiveNeutral,
                    pressed &&
                      filterPersonLinked !== "all" &&
                      styles.typePillPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.sidebarTypePillText,
                      filterPersonLinked === "all" && styles.typePillTextActive,
                    ]}
                  >
                    All
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setFilterPersonLinked("linked");
                    if (IS_WEB) {
                      const url = new URL(window.location.href);
                      url.searchParams.set("ispersonthere", "linked");
                      window.history.replaceState(null, "", url.toString());
                    }
                  }}
                  style={({ pressed }) => [
                    styles.sidebarTypePill,
                    filterPersonLinked === "linked" &&
                      styles.sidebarTypePillActiveNeutral,
                    pressed &&
                      filterPersonLinked !== "linked" &&
                      styles.typePillPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.sidebarTypePillText,
                      filterPersonLinked === "linked" &&
                        styles.typePillTextActive,
                    ]}
                  >
                    Linked
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setFilterPersonLinked("unlinked");
                    if (IS_WEB) {
                      const url = new URL(window.location.href);
                      url.searchParams.delete("ispersonthere");
                      window.history.replaceState(null, "", url.toString());
                    }
                  }}
                  style={({ pressed }) => [
                    styles.sidebarTypePill,
                    filterPersonLinked === "unlinked" &&
                      styles.sidebarTypePillActiveNeutral,
                    pressed &&
                      filterPersonLinked !== "unlinked" &&
                      styles.typePillPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.sidebarTypePillText,
                      filterPersonLinked === "unlinked" &&
                        styles.typePillTextActive,
                    ]}
                  >
                    Unlinked
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Amount range</Text>
              <View style={styles.sidebarAmountRow}>
                <TextInput
                  value={filterAmountMinInput}
                  onChangeText={(v) =>
                    setFilterAmountMinInput(normalizeAmountFilterInput(v))
                  }
                  placeholder="Min"
                  placeholderTextColor="#9A9A9A"
                  keyboardType="decimal-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.sidebarAmountInput}
                />
                <TextInput
                  value={filterAmountMaxInput}
                  onChangeText={(v) =>
                    setFilterAmountMaxInput(normalizeAmountFilterInput(v))
                  }
                  placeholder="Max"
                  placeholderTextColor="#9A9A9A"
                  keyboardType="decimal-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.sidebarAmountInput}
                />
              </View>
            </View>

            <Pressable
              onPress={() => {
                // Reset
                setFilterAccountId(null);
                setFilterPersonId(null);
                setFilterTxnType(null);
                setFilterTxnKind(null);
                setFilterVisibility("visible");
                setFilterPersonLinked("unlinked");
                setFilterAmountMinInput("");
                setFilterAmountMaxInput("");
                if (IS_WEB) {
                  const url = new URL(window.location.href);
                  url.searchParams.delete("account");
                  url.searchParams.delete("person");
                  url.searchParams.delete("type");
                  url.searchParams.delete("txn_type");
                  url.searchParams.delete("show");
                  url.searchParams.delete("include_hidden");
                  url.searchParams.delete("ispersonthere");
                  window.history.replaceState(null, "", url.toString());
                }
              }}
              style={({ pressed }) => [
                styles.secondaryResetBtn,
                pressed && styles.secondaryResetBtnPressed,
              ]}
            >
              <Text style={styles.secondaryResetText}>Clear filters</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isFilterAccountPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsFilterAccountPickerOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsFilterAccountPickerOpen(false)}
        />
        <View style={styles.pickerSheet}>
          <Text style={styles.pickerTitle}>Select account</Text>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            <Pressable
              onPress={() => {
                setFilterAccountId(null);
                if (IS_WEB) {
                  const url = new URL(window.location.href);
                  url.searchParams.delete("account");
                  window.history.replaceState(null, "", url.toString());
                }
                setIsFilterAccountPickerOpen(false);
              }}
              style={({ pressed }) => [
                styles.pickerRow,
                pressed && styles.pickerRowPressed,
              ]}
            >
              <Text style={styles.pickerRowText}>All</Text>
            </Pressable>
            {accounts.map((a) => (
              <Pressable
                key={String(a.id)}
                onPress={() => {
                  setFilterAccountId(String(a.id));
                  if (IS_WEB) {
                    const url = new URL(window.location.href);
                    url.searchParams.set("account", String(a.id));
                    window.history.replaceState(null, "", url.toString());
                  }
                  setIsFilterAccountPickerOpen(false);
                }}
                style={({ pressed }) => [
                  styles.pickerRow,
                  pressed && styles.pickerRowPressed,
                ]}
              >
                <Text style={styles.pickerRowText}>{a.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={isFilterPersonPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsFilterPersonPickerOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsFilterPersonPickerOpen(false)}
        />
        <View style={styles.pickerSheet}>
          <Text style={styles.pickerTitle}>Select person</Text>
          <TextInput
            value={filterPersonPickerQuery}
            onChangeText={setFilterPersonPickerQuery}
            placeholder="Search person…"
            placeholderTextColor="#6B6B6B"
            style={styles.pickerSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            <Pressable
              onPress={() => {
                setFilterPersonId(null);
                if (IS_WEB) {
                  const url = new URL(window.location.href);
                  url.searchParams.delete("person");
                  window.history.replaceState(null, "", url.toString());
                }
                setIsFilterPersonPickerOpen(false);
              }}
              style={({ pressed }) => [
                styles.pickerRow,
                pressed && styles.pickerRowPressed,
              ]}
            >
              <Text style={styles.pickerRowText}>All</Text>
            </Pressable>
            {peopleFilteredForSidebar.map((p) => (
              <Pressable
                key={String(p.id)}
                onPress={() => {
                  setFilterPersonId(String(p.id));
                  if (IS_WEB) {
                    const url = new URL(window.location.href);
                    url.searchParams.set("person", String(p.id));
                    window.history.replaceState(null, "", url.toString());
                  }
                  setIsFilterPersonPickerOpen(false);
                }}
                style={({ pressed }) => [
                  styles.pickerRow,
                  pressed && styles.pickerRowPressed,
                ]}
              >
                <Text style={styles.pickerRowText}>{p.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <View style={styles.toolbarRow}>
        <View style={styles.txnSearchWrap}>
          <Feather
            name="search"
            size={16}
            color="#9A9A9A"
            style={styles.txnSearchIcon}
          />
          <TextInput
            value={txnSearchInput}
            onChangeText={setTxnSearchInput}
            placeholder="Search…"
            placeholderTextColor="#9A9A9A"
            style={styles.txnSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        <Pressable
          onPress={onRefresh}
          disabled={isRefreshing}
          style={({ pressed }) => [
            styles.refreshIconBtn,
            pressed && styles.refreshIconBtnPressed,
            isRefreshing && { opacity: 0.55 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={isRefreshing ? "Refreshing" : "Refresh"}
        >
          <Feather
            name="refresh-cw"
            size={18}
            color="#0B0B0B"
            style={isRefreshing ? { opacity: 0.5 } : undefined}
          />
        </Pressable>
      </View>

      {!isLoading && (
        <View style={styles.txnMetaStrip}>
          <Text style={styles.txnMetaCountText} numberOfLines={2}>
            {txnListMetaLine}
          </Text>
          <Pressable
            onPress={toggleSelectAllVisible}
            style={({ pressed }) => [
              styles.bulkActionBtn,
              pressed && styles.bulkActionBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              areAllVisibleSelected
                ? "Unselect all listed"
                : "Select all listed"
            }
          >
            <Text style={styles.bulkActionBtnText}>
              {areAllVisibleSelected ? "Unselect all" : "Select all"}
            </Text>
          </Pressable>
          {txnTotalCount > 0 && (txnHasNext || txnHasPrev) ? (
            <View style={styles.txnPagerInline}>
              <Pressable
                onPress={() => setTxnPage((p) => Math.max(1, p - 1))}
                disabled={!txnHasPrev}
                style={({ pressed }) => [
                  styles.txnPagerIconBtn,
                  pressed && txnHasPrev && styles.txnPagerIconBtnPressed,
                  !txnHasPrev && styles.txnPagerIconBtnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Previous page"
              >
                <Feather
                  name="chevron-left"
                  size={20}
                  color={txnHasPrev ? "#0B0B0B" : "#C8C8C8"}
                />
              </Pressable>
              <Text style={styles.txnPagerPageText}>{txnPage}</Text>
              <Pressable
                onPress={() => setTxnPage((p) => p + 1)}
                disabled={!txnHasNext}
                style={({ pressed }) => [
                  styles.txnPagerIconBtn,
                  pressed && txnHasNext && styles.txnPagerIconBtnPressed,
                  !txnHasNext && styles.txnPagerIconBtnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Next page"
              >
                <Feather
                  name="chevron-right"
                  size={20}
                  color={txnHasNext ? "#0B0B0B" : "#C8C8C8"}
                />
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
      <TransactionBulkSelectionBar
        selectedCount={!isLoading ? selectedTxnIds.length : 0}
        onBulkUpdate={() => setIsBulkEditOpen(true)}
        onBulkDelete={() => void onBulkDeleteSelected()}
        onClear={() => setSelectedTxnIds([])}
        isBulkDeleting={isBulkSaving}
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0B0B0B" />
          <Text style={styles.muted}>Loading transactions…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.tableList}>
          {txns.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.muted}>
                Tap Add to create your first one.
              </Text>
            </View>
          ) : (
            <View style={styles.txnTableWrap}>
              <Text style={styles.tableTitle}>Transactions</Text>
              <View style={styles.tableHead}>
                <Text style={[styles.th, styles.thSelectCol]}>Sel</Text>
                <Text
                  style={[
                    styles.th,
                    dateFilterMode !== "period"
                      ? styles.thDateColWide
                      : styles.thDateCol,
                  ]}
                >
                  {dateFilterMode !== "period" ? "Date" : "Day"}
                </Text>
                <Text style={[styles.th, styles.thDesc]}>Description</Text>
                <Text style={[styles.th, styles.thAmt]}>Amount</Text>
              </View>
              {txns.map((t) => {
                const accName =
                  accountById.get(String(t.account))?.name ?? "Account";
                const hasPerson = t.person != null && t.person !== "";
                const personName = hasPerson
                  ? (peopleById.get(String(t.person))?.name ?? "Person")
                  : undefined;
                const txnTypePill = txnTypePillStyles(t.txn_type);

                const amountText = isZeroMoney(t.amount)
                  ? ""
                  : formatMoney2(t.amount);
                const amountStyle =
                  t.type === "credit" ? styles.creditText : styles.debitText;

                return (
                  <View
                    key={String(t.id)}
                    style={[
                      styles.txnTableBlock,
                      t.hidden && styles.txnRowHidden,
                    ]}
                  >
                    <View style={styles.txnTableRow}>
                      <Pressable
                        onPress={() => toggleTxnSelection(t.id)}
                        style={({ pressed }) => [
                          styles.selectCellBtn,
                          pressed && styles.selectCellBtnPressed,
                          selectedTxnIds.includes(String(t.id)) &&
                            styles.selectCellBtnActive,
                        ]}
                        accessibilityRole="checkbox"
                        accessibilityState={{
                          checked: selectedTxnIds.includes(String(t.id)),
                        }}
                      >
                        {selectedTxnIds.includes(String(t.id)) ? (
                          <Feather name="check" size={14} color="#FFFFFF" />
                        ) : null}
                      </Pressable>
                      <View
                        style={[
                          styles.cellDateColumn,
                          dateFilterMode !== "period" &&
                            styles.cellDateColumnWide,
                        ]}
                      >
                        <Text style={styles.cellDate} numberOfLines={1}>
                          {dateFilterMode !== "period"
                            ? formatFullDateWithWeekday(t.txn_date)
                            : formatShortWeekdayDay(t.txn_date)}
                        </Text>
                        <View style={styles.txnDateActions}>
                          <Pressable
                            onPress={() => void onToggleTransactionHidden(t)}
                            disabled={hidingTxnId === String(t.id)}
                            style={({ pressed }) => [
                              styles.txnHideUnderDate,
                              pressed && styles.txnHideUnderDatePressed,
                              hidingTxnId === String(t.id) && { opacity: 0.45 },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={
                              t.hidden
                                ? "Unhide transaction"
                                : "Hide transaction"
                            }
                          >
                            <Feather
                              name={t.hidden ? "eye-off" : "eye"}
                              size={16}
                              color={t.hidden ? "#9A9A9A" : "#0B0B0B"}
                            />
                          </Pressable>
                          <Pressable
                            onPress={() => void onDelete(t, { confirm: true })}
                            disabled={hidingTxnId === String(t.id)}
                            style={({ pressed }) => [
                              styles.txnDeleteUnderDate,
                              pressed && styles.txnDeleteUnderDatePressed,
                              hidingTxnId === String(t.id) && { opacity: 0.45 },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel="Delete transaction"
                          >
                            <Feather name="trash-2" size={16} color="#B42318" />
                          </Pressable>
                        </View>
                      </View>
                      <Pressable
                        onPress={() => openEdit(t)}
                        style={({ pressed }) => [
                          styles.cellDescWrap,
                          hasPerson && styles.cellDescWrapWithPerson,
                          pressed &&
                            (hasPerson
                              ? styles.cellDescPressablePressedPerson
                              : styles.cellDescPressablePressed),
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Edit transaction"
                      >
                        {t.remark ? (
                          <Text style={[styles.cellRemark]} numberOfLines={2}>
                            {t.remark}
                          </Text>
                        ) : null}
                        <Text
                          style={[
                            styles.cellDesc,
                            hasPerson && styles.cellDescWithPerson,
                          ]}
                        >
                          {t.description || "—"}
                        </Text>
                        <Text
                          style={[
                            styles.cellMeta,
                            hasPerson && styles.cellMetaWithPerson,
                          ]}
                          numberOfLines={1}
                        >
                          {hasPerson && personName
                            ? `${personName} · ${accName}`
                            : accName}
                          {t.category
                            ? ` · ${categoryById.get(String(t.category))?.name ?? "Category"}`
                            : ""}
                        </Text>
                        <View style={styles.cellTypeRow}>
                          <View style={[styles.cellTypePill, txnTypePill.wrap]}>
                            <Text
                              style={[
                                styles.cellTypePillText,
                                txnTypePill.text,
                              ]}
                            >
                              {txnTypeLabel(t.txn_type)}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                      <Text
                        style={[styles.cellMoney, amountStyle]}
                        numberOfLines={1}
                      >
                        {amountText}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      <Modal
        visible={listPersonPickerTxn !== null}
        animationType="fade"
        transparent
        onRequestClose={() =>
          listPersonPatchingId ? null : setListPersonPickerTxn(null)
        }
      >
        <Pressable
          style={styles.backdrop}
          onPress={() =>
            listPersonPatchingId ? null : setListPersonPickerTxn(null)
          }
        />
        <View style={styles.pickerSheet}>
          <Text style={styles.pickerTitle}>Person</Text>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            <Pressable
              onPress={() => void onListPersonPick(null)}
              disabled={listPersonPatchingId !== null}
              style={({ pressed }) => [
                styles.pickerRow,
                pressed && styles.pickerRowPressed,
              ]}
            >
              <Text style={styles.pickerRowText}>None</Text>
            </Pressable>
            {people.map((p) => (
              <Pressable
                key={String(p.id)}
                onPress={() => void onListPersonPick(p.id)}
                disabled={listPersonPatchingId !== null}
                style={({ pressed }) => [
                  styles.pickerRow,
                  pressed && styles.pickerRowPressed,
                ]}
              >
                <Text style={styles.pickerRowText}>{p.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <TransactionBulkEditModal
        visible={isBulkEditOpen}
        onRequestClose={() => (isBulkSaving ? null : setIsBulkEditOpen(false))}
        people={people}
        categories={categories}
        isSaving={isBulkSaving}
        onApply={(patch) => void onApplyBulkUpdate(patch)}
      />

      <TransactionFormModal
        visible={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
        editState={editState}
        onSaved={({ mode, txn }) => {
          if (mode === "create") setTxns((prev) => [txn, ...prev]);
          else {
            setTxns((prev) =>
              prev.map((t) => (String(t.id) === String(txn.id) ? txn : t)),
            );
          }
        }}
        onDeleted={(id) => {
          setTxns((prev) => prev.filter((t) => String(t.id) !== String(id)));
        }}
      />

      <Modal
        visible={isUploadOpen}
        animationType="slide"
        transparent
        onRequestClose={() => (isUploading ? null : setIsUploadOpen(false))}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => (isUploading ? null : setIsUploadOpen(false))}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Upload Excel</Text>
            <Pressable
              onPress={() => setIsUploadOpen(false)}
              disabled={isUploading}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && styles.closeBtnPressed,
                isUploading && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>

          <View style={{ gap: 10 }}>
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Account</Text>
              <Pressable
                onPress={() => setIsUploadAccountPickerOpen(true)}
                disabled={isUploading}
                style={({ pressed }) => [
                  styles.pickerBtn,
                  pressed && styles.pickerBtnPressed,
                  isUploading && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.pickerBtnText}>
                  {uploadAccountId != null
                    ? (accountById.get(String(uploadAccountId))?.name ??
                      "Select account")
                    : "Select account"}
                </Text>
              </Pressable>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Excel file</Text>
              <Pressable
                onPress={pickExcel}
                disabled={isUploading}
                style={({ pressed }) => [
                  styles.pickerBtn,
                  pressed && styles.pickerBtnPressed,
                  isUploading && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.pickerBtnText} numberOfLines={1}>
                  {uploadFile?.name ?? "Choose .xlsx / .xls"}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={onUpload}
              disabled={isUploading}
              style={({ pressed }) => [
                styles.saveBtn,
                (pressed || isUploading) && styles.saveBtnPressed,
              ]}
            >
              <Text style={styles.saveBtnText}>
                {isUploading ? "Uploading…" : "Upload"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isUploadListOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsUploadListOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsUploadListOpen(false)}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Uploaded files</Text>
            <Pressable
              onPress={() => setIsUploadListOpen(false)}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && styles.closeBtnPressed,
              ]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>

          {isUploadsLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color="#0B0B0B" />
              <Text style={styles.muted}>Loading uploads…</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              {uploads.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No uploads yet</Text>
                  <Text style={styles.muted}>
                    Upload an Excel file to see it here.
                  </Text>
                </View>
              ) : (
                uploads.map((u, idx) => {
                  const accName =
                    accountById.get(String(u.account))?.name ??
                    `Account ${u.account}`;
                  const status = u.processed ? "Processed" : "Pending";
                  const statusColor =
                    u.error_count > 0
                      ? "#E53935"
                      : u.created_count > 0
                        ? "#0FA958"
                        : "#6B6B6B";

                  return (
                    <View key={`${u.file}-${idx}`} style={styles.uploadCard}>
                      <View style={{ gap: 4 }}>
                        <Text style={styles.uploadTitle} numberOfLines={1}>
                          {u.file.split("/").pop() ?? u.file}
                        </Text>
                        <Text style={styles.uploadMeta} numberOfLines={2}>
                          {accName} • {new Date(u.uploaded_at).toLocaleString()}
                        </Text>
                        <Text style={styles.uploadMeta}>
                          Rows {u.total_rows} • Created {u.created_count} •
                          Duplicates {u.duplicate_count} • Errors{" "}
                          {u.error_count}
                        </Text>
                        <Text
                          style={[styles.uploadMeta, { color: statusColor }]}
                        >
                          {status}
                        </Text>
                      </View>

                      <View
                        style={{ flexDirection: "row", gap: 8, marginTop: 10 }}
                      >
                        <Pressable
                          onPress={async () => {
                            if (!u.file) return;
                            const can = await Linking.canOpenURL(u.file);
                            if (can) await Linking.openURL(u.file);
                            else Alert.alert("Can't open link", u.file);
                          }}
                          style={({ pressed }) => [
                            styles.tableSmallBtn,
                            pressed && styles.tableSmallBtnPressed,
                          ]}
                        >
                          <Feather
                            name="external-link"
                            size={16}
                            color="#0B0B0B"
                          />
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      <Modal
        visible={isUploadAccountPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsUploadAccountPickerOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsUploadAccountPickerOpen(false)}
        />
        <View style={styles.pickerSheet}>
          <Text style={styles.pickerTitle}>Select account</Text>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            {accounts.map((a) => (
              <Pressable
                key={String(a.id)}
                onPress={() => {
                  setUploadAccountId(a.id);
                  setIsUploadAccountPickerOpen(false);
                }}
                style={({ pressed }) => [
                  styles.pickerRow,
                  pressed && styles.pickerRowPressed,
                ]}
              >
                <Text style={styles.pickerRowText}>{a.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </AppTabScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  kicker: {
    color: "#6B6B6B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: "#0B0B0B",
    fontFamily: "Poppins_800ExtraBold",
    fontSize: 22,
    marginTop: 2,
  },
  periodSubtitle: {
    color: "#6B6B6B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    marginTop: 4,
  },
  title: { color: "#0B0B0B", fontFamily: "Poppins_800ExtraBold", fontSize: 24 },
  muted: { color: "#6B6B6B", fontFamily: "Poppins_400Regular" },
  filterCard: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 11,
    backgroundColor: "#FFFFFF",
    gap: 8,
  },
  periodTotalsSection: {
    marginBottom: 11,
    gap: 8,
  },
  periodTotalsAccordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    backgroundColor: "#FAFAFA",
  },
  periodTotalsAccordionHeaderPressed: {
    backgroundColor: "#F0F0F0",
  },
  periodTotalsRangeHint: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: "#6B6B6B",
  },
  periodTotalsRow: {
    flexDirection: "row",
    gap: 10,
  },
  periodTotalBox: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FAFAFA",
  },
  periodTotalBoxCredit: {
    borderColor: "#C8E6D4",
  },
  periodTotalBoxDebit: {
    borderColor: "#F0C4C4",
  },
  periodTotalLabel: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    color: "#6B6B6B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  periodTotalAmount: {
    fontSize: 17,
    fontFamily: "Poppins_700Bold",
  },
  filterCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  filterLead: {
    flex: 1,
    color: "#6B6B6B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  viewAllBtn: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    backgroundColor: "#FAFAFA",
  },
  viewAllBtnPressed: { backgroundColor: "#F0F0F0" },
  customDateBtnActive: {
    borderColor: "#0B0B0B",
    backgroundColor: "#F5F5F5",
  },
  rangeModeBtnActive: {
    borderColor: "#0B0B0B",
    backgroundColor: "#F5F5F5",
  },
  customDateSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    backgroundColor: "#FAFAFA",
  },
  customDateSummaryRowPressed: { backgroundColor: "#F0F0F0" },
  customDateSummaryText: {
    flex: 1,
    minWidth: 0,
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  customDateModalRoot: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  customDateModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  customDateModalSheet: {
    zIndex: 1,
    elevation: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    padding: 16,
    maxWidth: 420,
    alignSelf: "center",
    width: "100%",
  },
  customDateModalField: {
    marginBottom: 14,
    gap: 6,
  },
  customDateModalLabel: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    color: "#6B6B6B",
  },
  customDateInputFull: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
    backgroundColor: "#FFFFFF",
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  customDateModalCloseBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    backgroundColor: "#FFFFFF",
  },
  customDateModalCloseBtnPressed: { backgroundColor: "#F5F5F5" },
  customDateModalCloseText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  customDateApplyBtn: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B0B0B",
  },
  customDateApplyBtnPressed: { opacity: 0.88 },
  customDateApplyBtnText: {
    color: "#FFFFFF",
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },
  viewAllBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  filterRowInner: {
    flexDirection: "row",
    alignItems: "stretch",
    flexWrap: "nowrap",
    gap: 6,
  },
  filterField: { flex: 1, minWidth: 0 },
  filterBtnWithIcon: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  filterFieldLbl: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },
  filterBtn: {
    alignSelf: "stretch",
    width: "100%",
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 40,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  filterBtnPressed: { backgroundColor: "#F5F5F5" },
  filterValue: {
    flex: 1,
    minWidth: 0,
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  addBtn: {
    backgroundColor: "#0B0B0B",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnPressed: { opacity: 0.88 },
  addBtnText: { color: "#FFFFFF", fontFamily: "Poppins_700Bold", fontSize: 13 },
  outlineBtn: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0B0B0B",
  },
  outlineBtnPressed: { backgroundColor: "#F5F5F5" },
  outlineBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  txnSearchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 8 : 4,
    backgroundColor: "#FAFAFA",
    minHeight: 40,
  },
  txnSearchIcon: { marginRight: 2 },
  txnSearchInput: {
    flex: 1,
    paddingVertical: Platform.OS === "android" ? 6 : 4,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#0B0B0B",
    minWidth: 0,
  },
  refreshIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  refreshIconBtnPressed: { backgroundColor: "#F5F5F5" },
  txnMetaStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
    minHeight: 28,
  },
  txnMetaCountText: {
    flex: 1,
    minWidth: 0,
    color: "#6B6B6B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  bulkBar: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bulkBarText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  bulkActionBtn: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  bulkActionBtnPressed: { backgroundColor: "#F5F5F5" },
  bulkActionBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  bulkDangerBtn: {
    borderWidth: 1,
    borderColor: "#B42318",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FFF5F5",
  },
  bulkDangerBtnPressed: { backgroundColor: "#FEEAEA" },
  bulkDangerBtnText: {
    color: "#B42318",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  txnPagerInline: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  txnPagerIconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  txnPagerIconBtnPressed: { backgroundColor: "#F0F0F0" },
  txnPagerIconBtnDisabled: { opacity: 0.55 },
  txnPagerPageText: {
    minWidth: 28,
    textAlign: "center",
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  list: { gap: 10, paddingBottom: 12 },
  tableList: { paddingBottom: 24, paddingTop: 2 },
  txnTableWrap: { gap: 0 },
  tableTitle: {
    color: "#0B0B0B",
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    marginBottom: 8,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E7E7E7",
    paddingBottom: 8,
    gap: 8,
    marginBottom: 0,
  },
  thSelectCol: { width: 42, textAlign: "center" },
  th: { color: "#6B6B6B", fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  thDateCol: { width: 86 },
  thDateColWide: { width: 132 },
  thDesc: { flex: 1, minWidth: 0 },
  thAmt: { width: 62, textAlign: "right" },
  txnTableBlock: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    paddingBottom: 2,
  },
  txnRowHidden: { opacity: 0.62 },
  txnTableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    gap: 8,
  },
  selectCellBtn: {
    width: 26,
    height: 26,
    borderWidth: 1,
    borderColor: "#D6D6D6",
    borderRadius: 7,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  selectCellBtnPressed: { backgroundColor: "#F5F5F5" },
  selectCellBtnActive: {
    borderColor: "#0B0B0B",
    backgroundColor: "#0B0B0B",
  },
  cellDateColumn: {
    width: 86,
    flexShrink: 0,
    gap: 6,
  },
  cellDateColumnWide: {
    width: 132,
  },
  cellDate: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    paddingTop: 1,
  },
  txnDateActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  txnHideUnderDate: {
    padding: 4,
    borderRadius: 8,
  },
  txnHideUnderDatePressed: { backgroundColor: "#F5F5F5" },
  txnDeleteUnderDate: {
    padding: 4,
    borderRadius: 8,
  },
  txnDeleteUnderDatePressed: { backgroundColor: "#FDEDED" },
  txnPersonUnderDate: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignSelf: "stretch",
  },
  txnPersonUnderDatePressed: { backgroundColor: "#F5F5F5" },
  txnPersonUnderDateText: {
    flex: 1,
    minWidth: 0,
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },
  cellDescWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    alignSelf: "stretch",
  },
  cellDescWrapWithPerson: {
    backgroundColor: "#0B0B0B",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  cellDescPressablePressed: { opacity: 0.85 },
  cellDescPressablePressedPerson: { opacity: 0.88 },
  cellRemark: {
    color: "#fff",
    backgroundColor: "#0B0B0B",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    width: "100%",
    textAlign: "center",
    fontSize: 16,
  },
  cellDesc: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  cellDescWithPerson: {
    color: "#FFFFFF",
    fontFamily: "Poppins_600SemiBold",
  },
  cellMeta: {
    color: "#6B6B6B",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
  cellMetaWithPerson: {
    color: "rgba(255,255,255,0.78)",
    fontFamily: "Poppins_500Medium",
  },
  cellTypeRow: {
    marginTop: 2,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  cellTypePill: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#FFFFFF",
  },
  cellTypePillText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },
  cellTypePillIncome: {
    borderColor: "#C8E6D4",
    backgroundColor: "#F1FBF5",
  },
  cellTypePillIncomeText: { color: "#2E7D5A" },
  cellTypePillExpense: {
    borderColor: "#F0C4C4",
    backgroundColor: "#FFF5F5",
  },
  cellTypePillExpenseText: { color: "#B83C3C" },
  cellTypePillTransfer: {
    borderColor: "#C9D8F5",
    backgroundColor: "#F4F7FF",
  },
  cellTypePillTransferText: { color: "#2F4F8C" },
  cellTypePillLoanGiven: {
    borderColor: "#E6D1F4",
    backgroundColor: "#FAF5FF",
  },
  cellTypePillLoanGivenText: { color: "#6B3FA0" },
  cellTypePillLoanTaken: {
    borderColor: "#F6D8C2",
    backgroundColor: "#FFF8F2",
  },
  cellTypePillLoanTakenText: { color: "#A65A21" },
  cellTypePillRepaymentIn: {
    borderColor: "#C7E8ED",
    backgroundColor: "#F2FBFD",
  },
  cellTypePillRepaymentInText: { color: "#1F6F7A" },
  cellTypePillRepaymentOut: {
    borderColor: "#E4E4E4",
    backgroundColor: "#F8F8F8",
  },
  cellTypePillRepaymentOutText: { color: "#555555" },
  cellMoney: {
    width: 62,
    flexShrink: 0,
    textAlign: "right",
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    paddingTop: 1,
  },
  empty: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  emptyTitle: { fontSize: 14, fontFamily: "Poppins_700Bold", color: "#0B0B0B" },
  card: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#FFFFFF",
    gap: 12,
  },
  cardTitle: { color: "#0B0B0B", fontSize: 14, fontFamily: "Poppins_700Bold" },
  cardSubtitle: {
    color: "#6B6B6B",
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  cardAmount: {
    color: "#0B0B0B",
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  cardActions: { flexDirection: "row", gap: 10 },
  tableHeaderRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E7E7E7",
    gap: 0,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E7E7E7",
    gap: 0,
  },
  thText: {
    color: "#6B6B6B",
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  tdText: {
    color: "#0B0B0B",
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  creditText: { color: "#2E7D5A", fontFamily: "Poppins_700Bold" },
  debitText: { color: "#B83C3C", fontFamily: "Poppins_700Bold" },
  colDate: { flex: 1 },
  colDesc: { flex: 2 },
  colAccount: { flex: 2 },
  colPerson: { flex: 1.6 },
  colAmount: { flex: 1.4, textAlign: "right" as const },
  colActions: { flex: 1.6 },
  tableActions: { flexDirection: "row", gap: 8 },
  tableSmallBtn: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  tableSmallBtnPressed: { backgroundColor: "#F5F5F5" },
  tableSmallBtnDanger: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#0B0B0B",
    alignItems: "center",
    justifyContent: "center",
  },
  tableSmallBtnDangerPressed: { opacity: 0.88 },
  smallBtn: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallBtnPressed: { backgroundColor: "#F5F5F5" },
  smallBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  smallBtnDanger: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#0B0B0B",
  },
  smallBtnDangerPressed: { opacity: 0.88 },
  smallBtnDangerText: {
    color: "#FFFFFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },

  deleteBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E53935",
    marginTop: 6,
  },
  deleteBtnPressed: { opacity: 0.88 },
  deleteBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deleteBtnText: {
    color: "#FFFFFF",
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  txnModalKeyboardRoot: {
    flex: 1,
  },
  txnModalKeyboardInner: {
    flex: 1,
    justifyContent: "flex-end",
  },
  txnModalBackdropDim: {
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  txnModalScrollContent: {
    gap: 10,
    paddingBottom: 28,
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: "#E7E7E7",
    padding: 16,
    maxHeight: "92%",
    width: "100%",
    flexShrink: 1,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sheetTitle: { color: "#0B0B0B", fontSize: 16, fontFamily: "Poppins_700Bold" },
  closeBtn: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeBtnPressed: { backgroundColor: "#F5F5F5" },
  closeBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  label: { color: "#0B0B0B", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  inputMultiline: {
    minHeight: 88,
    paddingTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
  pickerBtn: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickerBtnPressed: { backgroundColor: "#F5F5F5" },
  pickerBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  moneyRow: { flexDirection: "row", gap: 10 },
  typePill: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  typePillPressed: { backgroundColor: "#F5F5F5" },
  typePillCreditActive: { borderColor: "#0FA958", backgroundColor: "#0FA958" },
  typePillDebitActive: { borderColor: "#E53935", backgroundColor: "#E53935" },
  typePillText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  typePillTextActive: { color: "#FFFFFF" },
  saveBtn: {
    marginTop: 6,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B0B0B",
  },
  saveBtnPressed: { opacity: 0.88 },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
  },

  pickerSheet: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    padding: 16,
    margin: 16,
    maxHeight: "75%",
  },
  pickerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  pickerTitle: {
    color: "#0B0B0B",
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
  },
  pickerAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pickerAddBtnPressed: { backgroundColor: "#F5F5F5" },
  pickerAddBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
  },
  pickerSearchInput: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#0B0B0B",
    marginBottom: 10,
  },
  pickerRow: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  pickerCreateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pickerRowPressed: { backgroundColor: "#F5F5F5" },
  pickerRowActive: { borderColor: "#0B0B0B", backgroundColor: "#F5F5F5" },
  bulkChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bulkChipBtn: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },
  bulkChipText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  pickerRowText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  sidebarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sidebarTitle: {
    color: "#0B0B0B",
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
  },
  closeMiniBtn: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 999,
    padding: 8,
    backgroundColor: "#FFFFFF",
  },
  closeMiniBtnPressed: { backgroundColor: "#F5F5F5" },
  sidebar: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "80%",
    backgroundColor: "#FFFFFF",
    borderLeftWidth: 1,
    borderLeftColor: "#E7E7E7",
    padding: 16,
  },
  sidebarTypeRow: {
    flexDirection: "row",
    gap: 8,
  },
  sidebarTypePill: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  sidebarTypePillActiveNeutral: {
    borderColor: "#0B0B0B",
    backgroundColor: "#0B0B0B",
  },
  sidebarTypePillText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  sidebarTxnTypeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sidebarTxnTypePill: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#FFFFFF",
  },
  sidebarTxnTypePillText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  sidebarAmountRow: {
    flexDirection: "row",
    gap: 8,
  },
  sidebarAmountInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    color: "#0B0B0B",
  },
  secondaryResetBtn: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  secondaryResetBtnPressed: { backgroundColor: "#F5F5F5" },
  secondaryResetText: {
    color: "#0B0B0B",
  },
  bulkActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E7E7E7",
  },
  uploadCard: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#FFFFFF",
  },
  uploadTitle: {
    color: "#0B0B0B",
  },
  uploadMeta: {
    color: "#6B6B6B",
  },
  menuSheet: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    padding: 8,
    margin: 16,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  menuRowPressed: { backgroundColor: "#F5F5F5" },
  menuRowText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
});
