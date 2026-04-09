import React from "react";
import { Pressable, Text, View } from "react-native";

import { txnEditorStyles as styles } from "./transactionEditorStyles";

export type TransactionBulkSelectionBarProps = {
  selectedCount: number;
  onBulkUpdate: () => void;
  onBulkDelete: () => void;
  onClear: () => void;
  isBulkDeleting?: boolean;
};

export function TransactionBulkSelectionBar({
  selectedCount,
  onBulkUpdate,
  onBulkDelete,
  onClear,
  isBulkDeleting,
}: TransactionBulkSelectionBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <View style={styles.bulkBar}>
      <Text style={styles.bulkBarText}>{selectedCount} selected</Text>
      <Pressable
        onPress={onBulkUpdate}
        style={({ pressed }) => [
          styles.bulkActionBtn,
          pressed && styles.bulkActionBtnPressed,
        ]}
      >
        <Text style={styles.bulkActionBtnText}>Bulk update</Text>
      </Pressable>
      <Pressable
        onPress={onBulkDelete}
        disabled={isBulkDeleting}
        style={({ pressed }) => [
          styles.bulkDangerBtn,
          pressed && styles.bulkDangerBtnPressed,
          isBulkDeleting && { opacity: 0.6 },
        ]}
      >
        <Text style={styles.bulkDangerBtnText}>Bulk delete</Text>
      </Pressable>
      <Pressable
        onPress={onClear}
        style={({ pressed }) => [
          styles.bulkActionBtn,
          pressed && styles.bulkActionBtnPressed,
        ]}
      >
        <Text style={styles.bulkActionBtnText}>Clear</Text>
      </Pressable>
    </View>
  );
}
