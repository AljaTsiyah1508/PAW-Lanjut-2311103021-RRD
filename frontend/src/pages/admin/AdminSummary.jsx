import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare, Users, MapPinned, ShieldAlert, Download, Star, Image as ImageIcon,
  ArrowRight, Flag, UserPlus, CheckCircle2, Activity, ThumbsDown,
} from 'lucide-react';
import api from '../../api/axios';
import { useToast, errorMessage } from '../../context/toast';
import { PageHead, StatCard } from '../../components/common/PanelUI';
import { fmtNum as fmt, timeAgo } from '../../utils/helpers';
import { downloadCsv, stamp } from '../../utils/csv';

const RANGES = [
  { days: 7, label: '7 Hari' },
  { days: 30, label: '30 Hari' },
  { days: 90, label: '90 Hari' },
];
// Palet tervalidasi (dataviz validator): hijau & oranye, lolos CVD dan kontras
const SERIES = [
  { key: 'reviews', label: 'Ulasan baru', color: '#047857' },
  { key: 'users', label: 'Pengguna baru', color: '#c2410c' },
];

const dayLabel = (iso, opts = { day: 'numeric', month: 'short' }) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', opts);

const niceMax = (v) => {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= v);
};

// Grafik area dua seri, satu sumbu (sama-sama "jumlah"), tooltip + garis bantu saat hover
function AreaChart({ labels, step, series }) {
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = 240;
  const pad = { l: 34, r: 12, t: 12, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const top = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const x = (i) => pad.l + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / top) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const every = Math.ceil(labels.length / 6);

  const slotLabel = (i) => {
    if (step === 1) return dayLabel(labels[i], { weekday: 'short', day: 'numeric', month: 'short' });
    const end = new Date(`${labels[i]}T00:00:00`);
    end.setDate(end.getDate() + step - 1);
    return `${dayLabel(labels[i])} – ${end.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`;
  };

  return (
    <div className="ad-area" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafik ulasan baru dan pengguna baru per periode">
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        <g className="grid">
          {ticks.map((t) => <line key={t} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />)}
        </g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={pad.l - 8} y={y(t) + 4} textAnchor="end">{fmt(t)}</text>)}
          {labels.map((l, i) =>
            i % every === 0 || i === labels.length - 1 ? (
              <text key={l} x={x(i)} y={H - 8} textAnchor="middle">{dayLabel(l)}</text>
            ) : null,
          )}
        </g>
        {series.map((s) => {
          const line = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
          return (
            <g key={s.key}>
              <path d={`${line} L${x(s.values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#grad-${s.key})`} />
              <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="#9ca3af" strokeDasharray="3 3" />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />
            ))}
          </g>
        )}
        {labels.map((l, i) => {
          const w = iw / Math.max(labels.length - 1, 1);
          return (
            <rect key={l} className="hit" x={x(i) - w / 2} y={pad.t} width={w} height={ih} onMouseEnter={() => setHover(i)} />
          );
        })}
      </svg>
      {hover !== null && (
        <div className="ad-area-tip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(pad.t / H) * 100}%` }}>
          <small>{slotLabel(hover)}</small>
          {series.map((s) => (
            <div key={s.key}><i style={{ background: s.color }} />{s.label}: <b>{fmt(s.values[hover])}</b></div>
          ))}
        </div>
      )}
      <details className="ad-chart-table">
        <summary>Lihat sebagai tabel</summary>
        <table className="ad-table compact">
          <thead>
            <tr><th>{step === 1 ? 'Tanggal' : 'Minggu'}</th>{series.map((s) => <th key={s.key} className="num">{s.label}</th>)}</tr>
          </thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={l}><td>{slotLabel(i)}</td>{series.map((s) => <td key={s.key} className="num">{fmt(s.values[i])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// SRS 3.5: Dashboard admin — ringkasan user, destinasi, ulasan, dan aktivitas terbaru
export default function AdminSummary() {
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [tick, setTick] = useState(0);
  const key = `${days}|${tick}`;
  const [result, setResult] = useState({ key: null, data: null, error: '' });
  const loading = result.key !== key;
  const data = result.data;

  useEffect(() => {
    let alive = true;
    api
      .get('/admin/summary', { params: { days } })
      .then((res) => {
        if (!alive) return;
        // Backend versi lama tidak mengirim data periode/grafik → tampilkan pesan, jangan layar kosong
        if (!res.data?.period || !res.data?.growth?.labels || !res.data?.moderation) {
          setResult({ key, data: null, error: 'Backend belum diperbarui. Hentikan lalu jalankan ulang backend (npm start di folder backend).' });
          return;
        }
        setResult({ key, data: res.data, error: '' });
      })
      .catch((err) => alive && setResult({ key, data: null, error: errorMessage(err, 'Gagal memuat dashboard') }));
    return () => {
      alive = false;
    };
  }, [key, days]);

  const series = useMemo(
    () => (data ? SERIES.map((s) => ({ ...s, values: data.growth[s.key] })) : []),
    [data],
  );

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      { a: 'Periode', b: `${data.days} hari terakhir` },
      { a: 'Total ulasan', b: data.reviews },
      { a: `Ulasan baru (${data.days} hari)`, b: data.period.reviews },
      { a: 'Total pengguna', b: data.users.total },
      { a: 'Wisatawan', b: data.users.wisatawan },
      { a: 'Pengelola', b: data.users.pengelola },
      { a: 'Admin', b: data.users.admin },
      { a: `Pengguna baru (${data.days} hari)`, b: data.period.users },
      { a: 'Total destinasi', b: data.destinations.total },
      { a: 'Destinasi berpemilik', b: data.destinations.owned },
      { a: 'Destinasi tanpa pemilik', b: data.destinations.unowned },
      { a: 'Total rating', b: data.ratings },
      { a: 'Rata-rata rating', b: data.avgRating },
      { a: 'Total foto', b: data.photos },
      { a: 'Laporan ulasan terbuka', b: data.moderation.openReports },
      { a: '', b: '' },
      { a: data.growth.step === 1 ? 'Tanggal' : 'Minggu mulai', b: 'Ulasan baru', c: 'Pengguna baru' },
      ...data.growth.labels.map((l, i) => ({ a: l, b: data.growth.reviews[i], c: data.growth.users[i] })),
    ];
    downloadCsv(
      `ringkasan-nusantarareview-${data.days}hari-${stamp()}.csv`,
      [{ label: 'Metrik', value: 'a' }, { label: 'Nilai', value: 'b' }, { label: '', value: 'c' }],
      rows,
    );
    toast.success('Ringkasan diunduh (CSV)');
  };

  const mod = data?.moderation;

  return (
    <>
      <PageHead
        eyebrow="Pemantauan ekosistem ulasan"
        title="Pusat Kendali Admin"
        desc="Ringkasan pengguna, destinasi, dan ulasan di NusantaraReview, beserta hal yang perlu ditindaklanjuti."
      >
        <div className="ad-range" role="group" aria-label="Periode">
          {RANGES.map((r) => (
            <button key={r.days} type="button" className={days === r.days ? 'on' : ''} aria-pressed={days === r.days} onClick={() => setDays(r.days)}>
              {r.label}
            </button>
          ))}
        </div>
        <button type="button" className="ad-btn accent" onClick={exportCsv} disabled={!data}>
          <Download size={15} /> Unduh Ringkasan (CSV)
        </button>
      </PageHead>

      {result.error && !loading && (
        <div className="ad-state error" role="alert">
          <strong>Dashboard tidak bisa dimuat</strong>
          <p>{result.error}</p>
          <button type="button" className="ad-btn soft" onClick={() => setTick((t) => t + 1)}>Coba lagi</button>
        </div>
      )}

      {!data && !result.error && (
        <div aria-busy="true">
          <div className="ad-stats">{[0, 1, 2, 3].map((i) => <div key={i} className="ad-stat ad-skel" style={{ height: 140 }} />)}</div>
          <div className="ad-card ad-skel" style={{ height: 320 }} />
        </div>
      )}

      {data && (
        <div style={{ opacity: loading ? 0.6 : 1 }} aria-busy={loading}>
          <section className="ad-stats" aria-label="Statistik utama">
            <StatCard icon={MessageSquare} label="Total Ulasan" value={fmt(data.reviews)} trend={data.period.reviewsTrend}>
              +{fmt(data.period.reviews)} ulasan dalam {data.days} hari
            </StatCard>
            <StatCard icon={Users} label="Pengguna Terdaftar" value={fmt(data.users.total)} trend={data.period.usersTrend}>
              {fmt(data.users.wisatawan)} wisatawan · {fmt(data.users.pengelola)} pengelola · {fmt(data.users.admin)} admin
            </StatCard>
            <StatCard icon={MapPinned} label="Destinasi Terdaftar" value={fmt(data.destinations.total)} unit="objek wisata">
              {fmt(data.destinations.owned)} berpemilik · {fmt(data.destinations.unowned)} tanpa pemilik
            </StatCard>
            {mod.enabled ? (
              <StatCard icon={ShieldAlert} label="Perlu Moderasi" value={fmt(mod.openReports)} unit="ulasan dilaporkan" tone={mod.openReports ? 'warn' : undefined}>
                <Link to="/admin/ulasan?tab=reported" className="ad-link">Buka antrean <ArrowRight size={13} /></Link>
              </StatCard>
            ) : (
              <StatCard icon={ThumbsDown} label="Rating Rendah (1–2★)" value={fmt(data.period.lowRatings)} unit={`dalam ${data.days} hari`} tone={data.period.lowRatings ? 'warn' : undefined}>
                <Link to="/admin/ulasan?tab=low" className="ad-link">Tinjau ulasan <ArrowRight size={13} /></Link>
              </StatCard>
            )}
          </section>

          <section className="ad-grid-main">
            <div className="ad-card">
              <div className="ad-card-head" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h3>Aktivitas Ulasan &amp; Pengguna Baru</h3>
                  <p className="ad-muted" style={{ margin: '4px 0 0' }}>
                    {data.growth.step === 1 ? 'Per hari' : 'Per minggu'}, {data.days} hari terakhir
                  </p>
                </div>
                <div className="ad-legend">
                  {SERIES.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
                </div>
              </div>
              <AreaChart labels={data.growth.labels} step={data.growth.step} series={series} />
            </div>

            <div className="ad-card">
              <div className="ad-card-head"><h3>Kualitas Konten</h3></div>
              <ul className="ad-queue">
                <li>
                  <span className="ad-queue-icon"><Star size={16} /></span>
                  <div className="ad-queue-body">
                    <strong>{data.ratings ? `${data.avgRating.toLocaleString('id-ID')} / 5` : '–'}</strong>
                    <p>Rata-rata dari {fmt(data.ratings)} rating</p>
                  </div>
                </li>
                <li>
                  <span className="ad-queue-icon"><ThumbsDown size={16} /></span>
                  <div className="ad-queue-body">
                    <strong>{fmt(data.period.lowRatings)} rating rendah</strong>
                    <p>Bintang 1–2 dalam {data.days} hari terakhir</p>
                  </div>
                </li>
                <li>
                  <span className="ad-queue-icon"><ImageIcon size={16} /></span>
                  <div className="ad-queue-body">
                    <strong>{fmt(data.photos)} foto</strong>
                    <p>Galeri resmi &amp; foto ulasan</p>
                  </div>
                </li>
              </ul>
              <Link to="/admin/ulasan" className="ad-btn soft" style={{ width: '100%', marginTop: 14 }}>
                Buka Moderasi Ulasan <ArrowRight size={14} />
              </Link>
            </div>
          </section>

          <section className="ad-grid-2" style={{ marginTop: 18 }}>
            <div className="ad-card">
              <div className="ad-card-head">
                <h3>{mod.enabled ? 'Antrean Moderasi' : 'Ulasan Terbaru'}</h3>
                {mod.enabled && mod.openReports > 0 && <span className="ad-tag red">{fmt(mod.openReports)} dilaporkan</span>}
              </div>
              {mod.enabled && mod.queue.length > 0 ? (
                <ul className="ad-queue">
                  {mod.queue.map((q) => (
                    <li key={q.id}>
                      <span className="ad-queue-icon"><Flag size={16} /></span>
                      <div className="ad-queue-body">
                        <strong>{q.user_name} <span className="ad-muted">· {q.destination_name}</span></strong>
                        <p className="ad-clamp">{q.title ? `${q.title} · ` : ''}{q.content}</p>
                        <div className="ad-tags">
                          {q.report?.reasons.map((r) => <span key={r.key} className="ad-tag red">{r.label}{r.count > 1 ? ` ×${r.count}` : ''}</span>)}
                        </div>
                      </div>
                      <Link to="/admin/ulasan?tab=reported" className="ad-btn primary" style={{ minHeight: 32, padding: '0 12px' }}>Tinjau</Link>
                    </li>
                  ))}
                </ul>
              ) : data.latestReviews.length === 0 ? (
                <p className="ad-empty-inline">Belum ada ulasan.</p>
              ) : (
                <>
                  {mod.enabled && (
                    <p className="ad-muted" style={{ margin: '0 0 10px' }}><CheckCircle2 size={13} /> Tidak ada laporan terbuka. Berikut ulasan terbaru.</p>
                  )}
                  <ul className="ad-queue">
                    {data.latestReviews.map((r) => (
                      <li key={r.id}>
                        <span className="ad-queue-icon"><MessageSquare size={16} /></span>
                        <div className="ad-queue-body">
                          <strong>{r.user_name} <span className="ad-muted">· {r.destination_name} · {timeAgo(r.created_at)}</span></strong>
                          <p className="ad-clamp">{r.title ? `${r.title} · ` : ''}{r.content}</p>
                          {r.score > 0 && <span className={`ad-tag ${r.score <= 2 ? 'amber' : 'green'}`}><Star size={11} /> {r.score}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="ad-card-foot">
                <Link to="/admin/ulasan" className="ad-link">Lihat semua ulasan <ArrowRight size={13} /></Link>
              </div>
            </div>

            <div className="ad-card">
              <div className="ad-card-head">
                <h3>Pengelola Belum Punya Destinasi</h3>
                {data.idlePengelola.total > 0 && <span className="ad-tag amber">{fmt(data.idlePengelola.total)} menunggu</span>}
              </div>
              {data.idlePengelola.total === 0 ? (
                <p className="ad-empty-inline"><CheckCircle2 size={13} /> Semua pengelola sudah memiliki destinasi.</p>
              ) : (
                <ul className="ad-queue">
                  {data.idlePengelola.items.map((u) => (
                    <li key={u.id}>
                      <span className="ad-queue-icon"><UserPlus size={16} /></span>
                      <div className="ad-queue-body">
                        <strong>{u.name}</strong>
                        <p>{u.email} · daftar {timeAgo(u.created_at)}</p>
                      </div>
                      <Link to="/admin/destinasi?owner=no" className="ad-btn primary" style={{ minHeight: 32, padding: '0 12px' }}>Tautkan</Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="ad-card-foot">
                <span><Activity size={12} /> {fmt(data.destinations.unowned)} destinasi belum berpemilik</span>
                <Link to="/admin/destinasi?owner=no" className="ad-link">Kelola <ArrowRight size={13} /></Link>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
