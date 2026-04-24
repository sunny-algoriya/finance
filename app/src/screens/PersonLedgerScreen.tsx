import React from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Feather } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Svg, { Circle, Path } from "react-native-svg";

import AppTabScreen from "../components/AppTabScreen";
import type { AppTabParamList } from "../navigation/AppNavigator";
import {
  TransactionBulkEditModal,
  TransactionBulkSelectionBar,
  TransactionFormModal,
  type BulkEditRowSnapshot,
  type BulkUpdatePatch,
  type TransactionEditState,
  IS_WEB,
} from "../components/transactions";
import {
  downloadPersonLedgerExcel,
  downloadPersonLedgerPdf,
  getPersonLedger,
  type PersonLedger,
  type PersonLedgerCategory,
  type PersonLedgerRow,
} from "../services/peoples";
import { listCategories, type Category } from "../services/categories";
import { listPeoples, type People } from "../services/peoples";
import {
  bulkDeleteTransactions,
  bulkUpdateTransactions,
  getTransaction,
} from "../services/transactions";
import { groupLedgerRowsByYearMonth } from "../utils/ledgerGrouping";
import { formatDateDDMMYY } from "../utils/date";
import { formatMoney2 } from "../utils/money";

function parseMoney(s: string): number {
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const remain = bytes.length - i;
    const a = bytes[i];
    const b = remain > 1 ? bytes[i + 1] : 0;
    const c = remain > 2 ? bytes[i + 2] : 0;

    const triple = (a << 16) | (b << 8) | c;
    output += alphabet[(triple >> 18) & 0x3f];
    output += alphabet[(triple >> 12) & 0x3f];
    output += remain > 1 ? alphabet[(triple >> 6) & 0x3f] : "=";
    output += remain > 2 ? alphabet[triple & 0x3f] : "=";
  }
  return output;
}

function CreditDebitPie({
  credit,
  debit,
  size = 168,
}: {
  credit: number;
  debit: number;
  size?: number;
}) {
  const total = credit + debit;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;

  if (total <= 0) {
    return (
      <View style={[styles.piePlaceholder, { width: size, height: size }]}>
        <Text style={styles.muted}>No amounts to chart</Text>
      </View>
    );
  }

  const credFrac = credit / total;
  const creditColor = "#2E7D5A";
  const debitColor = "#B83C3C";

  if (credFrac <= 0.0001) {
    return (
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} fill={debitColor} />
      </Svg>
    );
  }
  if (credFrac >= 0.9999) {
    return (
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} fill={creditColor} />
      </Svg>
    );
  }

  const startAngle = -90;
  const creditEndAngle = startAngle + credFrac * 360;

  function arcPath(startA: number, endA: number) {
    const p1 = polarToXY(cx, cy, r, startA);
    const p2 = polarToXY(cx, cy, r, endA);
    const sweep = endA - startA;
    const large = Math.abs(sweep) > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y} Z`;
  }

  const dCredit = arcPath(startAngle, creditEndAngle);
  const dDebit = arcPath(creditEndAngle, startAngle + 360);

  return (
    <Svg width={size} height={size}>
      <Path d={dCredit} fill={creditColor} />
      <Path d={dDebit} fill={debitColor} />
    </Svg>
  );
}

function LedgerRow({
  row,
  selected,
  onToggleSelect,
  onPressRow,
}: {
  row: PersonLedgerRow;
  selected: boolean;
  onToggleSelect: () => void;
  onPressRow: () => void;
}) {
  const isCredit = row.type === "credit";
  return (
    <View style={styles.tableRow}>
      <Pressable
        onPress={onToggleSelect}
        style={({ pressed }) => [
          styles.selectCellBtn,
          pressed && styles.selectCellBtnPressed,
          selected && styles.selectCellBtnActive,
        ]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
      >
        {selected ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
      </Pressable>
      <Pressable
        onPress={onPressRow}
        style={({ pressed }) => [
          styles.cellDescWrap,
          pressed && styles.cellDescPressed,
        ]}
      >
        <Text style={styles.cellDateTop} numberOfLines={1}>
          {formatDateDDMMYY(row.txn_date)}
        </Text>
        <Text style={styles.cellDesc} numberOfLines={3}>
          {row.description || "—"}
        </Text>
        {row.remark ? (
          <View style={styles.cellRemarkBox}>
            <Text style={styles.cellRemarkText} numberOfLines={4}>
              {row.remark}
            </Text>
          </View>
        ) : null}
        <View style={styles.cellMetaRow}>
          <Text style={styles.cellAccount} numberOfLines={1}>
            {row.account_name}
          </Text>
          {row.category_name ? (
            <View style={styles.cellCategoryPill}>
              <Text style={styles.cellCategoryPillText} numberOfLines={1}>
                {row.category_name}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      <Text
        style={[
          styles.cellMoney,
          isCredit ? styles.creditText : styles.debitText,
        ]}
        numberOfLines={2}
      >
        {formatMoney2(isCredit ? row.credit : row.debit)}
      </Text>
    </View>
  );
}

export default function PersonLedgerScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AppTabParamList, "PersonLedger">>();
  const route = useRoute<RouteProp<AppTabParamList, "PersonLedger">>();
  const { personId, personName: nameFromRoute } = route.params;

  const [ledger, setLedger] = React.useState<PersonLedger | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [filterYear, setFilterYear] = React.useState("");
  const [filterMonth, setFilterMonth] = React.useState("");
  const [entryTypeFilter, setEntryTypeFilter] = React.useState<
    "all" | "credit" | "debit"
  >("all");
  /** null = all categories; "none" = uncategorized; else category id string */
  const [categoryFilter, setCategoryFilter] = React.useState<
    null | "none" | string
  >(null);
  const [people, setPeople] = React.useState<People[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [selectedTxnIds, setSelectedTxnIds] = React.useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = React.useState(false);
  const [isBulkSaving, setIsBulkSaving] = React.useState(false);
  const [isTxnModalOpen, setIsTxnModalOpen] = React.useState(false);
  const [editState, setEditState] = React.useState<TransactionEditState>({
    mode: "create",
  });

  const loadLedger = React.useCallback(
    async (
      yearStr: string,
      monthStr: string,
      cat: null | "none" | string,
      side: "all" | "credit" | "debit" = entryTypeFilter,
    ) => {
      setIsLoading(true);
      try {
        const y = yearStr.trim();
        const m = monthStr.trim();
        const data = await getPersonLedger(personId, {
          ...(y ? { year: y } : {}),
          ...(m ? { month: m } : {}),
          ...(side !== "all" ? { type: side } : {}),
          ...(cat === null
            ? {}
            : {
                category: cat === "none" ? "none" : cat,
              }),
        });
        setLedger(data);
        if (data.category === "none") {
          setCategoryFilter("none");
        } else if (data.category !== null && data.category !== undefined) {
          setCategoryFilter(String(data.category));
        } else {
          setCategoryFilter(null);
        }
      } catch (err: any) {
        const message =
          err?.response?.data?.detail ??
          err?.response?.data?.message ??
          err?.message ??
          "Failed to load ledger.";
        Alert.alert("Error", String(message));
      } finally {
        setIsLoading(false);
      }
    },
    [personId, entryTypeFilter],
  );

  React.useEffect(() => {
    void loadLedger("", "", null);
  }, [loadLedger]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, c] = await Promise.all([listPeoples(), listCategories()]);
        if (!cancelled) {
          setPeople(p);
          setCategories(c);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = ledger?.person_name || nameFromRoute || "Person";
  const ledgerByYearMonth = React.useMemo(
    () => groupLedgerRowsByYearMonth(ledger?.transactions ?? []),
    [ledger?.transactions],
  );
  const creditNum = ledger ? parseMoney(ledger.total_credit) : 0;
  const debitNum = ledger ? parseMoney(ledger.total_debit) : 0;
  const totalFlow = creditNum + debitNum;
  const creditPct =
    totalFlow > 0 ? Math.round((creditNum / totalFlow) * 1000) / 10 : 0;
  const debitPct =
    totalFlow > 0 ? Math.round((debitNum / totalFlow) * 1000) / 10 : 0;

  function applyFilters() {
    void loadLedger(filterYear, filterMonth, categoryFilter, entryTypeFilter);
  }

  async function clearFilters() {
    setFilterYear("");
    setFilterMonth("");
    setEntryTypeFilter("all");
    setCategoryFilter(null);
    await loadLedger("", "", null, "all");
  }

  function setCategoryAndReload(next: null | "none" | string) {
    setCategoryFilter(next);
    void loadLedger(filterYear, filterMonth, next, entryTypeFilter);
  }

  function setEntryTypeAndReload(next: "all" | "credit" | "debit") {
    setEntryTypeFilter(next);
    void loadLedger(filterYear, filterMonth, categoryFilter, next);
  }

  function categoryChipSelected(c: PersonLedgerCategory): boolean {
    if (c.id === null || c.id === undefined) {
      return categoryFilter === "none";
    }
    return categoryFilter === String(c.id);
  }

  const rowIds = React.useMemo(
    () => (ledger?.transactions ?? []).map((r) => String(r.id)),
    [ledger?.transactions],
  );

  const bulkEditSelectionSnapshot = React.useMemo((): BulkEditRowSnapshot[] => {
    if (!ledger) return [];
    const idSet = new Set(selectedTxnIds);
    return ledger.transactions
      .filter((r) => idSet.has(String(r.id)))
      .map((r) => ({
        person: personId,
        category: r.category,
      }));
  }, [ledger, selectedTxnIds, personId]);

  const areAllSelected =
    rowIds.length > 0 && rowIds.every((id) => selectedTxnIds.includes(id));

  React.useEffect(() => {
    const visible = new Set(rowIds);
    setSelectedTxnIds((prev) => prev.filter((id) => visible.has(id)));
  }, [rowIds]);

  function toggleTxnSelection(id: string | number) {
    const key = String(id);
    setSelectedTxnIds((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  }

  function toggleSelectAll() {
    setSelectedTxnIds((prev) => {
      if (areAllSelected) {
        return prev.filter((id) => !rowIds.includes(id));
      }
      return Array.from(new Set([...prev, ...rowIds]));
    });
  }

  async function reloadLedger() {
    await loadLedger(filterYear, filterMonth, categoryFilter, entryTypeFilter);
  }

  async function exportPdf() {
    try {
      const { data, filename } = await downloadPersonLedgerPdf(personId, {
        ...(filterYear.trim() ? { year: filterYear.trim() } : {}),
        ...(filterMonth.trim() ? { month: filterMonth.trim() } : {}),
        ...(entryTypeFilter !== "all" ? { type: entryTypeFilter } : {}),
        ...(categoryFilter === null
          ? {}
          : {
              category: categoryFilter,
            }),
      });

      await saveAndShareBinaryFile({
        data,
        filename: filename || "person-ledger.pdf",
        mimeType: "application/pdf",
        webFallbackName: "person-ledger.pdf",
        unavailableShareTitle: "PDF Saved",
      });
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to export PDF.";
      Alert.alert("Error", String(message));
    }
  }

  async function saveAndShareBinaryFile(params: {
    data: ArrayBuffer;
    filename: string;
    mimeType: string;
    webFallbackName: string;
    unavailableShareTitle: string;
  }) {
    const { data, filename, mimeType, webFallbackName, unavailableShareTitle } =
      params;

    if (IS_WEB) {
      const blob = new Blob([data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename || webFallbackName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      return;
    }

    const bytes = new Uint8Array(data);
    const base64 = bytesToBase64(bytes);
    const safeName = (filename || webFallbackName).replace(/[^\w.-]/g, "_");
    const fileUri = `${FileSystem.cacheDirectory}${safeName}`;

    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert(unavailableShareTitle, `File saved at:\n${fileUri}`);
      return;
    }
    await Sharing.shareAsync(fileUri, {
      mimeType,
    });
  }

  async function exportExcel() {
    try {
      const { data, filename } = await downloadPersonLedgerExcel(personId, {
        ...(filterYear.trim() ? { year: filterYear.trim() } : {}),
        ...(filterMonth.trim() ? { month: filterMonth.trim() } : {}),
        ...(entryTypeFilter !== "all" ? { type: entryTypeFilter } : {}),
        ...(categoryFilter === null
          ? {}
          : {
              category: categoryFilter,
            }),
      });

      await saveAndShareBinaryFile({
        data,
        filename: filename || "person-ledger.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        webFallbackName: "person-ledger.xlsx",
        unavailableShareTitle: "Excel Saved",
      });
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to export Excel.";
      Alert.alert("Error", String(message));
    }
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
        ...(patch.personal_type !== undefined
          ? { personal_type: patch.personal_type }
          : {}),
      });
      setIsBulkEditOpen(false);
      setSelectedTxnIds([]);
      await reloadLedger();
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

  async function onBulkDeleteSelected() {
    if (selectedTxnIds.length === 0 || isBulkSaving) return;
    const run = async () => {
      setIsBulkSaving(true);
      try {
        await bulkDeleteTransactions({ ids: selectedTxnIds });
        setSelectedTxnIds([]);
        await reloadLedger();
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
        void run();
      }
      return;
    }
    Alert.alert(
      "Delete selected",
      `Delete ${selectedTxnIds.length} transactions? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void run() },
      ],
    );
  }

  function openCreate() {
    setEditState({ mode: "create" });
    setIsTxnModalOpen(true);
  }

  async function openEditRow(rowId: string | number) {
    try {
      const txn = await getTransaction(rowId);
      setEditState({ mode: "edit", txn });
      setIsTxnModalOpen(true);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to load transaction.";
      Alert.alert("Error", String(message));
    }
  }

  return (
    <AppTabScreen>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && styles.backBtnPressed,
          ]}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          Ledger
        </Text>
        <View style={styles.topRightActions}>
          <Pressable
            onPress={() => void exportExcel()}
            style={({ pressed }) => [
              styles.topExcelBtn,
              pressed && styles.topExcelBtnPressed,
            ]}
          >
            <Text style={styles.topExcelBtnText}>Excel</Text>
          </Pressable>
          <Pressable
            onPress={() => void exportPdf()}
            style={({ pressed }) => [
              styles.topPdfBtn,
              pressed && styles.topPdfBtnPressed,
            ]}
          >
            <Text style={styles.topPdfBtnText}>PDF</Text>
          </Pressable>
          <Pressable
            onPress={openCreate}
            style={({ pressed }) => [
              styles.topAddBtn,
              pressed && styles.topAddBtnPressed,
            ]}
          >
            <Text style={styles.topAddBtnText}>Add</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.personName}>{displayName}</Text>

      <View style={styles.filterCard}>
        <Text style={styles.filterLabel}>Filters</Text>
        <View style={styles.filterSingleRow}>
          <View style={styles.filterCol}>
            <Text style={styles.filterFieldLbl}>Year</Text>
            <TextInput
              value={filterYear}
              onChangeText={setFilterYear}
              placeholder="2026"
              placeholderTextColor="#6B6B6B"
              keyboardType="number-pad"
              style={styles.filterInput}
            />
          </View>
          <View style={styles.filterCol}>
            <Text style={styles.filterFieldLbl}>Month</Text>
            <TextInput
              value={filterMonth}
              onChangeText={setFilterMonth}
              placeholder="1–12"
              placeholderTextColor="#6B6B6B"
              keyboardType="number-pad"
              style={styles.filterInput}
            />
          </View>
          <Pressable
            onPress={applyFilters}
            style={({ pressed }) => [
              styles.filterBtnCell,
              styles.applyBtn,
              pressed && styles.applyBtnPressed,
            ]}
          >
            <Text style={styles.applyBtnText}>Apply</Text>
          </Pressable>
          <Pressable
            onPress={() => void clearFilters()}
            style={({ pressed }) => [
              styles.filterBtnCell,
              styles.clearBtn,
              pressed && styles.clearBtnPressed,
            ]}
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </Pressable>
        </View>
        {!isLoading && ledger && ledger.categories.length > 0 ? (
          <View style={styles.categoryFilterBlock}>
            <Text style={styles.categoryFilterLabel}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChipScroll}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                onPress={() => setCategoryAndReload(null)}
                style={({ pressed }) => [
                  styles.categoryChip,
                  categoryFilter === null && styles.categoryChipActive,
                  pressed && styles.categoryChipPressed,
                ]}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    categoryFilter === null && styles.categoryChipTextActive,
                  ]}
                >
                  All
                </Text>
              </Pressable>
              {ledger.categories.map((c) => {
                const uncat =
                  c.id === null || c.id === undefined || c.id === "";
                const label = uncat ? "Uncategorized" : (c.name ?? "Category");
                const selected = categoryChipSelected(c);
                return (
                  <Pressable
                    key={uncat ? "uncat" : String(c.id)}
                    onPress={() =>
                      setCategoryAndReload(uncat ? "none" : String(c.id))
                    }
                    style={({ pressed }) => [
                      styles.categoryChip,
                      selected && styles.categoryChipActive,
                      pressed && styles.categoryChipPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        selected && styles.categoryChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {label} ({c.transaction_count})
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>

      <TransactionBulkSelectionBar
        selectedCount={!isLoading && ledger ? selectedTxnIds.length : 0}
        onBulkUpdate={() => setIsBulkEditOpen(true)}
        onBulkDelete={() => void onBulkDeleteSelected()}
        onClear={() => setSelectedTxnIds([])}
        isBulkDeleting={isBulkSaving}
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0B0B0B" />
          <Text style={styles.muted}>Loading ledger…</Text>
        </View>
      ) : ledger ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.creditDebitNetBox}>
            <View style={styles.creditDebitNetHeader}>
              <Text style={styles.creditDebitNetTitle}>Summary</Text>
              {entryTypeFilter !== "all" ? (
                <Pressable
                  onPress={() => setEntryTypeAndReload("all")}
                  style={({ pressed }) => [
                    styles.creditDebitNetClearBtn,
                    pressed && styles.creditDebitNetClearBtnPressed,
                  ]}
                >
                  <Text style={styles.creditDebitNetClearText}>Show all</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => setEntryTypeAndReload("credit")}
              accessibilityRole="button"
              accessibilityState={{ selected: entryTypeFilter === "credit" }}
              style={({ pressed }) => [
                styles.creditDebitNetRowBtn,
                entryTypeFilter === "credit" && styles.creditDebitNetRowBtnCreditOn,
                pressed && styles.creditDebitNetRowBtnPressed,
              ]}
            >
              <Text style={styles.summaryLabel}>Total credit</Text>
              <Text style={[styles.summaryValue, styles.creditText]}>
                {formatMoney2(ledger.total_credit)}
              </Text>
            </Pressable>
            <View style={styles.creditDebitNetDivider} />
            <Pressable
              onPress={() => setEntryTypeAndReload("debit")}
              accessibilityRole="button"
              accessibilityState={{ selected: entryTypeFilter === "debit" }}
              style={({ pressed }) => [
                styles.creditDebitNetRowBtn,
                entryTypeFilter === "debit" && styles.creditDebitNetRowBtnDebitOn,
                pressed && styles.creditDebitNetRowBtnPressed,
              ]}
            >
              <Text style={styles.summaryLabel}>Total debit</Text>
              <Text style={[styles.summaryValue, styles.debitText]}>
                {formatMoney2(ledger.total_debit)}
              </Text>
            </Pressable>
            <View style={styles.creditDebitNetDivider} />
            <View style={styles.creditDebitNetRowNet}>
              <Text style={styles.summaryLabel}>Net</Text>
              <Text style={styles.summaryValue}>{formatMoney2(ledger.net)}</Text>
            </View>
          </View>

          {/* <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>
              Credit vs debit (share of volume)
            </Text>
            <View style={styles.chartRow}>
              <CreditDebitPie credit={creditNum} debit={debitNum} />
              <View style={styles.legend}>
                <View style={styles.legendRow}>
                  <View
                    style={[
                      styles.legendSwatch,
                      { backgroundColor: "#2E7D5A" },
                    ]}
                  />
                  <Text style={styles.legendText}>
                    Credit {creditPct}% · {formatMoney2(ledger.total_credit)}
                  </Text>
                </View>
                <View style={styles.legendRow}>
                  <View
                    style={[
                      styles.legendSwatch,
                      { backgroundColor: "#B83C3C" },
                    ]}
                  />
                  <Text style={styles.legendText}>
                    Debit {debitPct}% · {formatMoney2(ledger.total_debit)}
                  </Text>
                </View>
              </View>
            </View>
            {totalFlow > 0 ? (
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barSeg,
                    { flex: creditNum, backgroundColor: "#2E7D5A" },
                  ]}
                />
                <View
                  style={[
                    styles.barSeg,
                    { flex: debitNum, backgroundColor: "#B83C3C" },
                  ]}
                />
              </View>
            ) : null}
          </View> */}

          <View style={styles.tableTitleRow}>
            <Text style={styles.tableTitle}>Transactions</Text>
            {ledger.transactions.length > 0 ? (
              <Pressable
                onPress={toggleSelectAll}
                style={({ pressed }) => [
                  styles.selectAllBtn,
                  pressed && styles.selectAllBtnPressed,
                ]}
              >
                <Text style={styles.selectAllBtnText}>
                  {areAllSelected ? "Unselect all" : "Select all"}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {ledger.transactions.length === 0 ? (
            <View style={styles.emptyTable}>
              <Text style={styles.muted}>No rows for this filter.</Text>
            </View>
          ) : (
            ledgerByYearMonth.map((yg) => (
              <View key={yg.year} style={styles.ledgerYearGroup}>
                <Text style={styles.ledgerYearHeading}>{yg.year}</Text>
                {yg.months.map((mg) => (
                  <View
                    key={`${yg.year}-${mg.month}`}
                    style={styles.ledgerMonthGroup}
                  >
                    <Text style={styles.ledgerMonthHeading}>{mg.label}</Text>
                    {mg.transactions.map((row) => (
                      <LedgerRow
                        key={String(row.id)}
                        row={row}
                        selected={selectedTxnIds.includes(String(row.id))}
                        onToggleSelect={() => toggleTxnSelection(row.id)}
                        onPressRow={() => void openEditRow(row.id)}
                      />
                    ))}
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      ) : null}

      <TransactionBulkEditModal
        visible={isBulkEditOpen}
        onRequestClose={() => (isBulkSaving ? null : setIsBulkEditOpen(false))}
        people={people}
        categories={categories}
        isSaving={isBulkSaving}
        selectionSnapshot={bulkEditSelectionSnapshot}
        onApply={(patch) => void onApplyBulkUpdate(patch)}
      />

      <TransactionFormModal
        visible={isTxnModalOpen}
        onRequestClose={() => setIsTxnModalOpen(false)}
        editState={editState}
        createDefaults={{ personId }}
        onSaved={() => void reloadLedger()}
        onDeleted={() => void reloadLedger()}
      />
    </AppTabScreen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  backBtn: {
    paddingVertical: 6,
    paddingRight: 10,
  },
  backBtnPressed: { opacity: 0.7 },
  backBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    color: "#7B7B7B",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  topAddBtn: {
    minWidth: 52,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D9D9D9",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  topAddBtnPressed: { backgroundColor: "#F6F6F6" },
  topAddBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  topRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  topPdfBtn: {
    minWidth: 52,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D9D9D9",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  topPdfBtnPressed: { backgroundColor: "#F6F6F6" },
  topPdfBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  topExcelBtn: {
    minWidth: 52,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D9D9D9",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  topExcelBtnPressed: { backgroundColor: "#F6F6F6" },
  topExcelBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  personName: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 19,
    marginBottom: 10,
  },
  filterCard: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  filterLabel: {
    color: "#4F4F4F",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
  /** Year, month, Apply, Clear in one row; inputs and buttons bottom-aligned. */
  filterSingleRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-end",
    width: "100%",
  },
  filterCol: { flex: 1, minWidth: 0, gap: 4 },
  filterBtnCell: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    justifyContent: "center",
  },
  filterFieldLbl: {
    color: "#666666",
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
  },
  filterInput: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#0B0B0B",
    backgroundColor: "#FFFFFF",
  },
  applyBtn: {
    borderWidth: 1,
    borderColor: "#D9D9D9",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  applyBtnPressed: { backgroundColor: "#F6F6F6" },
  applyBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  clearBtn: {
    borderWidth: 1,
    borderColor: "#D9D9D9",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  clearBtnPressed: { backgroundColor: "#F6F6F6" },
  clearBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  categoryFilterBlock: { marginTop: 8, gap: 6 },
  categoryFilterLabel: {
    color: "#666666",
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
  },
  categoryChipScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingRight: 8,
  },
  categoryChip: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#FFFFFF",
  },
  categoryChipActive: {
    borderColor: "#0B0B0B",
    backgroundColor: "#F5F5F5",
  },
  categoryChipPressed: { opacity: 0.9 },
  categoryChipText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    maxWidth: 180,
  },
  categoryChipTextActive: {
    color: "#0B0B0B",
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  muted: { color: "#6B6B6B", fontFamily: "Poppins_400Regular" },
  scrollContent: { paddingBottom: 24, gap: 10 },
  creditDebitNetBox: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  creditDebitNetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 8,
  },
  creditDebitNetTitle: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  creditDebitNetClearBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  creditDebitNetClearBtnPressed: { opacity: 0.75 },
  creditDebitNetClearText: {
    color: "#4F4F4F",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
  creditDebitNetRowBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },
  creditDebitNetRowBtnCreditOn: {
    backgroundColor: "#F7FBF8",
    borderLeftWidth: 2,
    borderLeftColor: "#2E7D5A",
  },
  creditDebitNetRowBtnDebitOn: {
    backgroundColor: "#FFF8F8",
    borderLeftWidth: 2,
    borderLeftColor: "#B83C3C",
  },
  creditDebitNetRowBtnPressed: { opacity: 0.88 },
  creditDebitNetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E7E7E7",
    marginLeft: 12,
  },
  creditDebitNetRowNet: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },
  summaryLabel: {
    color: "#6B6B6B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  summaryValue: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
  chartCard: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  chartTitle: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  legend: { flex: 1, gap: 8, minWidth: 160 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    flex: 1,
  },
  barTrack: {
    flexDirection: "row",
    height: 10,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#F0F0F0",
  },
  barSeg: { minWidth: 2 },
  piePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 999,
  },
  tableTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 4,
  },
  tableTitle: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  selectAllBtn: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    backgroundColor: "#FFFFFF",
  },
  selectAllBtnPressed: { backgroundColor: "#F5F5F5" },
  selectAllBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E7E7E7",
    paddingBottom: 8,
    gap: 8,
    alignItems: "center",
  },
  th: { color: "#6B6B6B", fontFamily: "Poppins_400Regular", fontSize: 12 },
  thSelect: { width: 36, textAlign: "center" },
  thDate: { width: 80 },
  thDesc: { flex: 1 },
  thAmt: { width: 80, textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    gap: 8,
  },
  selectCellBtn: {
    width: 26,
    height: 26,
    borderWidth: 1,
    borderColor: "#D6D6D6",
    borderRadius: 7,
    marginRight: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  selectCellBtnPressed: { backgroundColor: "#F5F5F5" },
  selectCellBtnActive: {
    borderColor: "#0B0B0B",
    backgroundColor: "#0B0B0B",
  },
  cellDateTop: {
    color: "#6B6B6B",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 4,
  },
  cellDescWrap: { flex: 1, gap: 6 },
  cellDescPressed: { opacity: 0.88 },
  cellRemarkBox: {
    marginTop: 2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#F8F8F8",
    borderLeftWidth: 2,
    borderLeftColor: "#D0D0D0",
  },
  cellRemarkLabel: {
    color: "#6B6B6B",
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  cellRemarkText: {
    color: "#2A2A2A",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 17,
  },
  cellDesc: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  cellMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  cellAccount: {
    flex: 1,
    minWidth: 0,
    color: "#5C5C5C",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 16,
  },
  cellCategoryPill: {
    flexShrink: 0,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#C9D4E8",
    backgroundColor: "#F0F5FF",
    maxWidth: "100%",
  },
  cellCategoryPillText: {
    color: "#1E3A5F",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  cellMoney: {
    width: 86,
    textAlign: "right",
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  creditText: { color: "#2E7D5A" },
  debitText: { color: "#B83C3C" },
  emptyTable: {
    paddingVertical: 20,
    alignItems: "center",
  },
  ledgerYearGroup: {
    marginBottom: 8,
  },
  ledgerYearHeading: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 18,
    marginTop: 4,
    marginBottom: 4,
  },
  ledgerMonthGroup: {
    marginBottom: 10,
  },
  ledgerMonthHeading: {
    color: "#6B6B6B",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    paddingVertical: 5,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#E7E7E7",
    marginBottom: 4,
  },
});
