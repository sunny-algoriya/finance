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

import AppTabScreen from "../components/AppTabScreen";
import {
  createCategory,
  deleteCategory,
  listCategories,
  patchCategory,
  type Category,
} from "../services/categories";

type EditState = { mode: "create" } | { mode: "edit"; category: Category };

export default function CategoriesScreen() {
  const [items, setItems] = React.useState<Category[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editState, setEditState] = React.useState<EditState>({ mode: "create" });
  const [name, setName] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  async function load() {
    const res = await listCategories();
    setItems(res);
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
          "Failed to load categories.";
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
    setIsModalOpen(true);
  }

  function openEdit(category: Category) {
    setEditState({ mode: "edit", category });
    setName(category.name);
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
        const created = await createCategory({ name: trimmed });
        setItems((prev) => [created, ...prev]);
      } else {
        const updated = await patchCategory(editState.category.id, { name: trimmed });
        setItems((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
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

  async function onDelete(category: Category) {
    Alert.alert("Delete category?", `Delete "${category.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCategory(category.id);
            setItems((prev) => prev.filter((c) => c.id !== category.id));
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
          <Text style={styles.title}>Categories</Text>
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
        <Text style={styles.refreshText}>
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </Text>
      </Pressable>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0B0B0B" />
          <Text style={styles.muted}>Loading categories…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No categories yet</Text>
              <Text style={styles.muted}>Tap Add to create your first category.</Text>
            </View>
          ) : (
            items.map((c) => (
              <View key={String(c.id)} style={styles.card}>
                <Text style={styles.cardTitle}>{c.name}</Text>
                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() => openEdit(c)}
                    style={({ pressed }) => [styles.smallBtn, pressed && styles.smallBtnPressed]}
                  >
                    <Text style={styles.smallBtnText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onDelete(c)}
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
              {editState.mode === "create" ? "Add category" : "Edit category"}
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
                placeholder="e.g. Food"
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
              <Text style={styles.saveBtnText}>{isSaving ? "Saving…" : "Save"}</Text>
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
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: { color: "#0B0B0B", fontFamily: "Poppins_800ExtraBold", fontSize: 24 },
  muted: { color: "#6B6B6B", fontFamily: "Poppins_400Regular" },
  addBtn: {
    backgroundColor: "#0B0B0B",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnPressed: { opacity: 0.88 },
  addBtnText: { color: "#FFFFFF", fontFamily: "Poppins_700Bold", fontSize: 13 },
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
  refreshText: { color: "#0B0B0B", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  list: { gap: 10, paddingBottom: 12 },
  empty: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  emptyTitle: { fontSize: 14, fontFamily: "Poppins_700Bold", color: "#0B0B0B" },
  card: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#FFFFFF",
    gap: 12,
  },
  cardTitle: { color: "#0B0B0B", fontSize: 14, fontFamily: "Poppins_700Bold" },
  cardActions: { flexDirection: "row", gap: 10 },
  smallBtn: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallBtnPressed: { backgroundColor: "#F5F5F5" },
  smallBtnText: { color: "#0B0B0B", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  smallBtnDanger: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#0B0B0B",
  },
  smallBtnDangerPressed: { opacity: 0.88 },
  smallBtnDangerText: { color: "#FFFFFF", fontFamily: "Poppins_600SemiBold", fontSize: 12 },

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
  sheetTitle: { color: "#0B0B0B", fontSize: 16, fontFamily: "Poppins_700Bold" },
  closeBtn: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeBtnPressed: { backgroundColor: "#F5F5F5" },
  closeBtnText: { color: "#0B0B0B", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  label: { color: "#0B0B0B", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
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
  saveBtnText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Poppins_700Bold" },
});

