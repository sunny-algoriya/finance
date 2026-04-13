import React from "react";
import {
  NavigationContainer,
  type NavigatorScreenParams,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import AppTabScreen from "../components/AppTabScreen";

import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import AccountsScreen from "../screens/AccountsScreen";
import AccountLedgerScreen from "../screens/AccountLedgerScreen";
import PeoplesScreen from "../screens/PeoplesScreen";
import PersonLedgerScreen from "../screens/PersonLedgerScreen";
import PersonLoanReportScreen from "../screens/PersonLoanReportScreen";
import CategoriesScreen from "../screens/CategoriesScreen";
import TransactionsScreen from "../screens/TransactionsScreen";
import TransactionBrowseScreen from "../screens/TransactionBrowseScreen";
import SplitGroupsScreen from "../screens/SplitGroupsScreen";
import SelfTransferScreen from "../screens/SelfTransferScreen";
import { getToken } from "../services/auth";
import { logout as logoutService } from "../services/auth";
import { setUnauthorizedHandler } from "../services/api";

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type AppTabParamList = {
  Accounts: undefined;
  AccountLedger: { accountId: number | string; accountName?: string };
  Peoples: undefined;
  PersonLedger: { personId: number | string; personName?: string };
  PersonLoanReport: { personId: number | string; personName?: string };
  Categories: undefined;
  Transactions: undefined;
  TransactionBrowse: undefined;
  SplitGroups: undefined;
  SelfTransfers: undefined;
  Activity: undefined;
  Profile: undefined;
};

/** Tab routes reachable from the main menu (excludes nested flows like ledger detail). */
export type AppMenuTabKey = Exclude<
  keyof AppTabParamList,
  "PersonLedger" | "AccountLedger" | "PersonLoanReport"
>;

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  App: NavigatorScreenParams<AppTabParamList>;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppTabParamList>();

export type AuthContextValue = {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
};

export const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthContext.Provider");
  }
  return ctx;
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function DummyScreen({ title }: { title: string }) {
  return (
    <AppTabScreen
      style={{ justifyContent: "center", alignItems: "center", gap: 8 }}
    >
      <Text style={dummyStyles.title}>{title}</Text>
      <Text style={dummyStyles.subtitle}>Dummy page content.</Text>
    </AppTabScreen>
  );
}

function AppShell({ navigation }: NativeStackScreenProps<RootStackParamList, "App">) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { setAccessToken } = useAuth();
  const insets = useSafeAreaInsets();

  const navItems: Array<{
    key: AppMenuTabKey;
    label: string;
    icon: React.ComponentProps<typeof Feather>["name"];
  }> = [
    { key: "Transactions", label: "Transactions", icon: "repeat" },
    { key: "TransactionBrowse", label: "Browse", icon: "filter" },
    { key: "Accounts", label: "Accounts", icon: "briefcase" },
    { key: "Peoples", label: "People", icon: "users" },
    { key: "Categories", label: "Categories", icon: "grid" },
    { key: "SplitGroups", label: "Split groups", icon: "layers" },
    { key: "SelfTransfers", label: "Self transfers", icon: "shuffle" },
  ];

  async function onLogout() {
    setIsMenuOpen(false);
    await logoutService();
    setAccessToken(null);
  }

  function goTo(key: AppMenuTabKey) {
    setIsMenuOpen(false);
    navigation.navigate("App", { screen: key });
  }

  return (
    <View style={{ flex: 1 }}>
      <AppStack.Navigator
        initialRouteName="Transactions"
        screenOptions={{ headerShown: false }}
      >
        <AppStack.Screen name="Transactions" component={TransactionsScreen} />
        <AppStack.Screen name="TransactionBrowse" component={TransactionBrowseScreen} />
        <AppStack.Screen name="Accounts" component={AccountsScreen} />
        <AppStack.Screen name="AccountLedger" component={AccountLedgerScreen} />
        <AppStack.Screen name="Peoples" component={PeoplesScreen} />
        <AppStack.Screen name="PersonLedger" component={PersonLedgerScreen} />
        <AppStack.Screen name="PersonLoanReport" component={PersonLoanReportScreen} />
        <AppStack.Screen name="Categories" component={CategoriesScreen} />
        <AppStack.Screen name="SplitGroups" component={SplitGroupsScreen} />
        <AppStack.Screen name="SelfTransfers" component={SelfTransferScreen} />
        <AppStack.Screen
          name="Activity"
          children={() => <DummyScreen title="Activity" />}
        />
        <AppStack.Screen
          name="Profile"
          children={() => <DummyScreen title="Profile" />}
        />
      </AppStack.Navigator>

      <Pressable
        onPress={() => setIsMenuOpen(true)}
        style={({ pressed }) => [
          staticBarStyles.wrap,
          { paddingBottom: 12 + insets.bottom },
          pressed && staticBarStyles.wrapPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Open navigation menu"
      >
        <Text style={staticBarStyles.brand}>SplitApp</Text>
        <Text style={staticBarStyles.hint}>Menu</Text>
      </Pressable>

      <Modal
        visible={isMenuOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsMenuOpen(false)}
      >
        <Pressable
          style={menuStyles.backdrop}
          onPress={() => setIsMenuOpen(false)}
        />
        <View
          style={[menuStyles.sheet, { paddingBottom: 16 + insets.bottom }]}
        >
          <View style={menuStyles.header}>
            <Text style={menuStyles.title}>Navigation</Text>
            <Pressable
              onPress={() => setIsMenuOpen(false)}
              style={({ pressed }) => [
                menuStyles.closeBtn,
                pressed && menuStyles.closeBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
            >
              <Text style={menuStyles.closeText}>Close</Text>
            </Pressable>
          </View>

          <View style={menuStyles.list}>
            {navItems.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => goTo(item.key)}
                style={({ pressed }) => [
                  menuStyles.row,
                  pressed && menuStyles.rowPressed,
                ]}
                accessibilityRole="button"
              >
                <View style={menuStyles.rowLeft}>
                  <Feather name={item.icon} size={16} color="#0B0B0B" />
                  <Text style={menuStyles.rowText}>{item.label}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          <View style={menuStyles.footer}>
            <Pressable
              onPress={onLogout}
              style={({ pressed }) => [
                menuStyles.logoutBtn,
                pressed && menuStyles.logoutBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Logout"
            >
              <Text style={menuStyles.logoutText}>Logout</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function AppNavigator() {
  const [accessToken, setAccessToken] = React.useState<string | null>(null);
  const [isHydrating, setIsHydrating] = React.useState(true);

  React.useEffect(() => {
    setUnauthorizedHandler(() => {
      setAccessToken(null);
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      const token = await getToken();
      if (mounted) {
        setAccessToken(token);
        setIsHydrating(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const authContext = React.useMemo(
    () => ({ accessToken, setAccessToken }),
    [accessToken]
  );

  if (isHydrating) return null;

  return (
    <AuthContext.Provider value={authContext}>
      <NavigationContainer key={accessToken ? "app" : "auth"}>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          {accessToken ? (
            <RootStack.Screen name="App" component={AppShell} />
          ) : (
            <RootStack.Screen name="Auth" component={AuthNavigator} />
          )}
        </RootStack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
}

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

const staticBarStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: "#E7E7E7",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wrapPressed: { backgroundColor: "#F5F5F5" },
  brand: { color: "#0B0B0B", fontSize: 13, fontFamily: "Poppins_700Bold" },
  hint: { color: "#6B6B6B", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
});

const menuStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: "#E7E7E7",
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: { fontSize: 16, fontFamily: "Poppins_700Bold", color: "#0B0B0B" },
  closeBtn: {
    borderWidth: 1,
    borderColor: "#0B0B0B",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeBtnPressed: { backgroundColor: "#F5F5F5" },
  closeText: { color: "#0B0B0B", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  list: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 4,
    alignItems: "flex-start",
  },
  row: {
    borderWidth: 1,
    borderColor: "#E7E7E7",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    alignSelf: "flex-start",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowPressed: { backgroundColor: "#F5F5F5" },
  rowText: { color: "#0B0B0B", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  footer: { marginTop: 6 },
  logoutBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B0B0B",
  },
  logoutBtnPressed: { opacity: 0.88 },
  logoutText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Poppins_700Bold" },
});

const dummyStyles = StyleSheet.create({
  title: { fontSize: 18, fontFamily: "Poppins_700Bold", color: "#0B0B0B" },
  subtitle: { fontSize: 13, fontFamily: "Poppins_400Regular", color: "#6B6B6B" },
});

