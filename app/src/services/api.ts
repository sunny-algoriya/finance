import axios from "axios";
import { API_BASE_URL } from "../../config";
import { clearTokens, getAccessToken } from "../utils/storage";

export const api = axios.create({
  baseURL: API_BASE_URL,
});

let onUnauthorized: (() => void) | null = null;
let isHandlingUnauthorized = false;

/** Register global callback invoked when API receives HTTP 401. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

api.interceptors.request.use(async (config: any) => {
  const token = await getAccessToken();
  if (!token) return config;

  // Keep typing flexible across axios versions.
  const headers = config.headers ?? {};
  config.headers = {
    ...headers,
    Authorization: `Bearer ${token}`,
  };

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    if (status === 401 && !isHandlingUnauthorized) {
      isHandlingUnauthorized = true;
      try {
        await clearTokens();
        onUnauthorized?.();
      } finally {
        isHandlingUnauthorized = false;
      }
    }
    return Promise.reject(error);
  }
);

