import { api } from "./api";
import {
  clearTokens,
  getAccessToken,
  saveTokens,
} from "../utils/storage";

export type AuthTokens = {
  access: string;
  refresh: string;
};

function extractTokens(data: any): AuthTokens {
  const access =
    data?.access ??
    data?.access_token ??
    data?.accessToken;
  const refresh =
    data?.refresh ??
    data?.refresh_token ??
    data?.refreshToken;

  if (!access || !refresh) {
    throw new Error("Invalid token response from server.");
  }

  return { access, refresh };
}

export async function login(
  email: string,
  password: string
): Promise<AuthTokens> {
  const res = await api.post("/token/", { email, password });
  return extractTokens(res.data);
}

export async function register(
  email: string,
  password: string
): Promise<AuthTokens> {
  const res = await api.post("/auth/register/", { email, password });
  return extractTokens(res.data);
}

export async function saveToken(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  await saveTokens(accessToken, refreshToken);
}

export async function getToken(): Promise<string | null> {
  return getAccessToken();
}

export async function logout(): Promise<void> {
  await clearTokens();
}

