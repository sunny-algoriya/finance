import React from "react";
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { useAuth, type AuthStackScreenProps } from "../navigation/AppNavigator";
import { login, saveToken } from "../services/auth";

export default function LoginScreen(_props: AuthStackScreenProps<"Login">) {
  const { setAccessToken } = useAuth();
  const { width } = useWindowDimensions();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function onLogin() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const tokens = await login(email.trim(), password);
      await saveToken(tokens.access, tokens.refresh);
      setAccessToken(tokens.access);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to login.";
      Alert.alert("Login failed", String(message));
    } finally {
      setIsSubmitting(false);
    }
  }

  const containerPadding = Math.max(16, Math.min(28, Math.round(width * 0.06)));
  const cardMaxWidth = Math.min(420, Math.max(320, Math.round(width * 0.92)));

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            { padding: containerPadding },
          ]}
        >
          <View style={[styles.card, { width: "100%", maxWidth: cardMaxWidth }]}>
            <View style={styles.header}>
              <Text style={styles.kicker}>SplitApp</Text>
              <Text style={styles.title}>Sign in</Text>
              <Text style={styles.subtitle}>
                Use your email and password to continue.
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor={COLORS.muted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  editable={!isSubmitting}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.muted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  textContentType="password"
                  returnKeyType="go"
                  editable={!isSubmitting}
                  onSubmitEditing={onLogin}
                />
              </View>

              <Pressable
                onPress={onLogin}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (pressed || isSubmitting) && styles.primaryButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Login"
              >
                {isSubmitting ? (
                  <View style={styles.buttonRow}>
                    <ActivityIndicator color={COLORS.bg} />
                    <Text style={styles.primaryButtonText}>Logging in…</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryButtonText}>Login</Text>
                )}
              </Pressable>

            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const COLORS = {
  bg: "#FFFFFF",
  fg: "#0B0B0B",
  muted: "#6B6B6B",
  border: "#E7E7E7",
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 18,
    backgroundColor: COLORS.bg,
  },
  header: { gap: 6, marginBottom: 14 },
  kicker: {
    color: COLORS.muted,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: { color: COLORS.fg, fontFamily: "Poppins_800ExtraBold", fontSize: 24 },
  subtitle: {
    color: COLORS.muted,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  form: { gap: 12 },
  field: { gap: 6 },
  label: {
    color: COLORS.fg,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10, default: 10 }),
    color: COLORS.fg,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    backgroundColor: COLORS.bg,
  },
  primaryButton: {
    backgroundColor: COLORS.fg,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonPressed: { opacity: 0.88 },
  primaryButtonText: {
    color: COLORS.bg,
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
  },
  buttonRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  divider: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.muted, fontFamily: "Poppins_400Regular", fontSize: 11 },
  secondaryButton: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.fg,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonPressed: { backgroundColor: "#F5F5F5" },
  secondaryButtonDisabled: { opacity: 0.6 },
  secondaryButtonText: {
    color: COLORS.fg,
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
  },
  footer: {
    marginTop: 14,
    maxWidth: 420,
    paddingHorizontal: 8,
    textAlign: "center",
    color: COLORS.muted,
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    lineHeight: 15,
  },
});

