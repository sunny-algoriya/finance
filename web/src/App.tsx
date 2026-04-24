import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import MainLayout from "./components/MainLayout";
import TransactionsScreen from "./screens/TransactionsScreen";

function App() {
  const { accessToken, isHydrating } = useAuth();

  if (isHydrating) {
    return null;
  }

  return (
    <Routes>
      {!accessToken ? (
        <>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/register" element={<RegisterScreen />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Navigate to="/transactions" replace />} />
            <Route path="transactions" element={<TransactionsScreen />} />
          </Route>
          <Route path="*" element={<Navigate to="/transactions" replace />} />
        </>
      )}
    </Routes>
  );
}

export default App;
