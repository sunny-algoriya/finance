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
  TRANSACTION_TXN_TYPES,
  type TransactionTxnType,
} from "../../services/transactions";
import { txnTypeLabel } from "./transactionEditorShared";
import { txnEditorStyles as styles } from "./transactionEditorStyles";

export type BulkUpdatePatch = {
  person: string | null;
  category: string | null;
  txn_type: TransactionTxnType | undefined;
};

export type TransactionBulkEditModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  people: People[];
  categories: Category[];
  isSaving: boolean;
  onApply: (patch: BulkUpdatePatch) => void | Promise<void>;
};

export function TransactionBulkEditModal({
  visible,
  onRequestClose,
  people,
  categories,
  isSaving,
  onApply,
}: TransactionBulkEditModalProps) {
  const [bulkPersonId, setBulkPersonId] = React.useState<string | null>(null);
  const [bulkCategoryId, setBulkCategoryId] = React.useState<string | null>(null);
  const [bulkTxnType, setBulkTxnType] =
    React.useState<TransactionTxnType | null>(null);
  const [bulkPersonQuery, setBulkPersonQuery] = React.useState("");
  const [bulkCategoryQuery, setBulkCategoryQuery] = React.useState("");

  React.useEffect(() => {
    if (!visible) return;
    setBulkPersonId(null);
    setBulkCategoryId(null);
    setBulkTxnType(null);
    setBulkPersonQuery("");
    setBulkCategoryQuery("");
  }, [visible]);

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
    await onApply({
      person: bulkPersonId,
      category: bulkCategoryId,
      txn_type: bulkTxnType ?? undefined,
    });
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
