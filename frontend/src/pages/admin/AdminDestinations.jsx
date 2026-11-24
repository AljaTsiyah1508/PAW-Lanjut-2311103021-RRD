import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search, Plus, Pencil, Trash2, UserCog, RefreshCw, MapPinOff, X, Star, Images,
  Download, MapPinned, Handshake, UserX, Store, ClipboardList, Tags,
} from 'lucide-react';
import api from '../../api/axios';
import { useToast, errorMessage } from '../../context/toast';
import ConfirmModal from '../../components/common/ConfirmModal';
import Pagination from '../../components/common/Pagination';
import DestinationFormModal from '../../components/common/DestinationFormModal';
import GalleryModal from '../../components/common/GalleryModal';
import CategoryManagerModal from './CategoryManagerModal';
import { PageHead, StatCard, PillTabs } from '../../components/common/PanelUI';
import { imgUrl, fmtNum as fmt } from '../../utils/helpers';
import { downloadCsv, fetchAllPages, stamp } from '../../utils/csv';

const SOURCES = [
  { value: 'wikidata', label: 'Wikidata' },
  { value: 'osm', label: 'OpenStreetMap' },
  { value: 'manual', label: 'Manual' },
];
const sourceLabel = (s) => SOURCES.find((x) => x.value === s)?.label || s;
const LIMIT = 15;

// Modal tetapkan / lepas pemilik (pengelola)
function OwnerModal({ destination, onClose, onSaved }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [ownerId, setOwnerId] = useState(destination.owner_id ? String(destination.owner_id) : '');
  const [saving, setSaving] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get('/admin/pengelola')
      .then((res) => alive && setList(res.data.items))
      .catch((err) => alive && setLoadError(errorMessage(err, 'Gagal memuat daftar pengelola')));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving && !confirmRelease) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, confirmRelease, onClose]);

  const save = async (id) => {
    setSaving(true);
    try {
      await api.patch(`/admin/destinations/${destination.id}/owner`, { owner_id: id ? Number(id) : null });
      onSaved(id ? 'Pemilik destinasi ditetapkan' : 'Pemilik destinasi dilepas');
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menyimpan pemilik'));
      setSaving(false);
      setConfirmRelease(false);
    }
  };

  const unchanged = ownerId === (destination.owner_id ? String(destination.owner_id) : '');

  return (
    <>
      <div className="ad-overlay" onClick={() => !saving && onClose()}>
        <div className="ad-modal sm" role="dialog" aria-modal="true" aria-labelledby="owner-title" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="ad-modal-x" onClick={onClose} disabled={saving} aria-label="Tutup"><X size={16} /></button>
          <h3 id="owner-title">Pemilik destinasi</h3>
          <p className="ad-muted" style={{ margin: '0 0 14px' }}>{destination.name}</p>

          {loadError ? (
            <div className="ad-form-error" role="alert">{loadError}</div>
          ) : !list ? (
            <p className="ad-empty-inline">Memuat daftar pengelola...</p>
          ) : list.length === 0 ? (
            <div className="ad-state" style={{ padding: 20 }}>
              <strong>Belum ada user ber-role pengelola</strong>
              <p>Ubah role user menjadi pengelola dulu di Kelola User.</p>
              <Link to="/admin/users" className="ad-link">Buka Kelola User</Link>
            </div>
          ) : (
            <div className="ad-field">
              <label htmlFor="owner-select">Pilih pengelola</label>
              <select id="owner-select" className="ad-select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={saving}>
                <option value="">Tanpa pemilik</option>
                {list.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email}) · {u.owned_count} destinasi
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="ad-modal-actions">
            {destination.owner_id && (
              <button type="button" className="ad-btn soft" style={{ marginRight: 'auto' }} disabled={saving} onClick={() => setConfirmRelease(true)}>
                Lepas pemilik
              </button>
            )}
            <button type="button" className="ad-btn soft" onClick={onClose} disabled={saving}>Batal</button>
            <button
              type="button"
              className="ad-btn primary"
              disabled={saving || unchanged || !list || list.length === 0 || !ownerId}
              onClick={() => save(ownerId)}
            >
              {saving ? 'Menyimpan...' : 'Simpan pemilik'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmRelease}
        tone="primary"
        title="Lepas pemilik?"
        confirmLabel="Ya, lepas pemilik"
        busy={saving}
        onClose={() => setConfirmRelease(false)}
        onConfirm={() => save(null)}
        message={<p><b>{destination.owner_name}</b> tidak lagi tercatat sebagai pemilik <b>{destination.name}</b>.</p>}
      />
    </>
  );
}

export default function AdminDestinations() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const source = params.get('source') || '';
  const owner = params.get('owner') || '';
  const page = Math.max(Number(params.get('page')) || 1, 1);

  const [term, setTerm] = useState(q);
  // Sinkronkan kotak cari bila ?q= berubah dari luar (mis. pencarian cepat di top bar)
  const [syncedQ, setSyncedQ] = useState(q);
  if (syncedQ !== q) {
    setSyncedQ(q);
    setTerm(q);
  }
  const [tick, setTick] = useState(0);
  const key = `${q}|${category}|${source}|${owner}|${page}|${tick}`;
  const [result, setResult] = useState({ key: null, data: null, error: '' });
  const loading = result.key !== key;

  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState(null); // { destination: null | obj }
  const [ownerOf, setOwnerOf] = useState(null);
  const [galleryOf, setGalleryOf] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = useCallback(
    (patch) => {
      const next = new URLSearchParams(params);
      Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, String(v)) : next.delete(k)));
      if (!('page' in patch)) next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (term.trim() !== q) update({ q: term.trim() });
    }, 350);
    return () => clearTimeout(t);
  }, [term, q, update]);

  // Daftar kategori (+ jumlah destinasi) — dimuat ulang setelah kategori diubah di modal
  const [catTick, setCatTick] = useState(0);
  useEffect(() => {
    api
      .get('/admin/categories')
      .then((res) => setCategories(res.data.items))
      .catch(() => toast.error('Daftar kategori gagal dimuat'));
  }, [toast, catTick]);
  // ?kelola=kategori (mis. dari tautan lama /admin/kategori) langsung membuka modal kategori
  const [catModal, setCatModal] = useState(() => params.get('kelola') === 'kategori');
  const closeCatModal = () => {
    setCatModal(false);
    if (params.get('kelola')) update({ kelola: '' });
  };

  useEffect(() => {
    let alive = true;
    api
      .get('/admin/destinations', { params: { q, category, source, owner, page, limit: LIMIT } })
      .then((res) => alive && setResult({ key, data: res.data, error: '' }))
      .catch((err) => alive && setResult({ key, data: null, error: errorMessage(err, 'Gagal memuat destinasi') }));
    return () => {
      alive = false;
    };
  }, [key, q, category, source, owner, page]);

  useEffect(() => {
    let alive = true;
    api.get('/admin/destinations/stats').then((r) => alive && setStats(r.data)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [tick]);

  const reload = () => setTick((t) => t + 1);
  const data = result.data;
  const hasFilter = Boolean(q || category || source || owner);

  // Tab = kombinasi filter pemilik/sumber
  const tab = owner === 'yes' ? 'owned' : owner === 'no' ? 'unowned' : source === 'manual' ? 'manual' : 'all';
  const TAB_PARAMS = {
    all: { owner: '', source: '' },
    owned: { owner: 'yes', source: '' },
    unowned: { owner: 'no', source: '' },
    manual: { owner: '', source: 'manual' },
  };
  const tabs = [
    { key: 'all', label: 'Semua Destinasi', count: stats?.total },
    { key: 'owned', label: 'Berpemilik (Mitra)', count: stats?.owned },
    { key: 'unowned', label: 'Tanpa Pemilik', count: stats?.unowned, alert: stats?.unowned > 0 },
    { key: 'manual', label: 'Ditambahkan Manual', count: stats?.manual },
  ];
  const categoryName = categories.find((c) => String(c.id) === category)?.name;

  // Unduh data sesuai filter aktif (maks. 2.000 baris)
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllPages((p) =>
        api.get('/admin/destinations', { params: { q, category, source, owner, page: p, limit: 50 } }).then((r) => r.data),
      );
      downloadCsv(
        `destinasi-${tab}-${stamp()}.csv`,
        [
          { label: 'ID', value: 'id' },
          { label: 'Nama', value: 'name' },
          { label: 'Lokasi', value: 'location' },
          { label: 'Kategori', value: 'category' },
          { label: 'Sumber', value: (r) => sourceLabel(r.source) },
          { label: 'Pemilik', value: (r) => r.owner_name || '' },
          { label: 'Email pemilik', value: (r) => r.owner_email || '' },
          { label: 'Rata-rata rating', value: 'avg_rating' },
          { label: 'Jumlah rating', value: 'rating_count' },
          { label: 'Jumlah ulasan', value: 'review_count' },
          { label: 'Jumlah foto', value: 'photo_count' },
          { label: 'Harga tiket', value: (r) => r.price ?? '' },
        ],
        rows,
      );
      toast.success(`${fmt(rows.length)} destinasi diunduh (CSV)`);
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengunduh data'));
    } finally {
      setExporting(false);
    }
  };

  const saved = (msg) => {
    toast.success(msg);
    setForm(null);
    setOwnerOf(null);
    reload();
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/admin/destinations/${toDelete.id}`);
      toast.success(`Destinasi "${toDelete.name}" dihapus`);
      setToDelete(null);
      if (data && data.items.length === 1 && page > 1) update({ page: page - 1 });
      else reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menghapus destinasi'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Data destinasi & kemitraan"
        icon={ClipboardList}
        title="Kelola Destinasi & Mitra"
        desc="Kelola data destinasi wisata, tetapkan pengelola (mitra) sebagai pemilik, dan kelola galeri foto setiap destinasi."
      >
        <button type="button" className="ad-btn soft" onClick={exportCsv} disabled={exporting || !data}>
          <Download size={15} /> {exporting ? 'Menyiapkan...' : 'Unduh Data (CSV)'}
        </button>
        <button type="button" className="ad-btn soft" onClick={() => setCatModal(true)}>
          <Tags size={15} /> Kelola Kategori
        </button>
        <button type="button" className="ad-btn accent" onClick={() => setForm({ destination: null })} disabled={categories.length === 0}>
          <Plus size={15} /> Tambah Destinasi Baru
        </button>
      </PageHead>

      {stats && (
        <section className="ad-stats" aria-label="Statistik destinasi">
          <StatCard icon={MapPinned} label="Total Destinasi" value={fmt(stats.total)}>
            {stats.topCategories.map((c) => `${fmt(c.total)} ${c.name}`).join(' · ')}
          </StatCard>
          <StatCard icon={Handshake} label="Destinasi Berpemilik" value={fmt(stats.owned)} unit={`oleh ${fmt(stats.mitra)} mitra`}>
            Dikelola langsung oleh pengelola resmi
          </StatCard>
          <StatCard icon={UserX} label="Tanpa Pemilik" value={fmt(stats.unowned)} tone={stats.unowned ? 'warn' : undefined}>
            <button type="button" className="ad-link ad-link-btn" onClick={() => update(TAB_PARAMS.unowned)}>Lihat daftar</button>
          </StatCard>
          <StatCard icon={Store} label="Pengelola Tanpa Destinasi" value={fmt(stats.idlePengelola)} unit="akun" tone={stats.idlePengelola ? 'warn' : undefined}>
            Tetapkan lewat ikon <UserCog size={11} /> di tabel
          </StatCard>
        </section>
      )}

      <PillTabs tabs={tabs} value={tab} onChange={(k) => update(TAB_PARAMS[k])} label="Kelompok destinasi" />

      {/* Pengelompokan per kategori: klik untuk menampilkan destinasi kategori itu */}
      {categories.length > 0 && (
        <div className="ad-catbar" role="group" aria-label="Kategori destinasi">
          <button type="button" className={`ad-catchip${!category ? ' on' : ''}`} aria-pressed={!category} onClick={() => update({ category: '' })}>
            Semua kategori
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`ad-catchip${category === String(c.id) ? ' on' : ''}`}
              aria-pressed={category === String(c.id)}
              onClick={() => update({ category: c.id })}
            >
              {c.name} <b>{fmt(c.total)}</b>
            </button>
          ))}
          <button type="button" className="ad-catchip manage" onClick={() => setCatModal(true)} title="Tambah, ubah nama, atau hapus kategori">
            <Tags size={13} /> Kelola
          </button>
        </div>
      )}

      <div className="ad-toolbar">
        <label className="ad-search">
          <Search size={16} />
          <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Cari nama destinasi atau lokasi (kota/kabupaten)" aria-label="Cari destinasi" />
        </label>
        <button type="button" className="ad-icon-btn" onClick={reload} disabled={loading} title="Muat ulang" aria-label="Muat ulang">
          <RefreshCw size={15} className={loading ? 'ad-spin' : ''} />
        </button>
      </div>

      {(q || category || source === 'osm' || source === 'wikidata') && (
        <div className="ad-active-filters">
          Filter aktif:
          {q && <span className="ad-fchip">Kata kunci: {q}<button type="button" aria-label="Hapus kata kunci" onClick={() => { setTerm(''); update({ q: '' }); }}><X size={11} /></button></span>}
          {category && <span className="ad-fchip">Kategori: {categoryName || category}<button type="button" aria-label="Hapus filter kategori" onClick={() => update({ category: '' })}><X size={11} /></button></span>}
          {(source === 'osm' || source === 'wikidata') && <span className="ad-fchip">Sumber: {sourceLabel(source)}<button type="button" aria-label="Hapus filter sumber" onClick={() => update({ source: '' })}><X size={11} /></button></span>}
          <button type="button" className="ad-link-btn reset" onClick={() => { setTerm(''); update({ q: '', category: '', source: '', owner: '' }); }}>Reset semua filter</button>
        </div>
      )}

      {result.error && !loading ? (
        <div className="ad-state error" role="alert">
          <strong>Destinasi tidak bisa dimuat</strong>
          <p>{result.error}</p>
          <button type="button" className="ad-btn soft" onClick={reload}>Coba lagi</button>
        </div>
      ) : data && data.items.length === 0 && !loading ? (
        <div className="ad-state">
          <MapPinOff size={28} />
          <strong>{hasFilter ? 'Tidak ada destinasi yang cocok' : 'Belum ada destinasi'}</strong>
          {hasFilter ? <p>Coba kata kunci atau filter lain.</p> : <p>Tambahkan destinasi pertama dengan tombol "Tambah destinasi".</p>}
        </div>
      ) : (
        <>
          <div className="ad-table-wrap" aria-busy={loading}>
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Foto &amp; Nama Destinasi</th>
                  <th>Lokasi</th>
                  <th>Pengelola (Mitra)</th>
                  <th className="num">Rating &amp; Ulasan</th>
                  <th className="actions"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody style={{ opacity: loading && data ? 0.55 : 1 }}>
                {!data ? (
                  <tr className="ad-loading-row"><td colSpan={5}>Memuat destinasi...</td></tr>
                ) : (
                  data.items.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div className="ad-cell-main">
                          {d.cover_image ? (
                            <img className="ad-thumb" src={imgUrl(d.cover_image)} alt="" loading="lazy" />
                          ) : (
                            <span className="ad-thumb" aria-hidden="true" />
                          )}
                          <div style={{ minWidth: 0 }}>
                            <strong>{d.name}</strong>
                            <span className="ad-tags" style={{ marginTop: 4 }}>
                              <span className="ad-tag">{d.category}</span>
                              <span className={`ad-badge src-${d.source}`} style={{ fontSize: 11, padding: '1px 8px' }}>{sourceLabel(d.source)}</span>
                              <span className="ad-tag"><Images size={11} /> {fmt(d.photo_count)}</span>
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>{d.location}</td>
                      <td>
                        {d.owner_id ? (
                          <span className="ad-owner"><strong>{d.owner_name}</strong><small>{d.owner_email}</small></span>
                        ) : (
                          <span className="ad-tag amber">Belum ada pemilik</span>
                        )}
                      </td>
                      <td className="num">
                        {d.rating_count > 0 ? (
                          <span className="ad-score"><Star size={12} /> {d.avg_rating.toLocaleString('id-ID')}</span>
                        ) : (
                          <span className="ad-muted">Belum dinilai</span>
                        )}
                        <small className="ad-muted" style={{ display: 'block', marginTop: 3 }}>{fmt(d.review_count)} ulasan</small>
                      </td>
                      <td className="actions">
                        <button type="button" className="ad-icon-btn" title="Ubah" aria-label={`Ubah ${d.name}`} disabled={categories.length === 0} onClick={() => setForm({ destination: d })}>
                          <Pencil size={15} />
                        </button>
                        <button type="button" className="ad-icon-btn" title={`Foto (${d.photo_count})`} aria-label={`Kelola foto ${d.name}`} onClick={() => setGalleryOf(d)}>
                          <Images size={15} />
                        </button>
                        <button type="button" className="ad-icon-btn" title="Pemilik" aria-label={`Atur pemilik ${d.name}`} onClick={() => setOwnerOf(d)}>
                          <UserCog size={15} />
                        </button>
                        <button type="button" className="ad-icon-btn danger" title="Hapus" aria-label={`Hapus ${d.name}`} onClick={() => setToDelete(d)}>
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {data && (
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} disabled={loading} onChange={(p) => update({ page: p })} />
          )}
        </>
      )}

      {form && (
        <DestinationFormModal
          destination={form.destination}
          categories={categories}
          addressEnabled={Boolean(data?.addressEnabled)}
          onClose={() => setForm(null)}
          onSaved={saved}
        />
      )}

      {ownerOf && <OwnerModal destination={ownerOf} onClose={() => setOwnerOf(null)} onSaved={saved} />}

      {galleryOf && <GalleryModal destination={galleryOf} onClose={() => setGalleryOf(null)} onChanged={reload} />}

      {catModal && (
        <CategoryManagerModal
          onClose={closeCatModal}
          onChanged={() => {
            setCatTick((t) => t + 1);
            reload();
          }}
          onPick={(id) => {
            setCatModal(false);
            update({ category: id, kelola: '' });
          }}
        />
      )}

      <ConfirmModal
        open={Boolean(toDelete)}
        title="Hapus destinasi ini?"
        confirmLabel="Ya, hapus destinasi"
        busy={busy}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        message={
          toDelete && (
            <>
              <p><b>{toDelete.name}</b> ({toDelete.location}) akan dihapus permanen.</p>
              <p>
                Ikut terhapus: {toDelete.review_count} ulasan, {toDelete.rating_count} rating, semua foto ulasan, dan
                data wishlist untuk destinasi ini.
              </p>
              {toDelete.source !== 'manual' && (
                <p>Destinasi dari {sourceLabel(toDelete.source)} bisa muncul lagi kalau skrip sinkronisasi dijalankan ulang.</p>
              )}
              <p><b>Tindakan ini tidak bisa dibatalkan.</b></p>
            </>
          )
        }
      />
    </>
  );
}
