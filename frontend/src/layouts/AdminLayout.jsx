import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LayoutDashboard, MessageSquareWarning, MapPinned, Users } from 'lucide-react';
import api from '../api/axios';
import PanelShell from '../components/common/PanelShell';

// Sumber pencarian cepat di top bar (didefinisikan di luar komponen supaya stabil)
const SEARCH_SOURCES = [
  {
    label: 'Destinasi',
    search: (q) =>
      api.get('/admin/destinations', { params: { q, limit: 4 } }).then((r) =>
        r.data.items.map((d) => ({
          key: `d${d.id}`,
          title: d.name,
          sub: `${d.location} · ${d.category}`,
          to: `/admin/destinasi?q=${encodeURIComponent(d.name)}`,
        })),
      ),
  },
  {
    label: 'Pengguna',
    search: (q) =>
      api.get('/admin/users', { params: { q, limit: 4 } }).then((r) =>
        r.data.items.map((u) => ({
          key: `u${u.id}`,
          title: u.name,
          sub: `${u.email} · ${u.role}`,
          to: `/admin/users?q=${encodeURIComponent(u.email)}`,
        })),
      ),
  },
  {
    label: 'Ulasan',
    search: (q) =>
      api.get('/admin/reviews', { params: { q, limit: 3 } }).then((r) =>
        r.data.items.map((rv) => ({
          key: `r${rv.id}`,
          title: rv.title || rv.content.slice(0, 60),
          sub: `${rv.user_name} · ${rv.destination_name}`,
          to: `/admin/ulasan?q=${encodeURIComponent(q)}`,
        })),
      ),
  },
];

// Panel admin murni: tanpa tautan ke situs publik
export default function AdminLayout() {
  const { pathname } = useLocation();
  const [openReports, setOpenReports] = useState(0);

  // Badge menu Moderasi = jumlah ulasan dengan laporan terbuka; diperbarui tiap pindah halaman
  useEffect(() => {
    let alive = true;
    api
      .get('/admin/reports/count')
      .then((r) => alive && setOpenReports(r.data.open))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  const menu = useMemo(
    () => [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/ulasan', label: 'Moderasi Ulasan', icon: MessageSquareWarning, badge: openReports },
      { to: '/admin/destinasi', label: 'Kelola Destinasi & Mitra', icon: MapPinned },
      { to: '/admin/users', label: 'Kelola Pengguna', icon: Users },
    ],
    [openReports],
  );

  return (
    <PanelShell
      portalLabel="Admin Console"
      roleLabel="Administrator"
      menu={menu}
      homeTo="/admin"
      accountTo="/admin/akun"
      showSiteLink={false}
      searchSources={SEARCH_SOURCES}
      searchPlaceholder="Cari destinasi, pengguna, atau ulasan..."
      logoutDescription="Apakah Anda yakin ingin keluar dari akun NusantaraReview? Anda perlu masuk lagi untuk membuka panel admin."
    />
  );
}
