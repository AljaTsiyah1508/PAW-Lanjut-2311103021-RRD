import axios from "axios";
import { API_ORIGIN } from "../utils/helpers";

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
});

// Otomatis menyisipkan token di setiap request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
