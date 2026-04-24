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
  getAccountLedger,
  type AccountLedger,
  type AccountLedgerRow,
} from "../services/accounts";
import { listCategories, type Category } from "../services/categories";
import { listPeoples, type People } from "../services/peoples";
import {
  bulkDeleteTransactions,
  bulkUpdateTransactions,
  getTransaction,
} from "../services/transactions";
import { groupLedgerRowsByYearMonth } from "../utils/ledgerGrouping";
import { formatMoney2 } from "../utils/money";

function parseMoney(s: string): number {
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
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
  row: AccountLedgerRow;
  selected: boolean;
  onToggleSelect: () => void;
  onPressRow: () => void;
}) {
  const isCredit = row.type === "credit";
  const sub =
    row.person_name.trim() ||
    row.account_name.trim() ||
    "—";
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
      <Text style={styles.cellDate}>{row.txn_date}</Text>
      <Pressable
        onPress={onPressRow}
        style={({ pressed }) => [
          styles.cellDescWrap,
          pressed && styles.cellDescPressed,
        ]}
      >
        {row.remark ? (
          <Text style={styles.cellRemark} numberOfLines={2}>
            {row.remark}
          </Text>
        ) : null}
        <Text style={styles.cellDesc} numberOfLines={2}>
          {row.description || "—"}
        </Text>
        <Text style={styles.cellAccount} numberOfLines={1}>
          {sub}
        </Text>
      </Pressable>
      <Text style={[styles.cellMoney, isCredit ? styles.creditText : styles.debitText]}>
        {formatMoney2(isCredit ? row.credit : row.debit)}
      </Text>
    </View>
  );
}

export default function AccountLedgerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppTabParamList, "AccountLedger">>();
  const route = useRoute<RouteProp<AppTabParamList, "AccountLedger">>();
  const { accountId, accountName: nameFromRoute } = route.params;

  const [ledger, setLedger] = React.useState<AccountLedger | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [filterYear, setFilterYear] = React.useState("");
  const [filterMonth, setFilterMonth] = React.useState("");
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
    async (yearStr: string, monthStr: string) => {
      setIsLoading(true);
      try {
        const y = yearStr.trim();
        const m = monthStr.trim();
        const data = await getAccountLedger(accountId, {
          ...(y ? { year: y } : {}),
          ...(m ? { month: m } : {}),
        });
        setLedger(data);
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
    [accountId]
  );

  React.useEffect(() => {
    void loadLedger("", "");
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

  const displayName = ledger?.account_name || nameFromRoute || "Account";
  const ledgerByYearMonth = React.useMemo(
    () => groupLedgerRowsByYearMonth(ledger?.transactions ?? []),
    [ledger?.transactions],
  );
  const creditNum = ledger ? parseMoney(ledger.total_credit) : 0;
  const debitNum = ledger ? parseMoney(ledger.total_debit) : 0;
  const totalFlow = creditNum + debitNum;
  const creditPct = totalFlow > 0 ? Math.round((creditNum / totalFlow) * 1000) / 10 : 0;
  const debitPct = totalFlow > 0 ? Math.round((debitNum / totalFlow) * 1000) / 10 : 0;

  function applyFilters() {
    void loadLedger(filterYear, filterMonth);
  }

  async function clearFilters() {
    setFilterYear("");
    setFilterMonth("");
    await loadLedger("", "");
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
      .map((r) => ({ person: r.person }));
  }, [ledger, selectedTxnIds]);

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
    await loadLedger(filterYear, filterMonth);
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
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          Account ledger
        </Text>
        <Pressable
          onPress={openCreate}
          style={({ pressed }) => [styles.topAddBtn, pressed && styles.topAddBtnPressed]}
        >
          <Text style={styles.topAddBtnText}>Add</Text>
        </Pressable>
      </View>

      <Text style={styles.heroTitle}>{displayName}</Text>

      <View style={styles.filterCard}>
        <Text style={styles.filterLabel}>Optional filters (leave empty for all time)</Text>
        <View style={styles.filterRow}>
          <View style={styles.filterField}>
            <Text style={styles.filterFieldLbl}>Year</Text>
            <TextInput
              value={filterYear}
              onChangeText={setFilterYear}
              placeholder="e.g. 2026"
              placeholderTextColor="#6B6B6B"
              keyboardType="number-pad"
              style={styles.filterInput}
            />
          </View>
          <View style={styles.filterField}>
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
        </View>
        <View style={styles.filterActions}>
          <Pressable
            onPress={applyFilters}
            style={({ pressed }) => [styles.applyBtn, pressed && styles.applyBtnPressed]}
          >
            <Text style={styles.applyBtnText}>Apply</Text>
          </Pressable>
          <Pressable
            onPress={() => void clearFilters()}
            style={({ pressed }) => [styles.clearBtn, pressed && styles.clearBtnPressed]}
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </Pressable>
        </View>
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
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total credit</Text>
              <Text style={[styles.summaryValue, styles.creditText]}>
                {formatMoney2(ledger.total_credit)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total debit</Text>
              <Text style={[styles.summaryValue, styles.debitText]}>
                {formatMoney2(ledger.total_debit)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Net</Text>
              <Text style={styles.summaryValue}>{formatMoney2(ledger.net)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Transactions</Text>
              <Text style={styles.summaryValue}>{ledger.transaction_count}</Text>
            </View>
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Credit vs debit (share of volume)</Text>
            <View style={styles.chartRow}>
              <CreditDebitPie credit={creditNum} debit={debitNum} />
              <View style={styles.legend}>
                <View style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: "#2E7D5A" }]} />
                  <Text style={styles.legendText}>
                    Credit {creditPct}% · {formatMoney2(ledger.total_credit)}
                  </Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: "#B83C3C" }]} />
                  <Text style={styles.legendText}>
                    Debit {debitPct}% · {formatMoney2(ledger.total_debit)}
                  </Text>
                </View>
              </View>
            </View>
            {totalFlow > 0 ? (
              <View style={styles.barTrack}>
                <View style={[styles.barSeg, { flex: creditNum, backgroundColor: "#2E7D5A" }]} />
                <View style={[styles.barSeg, { flex: debitNum, backgroundColor: "#B83C3C" }]} />
              </View>
            ) : null}
          </View>

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
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.thSelect]}>Sel</Text>
            <Text style={[styles.th, styles.thDate]}>Date</Text>
            <Text style={[styles.th, styles.thDesc]}>Description / Person</Text>
            <Text style={[styles.th, styles.thAmt]}>Amount</Text>
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
        createDefaults={{ accountId }}
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
    marginBottom: 8,
  },
  backBtn: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  backBtnPressed: { opacity: 0.7 },
  backBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    color: "#6B6B6B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  topAddBtn: {
    minWidth: 56,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#0B0B0B",
    alignItems: "center",
  },
  topAddBtnPressed: { backgroundColor: "#F5F5F5" },
  topAddBtnText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
  heroTitle: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 22,
    marginBottom: 14,
  },
  filterCard: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 16,
    padding: 14,
    gap: 10,
    marginBottom: 14,
  },
  filterLabel: {
    color: "#6B6B6B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  filterRow: { flexDirection: "row", gap: 12 },
  filterField: { flex: 1, gap: 4 },
  filterFieldLbl: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
  filterInput: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#0B0B0B",
  },
  filterActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  applyBtn: {
    flex: 1,
    backgroundColor: "#0B0B0B",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  applyBtnPressed: { opacity: 0.88 },
  applyBtnText: { color: "#FFFFFF", fontFamily: "Poppins_400Regular", fontSize: 13 },
  clearBtn: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  clearBtnPressed: { backgroundColor: "#F5F5F5" },
  clearBtnText: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 13 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  muted: { color: "#6B6B6B", fontFamily: "Poppins_400Regular" },
  scrollContent: { paddingBottom: 24, gap: 14 },
  summaryCard: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: { color: "#6B6B6B", fontFamily: "Poppins_400Regular", fontSize: 13 },
  summaryValue: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 14 },
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
  legendText: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 12, flex: 1 },
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
    fontSize: 15,
  },
  selectAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E7E7E7",
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
  th: { color: "#6B6B6B", fontFamily: "Poppins_400Regular", fontSize: 11 },
  thSelect: { width: 36, textAlign: "center" },
  thDate: { width: 80 },
  thDesc: { flex: 1 },
  thAmt: { width: 80, textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
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
  cellDate: {
    width: 80,
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  cellDescWrap: { flex: 1, gap: 4 },
  cellDescPressed: { opacity: 0.88 },
  cellRemark: {
    color: "#5C5C5C",
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
  },
  cellDesc: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 12 },
  cellAccount: { color: "#6B6B6B", fontFamily: "Poppins_400Regular", fontSize: 11 },
  cellMoney: {
    width: 80,
    textAlign: "right",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
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
    fontSize: 22,
    marginTop: 4,
    marginBottom: 4,
  },
  ledgerMonthGroup: {
    marginBottom: 10,
  },
  ledgerMonthHeading: {
    color: "#6B6B6B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#E7E7E7",
    marginBottom: 4,
  },
});
