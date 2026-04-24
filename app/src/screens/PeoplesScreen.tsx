import React from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import AppTabScreen from "../components/AppTabScreen";
import type { AppTabParamList } from "../navigation/AppNavigator";
import {
  type People,
  createPeople,
  deletePeople,
  type PeopleListSummary,
  listPeoples,
  listPeoplesWithSummary,
  patchPeople,
} from "../services/peoples";

type EditState = { mode: "create" } | { mode: "edit"; people: People };

export default function PeoplesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AppTabParamList, "Peoples">>();

  const [items, setItems] = React.useState<People[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [isSearching, setIsSearching] = React.useState(false);
  const [listSummary, setListSummary] = React.useState<PeopleListSummary | null>(null);

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editState, setEditState] = React.useState<EditState>({
    mode: "create",
  });
  const [name, setName] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const latestRequestId = React.useRef(0);

  async function load(query: string) {
    const requestId = ++latestRequestId.current;
    const res = await listPeoplesWithSummary({ search: query });
    if (requestId !== latestRequestId.current) return;
    setItems(res.results);
    setListSummary(res.summary);
  }

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await load("");
      } catch (err: any) {
        const message =
          err?.response?.data?.detail ??
          err?.response?.data?.message ??
          err?.message ??
          "Failed to load people.";
        if (mounted) Alert.alert("Error", String(message));
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (isLoading) return;

    setIsSearching(true);
    const handle = setTimeout(async () => {
      try {
        await load(search);
      } catch (err: any) {
        const message =
          err?.response?.data?.detail ??
          err?.response?.data?.message ??
          err?.message ??
          "Search failed.";
        Alert.alert("Error", String(message));
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(handle);
  }, [search, isLoading]);

  async function onRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await load(search);
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

  function openCreate() {
    setEditState({ mode: "create" });
    setName("");
    setIsModalOpen(true);
  }

  function openEdit(people: People) {
    setEditState({ mode: "edit", people });
    setName(people.name);
    setIsModalOpen(true);
  }

  async function onSave() {
    if (isSaving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Validation", "Name is required.");
      return;
    }

    setIsSaving(true);
    try {
      if (editState.mode === "create") {
        const created = await createPeople({ name: trimmed });
        setItems((prev) => [created, ...prev]);
      } else {
        const updated = await patchPeople(editState.people.id, {
          name: trimmed,
        });
        setItems((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p)),
        );
      }
      setIsModalOpen(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to save.";
      Alert.alert("Error", String(message));
    } finally {
      setIsSaving(false);
    }
  }

  async function onDelete(people: People) {
    Alert.alert("Delete person?", `This will delete "${people.name}".`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePeople(people.id);
            setItems((prev) => prev.filter((p) => p.id !== people.id));
          } catch (err: any) {
            const message =
              err?.response?.data?.detail ??
              err?.response?.data?.message ??
              err?.message ??
              "Failed to delete.";
            Alert.alert("Error", String(message));
          }
        },
      },
    ]);
  }

  return (
    <AppTabScreen>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>SplitApp</Text>
          <Text style={styles.title}>People</Text>
        </View>
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

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search people…"
          placeholderTextColor="#6B6B6B"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <View style={styles.searchMeta}>
          <Text style={styles.searchMetaText}>
            {isSearching ? "Searching…" : " "}
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

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0B0B0B" />
          <Text style={styles.muted}>Loading people…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {listSummary ? (
            <View style={styles.overallSummaryBox}>
              <Text style={styles.overallSummaryTitle}>
                Overall ({listSummary.people_count})
              </Text>
              <View style={styles.overallSummaryGrid}>
                <View style={[styles.overallSummaryCell, styles.overallSummaryCellRight]}>
                  <Text style={styles.overallSummaryLabel}>Balance</Text>
                  <Text style={styles.overallSummaryValue}>{listSummary.balance}</Text>
                </View>
                <View style={[styles.overallSummaryCell, styles.overallSummaryCellRight]}>
                  <Text style={styles.overallSummaryLabel}>Gave</Text>
                  <Text style={styles.overallSummaryValue}>{listSummary.gave}</Text>
                </View>
                <View style={[styles.overallSummaryCell, styles.overallSummaryCellRight]}>
                  <Text style={styles.overallSummaryLabel}>Got</Text>
                  <Text style={styles.overallSummaryValue}>{listSummary.got}</Text>
                </View>
                <View style={styles.overallSummaryCell}>
                  <Text style={styles.overallSummaryLabel}>Settled</Text>
                  <Text style={styles.overallSummaryValue}>{listSummary.settled}</Text>
                </View>
              </View>
            </View>
          ) : null}
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No people yet</Text>
              <Text style={styles.muted}>
                Tap Add to create your first person.
              </Text>
            </View>
          ) : (
            items.map((p) => (
              <View key={String(p.id)} style={styles.peopleTable}>
                <View style={styles.tableRow}>
                  <Text style={styles.personName}>{p.name}</Text>
                  <View style={styles.rowIconActions}>
                    <Pressable
                      onPress={() => openEdit(p)}
                      style={({ pressed }) => [
                        styles.iconBtn,
                        pressed && styles.iconBtnPressed,
                      ]}
                    >
                      <Text style={styles.iconText}>✏️</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onDelete(p)}
                      style={({ pressed }) => [
                        styles.iconBtnDanger,
                        pressed && styles.iconBtnDangerPressed,
                      ]}
                    >
                      <Text style={styles.iconText}>🗑️</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        navigation.navigate("PersonLedger", {
                          personId: p.id,
                          personName: p.name,
                        })
                      }
                      style={({ pressed }) => [
                        styles.iconBtn,
                        pressed && styles.iconBtnPressed,
                      ]}
                    >
                      <Text style={styles.iconText}>📒</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.tableRow}>
                  <View style={[styles.metricCell, styles.metricCellRight]}>
                    <Text style={styles.metricLabel}>Balance</Text>
                    <Text style={styles.metricValue}>
                      {p.personal_summary?.balance ?? "-"}
                    </Text>
                  </View>
                  <View style={[styles.metricCell, styles.metricCellRight]}>
                    <Text style={styles.metricLabel}>Credit</Text>
                    <Text style={styles.metricValue}>
                      {p.personal_summary?.gave ?? "-"}
                    </Text>
                  </View>
                  <View style={[styles.metricCell, styles.metricCellRight]}>
                    <Text style={styles.metricLabel}>Debit</Text>
                    <Text style={styles.metricValue}>
                      {p.personal_summary?.got ?? "-"}
                    </Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={styles.metricLabel}>Settled</Text>
                    <Text style={styles.metricValue}>
                      {p.personal_summary?.settled ?? "-"}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal
        visible={isModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => (isSaving ? null : setIsModalOpen(false))}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => (isSaving ? null : setIsModalOpen(false))}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {editState.mode === "create" ? "Add person" : "Edit person"}
            </Text>
            <Pressable
              onPress={() => setIsModalOpen(false)}
              disabled={isSaving}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && styles.closeBtnPressed,
                isSaving && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>

          <View style={{ gap: 10 }}>
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Alex"
                placeholderTextColor="#6B6B6B"
                editable={!isSaving}
              />
            </View>

            <Pressable
              onPress={onSave}
              disabled={isSaving}
              style={({ pressed }) => [
                styles.saveBtn,
                (pressed || isSaving) && styles.saveBtnPressed,
              ]}
            >
              <Text style={styles.saveBtnText}>
                {isSaving ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </AppTabScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  kicker: {
    color: "#6B6B6B",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: { color: "#0B0B0B", fontSize: 24, fontFamily: "Poppins_400Regular" },
  muted: { color: "#6B6B6B", fontFamily: "Poppins_400Regular" },
  addBtn: {
    backgroundColor: "#0B0B0B",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnPressed: { opacity: 0.88 },
  addBtnText: { color: "#FFFFFF", fontFamily: "Poppins_400Regular", fontSize: 13 },
  searchWrap: { marginBottom: 12, gap: 6 },
  searchInput: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
  searchMeta: { minHeight: 16 },
  searchMetaText: {
    color: "#6B6B6B",
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
  },
  refreshRow: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  refreshRowPressed: { backgroundColor: "#F5F5F5" },
  refreshText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
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
  emptyTitle: { fontSize: 14, fontFamily: "Poppins_400Regular", color: "#0B0B0B" },
  overallSummaryBox: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  overallSummaryTitle: {
    borderBottomWidth: 1,
    borderBottomColor: "#E7E7E7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#0B0B0B",
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  overallSummaryGrid: {
    flexDirection: "row",
  },
  overallSummaryCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 2,
  },
  overallSummaryCellRight: {
    borderRightWidth: 1,
    borderRightColor: "#E7E7E7",
  },
  overallSummaryLabel: {
    color: "#6B6B6B",
    fontSize: 10,
    fontFamily: "Poppins_400Regular",
  },
  overallSummaryValue: {
    color: "#0B0B0B",
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  peopleTable: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  tableRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#E7E7E7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tableRowActions: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  personName: {
    color: "#0B0B0B",
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    flex: 1,
  },
  rowIconActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 10,
  },
  metricCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  metricCellRight: {
    borderRightWidth: 1,
    borderRightColor: "#E7E7E7",
  },
  metricLabel: {
    color: "#6B6B6B",
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
  },
  metricValue: {
    color: "#0B0B0B",
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  iconBtn: {
    borderWidth: 1,
    borderColor: "#E3E3E3",
    borderRadius: 8,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  iconBtnPressed: { backgroundColor: "#F4F4F4" },
  iconBtnDanger: {
    borderWidth: 1,
    borderColor: "#F0D0D0",
    borderRadius: 8,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7F7",
  },
  iconBtnDangerPressed: { backgroundColor: "#FFECEC" },
  iconText: { fontSize: 13 },
  smallBtnReport: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#0B0B0B",
  },
  smallBtnReportPressed: { opacity: 0.88 },
  smallBtnReportText: {
    color: "#FFFFFF",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: "#E7E7E7",
    padding: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sheetTitle: { color: "#0B0B0B", fontSize: 16, fontFamily: "Poppins_400Regular" },
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
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  label: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 12 },
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
    fontFamily: "Poppins_400Regular",
  },
});
