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
import { Feather } from "@expo/vector-icons";

import AppTabScreen from "../components/AppTabScreen";
import { listPeoples, type People } from "../services/peoples";
import {
  createSplitGroup,
  bulkAddSplitGroupTransactions,
  createSplitItem,
  deleteSplitGroup,
  deleteSplitItem,
  listDebitTransactionsForSplitGroup,
  listSplitGroupTransactionsExpanded,
  listSplitGroups,
  patchSplitGroup,
  type SplitGroupDebitTransaction,
  type SplitGroupTransactionExpanded,
  type SplitGroup,
} from "../services/splitGroups";

type EditState = { mode: "create" } | { mode: "edit"; item: SplitGroup };

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

export default function SplitGroupsScreen() {
  const [items, setItems] = React.useState<SplitGroup[]>([]);
  const [people, setPeople] = React.useState<People[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const [isTxnPickerOpen, setIsTxnPickerOpen] = React.useState(false);
  const [txnPickerGroup, setTxnPickerGroup] = React.useState<SplitGroup | null>(null);
  const [txnPickerItems, setTxnPickerItems] = React.useState<SplitGroupDebitTransaction[]>([]);
  const [txnPickerSelectedIds, setTxnPickerSelectedIds] = React.useState<
    Array<number | string>
  >([]);
  const [isTxnPickerLoading, setIsTxnPickerLoading] = React.useState(false);
  const [isTxnPickerSubmitting, setIsTxnPickerSubmitting] = React.useState(false);

  const [isGroupTxnListOpen, setIsGroupTxnListOpen] = React.useState(false);
  const [groupTxnListGroup, setGroupTxnListGroup] = React.useState<SplitGroup | null>(null);
  const [groupTxnListItems, setGroupTxnListItems] = React.useState<
    SplitGroupTransactionExpanded[]
  >([]);
  const [isGroupTxnListLoading, setIsGroupTxnListLoading] = React.useState(false);
  const [savingMemberKey, setSavingMemberKey] = React.useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isMembersPickerOpen, setIsMembersPickerOpen] = React.useState(false);
  const [editState, setEditState] = React.useState<EditState>({ mode: "create" });
  const [name, setName] = React.useState("");
  const [startDate, setStartDate] = React.useState(todayISO());
  const [endDate, setEndDate] = React.useState(todayISO());
  const [memberIds, setMemberIds] = React.useState<Array<number | string>>([]);
  const [isSaving, setIsSaving] = React.useState(false);

  const peopleById = React.useMemo(() => {
    const m = new Map<string, People>();
    for (const p of people) m.set(String(p.id), p);
    return m;
  }, [people]);

  async function load() {
    const [groupsRes, peopleRes] = await Promise.all([listSplitGroups(), listPeoples()]);
    setItems(groupsRes);
    setPeople(peopleRes);
  }

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await load();
      } catch (err: any) {
        const message =
          err?.response?.data?.detail ??
          err?.response?.data?.message ??
          err?.message ??
          "Failed to load split groups.";
        if (mounted) Alert.alert("Error", String(message));
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function onRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await load();
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
    setStartDate(todayISO());
    setEndDate(todayISO());
    setMemberIds([]);
    setIsModalOpen(true);
  }

  function openEdit(item: SplitGroup) {
    setEditState({ mode: "edit", item });
    setName(item.name);
    setStartDate(item.start_date);
    setEndDate(item.end_date);
    setMemberIds(item.members ?? []);
    setIsModalOpen(true);
  }

  function toggleMember(id: number | string) {
    setMemberIds((prev) =>
      prev.some((v) => String(v) === String(id))
        ? prev.filter((v) => String(v) !== String(id))
        : [...prev, id]
    );
  }

  function toggleTxn(id: number | string) {
    setTxnPickerSelectedIds((prev) =>
      prev.some((v) => String(v) === String(id))
        ? prev.filter((v) => String(v) !== String(id))
        : [...prev, id]
    );
  }

  async function openTxnPicker(group: SplitGroup) {
    setTxnPickerGroup(group);
    setTxnPickerItems([]);
    setTxnPickerSelectedIds([]);
    setIsTxnPickerOpen(true);
    if (isTxnPickerLoading) return;

    setIsTxnPickerLoading(true);
    try {
      const rows = await listDebitTransactionsForSplitGroup(group.id);
      setTxnPickerItems(rows);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to load transactions.";
      Alert.alert("Error", String(message));
    } finally {
      setIsTxnPickerLoading(false);
    }
  }

  async function openGroupTxnList(group: SplitGroup) {
    setGroupTxnListGroup(group);
    setGroupTxnListItems([]);
    setIsGroupTxnListOpen(true);
    if (isGroupTxnListLoading) return;

    setIsGroupTxnListLoading(true);
    try {
      const rows = await listSplitGroupTransactionsExpanded();
      const filtered = rows.filter((r) => {
        if (typeof r.group === "object" && r.group?.id !== undefined) {
          return String(r.group.id) === String(group.id);
        }
        return String(r.group) === String(group.id);
      });
      setGroupTxnListItems(filtered);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to load group transactions.";
      Alert.alert("Error", String(message));
    } finally {
      setIsGroupTxnListLoading(false);
    }
  }

  async function onSave() {
    if (isSaving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Validation", "Name is required.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
      Alert.alert("Validation", "Start date must be YYYY-MM-DD.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
      Alert.alert("Validation", "End date must be YYYY-MM-DD.");
      return;
    }
    if (memberIds.length === 0) {
      Alert.alert("Validation", "Select at least one member.");
      return;
    }

    setIsSaving(true);
    try {
      if (editState.mode === "create") {
        const created = await createSplitGroup({
          name: trimmed,
          members: memberIds,
          start_date: startDate.trim(),
          end_date: endDate.trim(),
        });
        setItems((prev) => [created, ...prev]);
      } else {
        const updated = await patchSplitGroup(editState.item.id, {
          name: trimmed,
          members: memberIds,
          start_date: startDate.trim(),
          end_date: endDate.trim(),
        });
        setItems((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      }
      setIsModalOpen(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to save split group.";
      Alert.alert("Error", String(message));
    } finally {
      setIsSaving(false);
    }
  }

  async function onDelete(item: SplitGroup) {
    Alert.alert("Delete split group?", `Delete "${item.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSplitGroup(item.id);
            setItems((prev) => prev.filter((g) => g.id !== item.id));
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
          <Text style={styles.title}>Split Groups</Text>
        </View>
        <Pressable
          onPress={openCreate}
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onRefresh}
        style={({ pressed }) => [styles.refreshRow, pressed && styles.refreshRowPressed]}
      >
        <Text style={styles.refreshText}>{isRefreshing ? "Refreshing…" : "Refresh"}</Text>
      </Pressable>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0B0B0B" />
          <Text style={styles.muted}>Loading split groups…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No split groups yet</Text>
              <Text style={styles.muted}>Tap Add to create your first split group.</Text>
            </View>
          ) : (
            items.map((g) => (
              <View key={String(g.id)} style={styles.card}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>{g.name}</Text>
                  <Pressable
                    onPress={() => openTxnPicker(g)}
                    style={({ pressed }) => [
                      styles.txnBtn,
                      pressed && styles.txnBtnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Bulk add transactions"
                  >
                    <Feather name="plus-circle" size={16} color="#0B0B0B" />
                    <Text style={styles.txnBtnText}>Bulk add</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => openGroupTxnList(g)}
                    style={({ pressed }) => [
                      styles.txnBtn,
                      pressed && styles.txnBtnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="View group transactions"
                  >
                    <Feather name="eye" size={16} color="#0B0B0B" />
                    <Text style={styles.txnBtnText}>View</Text>
                  </Pressable>
                </View>
                <Text style={styles.cardMeta}>
                  {g.start_date} to {g.end_date}
                </Text>
                <Text style={styles.cardMeta}>
                  Members:{" "}
                  {(g.members ?? [])
                    .map((id) => peopleById.get(String(id))?.name ?? `#${id}`)
                    .join(", ")}
                </Text>
                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() => openEdit(g)}
                    style={({ pressed }) => [styles.smallBtn, pressed && styles.smallBtnPressed]}
                  >
                    <Text style={styles.smallBtnText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onDelete(g)}
                    style={({ pressed }) => [
                      styles.smallBtnDanger,
                      pressed && styles.smallBtnDangerPressed,
                    ]}
                  >
                    <Text style={styles.smallBtnDangerText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal
        visible={isTxnPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() =>
          isTxnPickerSubmitting ? null : setIsTxnPickerOpen(false)
        }
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => (isTxnPickerSubmitting ? null : setIsTxnPickerOpen(false))}
        />
        <View style={styles.txnSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {txnPickerGroup ? `Bulk add • ${txnPickerGroup.name}` : "Bulk add"}
            </Text>
            <Pressable
              onPress={() => setIsTxnPickerOpen(false)}
              disabled={isTxnPickerSubmitting}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && styles.closeBtnPressed,
                isTxnPickerSubmitting && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.txnToolbar}>
            <Pressable
              onPress={() => {
                if (txnPickerSelectedIds.length === txnPickerItems.length) {
                  setTxnPickerSelectedIds([]);
                } else {
                  setTxnPickerSelectedIds(txnPickerItems.map((t) => t.id));
                }
              }}
              style={({ pressed }) => [
                styles.smallBtn,
                pressed && styles.smallBtnPressed,
              ]}
              disabled={txnPickerItems.length === 0}
            >
              <Text style={styles.smallBtnText}>
                {txnPickerSelectedIds.length === txnPickerItems.length
                  ? "Unselect all"
                  : "Select all"}
              </Text>
            </Pressable>
            <Text style={styles.muted}>
              Selected {txnPickerSelectedIds.length}/{txnPickerItems.length}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            {isTxnPickerLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color="#0B0B0B" />
                <Text style={styles.muted}>Loading transactions…</Text>
              </View>
            ) : (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ gap: 10, paddingBottom: 12 }}
                showsVerticalScrollIndicator
              >
                {txnPickerItems.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>No transactions found</Text>
                    <Text style={styles.muted}>
                      This group has no debit transactions available.
                    </Text>
                  </View>
                ) : (
                  txnPickerItems.map((t) => {
                    const selected = txnPickerSelectedIds.some(
                      (id) => String(id) === String(t.id)
                    );
                    return (
                      <Pressable
                        key={String(t.id)}
                        onPress={() => toggleTxn(t.id)}
                        style={({ pressed }) => [
                          styles.pickerRow,
                          selected && styles.pickerRowSelected,
                          pressed && styles.pickerRowPressed,
                        ]}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={styles.pickerRowText}>
                            {t.description || "(No description)"}
                          </Text>
                          <Text style={styles.cardMeta}>
                            {t.txn_date} • {t.amount}
                          </Text>
                        </View>
                        {selected ? (
                          <Feather name="check" size={16} color="#0B0B0B" />
                        ) : null}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            )}
          </View>

          <Pressable
            onPress={async () => {
              if (isTxnPickerSubmitting) return;
              if (!txnPickerGroup) return;
              if (txnPickerSelectedIds.length === 0) {
                Alert.alert("Validation", "Select at least one transaction.");
                return;
              }

              setIsTxnPickerSubmitting(true);
              try {
                await bulkAddSplitGroupTransactions({
                  group: txnPickerGroup.id,
                  transactions: txnPickerSelectedIds,
                });
                setIsTxnPickerOpen(false);
                Alert.alert("Done", "Transactions added to group.");
              } catch (err: any) {
                const message =
                  err?.response?.data?.detail ??
                  err?.response?.data?.message ??
                  err?.message ??
                  "Bulk add failed.";
                Alert.alert("Error", String(message));
              } finally {
                setIsTxnPickerSubmitting(false);
              }
            }}
            disabled={isTxnPickerSubmitting}
            style={({ pressed }) => [
              styles.saveBtn,
              (pressed || isTxnPickerSubmitting) && styles.saveBtnPressed,
            ]}
          >
            <Text style={styles.saveBtnText}>
              {isTxnPickerSubmitting ? "Uploading…" : "Bulk add"}
            </Text>
          </Pressable>
        </View>
      </Modal>

      <Modal
        visible={isGroupTxnListOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsGroupTxnListOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsGroupTxnListOpen(false)}
        />
        <View style={styles.txnSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {groupTxnListGroup ? `Group transactions • ${groupTxnListGroup.name}` : "Group transactions"}
            </Text>
            <Pressable
              onPress={() => setIsGroupTxnListOpen(false)}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && styles.closeBtnPressed,
              ]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>

          {isGroupTxnListLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color="#0B0B0B" />
              <Text style={styles.muted}>Loading…</Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ gap: 10, paddingBottom: 12 }}
              showsVerticalScrollIndicator
            >
              {groupTxnListItems.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No group transactions</Text>
                  <Text style={styles.muted}>Bulk add some transactions to see them here.</Text>
                </View>
              ) : (
                groupTxnListItems.map((row) => (
                  <View key={String(row.id)} style={styles.pickerRow}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.pickerRowText}>
                        {row.transaction?.description ?? "(No description)"}
                      </Text>
                      <Text style={styles.cardMeta}>
                        {row.transaction?.txn_date ?? ""} •{" "}
                        <Text
                          style={
                            row.transaction?.type === "credit"
                              ? styles.amountCredit
                              : row.transaction?.type === "debit"
                                ? styles.amountDebit
                                : styles.amountNeutral
                          }
                        >
                          {toMoneyString(row.transaction?.amount)}
                        </Text>
                      </Text>

                      {typeof row.group === "object" &&
                      row.group?.members &&
                      row.group.members.length > 0 ? (
                        <View style={styles.memberChipsWrap}>
                          {row.group.members.map((m) => {
                            const splitItemForMember = (row.transaction?.split_items ?? []).find(
                              (si) => String(si.person?.id) === String(m.id)
                            );
                            const isSelected = Boolean(splitItemForMember);
                            const key = `${row.id}:${m.id}`;
                            const isSaving = savingMemberKey === key;
                            return (
                              <Pressable
                                key={String(m.id)}
                                onPress={async () => {
                                  if (isSaving) return;
                                  if (!row.transaction?.id) return;

                                  setSavingMemberKey(key);
                                  try {
                                    if (isSelected) {
                                      if (!splitItemForMember?.id) return;
                                      await deleteSplitItem(splitItemForMember.id);
                                    } else {
                                      await createSplitItem({
                                        transaction: row.transaction.id,
                                        person: m.id,
                                      });
                                    }

                                    // Refresh list to reflect current split_items
                                    if (groupTxnListGroup) {
                                      const rows = await listSplitGroupTransactionsExpanded();
                                      const filtered = rows.filter((r) => {
                                        if (typeof r.group === "object" && r.group?.id !== undefined) {
                                          return String(r.group.id) === String(groupTxnListGroup.id);
                                        }
                                        return String(r.group) === String(groupTxnListGroup.id);
                                      });
                                      setGroupTxnListItems(filtered);
                                    }
                                  } catch (err: any) {
                                    const message =
                                      err?.response?.data?.detail ??
                                      err?.response?.data?.message ??
                                      err?.message ??
                                      "Failed to update split item.";
                                    Alert.alert("Error", String(message));
                                  } finally {
                                    setSavingMemberKey(null);
                                  }
                                }}
                                style={({ pressed }) => [
                                  styles.memberChip,
                                  isSelected && styles.memberChipSelected,
                                  isSaving && { opacity: 0.7 },
                                  pressed && { opacity: 0.85 },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.memberChipText,
                                    isSelected && styles.memberChipTextSelected,
                                  ]}
                                >
                                  {m.name ?? `#${m.id}`}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

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
              {editState.mode === "create" ? "Add split group" : "Edit split group"}
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

          <ScrollView contentContainerStyle={{ gap: 10 }}>
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Goa Trip"
                placeholderTextColor="#6B6B6B"
                editable={!isSaving}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Members</Text>
              <Pressable
                onPress={() => setIsMembersPickerOpen(true)}
                style={({ pressed }) => [styles.inputBtn, pressed && styles.inputBtnPressed]}
              >
                <Text style={styles.inputBtnText}>
                  {memberIds.length > 0 ? `${memberIds.length} selected` : "Select members"}
                </Text>
              </Pressable>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Start date</Text>
              <TextInput
                style={styles.input}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#6B6B6B"
                editable={!isSaving}
                autoCapitalize="none"
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>End date</Text>
              <TextInput
                style={styles.input}
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#6B6B6B"
                editable={!isSaving}
                autoCapitalize="none"
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
              <Text style={styles.saveBtnText}>{isSaving ? "Saving…" : "Save"}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={isMembersPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsMembersPickerOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsMembersPickerOpen(false)}
        />
        <View style={styles.pickerSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Select members</Text>
            <Pressable
              onPress={() => setIsMembersPickerOpen(false)}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && styles.closeBtnPressed,
              ]}
            >
              <Text style={styles.closeBtnText}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            {people.map((p) => {
              const selected = memberIds.some((id) => String(id) === String(p.id));
              return (
                <Pressable
                  key={String(p.id)}
                  onPress={() => toggleMember(p.id)}
                  style={({ pressed }) => [
                    styles.pickerRow,
                    selected && styles.pickerRowSelected,
                    pressed && styles.pickerRowPressed,
                  ]}
                >
                  <Text style={styles.pickerRowText}>{p.name}</Text>
                  {selected ? <Feather name="check" size={16} color="#0B0B0B" /> : null}
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
  title: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 24 },
  muted: { color: "#6B6B6B", fontFamily: "Poppins_400Regular" },
  addBtn: {
    backgroundColor: "#0B0B0B",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnPressed: { opacity: 0.88 },
  addBtnText: { color: "#FFFFFF", fontFamily: "Poppins_400Regular", fontSize: 13 },
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
  refreshText: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 12 },
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
  card: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#FFFFFF",
    gap: 10,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: { color: "#0B0B0B", fontSize: 14, fontFamily: "Poppins_400Regular" },
  cardMeta: { color: "#6B6B6B", fontSize: 12, fontFamily: "Poppins_400Regular" },
  cardActions: { flexDirection: "row", gap: 10 },
  txnBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
    alignSelf: "flex-start",
  },
  txnBtnPressed: { backgroundColor: "#F5F5F5" },
  txnBtnText: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 12 },
  smallBtn: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallBtnPressed: { backgroundColor: "#F5F5F5" },
  smallBtnText: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 12 },
  smallBtnDanger: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#0B0B0B",
  },
  smallBtnDangerPressed: { opacity: 0.88 },
  smallBtnDangerText: { color: "#FFFFFF", fontFamily: "Poppins_400Regular", fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: "#E7E7E7",
    padding: 16,
  },
  txnSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: "#E7E7E7",
    padding: 16,
    marginTop: "auto",
    maxHeight: "85%",
    minHeight: 280,
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
  closeBtnText: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 12 },
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
  inputBtn: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#FFFFFF",
  },
  inputBtnPressed: { backgroundColor: "#F5F5F5" },
  inputBtnText: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 13 },
  saveBtn: {
    marginTop: 6,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B0B0B",
  },
  saveBtnPressed: { opacity: 0.88 },
  saveBtnText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Poppins_400Regular" },
  txnToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  pickerRow: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerRowSelected: { borderColor: "#0B0B0B", backgroundColor: "#F8F8F8" },
  pickerRowPressed: { backgroundColor: "#F5F5F5" },
  pickerRowText: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 13 },
  amountCredit: { color: "#0FA958", fontFamily: "Poppins_400Regular" },
  amountDebit: { color: "#E53935", fontFamily: "Poppins_400Regular" },
  amountNeutral: { color: "#0B0B0B", fontFamily: "Poppins_400Regular" },
  memberChipsWrap: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  memberChip: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  memberChipSelected: {
    borderColor: "#0B0B0B",
    backgroundColor: "#0B0B0B",
  },
  memberChipText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  memberChipTextSelected: {
    color: "#FFFFFF",
  },
});

