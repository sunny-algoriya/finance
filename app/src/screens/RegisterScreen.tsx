import React from "react";
import { Alert, Button, TextInput, View } from "react-native";

import type { AuthStackScreenProps } from "../navigation/AppNavigator";
import { register } from "../services/auth";

export default function RegisterScreen({
  navigation,
}: AuthStackScreenProps<"Register">) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function onRegister() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await register(email.trim(), password);
      navigation.replace("Login");
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to register.";
      Alert.alert("Register failed", String(message));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button
        title={isSubmitting ? "Registering..." : "Register"}
        onPress={onRegister}
      />
    </View>
  );
}

