import axios from "axios";
import { API_BASE_URL } from "../config";

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
  const token = localStorage.getItem('accessToken');
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
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        onUnauthorized?.();
      } finally {
        isHandlingUnauthorized = false;
      }
    }
    return Promise.reject(error);
  }
);
