import React from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import AppTabScreen from "../components/AppTabScreen";
import type { AppTabParamList } from "../navigation/AppNavigator";
import {
  deleteTransaction,
  listSelfTransfers,
  type SelfTransferPair,
} from "../services/transactions";
import { formatMoney2 } from "../utils/money";

function pairKey(row: SelfTransferPair, index: number): string {
  const d = row.debit_transaction.id;
  const c = row.credit_transaction.id;
  if (d !== "" && c !== "") return `${String(d)}-${String(c)}`;
  return `${row.txn_date}-${index}`;
}

export default function SelfTransferScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AppTabParamList>>();

  const [rows, setRows] = React.useState<SelfTransferPair[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [hasNext, setHasNext] = React.useState(false);
  const [hasPrev, setHasPrev] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  /** Prevents double submits; value is `${pairKey}:debit|:credit|:both`. */
  const [deletingRef, setDeletingRef] = React.useState<string | null>(null);

  const load = React.useCallback(async (pageNum: number, showLoading: boolean) => {
    if (showLoading) setIsLoading(true);
    try {
      const res = await listSelfTransfers({ page: pageNum });
      setRows(res.results);
      setTotalCount(res.count);
      setHasNext(Boolean(res.next));
      setHasPrev(Boolean(res.previous));
      setPage(pageNum);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to load self-transfers.";
      Alert.alert("Error", String(message));
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(1, true);
  }, [load]);

  async function onRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await load(page, false);
    } finally {
      setIsRefreshing(false);
    }
  }

  function goEditTransaction(id: string | number) {
    if (id === "" || id === null) return;
    navigation.navigate("Transactions", { openEditTransactionId: id });
  }

  async function runDelete(
    busyKey: string,
    work: () => Promise<void>,
  ): Promise<void> {
    if (deletingRef) return;
    setDeletingRef(busyKey);
    try {
      await work();
      await load(page, false);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to delete.";
      Alert.alert("Error", String(message));
    } finally {
      setDeletingRef(null);
    }
  }

  return (
    <AppTabScreen>
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.kicker}>SplitApp</Text>
          <Text style={styles.title}>Self transfers</Text>
          <Text style={styles.subtitle}>
            Between your own accounts (paired debit / credit).
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onRefresh}
        style={({ pressed }) => [
          styles.refreshRow,
          pressed && styles.refreshRowPressed,
        ]}
      >
        <Text style={styles.refreshText}>
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </Text>
      </Pressable>

      {!isLoading && totalCount > 0 && (hasNext || hasPrev) ? (
        <View style={styles.pagerStrip}>
          <Text style={styles.pagerCount} numberOfLines={1}>
            {totalCount === 1 ? "1 pair" : `${totalCount} pairs`}
          </Text>
          <View style={styles.pagerBtns}>
            <Pressable
              onPress={() => hasPrev && void load(page - 1, true)}
              disabled={!hasPrev}
              style={({ pressed }) => [
                styles.pagerIconBtn,
                pressed && hasPrev && styles.pagerIconBtnPressed,
                !hasPrev && styles.pagerIconBtnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Previous page"
            >
              <Feather
                name="chevron-left"
                size={20}
                color={hasPrev ? "#0B0B0B" : "#C8C8C8"}
              />
            </Pressable>
            <Text style={styles.pagerPageText}>{page}</Text>
            <Pressable
              onPress={() => hasNext && void load(page + 1, true)}
              disabled={!hasNext}
              style={({ pressed }) => [
                styles.pagerIconBtn,
                pressed && hasNext && styles.pagerIconBtnPressed,
                !hasNext && styles.pagerIconBtnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Next page"
            >
              <Feather
                name="chevron-right"
                size={20}
                color={hasNext ? "#0B0B0B" : "#C8C8C8"}
              />
            </Pressable>
          </View>
        </View>
      ) : !isLoading && totalCount > 0 ? (
        <Text style={styles.metaLine}>
          {totalCount === 1 ? "1 transfer pair" : `${totalCount} transfer pairs`}
        </Text>
      ) : null}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0B0B0B" />
          <Text style={styles.muted}>Loading self-transfers…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No self-transfers found</Text>
              <Text style={styles.muted}>
                Transfers between your accounts will appear here when available.
              </Text>
            </View>
          ) : (
            rows.map((row, index) => {
              const pk = pairKey(row, index);
              const debitId = row.debit_transaction.id;
              const creditId = row.credit_transaction.id;
              const busyDebit = deletingRef === `${pk}:debit`;
              const busyCredit = deletingRef === `${pk}:credit`;
              const busyBoth = deletingRef === `${pk}:both`;
              const busy = busyDebit || busyCredit || busyBoth;

              return (
                <View key={pk} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardDate}>{row.txn_date}</Text>
                    <Text style={styles.cardAmount}>
                      {formatMoney2(row.amount)}
                    </Text>
                  </View>
                  <View style={styles.routeRow}>
                    <View style={styles.routeCol}>
                      <Text style={styles.routeLabel}>From</Text>
                      <Text style={styles.routeName} numberOfLines={2}>
                        {row.from_account_name}
                      </Text>
                    </View>
                    <Feather
                      name="arrow-right"
                      size={18}
                      color="#6B6B6B"
                      style={styles.routeArrow}
                    />
                    <View style={styles.routeCol}>
                      <Text style={styles.routeLabel}>To</Text>
                      <Text style={styles.routeName} numberOfLines={2}>
                        {row.to_account_name}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.detailBlock}>
                    <View style={styles.detailLabelRow}>
                      <Text style={styles.detailLabel}>Debit side</Text>
                      <View style={styles.detailActions}>
                        <Pressable
                          onPress={() => {
                            if (debitId === "" || busy) return;
                            goEditTransaction(debitId);
                          }}
                          disabled={debitId === "" || busy}
                          style={({ pressed }) => [
                            styles.inlineEditBtn,
                            (pressed || busy) && styles.inlineEditBtnPressed,
                            (debitId === "" || busy) &&
                              styles.inlineEditBtnDisabled,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel="Edit debit transaction"
                        >
                          <Feather name="edit-2" size={14} color="#0B0B0B" />
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            if (debitId === "" || busy) return;
                            Alert.alert(
                              "Delete debit transaction?",
                              `Remove only the debit on ${row.from_account_name}. The paired credit will remain.`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Delete",
                                  style: "destructive",
                                  onPress: () =>
                                    void runDelete(`${pk}:debit`, () =>
                                      deleteTransaction(debitId),
                                    ),
                                },
                              ],
                            );
                          }}
                          disabled={debitId === "" || busy}
                          style={({ pressed }) => [
                            styles.inlineDeleteBtn,
                            (pressed || busy) && styles.inlineDeleteBtnPressed,
                            (debitId === "" || busy) &&
                              styles.inlineDeleteBtnDisabled,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel="Delete debit transaction"
                        >
                          {busyDebit ? (
                            <ActivityIndicator color="#B83C3C" size="small" />
                          ) : (
                            <Feather name="trash-2" size={14} color="#B83C3C" />
                          )}
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.detailDesc} numberOfLines={3}>
                      {row.debit_transaction.description || "—"}
                    </Text>
                  </View>
                  <View style={styles.detailBlock}>
                    <View style={styles.detailLabelRow}>
                      <Text style={styles.detailLabel}>Credit side</Text>
                      <View style={styles.detailActions}>
                        <Pressable
                          onPress={() => {
                            if (creditId === "" || busy) return;
                            goEditTransaction(creditId);
                          }}
                          disabled={creditId === "" || busy}
                          style={({ pressed }) => [
                            styles.inlineEditBtn,
                            (pressed || busy) && styles.inlineEditBtnPressed,
                            (creditId === "" || busy) &&
                              styles.inlineEditBtnDisabled,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel="Edit credit transaction"
                        >
                          <Feather name="edit-2" size={14} color="#0B0B0B" />
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            if (creditId === "" || busy) return;
                            Alert.alert(
                              "Delete credit transaction?",
                              `Remove only the credit on ${row.to_account_name}. The paired debit will remain.`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Delete",
                                  style: "destructive",
                                  onPress: () =>
                                    void runDelete(`${pk}:credit`, () =>
                                      deleteTransaction(creditId),
                                    ),
                                },
                              ],
                            );
                          }}
                          disabled={creditId === "" || busy}
                          style={({ pressed }) => [
                            styles.inlineDeleteBtn,
                            (pressed || busy) && styles.inlineDeleteBtnPressed,
                            (creditId === "" || busy) &&
                              styles.inlineDeleteBtnDisabled,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel="Delete credit transaction"
                        >
                          {busyCredit ? (
                            <ActivityIndicator color="#B83C3C" size="small" />
                          ) : (
                            <Feather name="trash-2" size={14} color="#B83C3C" />
                          )}
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.detailDesc} numberOfLines={3}>
                      {row.credit_transaction.description || "—"}
                    </Text>
                  </View>
                  <View style={styles.cardActions}>
                    <Pressable
                      onPress={() => {
                        if (debitId === "" || creditId === "" || busy) return;
                        Alert.alert(
                          "Delete both transactions?",
                          "This removes the debit and the credit for this transfer.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete both",
                              style: "destructive",
                              onPress: () =>
                                void runDelete(`${pk}:both`, async () => {
                                  await deleteTransaction(debitId);
                                  await deleteTransaction(creditId);
                                }),
                            },
                          ],
                        );
                      }}
                      disabled={debitId === "" || creditId === "" || busy}
                      style={({ pressed }) => [
                        styles.deleteBothBtn,
                        (pressed || busyBoth) && styles.deleteBothBtnPressed,
                        (debitId === "" || creditId === "" || busy) &&
                          styles.deleteBothBtnDisabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Delete both transactions"
                    >
                      {busyBoth ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.deleteBothText}>Delete both</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </AppTabScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  kicker: {
    color: "#6B6B6B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: {
    color: "#0B0B0B",
    fontFamily: "Poppins_800ExtraBold",
    fontSize: 24,
    marginTop: 2,
  },
  subtitle: {
    color: "#6B6B6B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 4,
  },
  muted: { color: "#6B6B6B", fontFamily: "Poppins_400Regular" },
  refreshRow: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  refreshRowPressed: { backgroundColor: "#F5F5F5" },
  refreshText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  metaLine: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: "#6B6B6B",
    marginBottom: 10,
  },
  pagerStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  pagerCount: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: "#6B6B6B",
  },
  pagerBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pagerIconBtn: {
    padding: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    backgroundColor: "#FFFFFF",
  },
  pagerIconBtnPressed: { backgroundColor: "#F0F0F0" },
  pagerIconBtnDisabled: { opacity: 0.55 },
  pagerPageText: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: "#0B0B0B",
    minWidth: 24,
    textAlign: "center",
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  list: { gap: 10, paddingBottom: 12 },
  empty: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: "Poppins_700Bold",
    color: "#0B0B0B",
  },
  card: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#FFFFFF",
    gap: 10,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardDate: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: "#0B0B0B",
  },
  cardAmount: {
    fontSize: 16,
    fontFamily: "Poppins_800ExtraBold",
    color: "#0B0B0B",
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  routeCol: { flex: 1, minWidth: 0 },
  routeLabel: {
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    color: "#9A9A9A",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  routeName: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: "#0B0B0B",
  },
  routeArrow: { marginTop: 12 },
  detailBlock: { gap: 4 },
  detailLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  detailActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    color: "#6B6B6B",
  },
  inlineEditBtn: {
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    backgroundColor: "#FFFFFF",
  },
  inlineEditBtnPressed: { backgroundColor: "#F5F5F5" },
  inlineEditBtnDisabled: { opacity: 0.45 },
  inlineDeleteBtn: {
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F0C4C4",
    backgroundColor: "#FFFBFB",
  },
  inlineDeleteBtnPressed: { backgroundColor: "#FCE8E8" },
  inlineDeleteBtnDisabled: { opacity: 0.45 },
  detailDesc: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: "#0B0B0B",
    lineHeight: 18,
  },
  cardActions: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#EFEFEF",
  },
  deleteBothBtn: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#0B0B0B",
    minHeight: 40,
  },
  deleteBothBtnPressed: { opacity: 0.88 },
  deleteBothBtnDisabled: { opacity: 0.45 },
  deleteBothText: {
    color: "#FFFFFF",
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
  },
});
