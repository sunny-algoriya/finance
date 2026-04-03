import axios from "axios";
import { API_BASE_URL } from "../../config";
import { getAccessToken } from "../utils/storage";

export const api = axios.create({
  baseURL: API_BASE_URL,
});

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

