import { api } from "./api";

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
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export async function getToken(): Promise<string | null> {
  return localStorage.getItem('accessToken');
}

export async function logout(): Promise<void> {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}
