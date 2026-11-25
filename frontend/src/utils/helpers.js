// Alamat backend: VITE_API_URL saat online, localhost saat pengembangan
export const API_ORIGIN = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/[/]+$/, "");

export const imgUrl = (path) => {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${API_ORIGIN}/uploads/${path.replace(/^\/+/, "")}`;
};

export const rupiah = (n) => {
  if (n === null || n === undefined) return "Belum ada info";
  const v = Number(n);
  if (!v) return "Gratis";
  return v >= 1000 ? `Rp ${Math.round(v / 1000)}rb` : `Rp ${v}`;
};

export const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");

export const timeAgo = (date) => {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return "baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} menit yang lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam yang lalu`;
  return `${Math.floor(diff / 86400)} hari yang lalu`;
};

// Tujuan tombol "Daftarkan/Klaim Destinasi" sesuai role yang login
export const partnerLink = (user) => {
  if (user?.role === 'pengelola') return '/pengelola/destinasi?tambah=1';
  if (user?.role === 'admin') return '/admin/destinasi';
  return '/register?role=pengelola';
};

export const monthYear = (date) =>
  new Date(date).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });

// Angka dengan pemisah ribuan Indonesia (1.234)
export const fmtNum = (n) => Number(n || 0).toLocaleString("id-ID");
