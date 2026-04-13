import React from "react";
import { Feather } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AppTabScreen from "../components/AppTabScreen";
import { listAccounts, type Account } from "../services/accounts";
import { listCategories, type Category } from "../services/categories";
import { listPeoples, type People } from "../services/peoples";
import {
  listTransactionsAllPages,
  TRANSACTION_TXN_TYPES,
  type Transaction,
  type TransactionPersonalType,
  type TransactionTxnType,
  type TotalsByTxnType,
} from "../services/transactions";
import { groupLedgerRowsByYearMonth } from "../utils/ledgerGrouping";
import { formatDateDDMMYY } from "../utils/date";
import { formatMoney2 } from "../utils/money";

/** Delay after changing filters before fetching (avoids a request per tap). */
const FILTER_DEBOUNCE_MS = 400;

type PersonalFilter = TransactionPersonalType | "none";

function txnTypeLabel(t: TransactionTxnType): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function personalTypeLabel(pt: TransactionPersonalType): string {
  return pt.charAt(0).toUpperCase() + pt.slice(1);
}

function moneyAbs(v: string): number {
  const n = Number(String(v ?? "0").replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

export default function TransactionBrowseScreen() {
  const now = new Date();
  const [selectedYear, setSelectedYear] = React.useState(
    String(now.getFullYear()),
  );
  const [selectedMonth, setSelectedMonth] = React.useState(
    String(now.getMonth() + 1).padStart(2, "0"),
  );
  const [dateAll, setDateAll] = React.useState(false);
  const [yearOnly, setYearOnly] = React.useState(false);

  const [txnTypeOn, setTxnTypeOn] = React.useState<
    Record<TransactionTxnType, boolean>
  >({
    income: true,
    expense: true,
    transfer: true,
  });

  const [filterPersonId, setFilterPersonId] = React.useState<string | null>(
    null,
  );
  /** Selected category filters (OR): `"none"` = uncategorized, else category id string. */
  const [filterCategoryIds, setFilterCategoryIds] = React.useState<string[]>([]);
  const [filterPersonal, setFilterPersonal] = React.useState<PersonalFilter[]>(
    [],
  );

  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [people, setPeople] = React.useState<People[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [metaLoaded, setMetaLoaded] = React.useState(false);

  const [txns, setTxns] = React.useState<Transaction[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const [isPersonPickerOpen, setIsPersonPickerOpen] = React.useState(false);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = React.useState(false);

  /** Totals for the current filter (full list, not only this page); set when load succeeds. */
  const [listSummary, setListSummary] = React.useState<{
    total_flow: string;
    totals_by_txn_type: TotalsByTxnType;
  } | null>(null);

  const selectedTxnTypes = React.useMemo(
    () => TRANSACTION_TXN_TYPES.filter((t) => txnTypeOn[t]),
    [txnTypeOn],
  );

  const filterKey = React.useMemo(
    () =>
      JSON.stringify({
        dateAll,
        yearOnly,
        selectedYear,
        selectedMonth,
        types: selectedTxnTypes,
        person: filterPersonId,
        categories: [...filterCategoryIds].sort(),
        personal: [...filterPersonal].sort(),
      }),
    [
      dateAll,
      yearOnly,
      selectedYear,
      selectedMonth,
      selectedTxnTypes,
      filterPersonId,
      filterCategoryIds,
      filterPersonal,
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

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [a, p, c] = await Promise.all([
          listAccounts(),
          listPeoples(),
          listCategories(),
        ]);
        if (cancelled) return;
        setAccounts(a);
        setPeople(p);
        setCategories(c);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setMetaLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = React.useCallback(
    async (opts: { showSpinner?: boolean }) => {
      if (selectedTxnTypes.length === 0) {
        Alert.alert(
          "Txn type",
          "Select at least one of Income, Expense, or Transfer.",
        );
        return;
      }
      if (opts.showSpinner !== false) setIsLoading(true);
      try {
        const params: Parameters<typeof listTransactionsAllPages>[0] = {
          txn_types: selectedTxnTypes,
        };
        if (!dateAll) {
          params.year = selectedYear;
          if (!yearOnly) params.month = selectedMonth;
        }
        if (filterPersonId) {
          params.person = filterPersonId;
        }
        if (filterCategoryIds.length > 0) {
          params.categories = filterCategoryIds.map((id) =>
            id === "none" ? "none" : id,
          );
        }
        if (filterPersonal.length > 0) {
          params.personal_types = filterPersonal;
        }

        const res = await listTransactionsAllPages(params);
        setTxns(res.results);
        setTotalCount(res.count);
        setListSummary({
          total_flow: res.total_flow,
          totals_by_txn_type: res.totals_by_txn_type,
        });
      } catch (err: any) {
        const message =
          err?.response?.data?.detail ??
          err?.response?.data?.message ??
          err?.message ??
          "Failed to load.";
        Alert.alert("Error", String(message));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [
      selectedTxnTypes,
      dateAll,
      yearOnly,
      selectedYear,
      selectedMonth,
      filterPersonId,
      filterCategoryIds,
      filterPersonal,
    ],
  );

  React.useEffect(() => {
    if (!metaLoaded) return;
    const id = setTimeout(() => {
      void load({ showSpinner: true });
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [metaLoaded, filterKey, load]);

  function toggleTxnType(t: TransactionTxnType) {
    setTxnTypeOn((prev) => ({ ...prev, [t]: !prev[t] }));
  }

  function togglePersonal(pt: PersonalFilter) {
    setFilterPersonal((prev) =>
      prev.includes(pt) ? prev.filter((x) => x !== pt) : [...prev, pt],
    );
  }

  async function onRefresh() {
    setIsRefreshing(true);
    await load({ showSpinner: false });
  }

  function toggleCategoryFilter(id: string | "none") {
    const key = id === "none" ? "none" : String(id);
    setFilterCategoryIds((prev) => {
      const next = prev.includes(key)
        ? prev.filter((x) => x !== key)
        : [...prev, key];
      return [...next].sort((a, b) => a.localeCompare(b));
    });
  }

  const personLabel =
    filterPersonId == null
      ? "Anyone"
      : (peopleById.get(String(filterPersonId))?.name ?? "—");
  const categoryLabel = React.useMemo(() => {
    if (filterCategoryIds.length === 0) return "Any";
    if (filterCategoryIds.length === 1) {
      const only = filterCategoryIds[0];
      if (only === "none") return "Uncategorized";
      return categoryById.get(String(only))?.name ?? "—";
    }
    return `${filterCategoryIds.length} categories`;
  }, [filterCategoryIds, categoryById]);

  const txnsByYearMonth = React.useMemo(
    () => groupLedgerRowsByYearMonth(txns),
    [txns],
  );
  const summaryCards = React.useMemo(() => {
    if (!listSummary) return [];
    const cards = [
      {
        key: "income",
        label: "Income",
        value: listSummary.totals_by_txn_type.income,
        valueStyle: styles.summaryIncome,
      },
      {
        key: "expense",
        label: "Expense",
        value: listSummary.totals_by_txn_type.expense,
        valueStyle: styles.summaryExpense,
      },
      {
        key: "transfer",
        label: "Transfer",
        value: listSummary.totals_by_txn_type.transfer,
      },
      {
        key: "all",
        label: "All",
        value: listSummary.total_flow,
        dark: true,
      },
    ];
    return cards.filter((c) => moneyAbs(c.value) > 0);
  }, [listSummary]);

  return (
    <AppTabScreen>
      <View style={styles.topBar}>
        <Text style={styles.title}>Browse transactions</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLabel}>Period</Text>
        <View style={styles.row}>
          <Pressable
            onPress={() => setDateAll((v) => !v)}
            style={({ pressed }) => [
              styles.chip,
              dateAll && styles.chipOn,
              pressed && styles.chipPressed,
            ]}
          >
            <Text style={[styles.chipText, dateAll && styles.chipTextOn]}>
              All dates
            </Text>
          </Pressable>
          {!dateAll ? (
            <View style={styles.periodRow}>
              <Text style={styles.periodField}>{selectedYear}</Text>
              {yearOnly ? null : (
                <>
                  <Text style={styles.periodSep}>/</Text>
                  <Text style={styles.periodField}>{selectedMonth}</Text>
                </>
              )}
              <Pressable
                onPress={() => setYearOnly((v) => !v)}
                style={({ pressed }) => [
                  styles.chip,
                  yearOnly && styles.chipOn,
                  pressed && styles.chipPressed,
                ]}
              >
                <Text style={[styles.chipText, yearOnly && styles.chipTextOn]}>
                  All months
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const y = Number(selectedYear);
                  setSelectedYear(String(y - 1));
                }}
                style={styles.miniBtn}
              >
                <Text style={styles.miniBtnText}>−Y</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const y = Number(selectedYear);
                  setSelectedYear(String(y + 1));
                }}
                style={styles.miniBtn}
              >
                <Text style={styles.miniBtnText}>+Y</Text>
              </Pressable>
              {!yearOnly ? (
                <>
                  <Pressable
                    onPress={() => {
                      const m = Math.max(1, Number(selectedMonth) - 1);
                      setSelectedMonth(String(m).padStart(2, "0"));
                    }}
                    style={styles.miniBtn}
                  >
                    <Text style={styles.miniBtnText}>−M</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const m = Math.min(12, Number(selectedMonth) + 1);
                      setSelectedMonth(String(m).padStart(2, "0"));
                    }}
                    style={styles.miniBtn}
                  >
                    <Text style={styles.miniBtnText}>+M</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={() => void onRefresh()}
          disabled={isRefreshing || isLoading}
          style={styles.refreshLink}
        >
          <Text style={styles.refreshLinkText}>
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </Text>
        </Pressable>

        <View style={styles.segmentTrack}>
          {TRANSACTION_TXN_TYPES.map((t, i) => (
            <Pressable
              key={t}
              onPress={() => toggleTxnType(t)}
              style={({ pressed }) => [
                styles.segmentCell,
                i > 0 && styles.segmentCellDivider,
                txnTypeOn[t] &&
                  (t === "income"
                    ? styles.segmentOnIncome
                    : t === "expense"
                      ? styles.segmentOnExpense
                      : styles.segmentOnTransfer),
                pressed && styles.segmentPressed,
              ]}
            >
              <Text
                style={[
                  styles.segmentCellText,
                  txnTypeOn[t] && styles.segmentCellTextOn,
                ]}
              >
                {txnTypeLabel(t)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.filterBlockCard}>
          <View style={styles.personalGrid}>
            <View style={styles.personalGridRow}>
              <Pressable
                onPress={() => togglePersonal("none")}
                style={({ pressed }) => [
                  styles.personalTile,
                  filterPersonal.includes("none") && styles.personalTileOn,
                  pressed && styles.personalTilePressed,
                ]}
              >
                <Text
                  style={[
                    styles.personalTileText,
                    filterPersonal.includes("none") &&
                      styles.personalTileTextOn,
                  ]}
                >
                  No split
                </Text>
              </Pressable>
              <Pressable
                onPress={() => togglePersonal("gave")}
                style={({ pressed }) => [
                  styles.personalTile,
                  filterPersonal.includes("gave") && styles.personalTileOn,
                  pressed && styles.personalTilePressed,
                ]}
              >
                <Text
                  style={[
                    styles.personalTileText,
                    filterPersonal.includes("gave") &&
                      styles.personalTileTextOn,
                  ]}
                >
                  Gave
                </Text>
              </Pressable>
            </View>
            <View style={styles.personalGridRow}>
              <Pressable
                onPress={() => togglePersonal("got")}
                style={({ pressed }) => [
                  styles.personalTile,
                  filterPersonal.includes("got") && styles.personalTileOn,
                  pressed && styles.personalTilePressed,
                ]}
              >
                <Text
                  style={[
                    styles.personalTileText,
                    filterPersonal.includes("got") && styles.personalTileTextOn,
                  ]}
                >
                  Got
                </Text>
              </Pressable>
              <Pressable
                onPress={() => togglePersonal("settle")}
                style={({ pressed }) => [
                  styles.personalTile,
                  filterPersonal.includes("settle") && styles.personalTileOn,
                  pressed && styles.personalTilePressed,
                ]}
              >
                <Text
                  style={[
                    styles.personalTileText,
                    filterPersonal.includes("settle") &&
                      styles.personalTileTextOn,
                  ]}
                >
                  Settle
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.filterPickRow}>
          <Pressable
            onPress={() => setIsPersonPickerOpen(true)}
            style={({ pressed }) => [
              styles.filterPickCell,
              styles.fieldBtn,
              pressed && styles.fieldBtnPressed,
            ]}
          >
            <Text style={styles.fieldBtnLbl}>Person</Text>
            <Text style={styles.fieldBtnVal} numberOfLines={1}>
              {personLabel}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setIsCategoryPickerOpen(true)}
            style={({ pressed }) => [
              styles.filterPickCell,
              styles.fieldBtn,
              pressed && styles.fieldBtnPressed,
            ]}
          >
            <Text style={styles.fieldBtnLbl}>Category</Text>
            <Text style={styles.fieldBtnVal} numberOfLines={1}>
              {categoryLabel}
            </Text>
          </Pressable>
        </View>

        {summaryCards.length > 0 ? (
          <View style={styles.summaryGrid}>
            {summaryCards.map((card) => (
              <View
                key={card.key}
                style={[
                  styles.summaryCell,
                  card.dark && styles.summaryCellAll,
                ]}
              >
                <Text
                  style={[
                    styles.summaryCellLbl,
                    card.dark && styles.summaryCellLblOnDark,
                  ]}
                >
                  {card.label}
                </Text>
                <Text
                  style={[
                    card.dark ? styles.summaryCellValAll : styles.summaryCellVal,
                    !card.dark && card.valueStyle,
                  ]}
                >
                  {formatMoney2(card.value)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {isLoading && txns.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color="#0B0B0B" />
          </View>
        ) : (
          <>
            <Text style={styles.countLine}>
              {totalCount} match{totalCount === 1 ? "" : "es"} (all loaded)
            </Text>
            {txnsByYearMonth.map((yg) => (
              <View key={yg.year} style={styles.ledgerYearGroup}>
                <Text style={styles.ledgerYearHeading}>{yg.year}</Text>
                {yg.months.map((mg) => (
                  <View
                    key={`${yg.year}-${mg.month}`}
                    style={styles.ledgerMonthGroup}
                  >
                    <Text style={styles.ledgerMonthHeading}>{mg.label}</Text>
                    {mg.transactions.map((t) => {
                      const acc =
                        accountById.get(String(t.account))?.name ?? "Account";
                      const personN =
                        t.person != null && t.person !== ""
                          ? peopleById.get(String(t.person))?.name
                          : null;
                      return (
                        <View key={String(t.id)} style={styles.card}>
                          <View style={styles.cardTop}>
                            <Text style={styles.cardDate}>
                              {formatDateDDMMYY(t.txn_date)}
                            </Text>
                            <Text
                              style={[
                                styles.cardAmt,
                                t.type === "credit"
                                  ? styles.cardAmtCredit
                                  : styles.cardAmtDebit,
                              ]}
                            >
                              {formatMoney2(t.amount)}
                            </Text>
                          </View>
                          <Text style={styles.cardDesc} numberOfLines={2}>
                            {t.description || "—"}
                          </Text>
                          <View style={styles.cardMetaRow}>
                            <View style={styles.cardMetaLeft}>
                              <View
                                style={[
                                  styles.txnTypeBadge,
                                  t.txn_type === "income" &&
                                    styles.txnTypeBadgeIncome,
                                  t.txn_type === "expense" &&
                                    styles.txnTypeBadgeExpense,
                                  t.txn_type === "transfer" &&
                                    styles.txnTypeBadgeTransfer,
                                ]}
                              >
                                <Text style={styles.txnTypeBadgeText}>
                                  {txnTypeLabel(t.txn_type)}
                                </Text>
                              </View>
                              <Text style={styles.cardMeta} numberOfLines={1}>
                                {personN ? ` · ${personN}` : ""}
                                {` · ${acc}`}
                                {t.category
                                  ? ` · ${categoryById.get(String(t.category))?.name ?? "Cat"}`
                                  : ""}
                              </Text>
                            </View>
                            {t.personal_type ? (
                              <View
                                style={[
                                  styles.personalTypeBadge,
                                  t.personal_type === "gave" &&
                                    styles.personalTypeBadgeGave,
                                  t.personal_type === "got" &&
                                    styles.personalTypeBadgeGot,
                                  t.personal_type === "settle" &&
                                    styles.personalTypeBadgeSettle,
                                ]}
                              >
                                <Text style={styles.personalTypeBadgeText}>
                                  {personalTypeLabel(t.personal_type)}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
      {isLoading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0B0B0B" />
          <Text style={styles.loadingOverlayText}>Loading transactions...</Text>
        </View>
      ) : null}

      <Modal
        visible={isPersonPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsPersonPickerOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsPersonPickerOpen(false)}
        />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Person</Text>
          <ScrollView contentContainerStyle={{ gap: 8 }}>
            <Pressable
              onPress={() => {
                setFilterPersonId(null);
                setIsPersonPickerOpen(false);
              }}
              style={styles.sheetRow}
            >
              <Text style={styles.sheetRowText}>Anyone</Text>
            </Pressable>
            {people.map((p) => (
              <Pressable
                key={String(p.id)}
                onPress={() => {
                  setFilterPersonId(String(p.id));
                  setIsPersonPickerOpen(false);
                }}
                style={styles.sheetRow}
              >
                <Text style={styles.sheetRowText}>{p.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={isCategoryPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsCategoryPickerOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsCategoryPickerOpen(false)}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Categories</Text>
            <Pressable
              onPress={() => setIsCategoryPickerOpen(false)}
              style={({ pressed }) => [
                styles.sheetDoneBtn,
                pressed && styles.sheetDoneBtnPressed,
              ]}
            >
              <Text style={styles.sheetDoneText}>Done</Text>
            </Pressable>
          </View>
          <Text style={styles.sheetHint}>Tap to include/exclude (OR)</Text>
          <ScrollView contentContainerStyle={{ gap: 0 }}>
            <Pressable
              onPress={() => setFilterCategoryIds([])}
              style={({ pressed }) => [
                styles.sheetRow,
                styles.sheetRowSelectable,
                pressed && styles.sheetRowPressed,
              ]}
            >
              <Text style={styles.sheetRowText}>Any category</Text>
            </Pressable>
            <Pressable
              onPress={() => toggleCategoryFilter("none")}
              style={({ pressed }) => [
                styles.sheetRow,
                styles.sheetRowSelectable,
                pressed && styles.sheetRowPressed,
              ]}
            >
              <Text style={styles.sheetRowText}>Uncategorized</Text>
              {filterCategoryIds.includes("none") ? (
                <Feather name="check" size={18} color="#0B0B0B" />
              ) : null}
            </Pressable>
            {categories.map((c) => {
              const id = String(c.id);
              const selected = filterCategoryIds.includes(id);
              return (
                <Pressable
                  key={id}
                  onPress={() => toggleCategoryFilter(id)}
                  style={({ pressed }) => [
                    styles.sheetRow,
                    styles.sheetRowSelectable,
                    pressed && styles.sheetRowPressed,
                  ]}
                >
                  <Text style={styles.sheetRowText}>{c.name}</Text>
                  {selected ? (
                    <Feather name="check" size={18} color="#0B0B0B" />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </AppTabScreen>
  );
}

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: 16, paddingBottom: 8, gap: 4 },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "#0B0B0B",
  },
  sub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#6B6B6B",
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32, gap: 10 },
  sectionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#6B6B6B",
    marginTop: 4,
  },
  row: { gap: 8 },
  periodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  periodField: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#0B0B0B",
  },
  periodSep: { color: "#6B6B6B" },
  miniBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E7E7E7",
  },
  miniBtnText: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    color: "#0B0B0B",
  },
  filterBlockCard: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 16,
    padding: 12,
    backgroundColor: "#FFFFFF",
  },
  filterBlockSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "#8A8A8A",
    marginTop: -4,
    marginBottom: 2,
  },
  segmentTrack: {
    flexDirection: "row",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  segmentCell: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F4F4",
  },
  segmentCellDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "#D8D8D8",
  },
  segmentOnIncome: { backgroundColor: "#2E7D5A" },
  segmentOnExpense: { backgroundColor: "#B83C3C" },
  segmentOnTransfer: { backgroundColor: "#3D5A80" },
  segmentPressed: { opacity: 0.88 },
  segmentCellText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "#3A3A3A",
  },
  segmentCellTextOn: { color: "#FFFFFF" },
  personalGrid: { gap: 8 },
  personalGridRow: { flexDirection: "row", gap: 8 },
  personalTile: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: "#FAFAFA",
    alignItems: "center",
    justifyContent: "center",
  },
  personalTileOn: {
    borderColor: "#0B0B0B",
    backgroundColor: "#0B0B0B",
  },
  personalTilePressed: { opacity: 0.9 },
  personalTileText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "#2A2A2A",
  },
  personalTileTextOn: { color: "#FFFFFF" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D6D6D6",
    backgroundColor: "#FFFFFF",
  },
  chipOn: { borderColor: "#0B0B0B", backgroundColor: "#0B0B0B" },
  chipPressed: { opacity: 0.85 },
  chipText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#0B0B0B",
  },
  chipTextOn: { color: "#FFFFFF" },
  hint: { fontSize: 11, color: "#6B6B6B", fontFamily: "Poppins_400Regular" },
  filterPickRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
    width: "100%",
  },
  filterPickCell: { flex: 1, minWidth: 0 },
  fieldBtn: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#FAFAFA",
    gap: 6,
  },
  summaryCardTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: "#0B0B0B",
  },
  summaryHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "#6B6B6B",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  summaryCell: {
    minWidth: 140,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#FFFFFF",
    gap: 4,
  },
  summaryCellAll: {
    borderColor: "#0B0B0B",
    backgroundColor: "#0B0B0B",
  },
  summaryCellLbl: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: "#6B6B6B",
  },
  summaryCellLblOnDark: { color: "#D0D0D0" },
  summaryCellVal: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: "#0B0B0B",
  },
  summaryIncome: { color: "#2E7D5A" },
  summaryExpense: { color: "#B83C3C" },
  summaryCellValAll: {
    fontFamily: "Poppins_800ExtraBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  fieldBtnPressed: { backgroundColor: "#F8F8F8" },
  fieldBtnLbl: {
    fontSize: 11,
    color: "#6B6B6B",
    fontFamily: "Poppins_600SemiBold",
  },
  fieldBtnVal: {
    fontSize: 14,
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
  },
  refreshLink: { alignSelf: "center", paddingVertical: 8 },
  refreshLinkText: {
    color: "#2F4F8C",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  center: { paddingVertical: 24, alignItems: "center" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.72)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingOverlayText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#0B0B0B",
  },
  countLine: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#6B6B6B",
  },
  card: {
    borderWidth: 1,
    borderColor: "#F0F0F0",
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardDate: {
    fontSize: 12,
    color: "#6B6B6B",
    fontFamily: "Poppins_600SemiBold",
  },
  cardAmt: { fontSize: 14, fontFamily: "Poppins_700Bold" },
  cardAmtCredit: { color: "#2E7D5A" },
  cardAmtDebit: { color: "#B83C3C" },
  cardDesc: {
    fontSize: 14,
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardMetaLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardMeta: { fontSize: 11, color: "#9A9A9A", fontFamily: "Poppins_500Medium" },
  txnTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D9D9D9",
    backgroundColor: "#F5F5F5",
  },
  txnTypeBadgeIncome: {
    backgroundColor: "#E9F7EF",
    borderColor: "#B9E3C8",
  },
  txnTypeBadgeExpense: {
    backgroundColor: "#FFEAEA",
    borderColor: "#F3B8B8",
  },
  txnTypeBadgeTransfer: {
    backgroundColor: "#ECEFFE",
    borderColor: "#C9D1FB",
  },
  txnTypeBadgeText: {
    fontSize: 10,
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
  },
  personalTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D9D9D9",
    backgroundColor: "#F5F5F5",
  },
  personalTypeBadgeGave: {
    backgroundColor: "#FFEAEA",
    borderColor: "#F3B8B8",
  },
  personalTypeBadgeGot: {
    backgroundColor: "#E9F7EF",
    borderColor: "#B9E3C8",
  },
  personalTypeBadgeSettle: {
    backgroundColor: "#ECEFFE",
    borderColor: "#C9D1FB",
  },
  personalTypeBadgeText: {
    fontSize: 10,
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
  },
  ledgerYearGroup: {
    marginBottom: 8,
  },
  ledgerYearHeading: {
    color: "#0B0B0B",
    fontFamily: "Poppins_800ExtraBold",
    fontSize: 22,
    marginTop: 4,
    marginBottom: 4,
  },
  ledgerMonthGroup: {
    marginBottom: 10,
  },
  ledgerMonthHeading: {
    color: "#6B6B6B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#E7E7E7",
    marginBottom: 4,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    left: 16,
    right: 16,
    top: "15%",
    maxHeight: "70%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sheetTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: "#0B0B0B",
  },
  sheetDoneBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  sheetDoneBtnPressed: { opacity: 0.75 },
  sheetDoneText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#2F4F8C",
  },
  sheetHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "#8A8A8A",
    marginBottom: 8,
  },
  sheetRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  sheetRowSelectable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sheetRowPressed: { backgroundColor: "#F8F8F8" },
  sheetRowText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#0B0B0B",
  },
});
