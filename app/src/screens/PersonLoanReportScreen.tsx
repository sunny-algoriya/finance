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

import AppTabScreen from "../components/AppTabScreen";
import type { AppTabParamList } from "../navigation/AppNavigator";
import { listAccounts, type Account } from "../services/accounts";
import {
  getPersonLoanReport,
  PERSONAL_TYPES,
  type PersonLoanReport,
  type PersonalType,
} from "../services/peoples";
import { formatMoney2 } from "../utils/money";

const TYPE_LABEL: Record<PersonalType, string> = {
  gave: "You gave / lent",
  got: "You got / borrowed",
  settle: "Settle",
};

export default function PersonLoanReportScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AppTabParamList, "PersonLoanReport">>();
  const route = useRoute<RouteProp<AppTabParamList, "PersonLoanReport">>();
  const { personId, personName } = route.params;

  const [report, setReport] = React.useState<PersonLoanReport | null>(null);
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const [year, setYear] = React.useState("");
  const [month, setMonth] = React.useState("");
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [selectedTypes, setSelectedTypes] = React.useState<PersonalType[]>([
    ...PERSONAL_TYPES,
  ]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [accRes, loanRes] = await Promise.all([
        listAccounts(),
        getPersonLoanReport(personId, {
          ...(year.trim() ? { year: year.trim() } : {}),
          ...(month.trim() ? { month: month.trim() } : {}),
          ...(accountId ? { account: accountId } : {}),
          ...(selectedTypes.length === PERSONAL_TYPES.length
            ? {}
            : { types: selectedTypes }),
        }),
      ]);
      setAccounts(accRes);
      setReport(loanRes);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to load loan report.";
      Alert.alert("Error", String(message));
    } finally {
      setIsLoading(false);
    }
  }

  React.useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleType(type: PersonalType) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function clearFilters() {
    setYear("");
    setMonth("");
    setAccountId(null);
    setSelectedTypes([...PERSONAL_TYPES]);
  }

  const accountName =
    accountId != null
      ? accounts.find((a) => String(a.id) === String(accountId))?.name
      : "All accounts";
  const displayName = report?.person?.name || personName || "Person";

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
          Loan Report
        </Text>
        <View style={styles.topBarSpacer} />
      </View>

      <Text style={styles.personName}>{displayName}</Text>

      <View style={styles.filterCard}>
        <View style={styles.filterRow}>
          <View style={styles.filterField}>
            <Text style={styles.filterFieldLbl}>Year</Text>
            <TextInput
              value={year}
              onChangeText={setYear}
              placeholder="e.g. 2025"
              placeholderTextColor="#6B6B6B"
              keyboardType="number-pad"
              style={styles.filterInput}
            />
          </View>
          <View style={styles.filterField}>
            <Text style={styles.filterFieldLbl}>Month</Text>
            <TextInput
              value={month}
              onChangeText={setMonth}
              placeholder="1-12"
              placeholderTextColor="#6B6B6B"
              keyboardType="number-pad"
              style={styles.filterInput}
            />
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.filterFieldLbl}>Account</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              <Pressable
                onPress={() => setAccountId(null)}
                style={({ pressed }) => [
                  styles.typePill,
                  accountId == null && styles.typePillActive,
                  pressed && styles.typePillPressed,
                ]}
              >
                <Text
                  style={[
                    styles.typePillText,
                    accountId == null && styles.typePillTextActive,
                  ]}
                >
                  All
                </Text>
              </Pressable>
              {accounts.map((a) => {
                const active = String(accountId) === String(a.id);
                return (
                  <Pressable
                    key={String(a.id)}
                    onPress={() => setAccountId(String(a.id))}
                    style={({ pressed }) => [
                      styles.typePill,
                      active && styles.typePillActive,
                      pressed && styles.typePillPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.typePillText,
                        active && styles.typePillTextActive,
                      ]}
                    >
                      {a.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <Text style={styles.mutedTiny}>{accountName}</Text>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.filterFieldLbl}>Types</Text>
          <View style={styles.pillRowWrap}>
            {PERSONAL_TYPES.map((t) => {
              const active = selectedTypes.includes(t);
              return (
                <Pressable
                  key={t}
                  onPress={() => toggleType(t)}
                  style={({ pressed }) => [
                    styles.typePill,
                    active && styles.typePillActive,
                    pressed && styles.typePillPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.typePillText,
                      active && styles.typePillTextActive,
                    ]}
                  >
                    {TYPE_LABEL[t]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.filterActions}>
          <Pressable
            onPress={() => {
              if (selectedTypes.length === 0) {
                Alert.alert("Validation", "Select at least one type.");
                return;
              }
              void loadData();
            }}
            style={({ pressed }) => [styles.applyBtn, pressed && styles.applyBtnPressed]}
          >
            <Text style={styles.applyBtnText}>Apply</Text>
          </Pressable>
          <Pressable
            onPress={clearFilters}
            style={({ pressed }) => [styles.clearBtn, pressed && styles.clearBtnPressed]}
          >
            <Text style={styles.clearBtnText}>Reset</Text>
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0B0B0B" />
          <Text style={styles.muted}>Loading report…</Text>
        </View>
      ) : report ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryHeading}>Balance (lifetime)</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Got − Gave − Settled</Text>
              <Text style={styles.summaryValue}>
                {formatMoney2(report.summary.balance_lifetime.balance)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Gave (debit)</Text>
              <Text style={styles.summaryValue}>
                {formatMoney2(report.summary.balance_lifetime.gave)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Got (credit)</Text>
              <Text style={styles.summaryValue}>
                {formatMoney2(report.summary.balance_lifetime.got)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Settled</Text>
              <Text style={styles.summaryValue}>
                {formatMoney2(report.summary.balance_lifetime.settled)}
              </Text>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryHeading}>Balance (period)</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Got − Gave − Settled</Text>
              <Text style={styles.summaryValue}>
                {formatMoney2(report.summary.balance_period.balance)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Gave (debit)</Text>
              <Text style={styles.summaryValue}>
                {formatMoney2(report.summary.balance_period.gave)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Got (credit)</Text>
              <Text style={styles.summaryValue}>
                {formatMoney2(report.summary.balance_period.got)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Settled</Text>
              <Text style={styles.summaryValue}>
                {formatMoney2(report.summary.balance_period.settled)}
              </Text>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryHeading}>Totals by type</Text>
            {PERSONAL_TYPES.map((t) => {
              if (!selectedTypes.includes(t)) return null;
              const row = report.summary.totals_by_type[t];
              return (
                <View key={t} style={styles.typeRow}>
                  <View>
                    <Text style={styles.typeName}>{TYPE_LABEL[t]}</Text>
                    <Text style={styles.typeSub}>
                      {row.side === "settle"
                        ? "SETTLE"
                        : row.side.toUpperCase()}{" "}
                      · {row.count} txns
                    </Text>
                  </View>
                  <Text style={styles.typeAmt}>{formatMoney2(row.sum)}</Text>
                </View>
              );
            })}
          </View>

          {PERSONAL_TYPES.map((t) => {
            if (!selectedTypes.includes(t)) return null;
            const items = report.by_type[t] ?? [];
            return (
              <View key={t} style={styles.groupCard}>
                <Text style={styles.groupTitle}>
                  {TYPE_LABEL[t]} ({items.length})
                </Text>
                {items.length === 0 ? (
                  <Text style={styles.muted}>No records.</Text>
                ) : (
                  items.map((row) => (
                    <View key={String(row.id)} style={styles.txnRow}>
                      <Text style={styles.txnDate}>{row.txn_date}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={2} style={styles.txnDesc}>
                          {row.description || "—"}
                        </Text>
                        <Text style={styles.txnMeta}>
                          {row.type.toUpperCase()} · {row.hidden ? "Hidden" : "Visible"}
                        </Text>
                      </View>
                      <Text style={styles.txnAmt}>{formatMoney2(row.amount)}</Text>
                    </View>
                  ))
                )}
              </View>
            );
          })}
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
  backBtn: { paddingVertical: 6, paddingRight: 12 },
  backBtnPressed: { opacity: 0.7 },
  backBtnText: { color: "#0B0B0B", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
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
  personName: {
    color: "#0B0B0B",
    fontFamily: "Poppins_800ExtraBold",
    fontSize: 22,
    marginBottom: 12,
  },
  filterCard: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 16,
    padding: 12,
    gap: 10,
    marginBottom: 12,
  },
  filterRow: { flexDirection: "row", gap: 10 },
  filterField: { flex: 1, gap: 4 },
  filterFieldLbl: { color: "#0B0B0B", fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  filterInput: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  pillRow: { flexDirection: "row", gap: 8 },
  pillRowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typePill: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  typePillPressed: { backgroundColor: "#F5F5F5" },
  typePillActive: { borderColor: "#0B0B0B", backgroundColor: "#0B0B0B" },
  typePillText: { color: "#0B0B0B", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  typePillTextActive: { color: "#FFFFFF" },
  mutedTiny: { color: "#6B6B6B", fontFamily: "Poppins_400Regular", fontSize: 11 },
  filterActions: { flexDirection: "row", gap: 10 },
  applyBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#0B0B0B",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  applyBtnPressed: { opacity: 0.88 },
  applyBtnText: { color: "#FFFFFF", fontFamily: "Poppins_700Bold", fontSize: 13 },
  clearBtn: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  clearBtnPressed: { backgroundColor: "#F5F5F5" },
  clearBtnText: { color: "#0B0B0B", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  muted: { color: "#6B6B6B", fontFamily: "Poppins_400Regular" },
  scrollContent: { paddingBottom: 24, gap: 12 },
  summaryCard: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  summaryHeading: { color: "#0B0B0B", fontFamily: "Poppins_700Bold", fontSize: 14 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { color: "#6B6B6B", fontFamily: "Poppins_400Regular", fontSize: 12 },
  summaryValue: { color: "#0B0B0B", fontFamily: "Poppins_700Bold", fontSize: 13 },
  typeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  typeName: { color: "#0B0B0B", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  typeSub: { color: "#6B6B6B", fontFamily: "Poppins_400Regular", fontSize: 11 },
  typeAmt: { color: "#0B0B0B", fontFamily: "Poppins_700Bold", fontSize: 13 },
  groupCard: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  groupTitle: { color: "#0B0B0B", fontFamily: "Poppins_700Bold", fontSize: 13 },
  txnRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F2",
    paddingBottom: 8,
    marginBottom: 2,
  },
  txnDate: { width: 86, color: "#0B0B0B", fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  txnDesc: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 12 },
  txnMeta: { color: "#6B6B6B", fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 2 },
  txnAmt: { color: "#0B0B0B", fontFamily: "Poppins_700Bold", fontSize: 12, width: 76, textAlign: "right" },
});

