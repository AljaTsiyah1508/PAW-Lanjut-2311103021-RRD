import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Layout situs publik / wisatawan.
// Sementara hanya <Outlet/>: tiap halaman masih memanggil Navbar dan Footer sendiri
// (termasuk state loading/error-nya), supaya tampilan tidak berubah.
// TODO: pindahkan Navbar + Footer ke sini dalam tugas terpisah.
//
// Admin dan pengelola adalah peran panel murni: halaman situs publik dialihkan ke panel masing-masing.
const PANEL_HOME = { admin: '/admin', pengelola: '/pengelola' };

export default function WisatawanLayout() {
  const { user, loading } = useAuth();
  if (loading) return null; // tunggu status login supaya peran panel tidak sempat melihat situs
  if (PANEL_HOME[user?.role]) return <Navigate to={PANEL_HOME[user.role]} replace />;
  return <Outlet />;
}
