import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Trash2, RefreshCw, UserRoundX, X, Plus, Pencil, Download, Users, Compass,
  MessageSquare, Store, ShieldCheck,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useToast, errorMessage } from '../../context/toast';
import ConfirmModal from '../../components/common/ConfirmModal';
import Pagination from '../../components/common/Pagination';
import { PageHead, StatCard, PillTabs } from '../../components/common/PanelUI';
import UserFormModal from './UserFormModal';
import { imgUrl, initials, fmtNum as fmt } from '../../utils/helpers';
import { downloadCsv, fetchAllPages, stamp } from '../../utils/csv';

const ROLES = [
  { value: 'wisatawan', label: 'Wisatawan' },
  { value: 'pengelola', label: 'Pengelola' },
  { value: 'admin', label: 'Admin' },
];
const roleLabel = (r) => ROLES.find((x) => x.value === r)?.label || r;
const LIMIT = 15;

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AdminUsers() {
  const { user: me, refresh: refreshMe } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') || '';
  const role = params.get('role') || '';
  const page = Math.max(Number(params.get('page')) || 1, 1);

  const [term, setTerm] = useState(q);
  // Sinkronkan kotak cari bila ?q= berubah dari luar (mis. pencarian cepat di top bar)
  const [syncedQ, setSyncedQ] = useState(q);
  if (syncedQ !== q) {
    setSyncedQ(q);
    setTerm(q);
  }
  const [tick, setTick] = useState(0); // naikkan untuk memuat ulang
  const key = `${q}|${role}|${page}|${tick}`;
  // Hasil disimpan bersama kuncinya: loading = hasil belum untuk kunci sekarang
  const [result, setResult] = useState({ key: null, data: null, error: '' });
  const loading = result.key !== key;

  const [roleChange, setRoleChange] = useState(null); // { user, role }
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [userForm, setUserForm] = useState(null); // { user: null | obj }

  const formSaved = (msg) => {
    const editedSelf = userForm?.user?.id === me.id;
    toast.success(msg);
    setUserForm(null);
    if (editedSelf) refreshMe(); // nama/email di sidebar ikut berubah
    setTick((t) => t + 1);
  };

  // Ubah parameter URL; selain pindah halaman, kembali ke halaman 1
  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, String(v)) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Cari otomatis 350 ms setelah berhenti mengetik
  useEffect(() => {
    const t = setTimeout(() => {
      if (term.trim() !== q) update({ q: term.trim() });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  useEffect(() => {
    let alive = true;
    api
      .get('/admin/users', { params: { q, role, page, limit: LIMIT } })
      .then((res) => alive && setResult({ key, data: res.data, error: '' }))
      .catch((err) => alive && setResult({ key, data: null, error: errorMessage(err, 'Gagal memuat daftar user') }));
    return () => {
      alive = false;
    };
  }, [key, q, role, page]);

  const [stats, setStats] = useState(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    let alive = true;
    api.get('/admin/users/stats').then((r) => alive && setStats(r.data)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [tick]);

  const reload = () => setTick((t) => t + 1);
  const data = result.data;
  const hasFilter = Boolean(q || role);

  const tabs = [
    { key: '', label: 'Semua Pengguna', count: stats?.total },
    { key: 'wisatawan', label: 'Wisatawan', count: stats?.roles.wisatawan },
    { key: 'pengelola', label: 'Pengelola Destinasi', count: stats?.roles.pengelola },
    { key: 'admin', label: 'Administrator', count: stats?.roles.admin },
  ];

  // Unduh daftar pengguna sesuai filter aktif (tanpa data sensitif; maks. 2.000 baris)
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllPages((p) =>
        api.get('/admin/users', { params: { q, role, page: p, limit: 50 } }).then((r) => r.data),
      );
      downloadCsv(
        `pengguna-${role || 'semua'}-${stamp()}.csv`,
        [
          { label: 'ID', value: 'id' },
          { label: 'Nama', value: 'name' },
          { label: 'Email', value: 'email' },
          { label: 'Username', value: (r) => r.username || '' },
          { label: 'Peran', value: (r) => roleLabel(r.role) },
          { label: 'Jumlah ulasan', value: 'review_count' },
          { label: 'Jumlah foto', value: 'photo_count' },
          { label: 'Destinasi dimiliki', value: 'owned_count' },
          { label: 'Bergabung', value: (r) => fmtDate(r.created_at) },
        ],
        rows,
      );
      toast.success(`${fmt(rows.length)} pengguna diunduh (CSV)`);
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengunduh data'));
    } finally {
      setExporting(false);
    }
  };

  const confirmRole = async () => {
    const { user, role: newRole } = roleChange;
    setBusy(true);
    try {
      await api.patch(`/admin/users/${user.id}/role`, { role: newRole });
      toast.success(`Role ${user.name} diubah menjadi ${roleLabel(newRole)}`);
      setRoleChange(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengubah role'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/admin/users/${toDelete.id}`);
      toast.success(`User ${toDelete.name} dihapus`);
      setToDelete(null);
      // Halaman jadi kosong setelah hapus? mundur satu halaman
      if (data && data.items.length === 1 && page > 1) update({ page: page - 1 });
      else reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menghapus user'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Tata kelola akun"
        icon={ShieldCheck}
        title="Kelola Pengguna"
        desc="Tambah akun, ubah data dan peran pengguna, atau hapus akun yang melanggar ketentuan komunitas."
      >
        <button type="button" className="ad-btn soft" onClick={exportCsv} disabled={exporting || !data}>
          <Download size={15} /> {exporting ? 'Menyiapkan...' : 'Ekspor Data (CSV)'}
        </button>
        <button type="button" className="ad-btn accent" onClick={() => setUserForm({ user: null })}>
          <Plus size={15} /> Tambah Akun
        </button>
      </PageHead>

      {stats && (
        <section className="ad-stats" aria-label="Statistik pengguna">
          <StatCard icon={Users} label="Total Pengguna" value={fmt(stats.total)}>
            +{fmt(stats.new30)} akun baru dalam 30 hari
          </StatCard>
          <StatCard icon={Compass} label="Wisatawan" value={fmt(stats.roles.wisatawan)}>
            {fmt(stats.contributors)} pernah menulis ulasan
          </StatCard>
          <StatCard icon={MessageSquare} label="Ulasan Diterbitkan" value={fmt(stats.reviews)} unit="ulasan">
            Oleh seluruh pengguna
          </StatCard>
          <StatCard icon={Store} label="Pengelola Destinasi" value={fmt(stats.roles.pengelola)} tone={stats.idlePengelola ? 'warn' : undefined}>
            {stats.idlePengelola ? `${fmt(stats.idlePengelola)} belum punya destinasi` : 'Semua sudah punya destinasi'}
          </StatCard>
        </section>
      )}

      <PillTabs tabs={tabs} value={role} onChange={(k) => update({ role: k })} label="Peran pengguna" />

      <div className="ad-toolbar">
        <label className="ad-search">
          <Search size={16} />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Cari nama, email, atau username"
            aria-label="Cari pengguna"
          />
        </label>
        {q && (
          <button type="button" className="ad-btn soft" onClick={() => { setTerm(''); update({ q: '' }); }}>
            <X size={14} /> Hapus pencarian
          </button>
        )}
        <button type="button" className="ad-icon-btn" onClick={reload} disabled={loading} title="Muat ulang" aria-label="Muat ulang">
          <RefreshCw size={15} className={loading ? 'ad-spin' : ''} />
        </button>
      </div>

      {result.error && !loading ? (
        <div className="ad-state error" role="alert">
          <strong>Daftar user tidak bisa dimuat</strong>
          <p>{result.error}</p>
          <button type="button" className="ad-btn soft" onClick={reload}>Coba lagi</button>
        </div>
      ) : data && data.items.length === 0 && !loading ? (
        <div className="ad-state">
          <UserRoundX size={28} />
          <strong>{hasFilter ? 'Tidak ada user yang cocok' : 'Belum ada user'}</strong>
          {hasFilter && <p>Coba kata kunci lain atau hapus filter.</p>}
        </div>
      ) : (
        <>
          <div className="ad-table-wrap" aria-busy={loading}>
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Profil Pengguna</th>
                  <th>Peran</th>
                  <th>Ulasan &amp; Foto</th>
                  <th>Destinasi Dimiliki</th>
                  <th>Tanggal Bergabung</th>
                  <th className="actions"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody style={{ opacity: loading && data ? 0.55 : 1 }}>
                {!data ? (
                  <tr className="ad-loading-row"><td colSpan={6}>Memuat user...</td></tr>
                ) : (
                  data.items.map((u) => {
                    const isMe = u.id === me.id;
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="ad-cell-main">
                            {u.avatar ? (
                              <img className="ad-avatar" src={imgUrl(u.avatar)} alt="" />
                            ) : (
                              <span className="ad-avatar">{initials(u.name)}</span>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <strong>
                                {u.name} {isMe && <span className="ad-badge you">Kamu</span>}
                              </strong>
                              <small>{u.email}{u.username ? ` · @${u.username}` : ''}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <select
                            className={`ad-select ad-role-select ${u.role}`}
                            value={u.role}
                            disabled={isMe || loading}
                            title={isMe ? 'Kamu tidak bisa mengubah role akunmu sendiri' : 'Ubah role'}
                            aria-label={`Role ${u.name}`}
                            onChange={(e) => setRoleChange({ user: u, role: e.target.value })}
                          >
                            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </td>
                        <td>
                          <span className="ad-owner">
                            <strong>{fmt(u.review_count)} ulasan</strong>
                            <small>{fmt(u.photo_count)} foto diunggah</small>
                          </span>
                        </td>
                        <td>
                          {u.role === 'pengelola' ? (
                            u.owned_count > 0 ? (
                              <span className="ad-tag green">{fmt(u.owned_count)} destinasi</span>
                            ) : (
                              <span className="ad-tag amber">Belum ada</span>
                            )
                          ) : (
                            <span className="ad-muted">–</span>
                          )}
                        </td>
                        <td>{fmtDate(u.created_at)}</td>
                        <td className="actions">
                          <button
                            type="button"
                            className="ad-icon-btn"
                            disabled={loading}
                            title={`Edit ${u.name}`}
                            aria-label={`Edit ${u.name}`}
                            onClick={() => setUserForm({ user: u })}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="ad-icon-btn danger"
                            disabled={isMe || loading}
                            title={isMe ? 'Kamu tidak bisa menghapus akunmu sendiri' : `Hapus ${u.name}`}
                            aria-label={`Hapus ${u.name}`}
                            onClick={() => setToDelete(u)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {data && (
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              disabled={loading}
              onChange={(p) => update({ page: p })}
            />
          )}
        </>
      )}

      {userForm && (
        <UserFormModal
          user={userForm.user}
          isSelf={userForm.user?.id === me.id}
          onClose={() => setUserForm(null)}
          onSaved={formSaved}
        />
      )}

      <ConfirmModal
        open={Boolean(roleChange)}
        tone="primary"
        title="Ubah role user?"
        confirmLabel="Ya, ubah role"
        busy={busy}
        onClose={() => setRoleChange(null)}
        onConfirm={confirmRole}
        message={
          roleChange && (
            <>
              <p>
                Role <b>{roleChange.user.name}</b> akan diubah dari <b>{roleLabel(roleChange.user.role)}</b> menjadi{' '}
                <b>{roleLabel(roleChange.role)}</b>.
              </p>
              {roleChange.role === 'admin' && <p>Admin bisa mengelola semua user, destinasi, dan ulasan.</p>}
              {roleChange.user.role === 'pengelola' && roleChange.user.owned_count > 0 && (
                <p>User ini masih memiliki {roleChange.user.owned_count} destinasi. Kepemilikan tidak berubah otomatis.</p>
              )}
            </>
          )
        }
      />

      <ConfirmModal
        open={Boolean(toDelete)}
        title="Hapus user ini?"
        confirmLabel="Ya, hapus user"
        busy={busy}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        message={
          toDelete && (
            <>
              <p>
                Akun <b>{toDelete.name}</b> ({toDelete.email}) akan dihapus permanen.
              </p>
              <p>
                Ikut terhapus: {toDelete.review_count} ulasan beserta rating, foto, wishlist, dan notifikasinya.
                {toDelete.owned_count > 0 && ` ${toDelete.owned_count} destinasi miliknya menjadi tanpa pemilik.`}
              </p>
              <p><b>Tindakan ini tidak bisa dibatalkan.</b></p>
            </>
          )
        }
      />
    </>
  );
}
