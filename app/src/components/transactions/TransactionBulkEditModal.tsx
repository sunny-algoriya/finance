import React from "react";
import {
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

import type { Category } from "../../services/categories";
import type { People } from "../../services/peoples";
import {
  TRANSACTION_PERSONAL_TYPES,
  TRANSACTION_TXN_TYPES,
  type Transaction,
  type TransactionPersonalType,
  type TransactionTxnType,
} from "../../services/transactions";
import { txnTypeLabel } from "./transactionEditorShared";
import { txnEditorStyles as styles } from "./transactionEditorStyles";

export type BulkPersonalTypeMode = "keep" | "clear" | TransactionPersonalType;

export type BulkUpdatePatch = {
  person: string | null;
  category: string | null;
  txn_type: TransactionTxnType | undefined;
  /** Omitted when unchanged; null clears for all selected. */
  personal_type?: Transaction["personal_type"] | null;
};

/** One row’s person/category for inferring common values when opening bulk edit. */
export type BulkEditRowSnapshot = {
  person?: string | number | null;
  category?: string | number | null;
};

function inferBulkPersonCategory(
  snap: BulkEditRowSnapshot[],
  people: People[],
  categories: Category[],
): {
  personId: string | null;
  personQuery: string;
  categoryId: string | null;
  categoryQuery: string;
} {
  if (snap.length === 0) {
    return {
      personId: null,
      personQuery: "",
      categoryId: null,
      categoryQuery: "",
    };
  }

  const normPerson = (p: unknown) =>
    p === undefined || p === null || p === "" ? null : String(p);
  const normCategory = (c: unknown) =>
    c === undefined || c === null || c === "" ? null : String(c);

  const personVals = snap.map((s) => normPerson(s.person));
  const allPersonEqual = personVals.every((p) => p === personVals[0]);
  let personId: string | null = null;
  let personQuery = "";
  if (allPersonEqual && personVals[0] !== null) {
    personId = personVals[0];
    personQuery =
      people.find((p) => String(p.id) === personId)?.name ?? "";
  }

  const catVals = snap.map((s) => normCategory(s.category));
  const allCatEqual = catVals.every((c) => c === catVals[0]);
  let categoryId: string | null = null;
  let categoryQuery = "";
  if (allCatEqual && catVals[0] !== null) {
    categoryId = catVals[0];
    categoryQuery =
      categories.find((c) => String(c.id) === categoryId)?.name ?? "";
  }

  return { personId, personQuery, categoryId, categoryQuery };
}

export type TransactionBulkEditModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  people: People[];
  categories: Category[];
  isSaving: boolean;
  onApply: (patch: BulkUpdatePatch) => void | Promise<void>;
  /**
   * Selected rows used to pre-fill person & category when all selected share the same value.
   * Omit or empty to start with no selection (same as before).
   */
  selectionSnapshot?: BulkEditRowSnapshot[];
};

export function TransactionBulkEditModal({
  visible,
  onRequestClose,
  people,
  categories,
  isSaving,
  onApply,
  selectionSnapshot,
}: TransactionBulkEditModalProps) {
  const [bulkPersonId, setBulkPersonId] = React.useState<string | null>(null);
  const [bulkCategoryId, setBulkCategoryId] = React.useState<string | null>(null);
  const [bulkTxnType, setBulkTxnType] =
    React.useState<TransactionTxnType | null>(null);
  const [bulkPersonalMode, setBulkPersonalMode] =
    React.useState<BulkPersonalTypeMode>("keep");
  const [bulkPersonQuery, setBulkPersonQuery] = React.useState("");
  const [bulkCategoryQuery, setBulkCategoryQuery] = React.useState("");

  React.useEffect(() => {
    if (!visible) return;
    const snap = selectionSnapshot ?? [];
    if (snap.length === 0) {
      setBulkPersonId(null);
      setBulkCategoryId(null);
      setBulkPersonQuery("");
      setBulkCategoryQuery("");
    } else {
      const inferred = inferBulkPersonCategory(snap, people, categories);
      setBulkPersonId(inferred.personId);
      setBulkCategoryId(inferred.categoryId);
      setBulkPersonQuery(inferred.personQuery);
      setBulkCategoryQuery(inferred.categoryQuery);
    }
    setBulkTxnType(null);
    setBulkPersonalMode("keep");
  }, [visible, selectionSnapshot, people, categories]);

  const peopleFilteredForBulk = React.useMemo(() => {
    const q = bulkPersonQuery.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.name.toLowerCase().includes(q));
  }, [people, bulkPersonQuery]);

  const categoriesFilteredForBulk = React.useMemo(() => {
    const q = bulkCategoryQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, bulkCategoryQuery]);

  async function handleApply() {
    const patch: BulkUpdatePatch = {
      person: bulkPersonId,
      category: bulkCategoryId,
      txn_type: bulkTxnType ?? undefined,
    };
    if (bulkPersonalMode !== "keep") {
      patch.personal_type =
        bulkPersonalMode === "clear" ? null : bulkPersonalMode;
    }
    await onApply(patch);
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={() => (isSaving ? null : onRequestClose())}
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
            onPress={() => (isSaving ? null : onRequestClose())}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Bulk update selected</Text>
              <Pressable
                onPress={onRequestClose}
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
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              showsVerticalScrollIndicator
              automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
              contentContainerStyle={styles.txnModalScrollContent}
            >
              <View style={{ gap: 10 }}>
                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Person</Text>
                  <TextInput
                    value={bulkPersonQuery}
                    onChangeText={setBulkPersonQuery}
                    placeholder="Search person..."
                    placeholderTextColor="#9A9A9A"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.pickerSearchInput}
                  />
                  <View style={styles.bulkChipWrap}>
                    <Pressable
                      onPress={() => setBulkPersonId(null)}
                      style={({ pressed }) => [
                        styles.bulkChipBtn,
                        pressed && styles.pickerRowPressed,
                        bulkPersonId === null && styles.pickerRowActive,
                      ]}
                    >
                      <Text style={styles.bulkChipText}>None</Text>
                    </Pressable>
                    {peopleFilteredForBulk.map((p) => (
                      <Pressable
                        key={`bulk-person-${p.id}`}
                        onPress={() => setBulkPersonId(String(p.id))}
                        style={({ pressed }) => [
                          styles.bulkChipBtn,
                          pressed && styles.pickerRowPressed,
                          bulkPersonId === String(p.id) && styles.pickerRowActive,
                        ]}
                      >
                        <Text style={styles.bulkChipText}>{p.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Category</Text>
                  <TextInput
                    value={bulkCategoryQuery}
                    onChangeText={setBulkCategoryQuery}
                    placeholder="Search category..."
                    placeholderTextColor="#9A9A9A"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.pickerSearchInput}
                  />
                  <View style={styles.bulkChipWrap}>
                    <Pressable
                      onPress={() => setBulkCategoryId(null)}
                      style={({ pressed }) => [
                        styles.bulkChipBtn,
                        pressed && styles.pickerRowPressed,
                        bulkCategoryId === null && styles.pickerRowActive,
                      ]}
                    >
                      <Text style={styles.bulkChipText}>None</Text>
                    </Pressable>
                    {categoriesFilteredForBulk.map((c) => (
                      <Pressable
                        key={`bulk-category-${c.id}`}
                        onPress={() => setBulkCategoryId(String(c.id))}
                        style={({ pressed }) => [
                          styles.bulkChipBtn,
                          pressed && styles.pickerRowPressed,
                          bulkCategoryId === String(c.id) && styles.pickerRowActive,
                        ]}
                      >
                        <Text style={styles.bulkChipText}>{c.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Personal split</Text>
                  <Text style={{ color: "#6B6B6B", fontSize: 11 }}>
                    Only applied when you change from &quot;Keep current&quot;. Requires person on each row for non-clear values.
                  </Text>
                  <View style={styles.bulkChipWrap}>
                    <Pressable
                      onPress={() => setBulkPersonalMode("keep")}
                      style={({ pressed }) => [
                        styles.bulkChipBtn,
                        pressed && styles.pickerRowPressed,
                        bulkPersonalMode === "keep" && styles.pickerRowActive,
                      ]}
                    >
                      <Text style={styles.bulkChipText}>Keep current</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setBulkPersonalMode("clear")}
                      style={({ pressed }) => [
                        styles.bulkChipBtn,
                        pressed && styles.pickerRowPressed,
                        bulkPersonalMode === "clear" && styles.pickerRowActive,
                      ]}
                    >
                      <Text style={styles.bulkChipText}>Clear all</Text>
                    </Pressable>
                    {TRANSACTION_PERSONAL_TYPES.map((pt) => (
                      <Pressable
                        key={`bulk-pt-${pt}`}
                        onPress={() => setBulkPersonalMode(pt)}
                        style={({ pressed }) => [
                          styles.bulkChipBtn,
                          pressed && styles.pickerRowPressed,
                          bulkPersonalMode === pt && styles.pickerRowActive,
                        ]}
                      >
                        <Text style={styles.bulkChipText}>
                          {pt.charAt(0).toUpperCase() + pt.slice(1)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Type</Text>
                  <View style={styles.bulkChipWrap}>
                    <Pressable
                      onPress={() => setBulkTxnType(null)}
                      style={({ pressed }) => [
                        styles.bulkChipBtn,
                        pressed && styles.pickerRowPressed,
                        bulkTxnType === null && styles.pickerRowActive,
                      ]}
                    >
                      <Text style={styles.bulkChipText}>Keep current</Text>
                    </Pressable>
                    {TRANSACTION_TXN_TYPES.map((opt) => (
                      <Pressable
                        key={`bulk-type-${opt}`}
                        onPress={() => setBulkTxnType(opt)}
                        style={({ pressed }) => [
                          styles.bulkChipBtn,
                          pressed && styles.pickerRowPressed,
                          bulkTxnType === opt && styles.pickerRowActive,
                        ]}
                      >
                        <Text style={styles.bulkChipText}>{txnTypeLabel(opt)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            </ScrollView>
            <View style={styles.bulkActionsRow}>
              <Pressable
                onPress={onRequestClose}
                disabled={isSaving}
                style={({ pressed }) => [
                  styles.secondaryResetBtn,
                  pressed && styles.secondaryResetBtnPressed,
                  { flex: 1 },
                ]}
              >
                <Text style={styles.secondaryResetText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleApply()}
                disabled={isSaving}
                style={({ pressed }) => [
                  styles.saveBtn,
                  (pressed || isSaving) && styles.saveBtnPressed,
                  { flex: 1 },
                ]}
              >
                <Text style={styles.saveBtnText}>
                  {isSaving ? "Updating..." : "Apply"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
