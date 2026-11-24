import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search, Plus, Pencil, Trash2, Images, RefreshCw, MapPinOff, X, Star, MapPin, Map as MapIcon,
  MessageSquare, Camera, Download, Clock, Ticket, Sun, AlertTriangle, ClipboardCheck, MessageSquareText,
} from 'lucide-react';
import api from '../../api/axios';
import { useToast, errorMessage } from '../../context/toast';
import ConfirmModal from '../../components/common/ConfirmModal';
import Pagination from '../../components/common/Pagination';
import DestinationFormModal from '../../components/common/DestinationFormModal';
import GalleryModal from '../../components/common/GalleryModal';
import { PageHead, StatCard, PillTabs } from '../../components/common/PanelUI';
import { imgUrl, fmtNum as fmt } from '../../utils/helpers';
import { downloadCsv, fetchAllPages, stamp } from '../../utils/csv';

const LIMIT = 10;
const STATUSES = [
  { key: '', label: 'Semua status' },
  { key: 'incomplete', label: 'Perlu dilengkapi' },
  { key: 'complete', label: 'Data lengkap' },
];

// Bagian data yang masih kosong. Aturannya sama dengan INCOMPLETE_SQL di manageController (backend).
const missingFields = (d) =>
  [
    (!d.description || d.description.trim().length < 30) && 'deskripsi',
    !d.open_hours && 'jam operasional',
    d.price === null && 'harga tiket',
    !d.cover_image && 'foto sampul',
    (d.latitude === null || d.longitude === null) && 'titik peta',
  ].filter(Boolean);

const priceText = (p) => (p === null ? null : p === 0 ? 'Gratis' : `Rp ${fmt(p)} / orang`);

// SRS 3.8–3.10 & 3.15–3.16: kelola destinasi milik sendiri beserta galerinya
export default function ManageDestinations() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const status = STATUSES.some((s) => s.key === params.get('status')) ? params.get('status') : '';
  const page = Math.max(Number(params.get('page')) || 1, 1);

  const [term, setTerm] = useState(q);
  // Sinkronkan kotak cari bila ?q= berubah dari luar (mis. pencarian cepat di top bar)
  const [syncedQ, setSyncedQ] = useState(q);
  if (syncedQ !== q) {
    setSyncedQ(q);
    setTerm(q);
  }
  const [tick, setTick] = useState(0);
  const key = `${q}|${category}|${status}|${page}|${tick}`;
  const [result, setResult] = useState({ key: null, data: null, error: '' });
  const loading = result.key !== key;

  const [categories, setCategories] = useState([]);
  // ?tambah=1 (dari Ringkasan) langsung membuka form tambah
  const [form, setForm] = useState(() => (params.get('tambah') ? { destination: null } : null));
  const [galleryOf, setGalleryOf] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const update = useCallback(
    (patch) => {
      const next = new URLSearchParams(params);
      Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, String(v)) : next.delete(k)));
      if (!('page' in patch)) next.delete('page');
      next.delete('tambah');
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

  useEffect(() => {
    api
      .get('/categories')
      .then((res) => setCategories(res.data))
      .catch(() => toast.error('Daftar kategori gagal dimuat'));
  }, [toast]);

  useEffect(() => {
    let alive = true;
    api
      .get('/manage/destinations', { params: { q, category, status, page, limit: LIMIT } })
      .then((res) => alive && setResult({ key, data: res.data, error: '' }))
      .catch((err) => alive && setResult({ key, data: null, error: errorMessage(err, 'Gagal memuat destinasi') }));
    return () => {
      alive = false;
    };
  }, [key, q, category, status, page]);

  const reload = () => setTick((t) => t + 1);
  const data = result.data;
  const stats = data?.stats;
  const hasFilter = Boolean(q || category || status);

  const closeForm = () => {
    setForm(null);
    if (params.get('tambah')) update({});
  };

  const saved = (msg) => {
    toast.success(msg);
    closeForm();
    reload();
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/manage/destinations/${toDelete.id}`);
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

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllPages((p) =>
        api.get('/manage/destinations', { params: { q, category, status, page: p, limit: 50 } }).then((r) => r.data),
      );
      if (rows.length === 0) return toast.error('Tidak ada destinasi untuk diunduh');
      downloadCsv(
        `rekap-destinasi-${stamp()}.csv`,
        [
          { label: 'Nama', value: 'name' },
          { label: 'Kategori', value: 'category' },
          { label: 'Lokasi', value: 'location' },
          { label: 'Rata-rata rating', value: (d) => (d.rating_count ? d.avg_rating : '') },
          { label: 'Jumlah rating', value: 'rating_count' },
          { label: 'Jumlah ulasan', value: 'review_count' },
          { label: 'Belum dibalas', value: (d) => (data?.repliesEnabled ? d.pending_replies : '') },
          { label: 'Jumlah foto', value: 'photo_count' },
          { label: 'Harga tiket', value: (d) => (d.price === null ? '' : d.price) },
          { label: 'Jam operasional', value: 'open_hours' },
          { label: 'Waktu terbaik', value: 'best_time' },
          { label: 'Data kurang', value: (d) => missingFields(d).join(', ') },
        ],
        rows,
      );
      toast.success(`Rekap ${fmt(rows.length)} destinasi diunduh`);
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengunduh rekap'));
    } finally {
      setExporting(false);
    }
  };

  const tabs = [
    { key: '', label: 'Semua', count: stats?.total },
    ...(data?.categories || []).map((c) => ({ key: String(c.id), label: c.name, count: c.total })),
  ];

  return (
    <>
      <PageHead
        eyebrow="Kelola destinasi mitra"
        icon={MapIcon}
        title="Kelola Destinasi Wisata"
        desc={
          stats?.total
            ? `Kelola informasi, jam operasional, harga tiket, dan galeri foto untuk ${fmt(stats.total)} destinasi Anda.`
            : 'Kelola informasi, jam operasional, harga tiket, dan galeri foto destinasi Anda.'
        }
      >
        <button type="button" className="ad-btn soft" onClick={reload} disabled={loading} aria-label="Muat ulang">
          <RefreshCw size={15} className={loading ? 'ad-spin' : ''} />
        </button>
        <button type="button" className="ad-btn soft" onClick={exportCsv} disabled={exporting || !data?.total}>
          <Download size={15} /> {exporting ? 'Mengunduh...' : 'Unduh Rekap'}
        </button>
        <button type="button" className="ad-btn accent" onClick={() => setForm({ destination: null })} disabled={categories.length === 0}>
          <Plus size={15} /> Tambah Destinasi Baru
        </button>
      </PageHead>

      {stats && (
        <section className="ad-stats" aria-label="Ringkasan destinasi">
          <StatCard icon={MapIcon} label="Total Destinasi Kelolaan" value={fmt(stats.total)} unit="destinasi">
            {stats.incomplete ? `${fmt(stats.incomplete)} perlu dilengkapi` : 'Semua data lengkap'}
          </StatCard>
          <StatCard
            icon={Star}
            label="Rating Gabungan"
            value={stats.avgRating === null ? '–' : stats.avgRating.toLocaleString('id-ID')}
            unit={stats.avgRating === null ? undefined : '/ 5'}
          >
            {stats.ratings ? `dari ${fmt(stats.ratings)} rating` : 'Belum ada rating'}
          </StatCard>
          <StatCard icon={MessageSquare} label="Total Ulasan" value={fmt(stats.reviews)} unit="ulasan">
            <Link to="/pengelola/ulasan" className="ad-link">Lihat semua ulasan</Link>
          </StatCard>
          <StatCard icon={Camera} label="Foto Galeri" value={fmt(stats.photos)} unit="foto">
            Foto resmi yang Anda unggah
          </StatCard>
        </section>
      )}

      <div className="ad-toolbar">
        <label className="ad-search">
          <Search size={16} />
          <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Cari nama destinasi atau lokasi" aria-label="Cari destinasi" />
        </label>
        <select className="ad-select" value={status} onChange={(e) => update({ status: e.target.value })} aria-label="Filter status data">
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {hasFilter && (
          <button type="button" className="ad-btn soft" onClick={() => { setTerm(''); update({ q: '', category: '', status: '' }); }}>
            <X size={14} /> Hapus filter
          </button>
        )}
      </div>

      {tabs.length > 2 && <PillTabs tabs={tabs} value={category} onChange={(k) => update({ category: k })} label="Kategori destinasi" />}

      {result.error && !loading ? (
        <div className="ad-state error" role="alert">
          <strong>Destinasi tidak bisa dimuat</strong>
          <p>{result.error}</p>
          <button type="button" className="ad-btn soft" onClick={reload}>Coba lagi</button>
        </div>
      ) : !data ? (
        <div aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="ad-card ad-skel" style={{ height: 220, marginBottom: 14 }} />)}
        </div>
      ) : data.items.length === 0 && !loading ? (
        <div className="ad-state">
          <MapPinOff size={28} />
          <strong>{hasFilter ? 'Tidak ada destinasi yang cocok' : 'Belum ada destinasi'}</strong>
          <p>
            {hasFilter
              ? 'Coba kata kunci atau filter lain.'
              : 'Tambahkan destinasi pertama Anda, atau hubungi admin bila destinasi Anda sudah terdaftar.'}
          </p>
        </div>
      ) : (
        <>
          <ul className="md-list" aria-busy={loading} style={{ opacity: loading ? 0.55 : 1 }}>
            {data.items.map((d) => {
              const missing = missingFields(d);
              return (
                <li key={d.id} className="ad-card md-card">
                  <div className="md-cover">
                    {d.cover_image ? (
                      <img src={imgUrl(d.cover_image)} alt={`Foto sampul ${d.name}`} loading="lazy" />
                    ) : (
                      <span className="md-cover-empty"><Camera size={26} /> Belum ada foto sampul</span>
                    )}
                    <span className="md-badge">{d.category}</span>
                    <span className="md-badge bottom"><Camera size={12} /> {fmt(d.photo_count)} foto</span>
                  </div>

                  <div className="md-body">
                    <div className="md-title">
                      <div style={{ minWidth: 0 }}>
                        <h3>{d.name}</h3>
                        <small><MapPin size={12} /> {d.location}</small>
                      </div>
                      {missing.length ? (
                        <span className="ad-tag amber"><AlertTriangle size={12} /> Perlu dilengkapi</span>
                      ) : (
                        <span className="ad-tag green"><ClipboardCheck size={12} /> Data lengkap</span>
                      )}
                    </div>

                    {missing.length > 0 && (
                      <p className="md-missing">
                        <AlertTriangle size={14} />
                        <span>
                          Belum diisi: <b>{missing.join(', ')}</b>. Data lengkap membantu wisatawan merencanakan kunjungan.
                        </span>
                      </p>
                    )}

                    <dl className="md-facts">
                      <div>
                        <dt>Skor &amp; ulasan</dt>
                        <dd>
                          {d.rating_count ? (
                            <><Star size={14} className="md-star" /> <b>{d.avg_rating.toLocaleString('id-ID')}</b> <span className="ad-muted">({fmt(d.rating_count)} rating)</span></>
                          ) : (
                            <span className="ad-muted">Belum ada rating</span>
                          )}
                        </dd>
                        <dd className="ad-muted">
                          {fmt(d.review_count)} ulasan
                          {data.repliesEnabled && d.pending_replies > 0 && <span className="md-pending"> · {fmt(d.pending_replies)} belum dibalas</span>}
                        </dd>
                      </div>
                      <div>
                        <dt><Ticket size={12} /> Tiket masuk</dt>
                        <dd>{priceText(d.price) ? <b>{priceText(d.price)}</b> : <span className="ad-muted">Belum diisi</span>}</dd>
                      </div>
                      <div>
                        <dt><Clock size={12} /> Jam operasional</dt>
                        <dd>{d.open_hours ? <b>{d.open_hours}</b> : <span className="ad-muted">Belum diisi</span>}</dd>
                      </div>
                      <div>
                        <dt><Sun size={12} /> Waktu terbaik</dt>
                        <dd>{d.best_time ? <b>{d.best_time}</b> : <span className="ad-muted">Belum diisi</span>}</dd>
                      </div>
                    </dl>

                    <div className="md-actions">
                      <button type="button" className="ad-btn soft sm" onClick={() => setGalleryOf(d)}>
                        <Images size={14} /> Kelola Foto
                      </button>
                      <Link to={`/pengelola/ulasan?destination=${d.id}`} className="ad-btn soft sm">
                        <MessageSquareText size={14} /> Lihat Ulasan
                      </Link>
                      <button
                        type="button"
                        className={`ad-btn sm ${missing.length ? 'accent' : 'primary'}`}
                        disabled={categories.length === 0}
                        onClick={() => setForm({ destination: d })}
                      >
                        <Pencil size={14} /> {missing.length ? 'Lengkapi Data' : 'Edit Informasi'}
                      </button>
                      <button type="button" className="ad-icon-btn danger md-del" title="Hapus destinasi" aria-label={`Hapus ${d.name}`} onClick={() => setToDelete(d)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} disabled={loading} onChange={(p) => update({ page: p })} />
        </>
      )}

      {form && categories.length > 0 && (
        <DestinationFormModal
          apiBase="/manage"
          destination={form.destination}
          categories={categories}
          addressEnabled={Boolean(data?.addressEnabled)}
          onClose={closeForm}
          onSaved={saved}
        />
      )}

      {galleryOf && (
        <GalleryModal
          apiBase="/manage"
          canDeleteReviewPhotos={false}
          destination={galleryOf}
          onClose={() => setGalleryOf(null)}
          onChanged={reload}
        />
      )}

      <ConfirmModal
        open={Boolean(toDelete)}
        title="Hapus destinasi?"
        confirmLabel="Ya, hapus destinasi"
        busy={busy}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        message={
          toDelete && (
            <>
              <p><b>{toDelete.name}</b> ({toDelete.location}) akan dihapus permanen dari Nusantara Review.</p>
              <p>
                Ikut terhapus: {toDelete.review_count} ulasan, {toDelete.rating_count} rating dari wisatawan, dan
                {` ${toDelete.photo_count}`} foto.
              </p>
              <p><b>Tindakan ini tidak bisa dibatalkan.</b></p>
            </>
          )
        }
      />
    </>
  );
}
