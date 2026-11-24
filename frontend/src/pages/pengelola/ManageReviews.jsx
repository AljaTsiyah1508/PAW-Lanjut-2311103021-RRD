import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  RefreshCw, MessageSquareOff, X, Star, ThumbsUp, Flag, Search, Download, MessageSquare,
  Clock, Gauge, MapPin, CornerDownRight, Pencil, Trash2, Send, Info,
} from 'lucide-react';
import api from '../../api/axios';
import { errorMessage, useToast } from '../../context/toast';
import { PageHead, StatCard, PillTabs } from '../../components/common/PanelUI';
import ReportModal from '../../components/common/ReportModal';
import ConfirmModal from '../../components/common/ConfirmModal';
import Pagination from '../../components/common/Pagination';
import { imgUrl, initials, fmtNum as fmt } from '../../utils/helpers';
import { downloadCsv, fetchAllPages, stamp } from '../../utils/csv';

const LIMIT = 10;
const REPLY_MIN = 10;
const REPLY_MAX = 2000;
const SORTS = [
  { key: 'newest', label: 'Paling baru' },
  { key: 'oldest', label: 'Paling lama' },
  { key: 'highest', label: 'Rating tertinggi' },
  { key: 'lowest', label: 'Rating terendah' },
];
const fmtDate = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (d) =>
  new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const firstName = (name = '') => name.trim().split(/\s+/)[0] || 'Kak';

// Template respon cepat: titik awal yang tetap bisa diedit sebelum dikirim
const TEMPLATES = [
  {
    label: 'Apresiasi',
    text: (r) =>
      `Terima kasih banyak atas ulasan dan kunjungan Anda, ${firstName(r.user_name)}! Kami senang Anda menikmati pengalaman di ${r.destination_name}. Sampai jumpa di kunjungan berikutnya.`,
  },
  {
    label: 'Permohonan maaf',
    text: (r) =>
      `Terima kasih atas masukan Anda, ${firstName(r.user_name)}. Kami mohon maaf atas ketidaknyamanan yang Anda alami di ${r.destination_name}. Masukan ini sudah kami teruskan ke tim untuk segera diperbaiki.`,
  },
  {
    label: 'Perbaikan fasilitas',
    text: (r) =>
      `Terima kasih atas sarannya, ${firstName(r.user_name)}. Kami sedang membenahi fasilitas di ${r.destination_name} agar kunjungan Anda berikutnya lebih nyaman.`,
  },
];

function Stars({ score, size = 13 }) {
  return (
    <span className="ad-stars" aria-label={`Rating ${score} dari 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} className={i <= Math.round(score) ? 'on' : ''} />)}
    </span>
  );
}

// Tabel 2.3 "Melihat Review dan Rating" + tanggapan resmi pengelola atas ulasan di destinasi miliknya
export default function ManageReviews() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = ['pending', 'replied'].includes(params.get('status')) ? params.get('status') : '';
  const destination = params.get('destination') || '';
  const rating = params.get('rating') || '';
  const sort = SORTS.some((s) => s.key === params.get('sort')) ? params.get('sort') : 'newest';
  const q = params.get('q') || '';
  const page = Math.max(Number(params.get('page')) || 1, 1);

  const [term, setTerm] = useState(q);
  // Sinkronkan kotak cari bila ?q= berubah dari luar (mis. pencarian cepat di top bar)
  const [syncedQ, setSyncedQ] = useState(q);
  if (syncedQ !== q) {
    setSyncedQ(q);
    setTerm(q);
  }

  const [tick, setTick] = useState(0);
  const key = `${status}|${destination}|${rating}|${sort}|${q}|${page}|${tick}`;
  const [result, setResult] = useState({ key: null, data: null, error: '' });
  const loading = result.key !== key;
  const [stats, setStats] = useState(null);
  const [myDestinations, setMyDestinations] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [reportsOn, setReportsOn] = useState(false);
  const [reportOf, setReportOf] = useState(null);

  // Penyusun tanggapan: satu ulasan terbuka dalam satu waktu
  const [draft, setDraft] = useState(null); // { id, text }
  const [draftErr, setDraftErr] = useState('');
  const [sending, setSending] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

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
    api.get('/reports/status').then((r) => setReportsOn(r.data.enabled)).catch(() => {});
    api
      .get('/manage/destinations', { params: { limit: 50 } })
      .then((res) => setMyDestinations(res.data.items))
      .catch(() => setMyDestinations([]));
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .get('/manage/reviews', { params: { status, destination, rating, sort, q, page, limit: LIMIT } })
      .then((res) => alive && setResult({ key, data: res.data, error: '' }))
      .catch((err) => alive && setResult({ key, data: null, error: errorMessage(err, 'Gagal memuat ulasan') }));
    return () => {
      alive = false;
    };
  }, [key, status, destination, rating, sort, q, page]);

  // Statistik & jumlah per tab mengikuti filter destinasi/rating/cari (bukan tab)
  useEffect(() => {
    let alive = true;
    api
      .get('/manage/reviews/stats', { params: { destination, rating, q } })
      .then((r) => alive && setStats(r.data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [destination, rating, q, tick]);

  const reload = () => setTick((t) => t + 1);
  const data = result.data;
  const repliesOn = Boolean(data?.repliesEnabled ?? stats?.repliesEnabled);
  const hasFilter = Boolean(destination || rating || q);

  const openDraft = (r) => {
    setDraftErr('');
    setDraft({ id: r.id, text: r.reply?.content || '' });
  };

  const sendReply = async (r) => {
    const text = draft.text.trim();
    if (text.length < REPLY_MIN) return setDraftErr(`Tanggapan minimal ${REPLY_MIN} karakter`);
    if (text.length > REPLY_MAX) return setDraftErr(`Tanggapan maksimal ${REPLY_MAX} karakter`);
    setDraftErr('');
    setSending(true);
    try {
      const res = await api.put(`/manage/reviews/${r.id}/reply`, { content: text });
      toast.success(res.data.message);
      setDraft(null);
      // Di tab "Belum Dibalas" ulasan ini pindah tab, jadi muat ulang; selain itu cukup perbarui di tempat
      if (status === 'pending') {
        if (data.items.length === 1 && page > 1) update({ page: page - 1 });
        reload();
      } else {
        setResult((s) => ({
          ...s,
          data: { ...s.data, items: s.data.items.map((x) => (x.id === r.id ? { ...x, reply: res.data.reply } : x)) },
        }));
        setTick((t) => t + 1);
      }
    } catch (err) {
      setDraftErr(errorMessage(err, 'Gagal mengirim tanggapan'));
    } finally {
      setSending(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/manage/reviews/${toDelete.id}/reply`);
      toast.success('Tanggapan dihapus');
      setToDelete(null);
      if (status === 'replied' && data.items.length === 1 && page > 1) update({ page: page - 1 });
      reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menghapus tanggapan'));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllPages((p) =>
        api
          .get('/manage/reviews', { params: { status, destination, rating, sort, q, page: p, limit: 50 } })
          .then((r) => r.data),
      );
      if (rows.length === 0) return toast.error('Tidak ada ulasan untuk diekspor');
      downloadCsv(
        `ulasan-destinasi-${stamp()}.csv`,
        [
          { label: 'Tanggal', value: (r) => fmtDate(r.created_at) },
          { label: 'Destinasi', value: 'destination_name' },
          { label: 'Penulis', value: 'user_name' },
          { label: 'Rating', value: (r) => r.score || '' },
          { label: 'Judul', value: 'title' },
          { label: 'Ulasan', value: 'content' },
          { label: 'Membantu', value: 'helpful_count' },
          { label: 'Status', value: (r) => (r.reply ? 'Sudah dibalas' : 'Belum dibalas') },
          { label: 'Tanggapan', value: (r) => r.reply?.content || '' },
        ],
        rows,
      );
      toast.success(`${fmt(rows.length)} ulasan diekspor`);
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengekspor ulasan'));
    } finally {
      setExporting(false);
    }
  };

  const tabs = [
    { key: 'all', label: 'Semua', count: stats?.total },
    ...(repliesOn
      ? [
          { key: 'pending', label: 'Belum Dibalas', count: stats?.pending, alert: stats?.pending > 0 },
          { key: 'replied', label: 'Sudah Dibalas', count: stats?.replied },
        ]
      : []),
  ];

  return (
    <>
      <PageHead
        eyebrow="Ulasan destinasi saya"
        icon={MessageSquare}
        title="Review & Ulasan Wisatawan"
        desc={
          repliesOn && stats?.pending
            ? `Pantau, filter, dan berikan tanggapan resmi. ${fmt(stats.pending)} ulasan masih menunggu balasan Anda.`
            : 'Pantau, filter, dan berikan tanggapan resmi untuk ulasan di destinasi yang Anda kelola.'
        }
      >
        <button type="button" className="ad-btn soft" onClick={reload} disabled={loading} aria-label="Muat ulang">
          <RefreshCw size={15} className={loading ? 'ad-spin' : ''} />
        </button>
        <button type="button" className="ad-btn soft" onClick={exportCsv} disabled={exporting || !data?.total}>
          <Download size={15} /> {exporting ? 'Mengekspor...' : 'Ekspor Data Ulasan'}
        </button>
      </PageHead>

      {stats && (
        <section className="ad-stats" aria-label="Statistik ulasan">
          <StatCard icon={MessageSquare} label="Total Ulasan Masuk" value={fmt(stats.total)}>
            +{fmt(stats.last30)} dalam 30 hari terakhir
          </StatCard>
          {repliesOn && (
            <StatCard icon={Clock} label="Menunggu Balasan" value={fmt(stats.pending)} tone={stats.pending ? 'warn' : undefined}>
              {stats.overdue ? `${fmt(stats.overdue)} lewat dari 24 jam` : 'Semua tertangani tepat waktu'}
            </StatCard>
          )}
          <StatCard
            icon={Star}
            label="Rata-rata Rating"
            value={stats.avgRating === null ? '–' : stats.avgRating.toLocaleString('id-ID')}
            unit={stats.avgRating === null ? undefined : '/ 5'}
          >
            {stats.ratingCount ? `dari ${fmt(stats.ratingCount)} rating` : 'Belum ada rating'}
          </StatCard>
          {repliesOn && (
            <StatCard
              icon={Gauge}
              label="Tingkat Respon"
              value={stats.responseRate === null ? '–' : `${stats.responseRate.toLocaleString('id-ID')}%`}
            >
              Ulasan yang sudah Anda tanggapi
            </StatCard>
          )}
        </section>
      )}

      <div className="ad-toolbar">
        <select className="ad-select" value={destination} onChange={(e) => update({ destination: e.target.value })} aria-label="Filter destinasi">
          <option value="">Semua destinasi saya</option>
          {myDestinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="ad-select" value={rating} onChange={(e) => update({ rating: e.target.value })} aria-label="Filter rating">
          <option value="">Semua bintang</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} bintang</option>)}
        </select>
        <label className="ad-search">
          <Search size={16} />
          <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Cari judul, isi, atau nama penulis" aria-label="Cari ulasan" />
        </label>
        <select className="ad-select" value={sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? '' : e.target.value })} aria-label="Urutkan">
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {hasFilter && (
          <button type="button" className="ad-btn soft" onClick={() => { setTerm(''); update({ destination: '', rating: '', q: '' }); }}>
            <X size={14} /> Hapus filter
          </button>
        )}
      </div>

      <div className="mr-tabbar">
        <PillTabs tabs={tabs} value={status || 'all'} onChange={(k) => update({ status: k === 'all' ? '' : k })} label="Status tanggapan" />
        {repliesOn && (
          <span className="mr-tip"><Info size={13} /> Usahakan menanggapi ulasan dalam 24 jam.</span>
        )}
      </div>

      {result.error && !loading ? (
        <div className="ad-state error" role="alert">
          <strong>Ulasan tidak bisa dimuat</strong>
          <p>{result.error}</p>
          <button type="button" className="ad-btn soft" onClick={reload}>Coba lagi</button>
        </div>
      ) : !data ? (
        <div aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="ad-card ad-skel" style={{ height: 140, marginBottom: 12 }} />)}
        </div>
      ) : data.items.length === 0 && !loading ? (
        <div className="ad-state">
          <MessageSquareOff size={28} />
          <strong>
            {status === 'pending' && !hasFilter
              ? 'Semua ulasan sudah ditanggapi'
              : hasFilter || status
                ? 'Tidak ada ulasan yang cocok'
                : 'Belum ada ulasan'}
          </strong>
          <p>
            {status === 'pending' && !hasFilter
              ? 'Kerja bagus! Ulasan baru yang masuk akan muncul di sini.'
              : hasFilter || status
                ? 'Coba ubah filter atau tab.'
                : 'Ulasan wisatawan untuk destinasi Anda akan muncul di sini.'}
          </p>
        </div>
      ) : (
        <>
          <ul className="ad-reviews" aria-busy={loading} style={{ opacity: loading ? 0.55 : 1 }}>
            {data.items.map((r) => {
              const long = r.content.length > 280;
              const open = expanded[r.id];
              const composing = draft?.id === r.id;
              const pending = repliesOn && !r.reply;
              return (
                <li key={r.id} className={`ad-card ad-rev mr-rev${pending ? ' pending' : ''}`}>
                  <div className="mr-rev-head">
                    <span className="mr-avatar" aria-hidden="true">{initials(r.user_name)}</span>
                    <div className="mr-rev-who">
                      <strong>{r.user_name}</strong>
                      <small>
                        <MapPin size={12} /> {r.destination_name} · {fmt(r.user_review_count)} ulasan ditulis
                        {r.visit_date && ` · Kunjungan ${fmtDate(r.visit_date)}`}
                      </small>
                    </div>
                    <div className="mr-rev-score">
                      {r.score > 0 ? (
                        <span><Stars score={r.score} /> <b>{r.score.toLocaleString('id-ID', { minimumFractionDigits: 1 })}</b></span>
                      ) : (
                        <span className="ad-muted">Tanpa rating</span>
                      )}
                      <small>{fmtDateTime(r.created_at)}</small>
                      {repliesOn && (
                        <span className={`ad-tag ${r.reply ? 'green' : 'amber'}`}>{r.reply ? 'Sudah dibalas' : 'Menunggu balasan'}</span>
                      )}
                    </div>
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
                        <a key={p.id} href={imgUrl(p.file_path)} target="_blank" rel="noreferrer">
                          <img src={imgUrl(p.file_path)} alt={`Foto ulasan ${r.user_name}`} loading="lazy" />
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="mr-rev-foot">
                    <span className="ad-muted"><ThumbsUp size={12} /> {fmt(r.helpful_count)} wisatawan terbantu</span>
                    <div className="mr-rev-btns">
                      {reportsOn && (
                        <button
                          type="button"
                          className="ad-btn soft sm"
                          disabled={r.reported}
                          onClick={() => setReportOf(r)}
                          title={r.reported ? 'Sudah dilaporkan, menunggu peninjauan admin' : 'Laporkan ulasan yang melanggar ke admin'}
                        >
                          <Flag size={13} /> {r.reported ? 'Sudah dilaporkan' : 'Laporkan'}
                        </button>
                      )}
                      {pending && !composing && (
                        <button type="button" className="ad-btn accent sm" onClick={() => openDraft(r)}>
                          <CornerDownRight size={14} /> Balas Ulasan
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tanggapan yang sudah terkirim */}
                  {r.reply && !composing && (
                    <div className="mr-reply">
                      <div className="mr-reply-head">
                        <strong><CornerDownRight size={14} /> Tanggapan Pengelola {r.destination_name}</strong>
                        <small>
                          {fmtDateTime(r.reply.updated_at || r.reply.created_at)}
                          {r.reply.updated_at && r.reply.updated_at !== r.reply.created_at && ' (diubah)'}
                        </small>
                        <span className="mr-reply-btns">
                          <button type="button" className="ad-icon-btn" title="Ubah tanggapan" aria-label="Ubah tanggapan" onClick={() => openDraft(r)}>
                            <Pencil size={14} />
                          </button>
                          <button type="button" className="ad-icon-btn danger" title="Hapus tanggapan" aria-label="Hapus tanggapan" onClick={() => setToDelete(r)}>
                            <Trash2 size={14} />
                          </button>
                        </span>
                      </div>
                      <p>{r.reply.content}</p>
                    </div>
                  )}

                  {/* Penyusun tanggapan */}
                  {composing && (
                    <form
                      className="mr-compose"
                      noValidate
                      onSubmit={(e) => {
                        e.preventDefault();
                        sendReply(r);
                      }}
                    >
                      <div className="mr-compose-head">
                        <strong>{r.reply ? 'Ubah Tanggapan Resmi' : 'Tanggapan Resmi Pengelola'}</strong>
                        <small>Tampil di bawah ulasan ini pada halaman destinasi. Penulis ulasan akan diberi notifikasi.</small>
                      </div>
                      <div className="mr-templates" role="group" aria-label="Template respon cepat">
                        <span>Template cepat:</span>
                        {TEMPLATES.map((t) => (
                          <button key={t.label} type="button" className="ad-catchip" onClick={() => setDraft({ ...draft, text: t.text(r) })} disabled={sending}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        className="ad-input"
                        rows={4}
                        autoFocus
                        maxLength={REPLY_MAX}
                        value={draft.text}
                        disabled={sending}
                        placeholder="Tulis tanggapan yang sopan dan solutif untuk wisatawan..."
                        aria-label={`Tanggapan untuk ulasan ${r.user_name}`}
                        aria-invalid={Boolean(draftErr)}
                        onChange={(e) => {
                          setDraft({ ...draft, text: e.target.value });
                          if (draftErr) setDraftErr('');
                        }}
                      />
                      <div className="mr-compose-meta">
                        {draftErr ? <span className="ad-field-err" role="alert">{draftErr}</span> : <span className="ad-muted">Gunakan bahasa yang ramah dan jangan cantumkan data pribadi.</span>}
                        <span className="ad-muted">{fmt(draft.text.length)} / {fmt(REPLY_MAX)}</span>
                      </div>
                      <div className="mr-compose-actions">
                        <button type="button" className="ad-btn soft" onClick={() => setDraft(null)} disabled={sending}>Batal</button>
                        <button type="submit" className="ad-btn accent" disabled={sending}>
                          <Send size={14} /> {sending ? 'Mengirim...' : r.reply ? 'Simpan Perubahan' : 'Kirim Tanggapan Resmi'}
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} disabled={loading} onChange={(p) => update({ page: p })} />
        </>
      )}

      <ConfirmModal
        open={Boolean(toDelete)}
        title="Hapus tanggapan ini?"
        confirmLabel="Ya, hapus tanggapan"
        busy={busy}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        message={toDelete && <p>Tanggapan Anda untuk ulasan <b>{toDelete.user_name}</b> akan dihapus dari halaman destinasi. Ulasannya sendiri tidak terhapus.</p>}
      />

      {reportOf && (
        <ReportModal
          review={reportOf}
          onClose={() => setReportOf(null)}
          onDone={(msg, reviewId) => {
            setReportOf(null);
            setResult((res) =>
              res.data
                ? { ...res, data: { ...res.data, items: res.data.items.map((x) => (x.id === reviewId ? { ...x, reported: true } : x)) } }
                : res,
            );
            toast.success(msg);
          }}
        />
      )}
    </>
  );
}
