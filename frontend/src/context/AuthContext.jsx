import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api/axios';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUser(data);
    return data;
  }, []);

  // Saat aplikasi dibuka, cek token yang tersimpan
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe()
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, [fetchMe]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    return fetchMe();
  };

  // Sesuai SRS 3.1: setelah registrasi, user diarahkan ke halaman login (tidak login otomatis)
  const register = async (form) => {
    const { data } = await api.post('/auth/register', form);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  // Muat ulang data user (dipanggil setelah profil diubah)
  const refresh = () => fetchMe().catch(() => {});

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}