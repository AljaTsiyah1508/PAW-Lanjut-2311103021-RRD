import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Trash2, RefreshCw, MessageSquareOff, X, Star, ThumbsUp, MapPin,
  Flag, ShieldCheck, Clock, ThumbsDown, ShieldAlert, ImageOff,
} from 'lucide-react';
import api from '../../api/axios';
import { useToast, errorMessage } from '../../context/toast';
import ConfirmModal from '../../components/common/ConfirmModal';
import Pagination from '../../components/common/Pagination';
import { PageHead, StatCard, PillTabs } from '../../components/common/PanelUI';
import { imgUrl, timeAgo, fmtNum as fmt } from '../../utils/helpers';

const LIMIT = 10;

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

// Pilih destinasi dengan pencarian (saran dari /admin/destinations)
function DestinationPicker({ value, label, onChange }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState({ text: null, items: [] });
  const boxRef = useRef(null);
  const term = text.trim();

  useEffect(() => {
    if (term.length < 2) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      api
        .get('/admin/destinations', { params: { q: term, limit: 8 } })
        .then((res) => alive && setFound({ text: term, items: res.data.items }))
        .catch(() => alive && setFound({ text: term, items: [] }));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [term]);

  useEffect(() => {
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (value) {
    return (
      <span className="ad-chip">
        <MapPin size={13} /> {label || `Destinasi #${value}`}
        <button type="button" onClick={() => onChange(null)} aria-label="Hapus filter destinasi"><X size={13} /></button>
      </span>
    );
  }

  const searching = term.length >= 2 && found.text !== term;
  return (
    <div className="ad-picker" ref={boxRef}>
      <label className="ad-search">
        <MapPin size={16} />
        <input
          type="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Filter destinasi..."
          aria-label="Filter destinasi"
          aria-expanded={open && term.length >= 2}
        />
      </label>
      {open && term.length >= 2 && (
        <ul className="ad-picker-list" role="listbox">
          {searching ? (
            <li className="ad-picker-note">Mencari...</li>
          ) : found.items.length === 0 ? (
            <li className="ad-picker-note">Tidak ada destinasi "{term}"</li>
          ) : (
            found.items.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => {
                    onChange({ id: d.id, name: d.name });
                    setText('');
                    setOpen(false);
                  }}
                >
                  <strong>{d.name}</strong>
                  <small>{d.location} · {d.review_count} ulasan</small>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function Stars({ score }) {
  return (
    <span className="ad-stars" aria-label={`Rating ${score} dari 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={13} className={i <= score ? 'on' : ''} />)}
    </span>
  );
}

// SRS 3.18: Moderasi ulasan & rating — tinjau laporan pengguna, hapus ulasan/foto yang melanggar
export default function AdminReviews() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const tab = ['reported', 'all', 'low', 'photos'].includes(params.get('tab')) ? params.get('tab') : 'all';
  const q = params.get('q') || '';
  const destination = params.get('destination') || '';
  const dname = params.get('dname') || '';
  const rating = params.get('rating') || '';
  const page = Math.max(Number(params.get('page')) || 1, 1);

  const [term, setTerm] = useState(q);
  // Sinkronkan kotak cari bila ?q= berubah dari luar (mis. pencarian cepat di top bar)
  const [syncedQ, setSyncedQ] = useState(q);
  if (syncedQ !== q) {
    setSyncedQ(q);
    setTerm(q);
  }
  const [tick, setTick] = useState(0);
  const key = `${tab}|${q}|${destination}|${rating}|${page}|${tick}`;
  const [result, setResult] = useState({ key: null, data: null, error: '' });
  const loading = result.key !== key;
  const [stats, setStats] = useState(null);

  const [expanded, setExpanded] = useState({});
  const [toDelete, setToDelete] = useState(null);
  const [withRating, setWithRating] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState(null);
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

  useEffect(() => {
    let alive = true;
    api
      .get('/admin/reviews', { params: { tab, q, destination, rating, page, limit: LIMIT } })
      .then((res) => alive && setResult({ key, data: res.data, error: '' }))
      .catch((err) => alive && setResult({ key, data: null, error: errorMessage(err, 'Gagal memuat ulasan') }));
    return () => {
      alive = false;
    };
  }, [key, tab, q, destination, rating, page]);

  // Statistik dimuat ulang setiap ada perubahan data (tick)
  useEffect(() => {
    let alive = true;
    api.get('/admin/reviews/stats').then((r) => alive && setStats(r.data)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [tick]);

  const reload = () => setTick((t) => t + 1);
  const data = result.data;
  const hasFilter = Boolean(q || destination || rating);

  const afterRemove = () => {
    if (data && data.items.length === 1 && page > 1) update({ page: page - 1 });
    reload();
  };

  const openDelete = (r) => {
    setWithRating(false); // default: rating dipertahankan
    setToDelete(r);
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const res = await api.delete(`/admin/reviews/${toDelete.id}`, {
        params: withRating ? { with_rating: 1 } : {},
      });
      const extra = res.data.photosDeleted ? `, ${res.data.photosDeleted} foto ikut dihapus` : '';
      toast.success(`${res.data.message}${extra}`);
      setToDelete(null);
      afterRemove();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menghapus ulasan'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeletePhoto = async () => {
    setBusy(true);
    try {
      await api.delete(`/admin/photos/${photoToDelete.photo.id}`);
      toast.success('Foto dihapus, teks ulasan tetap tampil');
      setPhotoToDelete(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menghapus foto'));
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async (r) => {
    try {
      const res = await api.patch(`/admin/reviews/${r.id}/dismiss`);
      toast.success(res.data.message);
      if (tab === 'reported') afterRemove();
      else reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengabaikan laporan'));
    }
  };

  const tabs = [
    ...(stats?.reportsEnabled ? [{ key: 'reported', label: 'Dilaporkan', count: stats.openReports, alert: stats.openReports > 0 }] : []),
    { key: 'all', label: 'Semua Ulasan', count: stats?.total },
    { key: 'low', label: 'Rating Rendah (1–2★)', count: stats?.lowRatings },
    { key: 'photos', label: 'Dengan Foto', count: stats?.withPhotos },
  ];

  return (
    <>
      <PageHead
        eyebrow="Kurasi konten komunitas"
        icon={ShieldCheck}
        title="Moderasi Ulasan"
        desc="Tinjau ulasan yang dilaporkan pengguna dan hapus konten yang melanggar: spam, SARA, kata kasar, atau ulasan palsu."
      >
        <button type="button" className="ad-btn soft" onClick={reload} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'ad-spin' : ''} /> Muat ulang
        </button>
      </PageHead>

      {stats && (
        <section className="ad-stats" aria-label="Statistik moderasi">
          {stats.reportsEnabled ? (
            <StatCard icon={Flag} label="Laporan Terbuka" value={fmt(stats.openReports)} unit="ulasan" tone={stats.openReports ? 'warn' : undefined}>
              Menunggu keputusan admin
            </StatCard>
          ) : (
            <StatCard icon={Flag} label="Laporan Pengguna" value="–">Fitur laporan belum diaktifkan</StatCard>
          )}
          <StatCard icon={ShieldCheck} label="Laporan Diabaikan" value={fmt(stats.handled30d)} unit="30 hari">
            Dinilai tidak melanggar
          </StatCard>
          <StatCard icon={Clock} label="Ulasan 24 Jam" value={fmt(stats.today)} unit="baru">
            Dari total {fmt(stats.total)} ulasan
          </StatCard>
          <StatCard icon={ThumbsDown} label="Rating Rendah" value={fmt(stats.lowRatings)} unit="1–2 bintang">
            Perlu dicek keasliannya
          </StatCard>
        </section>
      )}

      <PillTabs tabs={tabs} value={tab} onChange={(k) => update({ tab: k === 'all' ? '' : k })} label="Jenis ulasan" />

      <div className="ad-toolbar">
        <label className="ad-search">
          <Search size={16} />
          <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Cari judul, isi, atau nama penulis" aria-label="Cari ulasan" />
        </label>
        <DestinationPicker
          value={destination}
          label={dname}
          onChange={(d) => update({ destination: d?.id || '', dname: d?.name || '' })}
        />
        <select className="ad-select" value={rating} onChange={(e) => update({ rating: e.target.value })} aria-label="Filter rating">
          <option value="">Semua bintang</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} bintang</option>)}
        </select>
        {hasFilter && (
          <button type="button" className="ad-btn soft" onClick={() => { setTerm(''); update({ q: '', destination: '', dname: '', rating: '' }); }}>
            <X size={14} /> Hapus filter
          </button>
        )}
      </div>

      {result.error && !loading ? (
        <div className="ad-state error" role="alert">
          <strong>Ulasan tidak bisa dimuat</strong>
          <p>{result.error}</p>
          <button type="button" className="ad-btn soft" onClick={reload}>Coba lagi</button>
        </div>
      ) : !data ? (
        <div aria-busy="true" aria-label="Memuat ulasan">
          {[0, 1, 2].map((i) => <div key={i} className="ad-card ad-skel" style={{ height: 140, marginBottom: 12 }} />)}
        </div>
      ) : data.items.length === 0 && !loading ? (
        <div className="ad-state">
          {tab === 'reported' ? <ShieldCheck size={28} /> : <MessageSquareOff size={28} />}
          <strong>
            {tab === 'reported' && !hasFilter ? 'Tidak ada laporan terbuka' : hasFilter ? 'Tidak ada ulasan yang cocok' : 'Belum ada ulasan'}
          </strong>
          <p>{tab === 'reported' && !hasFilter ? 'Semua laporan sudah ditangani.' : hasFilter ? 'Coba filter lain.' : ''}</p>
        </div>
      ) : (
        <>
          <ul className="ad-reviews" aria-busy={loading} style={{ opacity: loading ? 0.55 : 1 }}>
            {data.items.map((r) => {
              const long = r.content.length > 280;
              const open = expanded[r.id];
              const tone = r.report ? ' reported' : r.score > 0 && r.score <= 2 ? ' low' : '';
              return (
                <li key={r.id} className={`ad-card ad-rev${tone}`}>
                  {r.report && (
                    <div className="ad-rev-flag">
                      <span className="ad-tag red"><ShieldAlert size={12} /> {fmt(r.report.count)} laporan</span>
                      {r.report.reasons.map((x) => (
                        <span key={x.key} className="ad-tag red">{x.label}{x.count > 1 ? ` ×${x.count}` : ''}</span>
                      ))}
                    </div>
                  )}
                  <div className="ad-rev-head">
                    <div className="ad-rev-meta">
                      <strong>{r.user_name}</strong>
                      {r.username && <span className="ad-muted">@{r.username}</span>}
                      <span className="ad-muted">·</span>
                      <button
                        type="button"
                        className="ad-link ad-link-btn"
                        title="Tampilkan semua ulasan destinasi ini"
                        onClick={() => update({ destination: r.destination_id, dname: r.destination_name })}
                      >
                        {r.destination_name}
                      </button>
                    </div>
                  </div>

                  <div className="ad-rev-sub">
                    {r.score > 0 ? <Stars score={r.score} /> : <span className="ad-muted">Tanpa rating</span>}
                    <span className="ad-muted" title={fmtDate(r.created_at)}>{timeAgo(r.created_at)}</span>
                    {r.visit_date && <span className="ad-muted">Berkunjung {fmtDate(r.visit_date)}</span>}
                    {r.helpful_count > 0 && <span className="ad-muted"><ThumbsUp size={12} /> {r.helpful_count}</span>}
                  </div>

                  {r.title && <h4 className="ad-rev-title">{r.title}</h4>}
                  <p className={`ad-rev-body${long && !open ? ' ad-clamp-4' : ''}`}>{r.content}</p>
                  {long && (
                    <button type="button" className="ad-link ad-link-btn" onClick={() => setExpanded((e) => ({ ...e, [r.id]: !open }))}>
                      {open ? 'Tampilkan lebih sedikit' : 'Baca selengkapnya'}
                    </button>
                  )}

                  {r.photos.length > 0 && (
                    <div className="ad-rev-photos">
                      {r.photos.map((p) => (
                        <span key={p.id} className="ad-rev-photo">
                          <a href={imgUrl(p.file_path)} target="_blank" rel="noreferrer">
                            <img src={imgUrl(p.file_path)} alt={`Foto ulasan ${r.user_name}`} loading="lazy" />
                          </a>
                          <button type="button" className="ad-icon-btn danger" title="Hapus foto ini saja" aria-label="Hapus foto ini saja" onClick={() => setPhotoToDelete({ review: r, photo: p })}>
                            <ImageOff size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {r.report?.notes.length > 0 && (
                    <ul className="ad-rev-notes" aria-label="Catatan pelapor">
                      {r.report.notes.map((n, i) => <li key={i}>“{n}”</li>)}
                    </ul>
                  )}

                  <div className="ad-rev-actions">
                    {r.report && (
                      <button type="button" className="ad-btn soft" onClick={() => dismiss(r)} title="Ulasan tidak melanggar; laporan ditutup">
                        Abaikan Laporan
                      </button>
                    )}
                    <button type="button" className="ad-btn danger" onClick={() => openDelete(r)}>
                      <Trash2 size={15} /> Hapus Ulasan
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} disabled={loading} onChange={(p) => update({ page: p })} />
        </>
      )}

      <ConfirmModal
        open={Boolean(toDelete)}
        title="Hapus ulasan ini?"
        confirmLabel={withRating ? 'Hapus ulasan & rating' : 'Hapus ulasan'}
        busy={busy}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        message={
          toDelete && (
            <>
              <p>
                Ulasan <b>{toDelete.user_name}</b> di <b>{toDelete.destination_name}</b> akan dihapus permanen
                {toDelete.photos.length > 0 && <>, termasuk <b>{toDelete.photos.length} foto</b> yang dihapus dari server</>}.
                {toDelete.report && ' Laporan terkait ikut ditutup.'}
              </p>
              <p><b>Tindakan ini tidak bisa dibatalkan.</b></p>
            </>
          )
        }
      >
        {toDelete && toDelete.score > 0 && (
          <label className="ad-check">
            <input type="checkbox" checked={withRating} onChange={(e) => setWithRating(e.target.checked)} disabled={busy} />
            <span>
              Hapus juga rating pengguna ini
              <small>Rating {toDelete.score} bintang untuk destinasi ini. Bila tidak dicentang, rating tetap dihitung.</small>
            </span>
          </label>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={Boolean(photoToDelete)}
        title="Hapus foto ini saja?"
        confirmLabel="Ya, hapus foto"
        busy={busy}
        onClose={() => setPhotoToDelete(null)}
        onConfirm={confirmDeletePhoto}
        message={
          photoToDelete && (
            <p>
              Foto dari ulasan <b>{photoToDelete.review.user_name}</b> dihapus permanen dari server. Teks ulasan dan
              ratingnya tetap tampil. Gunakan ini untuk foto yang tidak pantas atau bukan milik pengunggah.
            </p>
          )
        }
      />
    </>
  );
}
