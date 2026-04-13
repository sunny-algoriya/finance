import React from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
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

import { listAccounts, type Account } from "../services/accounts";
import { createCategory, listCategories, type Category } from "../services/categories";
import { createPeople, listPeoples, type People } from "../services/peoples";
import {
  deleteTransaction,
  getTransaction,
  patchTransaction,
  TRANSACTION_PERSONAL_TYPES,
  TRANSACTION_TXN_TYPES,
  type Transaction,
  type TransactionPersonalType,
  type TransactionTxnType,
} from "../services/transactions";

function formatMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
}

function txnTypeLabel(v: TransactionTxnType): string {
  return v
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type Props = {
  visible: boolean;
  transactionId: string | number | null;
  onClose: () => void;
  /** Called after successful save or delete so parent can refresh. */
  onSaved?: () => void;
};

export default function TransactionEditModal({
  visible,
  transactionId,
  onClose,
  onSaved,
}: Props) {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [people, setPeople] = React.useState<People[]>([]);
  const [metaReady, setMetaReady] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [txn, setTxn] = React.useState<Transaction | null>(null);

  const [accountId, setAccountId] = React.useState<string | number | null>(null);
  const [personId, setPersonId] = React.useState<string | number | null>(null);
  const [categoryId, setCategoryId] = React.useState<string | number | null>(null);
  const [txnDate, setTxnDate] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("0.00");
  const [txnType, setTxnType] = React.useState<"credit" | "debit">("credit");
  const [txnKind, setTxnKind] = React.useState<TransactionTxnType>("expense");
  const [personalType, setPersonalType] = React.useState<TransactionPersonalType | null>(
    null,
  );
  const [isSaving, setIsSaving] = React.useState(false);

  const [isAccountPickerOpen, setIsAccountPickerOpen] = React.useState(false);
  const [isPersonPickerOpen, setIsPersonPickerOpen] = React.useState(false);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = React.useState(false);
  const [personPickerQuery, setPersonPickerQuery] = React.useState("");
  const [categoryPickerQuery, setCategoryPickerQuery] = React.useState("");
  const [isPersonSaving, setIsPersonSaving] = React.useState(false);
  const [isCategorySaving, setIsCategorySaving] = React.useState(false);

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

  const peopleFiltered = React.useMemo(() => {
    const q = personPickerQuery.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.name.toLowerCase().includes(q));
  }, [people, personPickerQuery]);

  const categoriesFiltered = React.useMemo(() => {
    const q = categoryPickerQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, categoryPickerQuery]);

  const canCreatePersonFromQuery = React.useMemo(() => {
    const q = personPickerQuery.trim().toLowerCase();
    if (!q) return false;
    return !people.some((p) => p.name.trim().toLowerCase() === q);
  }, [people, personPickerQuery]);

  const canCreateCategoryFromQuery = React.useMemo(() => {
    const q = categoryPickerQuery.trim().toLowerCase();
    if (!q) return false;
    return !categories.some((c) => c.name.trim().toLowerCase() === q);
  }, [categories, categoryPickerQuery]);

  const accountLabel = accountId != null ? accountById.get(String(accountId))?.name : null;
  const personLabel =
    personId != null ? peopleById.get(String(personId))?.name : null;
  const categoryLabel =
    categoryId != null ? categoryById.get(String(categoryId))?.name : null;

  async function loadMeta() {
    const [accRes, catRes, pplRes] = await Promise.all([
      listAccounts(),
      listCategories(),
      listPeoples(),
    ]);
    setAccounts(accRes);
    setCategories(catRes);
    setPeople(pplRes);
    setMetaReady(true);
  }

  React.useEffect(() => {
    if (!visible) return;
    void loadMeta().catch((err: any) => {
      setLoadError(String(err?.message ?? "Failed to load."));
    });
  }, [visible]);

  React.useEffect(() => {
    if (!visible || !metaReady || transactionId === null || transactionId === "") {
      return;
    }
    let cancelled = false;
    setLoadError(null);
    void (async () => {
      try {
        const t = await getTransaction(transactionId);
        if (cancelled) return;
        setTxn(t);
        setAccountId(t.account);
        setPersonId(t.person ?? null);
        setCategoryId(t.category ?? null);
        setTxnDate(t.txn_date);
        setDescription(t.description ?? "");
        setAmount(t.amount ?? "0.00");
        setTxnType(t.type ?? "credit");
        setTxnKind(t.txn_type ?? "expense");
        setPersonalType(t.personal_type ?? null);
      } catch (err: any) {
        const message =
          err?.response?.data?.detail ??
          err?.response?.data?.message ??
          err?.message ??
          "Failed to load transaction.";
        if (!cancelled) {
          Alert.alert("Error", String(message));
          onClose();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, metaReady, transactionId, onClose]);

  function closeModal() {
    if (isSaving) return;
    Keyboard.dismiss();
    setTxn(null);
    onClose();
  }

  async function onSave() {
    if (!txn || isSaving) return;
    if (accountId === null || accountId === undefined || accountId === "") {
      Alert.alert("Validation", "Account is required.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(txnDate.trim())) {
      Alert.alert("Validation", "Date must be YYYY-MM-DD.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Validation", "Description is required.");
      return;
    }

    setIsSaving(true);
    try {
      await patchTransaction(txn.id, {
        account: accountId,
        person: personId ?? null,
        category: categoryId ?? null,
        txn_date: txnDate.trim(),
        description: description.trim(),
        amount,
        type: txnType,
        txn_type: txnKind,
        personal_type: personId ? personalType : null,
      });
      Keyboard.dismiss();
      onSaved?.();
      onClose();
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to save transaction.";
      Alert.alert("Error", String(message));
    } finally {
      setIsSaving(false);
    }
  }

  async function onDelete() {
    if (!txn || isSaving) return;
    Alert.alert("Delete transaction", "Delete this transaction? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteTransaction(txn.id);
            onSaved?.();
            onClose();
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

  async function refreshPeople(selectId?: string | number) {
    const pplRes = await listPeoples();
    setPeople(pplRes);
    if (selectId !== undefined && selectId !== null) setPersonId(selectId);
  }

  async function refreshCategories(selectId?: string | number) {
    const catRes = await listCategories();
    setCategories(catRes);
    if (selectId !== undefined && selectId !== null) setCategoryId(selectId);
  }

  if (!visible || transactionId === null || transactionId === "") return null;

  return (
    <>
      <Modal
        visible={visible && !!txn && metaReady}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (isSaving) return;
          closeModal();
        }}
      >
        <KeyboardAvoidingView
          style={styles.txnModalKeyboardRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          enabled={Platform.OS === "ios"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <View style={styles.txnModalKeyboardInner}>
            <Pressable
              style={[StyleSheet.absoluteFillObject, styles.txnModalBackdropDim]}
              onPress={() => {
                if (isSaving) return;
                closeModal();
              }}
            />
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Edit transaction</Text>
                <Pressable
                  onPress={closeModal}
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

              {loadError ? (
                <Text style={styles.errorText}>{loadError}</Text>
              ) : null}

              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                showsVerticalScrollIndicator
                automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
                contentContainerStyle={styles.txnModalScrollContent}
              >
                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Account</Text>
                  <Pressable
                    onPress={() => setIsAccountPickerOpen(true)}
                    style={({ pressed }) => [
                      styles.pickerBtn,
                      pressed && styles.pickerBtnPressed,
                    ]}
                  >
                    <Text style={styles.pickerBtnText}>
                      {accountLabel ?? "Select account"}
                    </Text>
                  </Pressable>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Person (optional)</Text>
                  <Pressable
                    onPress={() => setIsPersonPickerOpen(true)}
                    style={({ pressed }) => [
                      styles.pickerBtn,
                      pressed && styles.pickerBtnPressed,
                    ]}
                  >
                    <Text style={styles.pickerBtnText}>{personLabel ?? "None"}</Text>
                  </Pressable>
                </View>

                <View style={{ gap: 6, opacity: personId ? 1 : 0.55 }}>
                  <Text style={styles.label}>Personal split (optional)</Text>
                  <Text style={{ color: "#6B6B6B", fontSize: 11 }}>
                    {personId
                      ? "Gave = lent (debit); Got = borrowed (credit); Settle = repayment"
                      : "Select a person above to set Gave, Got, or Settle."}
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <Pressable
                      onPress={() => {
                        if (!personId) {
                          Alert.alert("Person required", "Select a person first to use personal split.");
                          return;
                        }
                        setPersonalType(null);
                      }}
                      disabled={isSaving}
                      style={({ pressed }) => [
                        styles.typePill,
                        personalType === null && styles.sidebarTypePillActiveNeutral,
                        pressed &&
                          personId != null &&
                          personalType !== null &&
                          styles.typePillPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.typePillText,
                          personalType === null && styles.typePillTextActive,
                        ]}
                      >
                        None
                      </Text>
                    </Pressable>
                    {TRANSACTION_PERSONAL_TYPES.map((pt) => (
                      <Pressable
                        key={pt}
                        onPress={() => {
                          if (!personId) {
                            Alert.alert("Person required", "Select a person first to use personal split.");
                            return;
                          }
                          setPersonalType((prev) => {
                            const next = prev === pt ? null : pt;
                            if (next === "gave") {
                              setTxnKind("expense");
                              setTxnType("debit");
                            } else if (next === "got") {
                              setTxnKind("income");
                              setTxnType("credit");
                            }
                            return next;
                          });
                        }}
                        disabled={isSaving}
                        style={({ pressed }) => [
                          styles.typePill,
                          personalType === pt && styles.sidebarTypePillActiveNeutral,
                          pressed &&
                            personId != null &&
                            personalType !== pt &&
                            styles.typePillPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.typePillText,
                            personalType === pt && styles.typePillTextActive,
                          ]}
                        >
                          {pt.charAt(0).toUpperCase() + pt.slice(1)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Category (optional)</Text>
                  <Pressable
                    onPress={() => setIsCategoryPickerOpen(true)}
                    style={({ pressed }) => [
                      styles.pickerBtn,
                      pressed && styles.pickerBtnPressed,
                    ]}
                  >
                    <Text style={styles.pickerBtnText}>{categoryLabel ?? "None"}</Text>
                  </Pressable>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Date</Text>
                  <TextInput
                    style={styles.input}
                    value={txnDate}
                    onChangeText={setTxnDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#6B6B6B"
                    editable={!isSaving}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Description</Text>
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="e.g. Lunch split"
                    placeholderTextColor="#6B6B6B"
                    editable={!isSaving}
                    multiline
                    textAlignVertical="top"
                    scrollEnabled={false}
                  />
                </View>

                <View style={styles.moneyRow}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.label}>Amount</Text>
                    <TextInput
                      style={styles.input}
                      value={amount}
                      onChangeText={(t) => setAmount(formatMoneyInput(t))}
                      placeholder="0.00"
                      placeholderTextColor="#6B6B6B"
                      keyboardType="numeric"
                      editable={!isSaving}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.label}>Type</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        onPress={() => setTxnType("credit")}
                        disabled={isSaving}
                        style={({ pressed }) => [
                          styles.typePill,
                          txnType === "credit" && styles.typePillCreditActive,
                          pressed && txnType !== "credit" && styles.typePillPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.typePillText,
                            txnType === "credit" && styles.typePillTextActive,
                          ]}
                        >
                          Credit
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setTxnType("debit")}
                        disabled={isSaving}
                        style={({ pressed }) => [
                          styles.typePill,
                          txnType === "debit" && styles.typePillDebitActive,
                          pressed && txnType !== "debit" && styles.typePillPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.typePillText,
                            txnType === "debit" && styles.typePillTextActive,
                          ]}
                        >
                          Debit
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Transaction type</Text>
                  <View style={styles.sidebarTxnTypeWrap}>
                    {TRANSACTION_TXN_TYPES.map((opt) => (
                      <Pressable
                        key={opt}
                        onPress={() => setTxnKind(opt)}
                        disabled={isSaving}
                        style={({ pressed }) => [
                          styles.sidebarTxnTypePill,
                          txnKind === opt && styles.sidebarTypePillActiveNeutral,
                          pressed && txnKind !== opt && styles.typePillPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sidebarTxnTypePillText,
                            txnKind === opt && styles.typePillTextActive,
                          ]}
                        >
                          {txnTypeLabel(opt)}
                        </Text>
                      </Pressable>
                    ))}
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

                <Pressable
                  onPress={onDelete}
                  disabled={isSaving}
                  style={({ pressed }) => [
                    styles.deleteBtn,
                    pressed && styles.deleteBtnPressed,
                    isSaving && { opacity: 0.65 },
                  ]}
                >
                  <View style={styles.deleteBtnRow}>
                    <Feather name="trash-2" size={16} color="#FFFFFF" />
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </View>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isAccountPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsAccountPickerOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setIsAccountPickerOpen(false)} />
        <View style={styles.pickerSheet}>
          <Text style={styles.pickerTitle}>Select account</Text>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            {accounts.map((a) => (
              <Pressable
                key={String(a.id)}
                onPress={() => {
                  setAccountId(a.id);
                  setIsAccountPickerOpen(false);
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
        visible={isPersonPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsPersonPickerOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setIsPersonPickerOpen(false)} />
        <View style={styles.pickerSheet}>
          <Text style={styles.pickerTitle}>Select person</Text>
          <TextInput
            value={personPickerQuery}
            onChangeText={setPersonPickerQuery}
            placeholder="Search person…"
            placeholderTextColor="#6B6B6B"
            style={styles.pickerSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            <Pressable
              onPress={() => {
                setPersonId(null);
                setPersonalType(null);
                setIsPersonPickerOpen(false);
              }}
              style={({ pressed }) => [
                styles.pickerRow,
                pressed && styles.pickerRowPressed,
              ]}
            >
              <Text style={styles.pickerRowText}>None</Text>
            </Pressable>
            {canCreatePersonFromQuery ? (
              <Pressable
                onPress={async () => {
                  if (isPersonSaving) return;
                  const trimmed = personPickerQuery.trim();
                  if (!trimmed) return;
                  setIsPersonSaving(true);
                  try {
                    const created = await createPeople({ name: trimmed });
                    await refreshPeople(created.id);
                    setPersonPickerQuery("");
                    setIsPersonPickerOpen(false);
                  } catch (err: any) {
                    const message =
                      err?.response?.data?.detail ??
                      err?.response?.data?.message ??
                      err?.message ??
                      "Failed to create person.";
                    Alert.alert("Error", String(message));
                  } finally {
                    setIsPersonSaving(false);
                  }
                }}
                disabled={isPersonSaving}
                style={({ pressed }) => [
                  styles.pickerRow,
                  styles.pickerCreateRow,
                  (pressed || isPersonSaving) && styles.pickerRowPressed,
                ]}
              >
                <Feather name="plus" size={14} color="#0B0B0B" />
                <Text style={styles.pickerRowText}>
                  {isPersonSaving ? "Adding..." : `Add "${personPickerQuery.trim()}"`}
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.pickerChipGrid}>
              {peopleFiltered.map((p) => (
                <Pressable
                  key={String(p.id)}
                  onPress={() => {
                    setPersonId(p.id);
                    setIsPersonPickerOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.pickerChip,
                    pressed && styles.pickerChipPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={p.name}
                >
                  <Text style={styles.pickerChipText} numberOfLines={2}>
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={isCategoryPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsCategoryPickerOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setIsCategoryPickerOpen(false)} />
        <View style={styles.pickerSheet}>
          <Text style={styles.pickerTitle}>Select category</Text>
          <TextInput
            value={categoryPickerQuery}
            onChangeText={setCategoryPickerQuery}
            placeholder="Search category…"
            placeholderTextColor="#6B6B6B"
            style={styles.pickerSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            <Pressable
              onPress={() => {
                setCategoryId(null);
                setIsCategoryPickerOpen(false);
              }}
              style={({ pressed }) => [
                styles.pickerRow,
                pressed && styles.pickerRowPressed,
              ]}
            >
              <Text style={styles.pickerRowText}>None</Text>
            </Pressable>
            {canCreateCategoryFromQuery ? (
              <Pressable
                onPress={async () => {
                  if (isCategorySaving) return;
                  const trimmed = categoryPickerQuery.trim();
                  if (!trimmed) return;
                  setIsCategorySaving(true);
                  try {
                    const created = await createCategory({ name: trimmed });
                    await refreshCategories(created.id);
                    setCategoryPickerQuery("");
                    setIsCategoryPickerOpen(false);
                  } catch (err: any) {
                    const message =
                      err?.response?.data?.detail ??
                      err?.response?.data?.message ??
                      err?.message ??
                      "Failed to create category.";
                    Alert.alert("Error", String(message));
                  } finally {
                    setIsCategorySaving(false);
                  }
                }}
                disabled={isCategorySaving}
                style={({ pressed }) => [
                  styles.pickerRow,
                  styles.pickerCreateRow,
                  (pressed || isCategorySaving) && styles.pickerRowPressed,
                ]}
              >
                <Feather name="plus" size={14} color="#0B0B0B" />
                <Text style={styles.pickerRowText}>
                  {isCategorySaving ? "Adding..." : `Add "${categoryPickerQuery.trim()}"`}
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.pickerChipGrid}>
              {categoriesFiltered.map((c) => (
                <Pressable
                  key={String(c.id)}
                  onPress={() => {
                    setCategoryId(c.id);
                    setIsCategoryPickerOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.pickerChip,
                    pressed && styles.pickerChipPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={c.name}
                >
                  <Text style={styles.pickerChipText} numberOfLines={2}>
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  errorText: { color: "#B83C3C", fontFamily: "Poppins_400Regular", marginBottom: 8 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  txnModalKeyboardRoot: { flex: 1 },
  txnModalKeyboardInner: { flex: 1, justifyContent: "flex-end" },
  txnModalBackdropDim: { backgroundColor: "rgba(0,0,0,0.35)" },
  txnModalScrollContent: { gap: 10, paddingBottom: 28 },
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
  inputMultiline: { minHeight: 88, paddingTop: 10 },
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
  deleteBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E53935",
    marginTop: 6,
  },
  deleteBtnPressed: { opacity: 0.88 },
  deleteBtnRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  deleteBtnText: {
    color: "#FFFFFF",
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
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
  pickerTitle: {
    color: "#0B0B0B",
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    marginBottom: 10,
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
  pickerCreateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pickerChipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 2,
  },
  pickerChip: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#FAFAFA",
  },
  pickerChipPressed: { backgroundColor: "#F5F5F5" },
  pickerChipText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  pickerRowPressed: { backgroundColor: "#F5F5F5" },
  pickerRowText: {
    color: "#0B0B0B",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  sidebarTxnTypeWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  sidebarTypePillActiveNeutral: {
    borderColor: "#0B0B0B",
    backgroundColor: "#0B0B0B",
  },
});
