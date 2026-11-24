import { LayoutDashboard, MapPinned, MessageSquare } from 'lucide-react';
import api from '../api/axios';
import PanelShell from '../components/common/PanelShell';

const MENU = [
  { to: '/pengelola', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pengelola/destinasi', label: 'Destinasi Saya', icon: MapPinned },
  { to: '/pengelola/ulasan', label: 'Ulasan & Rating', icon: MessageSquare },
];

// Pencarian cepat: hanya destinasi milik pengelola (didefinisikan di luar komponen supaya stabil)
const SEARCH_SOURCES = [
  {
    label: 'Destinasi saya',
    search: (q) =>
      api.get('/manage/destinations', { params: { q, limit: 5 } }).then((r) =>
        r.data.items.map((d) => ({
          key: `d${d.id}`,
          title: d.name,
          sub: `${d.location} · ${d.review_count} ulasan`,
          to: `/pengelola/destinasi?q=${encodeURIComponent(d.name)}`,
        })),
      ),
  },
];

// Portal pengelola destinasi: panel murni seperti admin (tanpa tautan ke situs publik)
export default function PengelolaLayout() {
  return (
    <PanelShell
      portalLabel="Portal Mitra"
      roleLabel="Pengelola Destinasi"
      menu={MENU}
      homeTo="/pengelola"
      accountTo="/pengelola/akun"
      showSiteLink={false}
      searchSources={SEARCH_SOURCES}
      searchPlaceholder="Cari destinasi saya..."
      logoutDescription="Apakah Anda yakin ingin keluar dari akun NusantaraReview? Anda perlu masuk lagi untuk membuka portal mitra."
    />
  );
}
