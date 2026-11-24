import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

// Pakai: const toast = useToast(); toast.success('Tersimpan'); toast.error('Gagal')
export const useToast = () => useContext(ToastContext);

// Ambil pesan error dari respons backend ({ message }) atau pakai cadangan
export const errorMessage = (err, fallback = 'Terjadi kesalahan, coba lagi') =>
  err?.response?.data?.message ||
  (err?.request && !err?.response ? 'Server tidak dapat dihubungi' : fallback);
