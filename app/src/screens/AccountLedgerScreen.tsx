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
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Svg, { Circle, Path } from "react-native-svg";

import AppTabScreen from "../components/AppTabScreen";
import type { AppTabParamList } from "../navigation/AppNavigator";
import {
  getAccountLedger,
  type AccountLedger,
  type AccountLedgerRow,
} from "../services/accounts";
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

function LedgerRow({ row }: { row: AccountLedgerRow }) {
  const isCredit = row.type === "credit";
  const sub =
    row.person_name.trim() ||
    row.account_name.trim() ||
    "—";
  return (
    <View style={styles.tableRow}>
      <Text style={styles.cellDate}>{row.txn_date}</Text>
      <View style={styles.cellDescWrap}>
        <Text style={styles.cellDesc} numberOfLines={2}>
          {row.description || "—"}
        </Text>
        <Text style={styles.cellAccount} numberOfLines={1}>
          {sub}
        </Text>
      </View>
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

  const displayName = ledger?.account_name || nameFromRoute || "Account";
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
        <View style={styles.topBarSpacer} />
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

          <Text style={styles.tableTitle}>Transactions</Text>
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.thDate]}>Date</Text>
            <Text style={[styles.th, styles.thDesc]}>Description / Person</Text>
            <Text style={[styles.th, styles.thAmt]}>Amount</Text>
          </View>
          {ledger.transactions.length === 0 ? (
            <View style={styles.emptyTable}>
              <Text style={styles.muted}>No rows for this filter.</Text>
            </View>
          ) : (
            ledger.transactions.map((row) => <LedgerRow key={String(row.id)} row={row} />)
          )}
        </ScrollView>
      ) : null}
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
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    color: "#6B6B6B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  topBarSpacer: { width: 64 },
  heroTitle: {
    color: "#0B0B0B",
    fontFamily: "Poppins_800ExtraBold",
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
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },
  filterInput: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontFamily: "Poppins_600SemiBold",
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
  applyBtnText: { color: "#FFFFFF", fontFamily: "Poppins_700Bold", fontSize: 13 },
  clearBtn: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  clearBtnPressed: { backgroundColor: "#F5F5F5" },
  clearBtnText: { color: "#0B0B0B", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
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
  summaryValue: { color: "#0B0B0B", fontFamily: "Poppins_700Bold", fontSize: 14 },
  chartCard: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  chartTitle: {
    color: "#0B0B0B",
    fontFamily: "Poppins_700Bold",
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
  tableTitle: {
    color: "#0B0B0B",
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    marginTop: 4,
  },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E7E7E7",
    paddingBottom: 8,
    gap: 8,
  },
  th: { color: "#6B6B6B", fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  thDate: { width: 92 },
  thDesc: { flex: 1 },
  thAmt: { width: 88, textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    gap: 8,
  },
  cellDate: {
    width: 92,
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  cellDescWrap: { flex: 1, gap: 4 },
  cellDesc: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 12 },
  cellAccount: { color: "#6B6B6B", fontFamily: "Poppins_400Regular", fontSize: 11 },
  cellMoney: {
    width: 88,
    textAlign: "right",
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
  },
  creditText: { color: "#2E7D5A" },
  debitText: { color: "#B83C3C" },
  emptyTable: {
    paddingVertical: 20,
    alignItems: "center",
  },
});
