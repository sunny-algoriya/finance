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
  ACCOUNT_TYPES,
  type Account,
  type AccountType,
  createAccount,
  deleteAccount,
  listAccounts,
  patchAccount,
} from "../services/accounts";

const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  bank: "Bank",
  wallet: "Wallet",
  credit_card: "Credit Card",
};

type EditState =
  | { mode: "create" }
  | { mode: "edit"; account: Account };

export default function AccountsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppTabParamList, "Accounts">>();

  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editState, setEditState] = React.useState<EditState>({
    mode: "create",
  });

  const [name, setName] = React.useState("");
  const [accountType, setAccountType] = React.useState<AccountType>("bank");
  const [isSaving, setIsSaving] = React.useState(false);

  async function load() {
    const items = await listAccounts();
    setAccounts(items);
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
          "Failed to load accounts.";
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
    setAccountType("bank");
    setIsModalOpen(true);
  }

  function openEdit(account: Account) {
    setEditState({ mode: "edit", account });
    setName(account.name);
    setAccountType(account.account_type);
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
        const created = await createAccount({
          name: trimmed,
          account_type: accountType,
        });
        setAccounts((prev) => [created, ...prev]);
      } else {
        const updated = await patchAccount(editState.account.id, {
          name: trimmed,
          account_type: accountType,
        });
        setAccounts((prev) =>
          prev.map((a) => (a.id === updated.id ? updated : a))
        );
      }

      setIsModalOpen(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to save account.";
      Alert.alert("Error", String(message));
    } finally {
      setIsSaving(false);
    }
  }

  async function onDelete(account: Account) {
    Alert.alert(
      "Delete account?",
      `This will delete "${account.name}".`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount(account.id);
              setAccounts((prev) => prev.filter((a) => a.id !== account.id));
            } catch (err: any) {
              const message =
                err?.response?.data?.detail ??
                err?.response?.data?.message ??
                err?.message ??
                "Failed to delete account.";
              Alert.alert("Error", String(message));
            }
          },
        },
      ]
    );
  }

  return (
    <AppTabScreen>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>SplitApp</Text>
          <Text style={styles.title}>Accounts</Text>
        </View>
        <Pressable
          onPress={openCreate}
          style={({ pressed }) => [
            styles.addBtn,
            pressed && styles.addBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add account"
        >
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
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
          <Text style={styles.muted}>Loading accounts…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {accounts.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No accounts yet</Text>
              <Text style={styles.muted}>
                Tap Add to create your first account.
              </Text>
            </View>
          ) : (
            accounts.map((a) => (
              <View key={String(a.id)} style={styles.card}>
                <View style={{ gap: 4 }}>
                  <Text style={styles.cardTitle}>{a.name}</Text>
                  <Text style={styles.cardSubtitle}>
                    {ACCOUNT_TYPE_LABEL[a.account_type]}
                  </Text>
                </View>

                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() => openEdit(a)}
                    style={({ pressed }) => [
                      styles.smallBtn,
                      pressed && styles.smallBtnPressed,
                    ]}
                  >
                    <Text style={styles.smallBtnText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onDelete(a)}
                    style={({ pressed }) => [
                      styles.smallBtnDanger,
                      pressed && styles.smallBtnDangerPressed,
                    ]}
                  >
                    <Text style={styles.smallBtnDangerText}>Delete</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      navigation.navigate("AccountLedger", {
                        accountId: a.id,
                        accountName: a.name,
                      })
                    }
                    style={({ pressed }) => [
                      styles.smallBtnLedger,
                      pressed && styles.smallBtnLedgerPressed,
                    ]}
                  >
                    <Text style={styles.smallBtnLedgerText}>Ledger</Text>
                  </Pressable>
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
              {editState.mode === "create" ? "Add account" : "Edit account"}
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
                placeholder="e.g. HDFC Bank"
                placeholderTextColor="#6B6B6B"
                editable={!isSaving}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Account type</Text>
              <View style={styles.typeRow}>
                {ACCOUNT_TYPES.map((t) => {
                  const active = accountType === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setAccountType(t)}
                      disabled={isSaving}
                      style={({ pressed }) => [
                        styles.typePill,
                        active && styles.typePillActive,
                        pressed && !active && styles.typePillPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.typePillText,
                          active && styles.typePillTextActive,
                        ]}
                      >
                        {ACCOUNT_TYPE_LABEL[t]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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
    gap: 12,
  },
  cardTitle: { color: "#0B0B0B", fontSize: 14, fontFamily: "Poppins_400Regular" },
  cardSubtitle: { color: "#6B6B6B", fontSize: 12, fontFamily: "Poppins_400Regular" },
  cardActions: { flexDirection: "row", gap: 10 },
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
  smallBtnLedger: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F8F8F8",
  },
  smallBtnLedgerPressed: { backgroundColor: "#EEF0F0" },
  smallBtnLedgerText: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 12 },

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
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  typePill: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  typePillPressed: { backgroundColor: "#F5F5F5" },
  typePillActive: { borderColor: "#0B0B0B", backgroundColor: "#0B0B0B" },
  typePillText: { color: "#0B0B0B", fontFamily: "Poppins_400Regular", fontSize: 12 },
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
  saveBtnText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Poppins_400Regular" },
});

