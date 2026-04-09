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
import { SafeAreaView } from "react-native-safe-area-context";

import { listAccounts, type Account } from "../../services/accounts";
import {
  createCategory,
  listCategories,
  type Category,
} from "../../services/categories";
import { createPeople, listPeoples, type People } from "../../services/peoples";
import {
  createTransaction,
  deleteTransaction,
  patchTransaction,
  TRANSACTION_TXN_TYPES,
  type Transaction,
  type TransactionTxnType,
} from "../../services/transactions";
import {
  formatMoneyInput,
  IS_WEB,
  todayISO,
  txnTypeLabel,
  type TransactionEditState,
} from "./transactionEditorShared";
import { txnEditorStyles as styles } from "./transactionEditorStyles";

export type TransactionFormCreateDefaults = {
  accountId?: string | number | null;
  personId?: string | number | null;
};

export type TransactionFormModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  editState: TransactionEditState;
  /** Pre-fill account/person when opening create (e.g. from a ledger screen). */
  createDefaults?: TransactionFormCreateDefaults;
  onSaved: (payload: { mode: "create" | "edit"; txn: Transaction }) => void;
  /** After successful single-row delete from edit mode. */
  onDeleted?: (id: Transaction["id"]) => void;
};

export function TransactionFormModal({
  visible,
  onRequestClose,
  editState,
  createDefaults,
  onSaved,
  onDeleted,
}: TransactionFormModalProps) {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [people, setPeople] = React.useState<People[]>([]);
  const [metaLoaded, setMetaLoaded] = React.useState(false);

  const [isSaving, setIsSaving] = React.useState(false);
  const [accountId, setAccountId] = React.useState<string | number | null>(null);
  const [personId, setPersonId] = React.useState<string | number | null>(null);
  const [categoryId, setCategoryId] = React.useState<string | number | null>(null);
  const [txnDate, setTxnDate] = React.useState(todayISO());
  const [remark, setRemark] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("0.00");
  const [txnType, setTxnType] = React.useState<"credit" | "debit">("credit");
  const [txnKind, setTxnKind] = React.useState<TransactionTxnType>("expense");

  const [isAccountPickerOpen, setIsAccountPickerOpen] = React.useState(false);
  const [isPersonPickerOpen, setIsPersonPickerOpen] = React.useState(false);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = React.useState(false);
  const [personPickerQuery, setPersonPickerQuery] = React.useState("");
  const [categoryPickerQuery, setCategoryPickerQuery] = React.useState("");
  const [isPersonSaving, setIsPersonSaving] = React.useState(false);
  const [isCategorySaving, setIsCategorySaving] = React.useState(false);

  React.useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setMetaLoaded(false);
      try {
        const [accRes, catRes, pplRes] = await Promise.all([
          listAccounts(),
          listCategories(),
          listPeoples(),
        ]);
        if (cancelled) return;
        setAccounts(accRes);
        setCategories(catRes);
        setPeople(pplRes);
        setMetaLoaded(true);
      } catch {
        if (!cancelled) setMetaLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const applyEditState = React.useCallback(() => {
    if (editState.mode === "create") {
      const defAcc =
        createDefaults?.accountId ??
        accounts[0]?.id ??
        null;
      setAccountId(defAcc ?? null);
      setPersonId(createDefaults?.personId ?? null);
      setCategoryId(null);
      setTxnDate(todayISO());
      setRemark("");
      setDescription("");
      setAmount("0.00");
      setTxnType("credit");
      setTxnKind("expense");
    } else {
      const txn = editState.txn;
      setAccountId(txn.account);
      setPersonId(txn.person ?? null);
      setCategoryId(txn.category ?? null);
      setTxnDate(txn.txn_date);
      setRemark(txn.remark ?? "");
      setDescription(txn.description ?? "");
      setAmount(txn.amount ?? "0.00");
      setTxnType(txn.type ?? "credit");
      setTxnKind(txn.txn_type ?? "expense");
    }
    setPersonPickerQuery("");
    setCategoryPickerQuery("");
  }, [editState, createDefaults, accounts]);

  React.useEffect(() => {
    if (!visible || !metaLoaded) return;
    applyEditState();
  }, [visible, metaLoaded, applyEditState]);

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

  const peopleFilteredForTxn = React.useMemo(() => {
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

  async function refreshCategories(selectId?: string | number) {
    const catRes = await listCategories();
    setCategories(catRes);
    if (selectId !== undefined && selectId !== null) {
      setCategoryId(selectId);
    }
  }

  async function refreshPeople(selectId?: string | number) {
    const pplRes = await listPeoples();
    setPeople(pplRes);
    if (selectId !== undefined && selectId !== null) {
      setPersonId(selectId);
    }
  }

  function closeModal() {
    if (isSaving) return;
    Keyboard.dismiss();
    onRequestClose();
  }

  async function onSave() {
    if (isSaving) return;
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
      if (editState.mode === "create") {
        const created = await createTransaction({
          account: accountId,
          person: personId ?? null,
          category: categoryId ?? null,
          txn_date: txnDate.trim(),
          remark: remark.trim() ? remark.trim() : null,
          description: description.trim(),
          amount,
          type: txnType,
          txn_type: txnKind,
        });
        onSaved({ mode: "create", txn: created });
      } else {
        const updated = await patchTransaction(editState.txn.id, {
          account: accountId,
          person: personId ?? null,
          category: categoryId ?? null,
          txn_date: txnDate.trim(),
          remark: remark.trim() ? remark.trim() : null,
          description: description.trim(),
          amount,
          type: txnType,
          txn_type: txnKind,
        });
        onSaved({ mode: "edit", txn: updated });
      }
      Keyboard.dismiss();
      onRequestClose();
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
    if (editState.mode !== "edit") return;
    const txn = editState.txn;

    const doDelete = async () => {
      try {
        await deleteTransaction(txn.id);
        onDeleted?.(txn.id);
        onRequestClose();
      } catch (err: any) {
        const message =
          err?.response?.data?.detail ??
          err?.response?.data?.message ??
          err?.message ??
          "Failed to delete.";
        Alert.alert("Error", String(message));
      }
    };

    if (IS_WEB) {
      if (window.confirm("Delete this transaction?")) {
        void doDelete();
      }
      return;
    }
    Alert.alert("Delete transaction", "Delete this transaction? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void doDelete() },
    ]);
  }

  const accountLabel =
    accountId != null ? accountById.get(String(accountId))?.name : undefined;
  const personLabel =
    personId != null ? peopleById.get(String(personId))?.name : undefined;
  const categoryLabel =
    categoryId != null ? categoryById.get(String(categoryId))?.name : undefined;

  return (
    <>
      <Modal
        visible={visible}
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
            <SafeAreaView style={{ flex: 1, width: "100%" }} edges={["top", "bottom", "left", "right"]}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>
                  {editState.mode === "create" ? "Add transaction" : "Edit transaction"}
                </Text>
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

              <ScrollView
                style={{ flex: 1 }}
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
                    style={({ pressed }) => [styles.pickerBtn, pressed && styles.pickerBtnPressed]}
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
                    style={({ pressed }) => [styles.pickerBtn, pressed && styles.pickerBtnPressed]}
                  >
                    <Text style={styles.pickerBtnText}>{personLabel ?? "None"}</Text>
                  </Pressable>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Category (optional)</Text>
                  <Pressable
                    onPress={() => setIsCategoryPickerOpen(true)}
                    style={({ pressed }) => [styles.pickerBtn, pressed && styles.pickerBtnPressed]}
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
                  <Text style={styles.label}>Remark (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={remark}
                    onChangeText={setRemark}
                    placeholder="Short note"
                    placeholderTextColor="#6B6B6B"
                    editable={!isSaving}
                    autoCapitalize="sentences"
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
                  onPress={() => void onSave()}
                  disabled={isSaving}
                  style={({ pressed }) => [
                    styles.saveBtn,
                    (pressed || isSaving) && styles.saveBtnPressed,
                  ]}
                >
                  <Text style={styles.saveBtnText}>{isSaving ? "Saving…" : "Save"}</Text>
                </Pressable>

                {editState.mode === "edit" ? (
                  <Pressable
                    onPress={() => void onDelete()}
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
                ) : null}
              </ScrollView>
            </View>
            </SafeAreaView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isAccountPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsAccountPickerOpen(false)}
      >
        <View style={styles.pickerModalRoot}>
          <SafeAreaView style={styles.pickerSheetFull} edges={["top", "bottom", "left", "right"]}>
            <View style={styles.pickerSheetHeader}>
              <Text style={styles.pickerTitleInHeader} numberOfLines={1}>
                Select account
              </Text>
              <Pressable onPress={() => setIsAccountPickerOpen(false)} hitSlop={8}>
                <Text style={styles.closeBtnText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.pickerListScroll}
              contentContainerStyle={styles.pickerListContent}
              keyboardShouldPersistTaps="handled"
            >
              {accounts.map((a) => (
                <Pressable
                  key={String(a.id)}
                  onPress={() => {
                    setAccountId(a.id);
                    setIsAccountPickerOpen(false);
                  }}
                  style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
                >
                  <Text style={styles.pickerRowText}>{a.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={isPersonPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsPersonPickerOpen(false)}
      >
        <View style={styles.pickerModalRoot}>
          <SafeAreaView style={styles.pickerSheetFull} edges={["top", "bottom", "left", "right"]}>
            <View style={styles.pickerSheetHeader}>
              <Text style={styles.pickerTitleInHeader} numberOfLines={1}>
                Select person
              </Text>
              <Pressable onPress={() => setIsPersonPickerOpen(false)} hitSlop={8}>
                <Text style={styles.closeBtnText}>Close</Text>
              </Pressable>
            </View>
            <TextInput
              value={personPickerQuery}
              onChangeText={setPersonPickerQuery}
              placeholder="Search person…"
              placeholderTextColor="#6B6B6B"
              style={[styles.pickerSearchInput, styles.pickerSearchInFull]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ScrollView
              style={styles.pickerListScroll}
              contentContainerStyle={styles.pickerListContent}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                onPress={() => {
                  setPersonId(null);
                  setIsPersonPickerOpen(false);
                }}
                style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
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
              {peopleFilteredForTxn.map((p) => (
                <Pressable
                  key={String(p.id)}
                  onPress={() => {
                    setPersonId(p.id);
                    setIsPersonPickerOpen(false);
                  }}
                  style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
                >
                  <Text style={styles.pickerRowText}>{p.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={isCategoryPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsCategoryPickerOpen(false)}
      >
        <View style={styles.pickerModalRoot}>
          <SafeAreaView style={styles.pickerSheetFull} edges={["top", "bottom", "left", "right"]}>
            <View style={styles.pickerSheetHeader}>
              <Text style={styles.pickerTitleInHeader} numberOfLines={1}>
                Select category
              </Text>
              <Pressable onPress={() => setIsCategoryPickerOpen(false)} hitSlop={8}>
                <Text style={styles.closeBtnText}>Close</Text>
              </Pressable>
            </View>
            <TextInput
              value={categoryPickerQuery}
              onChangeText={setCategoryPickerQuery}
              placeholder="Search category…"
              placeholderTextColor="#6B6B6B"
              style={[styles.pickerSearchInput, styles.pickerSearchInFull]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ScrollView
              style={styles.pickerListScroll}
              contentContainerStyle={styles.pickerListContent}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                onPress={() => {
                  setCategoryId(null);
                  setIsCategoryPickerOpen(false);
                }}
                style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
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
              {categoriesFiltered.map((c) => (
                <Pressable
                  key={String(c.id)}
                  onPress={() => {
                    setCategoryId(c.id);
                    setIsCategoryPickerOpen(false);
                  }}
                  style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
                >
                  <Text style={styles.pickerRowText}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}
