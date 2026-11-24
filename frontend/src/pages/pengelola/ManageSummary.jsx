import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Star, MessageSquare, RefreshCw, ArrowRight, Plus, Store, Download, MapPinned, MapPin,
  CheckCircle2, CornerDownRight, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import api from '../../api/axios';
import { errorMessage, useToast } from '../../context/toast';
import { PageHead } from '../../components/common/PanelUI';
import { fmtNum as fmt, initials } from '../../utils/helpers';
import { downloadCsv, stamp } from '../../utils/csv';

// Palet tervalidasi (sama dengan dashboard admin): hijau = rating bulanan, oranye = rata-rata kumulatif
const C_MONTH = '#047857';
const C_AVG = '#c2410c';

const monthLabel = (ym, opts = { month: 'short' }) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('id-ID', opts);
const fmtDate = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const dec = (n, digits = 1) => Number(n).toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function Stars({ score }) {
  return (
    <span className="ad-stars" aria-label={`Rating ${score} dari 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={12} className={i <= score ? 'on' : ''} />)}
    </span>
  );
}

// Grafik garis rating rata-rata per bulan (skala 1–5) + garis putus-putus rata-rata kumulatif
function RatingTrend({ months, average }) {
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = 220;
  const pad = { l: 30, r: 14, t: 14, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (i / (months.length - 1)) * iw;
  const y = (v) => pad.t + ih - ((v - 1) / 4) * ih;

  // Garis hanya menyambung bulan yang punya rating; bulan kosong memutus garis
  const segments = [];
  let cur = [];
  months.forEach((m, i) => {
    if (m.avg === null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else cur.push(i);
  });
  if (cur.length) segments.push(cur);
  const path = (seg) => seg.map((i, k) => `${k ? 'L' : 'M'}${x(i)},${y(months[i].avg)}`).join(' ');

  return (
    <div className="ad-area" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafik rata-rata rating per bulan, 6 bulan terakhir">
        <defs>
          <linearGradient id="grad-rating" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={C_MONTH} stopOpacity="0.18" />
            <stop offset="100%" stopColor={C_MONTH} stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="grid">
          {[1, 2, 3, 4, 5].map((t) => <line key={t} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />)}
        </g>
        <g className="axis">
          {[1, 2, 3, 4, 5].map((t) => <text key={t} x={pad.l - 8} y={y(t) + 4} textAnchor="end">{t}</text>)}
          {months.map((m, i) => <text key={m.month} x={x(i)} y={H - 8} textAnchor="middle">{monthLabel(m.month)}</text>)}
        </g>
        {average !== null && (
          <line x1={pad.l} x2={W - pad.r} y1={y(average)} y2={y(average)} stroke={C_AVG} strokeWidth="1.5" strokeDasharray="6 5" />
        )}
        {segments.map((seg) => (
          <g key={seg[0]}>
            {seg.length > 1 && (
              <path d={`${path(seg)} L${x(seg[seg.length - 1])},${y(1)} L${x(seg[0])},${y(1)} Z`} fill="url(#grad-rating)" />
            )}
            <path d={path(seg)} fill="none" stroke={C_MONTH} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
        {months.map((m, i) =>
          m.avg === null ? null : (
            <circle key={m.month} cx={x(i)} cy={y(m.avg)} r={hover === i ? 6 : 4.5} fill={C_MONTH} stroke="#fff" strokeWidth="2" />
          ),
        )}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="#9ca3af" strokeDasharray="3 3" />
        )}
        {months.map((m, i) => {
          const w = iw / (months.length - 1);
          return <rect key={m.month} className="hit" x={x(i) - w / 2} y={pad.t} width={w} height={ih} onMouseEnter={() => setHover(i)} />;
        })}
      </svg>
      {hover !== null && (
        <div className="ad-area-tip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(pad.t / H) * 100}%` }}>
          <small>{monthLabel(months[hover].month, { month: 'long', year: 'numeric' })}</small>
          {months[hover].avg === null ? (
            <div>Belum ada rating</div>
          ) : (
            <div><i style={{ background: C_MONTH }} />Rating: <b>{dec(months[hover].avg, 2)}</b> ({fmt(months[hover].count)} rating)</div>
          )}
        </div>
      )}
      <details className="ad-chart-table">
        <summary>Lihat sebagai tabel</summary>
        <table className="ad-table compact">
          <thead><tr><th>Bulan</th><th className="num">Rata-rata</th><th className="num">Jumlah rating</th></tr></thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <td>{monthLabel(m.month, { month: 'long', year: 'numeric' })}</td>
                <td className="num">{m.avg === null ? '–' : dec(m.avg, 2)}</td>
                <td className="num">{fmt(m.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Delta({ value }) {
  if (value === null) return null;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const cls = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  return (
    <span className={`ad-trend ${cls}`}>
      <Icon size={12} /> {value > 0 ? '+' : ''}{dec(value, 2)} vs 30 hari lalu
    </span>
  );
}

// SRS 3.4: ringkasan destinasi milik pengelola (rata-rata rating, jumlah review, review terbaru)
export default function ManageSummary() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSummary = useCallback(
    () =>
      api
        .get('/manage/summary')
        .then((res) => {
          setData(res.data);
          setError('');
        })
        .catch((err) => setError(errorMessage(err, 'Gagal memuat ringkasan')))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const reload = () => {
    setLoading(true);
    fetchSummary();
  };

  const exportCsv = () => {
    const rows = [
      { k: 'Jumlah destinasi', v: data.destinations, n: '' },
      { k: 'Rata-rata rating', v: data.avgRating === null ? '' : data.avgRating, n: data.ratings },
      { k: 'Jumlah ulasan', v: data.reviews, n: '' },
      { k: 'Ulasan 30 hari terakhir', v: data.reviews30, n: '' },
      ...(data.repliesEnabled ? [{ k: 'Ulasan sudah dibalas', v: data.replied, n: data.responseRate === null ? '' : `${data.responseRate}%` }] : []),
      ...data.monthly.map((m) => ({
        k: `Rating ${monthLabel(m.month, { month: 'long', year: 'numeric' })}`,
        v: m.avg === null ? '' : m.avg,
        n: m.count,
      })),
    ];
    downloadCsv(
      `laporan-pengelola-${stamp()}.csv`,
      [
        { label: 'Keterangan', value: 'k' },
        { label: 'Nilai', value: 'v' },
        { label: 'Jumlah / persentase', value: 'n' },
      ],
      rows,
    );
    toast.success('Laporan diunduh');
  };

  const months = data?.monthly || [];
  const range = months.length
    ? `${monthLabel(months[0].month, { month: 'short', year: 'numeric' })} – ${monthLabel(months[months.length - 1].month, { month: 'short', year: 'numeric' })}`
    : '';
  const hasTrend = months.some((m) => m.avg !== null);

  return (
    <>
      <PageHead
        eyebrow="Portal mitra pengelola"
        title="Dashboard Pengelola Destinasi"
        desc="Pantau rata-rata rating, tren rating bulanan, dan ulasan terbaru untuk destinasi yang Anda kelola."
      >
        <button type="button" className="ad-btn soft" onClick={reload} disabled={loading} aria-label="Muat ulang">
          <RefreshCw size={15} className={loading ? 'ad-spin' : ''} />
        </button>
        {data?.destinations > 0 && (
          <button type="button" className="ad-btn soft" onClick={exportCsv}>
            <Download size={15} /> Unduh Laporan
          </button>
        )}
        <Link to="/pengelola/destinasi?tambah=1" className="ad-btn accent">
          <Plus size={15} /> Tambah Destinasi
        </Link>
      </PageHead>

      {loading && !data && (
        <div className="ad-stats" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="ad-stat ad-skel" style={{ height: 120 }} />)}
        </div>
      )}

      {error && (
        <div className="ad-state error" role="alert">
          <strong>Ringkasan tidak bisa dimuat</strong>
          <p>{error}</p>
          <button type="button" className="ad-btn soft" onClick={reload}>Coba lagi</button>
        </div>
      )}

      {data && !error && data.destinations === 0 && (
        <div className="ad-state">
          <Store size={30} />
          <strong>Anda belum mengelola destinasi</strong>
          <p>
            Tambahkan destinasi pertama Anda. Jika destinasi Anda sudah terdaftar di Nusantara Review,
            hubungi admin agar destinasi itu ditautkan ke akun Anda.
          </p>
          <Link to="/pengelola/destinasi?tambah=1" className="ad-btn accent"><Plus size={15} /> Tambah destinasi</Link>
        </div>
      )}

      {data && !error && data.destinations > 0 && (
        <>
          <section className="ms-cards" aria-label="Statistik">
            <div className="ad-card ms-card">
              <div className="ms-card-head">
                <div><span className="ms-eyebrow">Indikator kualitas</span><h3>Rata-rata Rating</h3></div>
                <span className="ms-icon amber"><Star size={18} /></span>
              </div>
              <p className="ms-value">
                {data.avgRating === null ? '–' : dec(data.avgRating)}
                {data.avgRating !== null && <small> / 5,0</small>}
              </p>
              <div className="ms-foot">
                <Delta value={data.avgDelta} />
                <span className="ad-muted">{data.ratings ? `dari ${fmt(data.ratings)} rating` : 'Belum ada rating'}</span>
              </div>
            </div>

            <div className="ad-card ms-card">
              <div className="ms-card-head">
                <div><span className="ms-eyebrow">Interaksi wisatawan</span><h3>Jumlah Ulasan</h3></div>
                <span className="ms-icon green"><MessageSquare size={18} /></span>
              </div>
              <p className="ms-value">{fmt(data.reviews)}<small> ulasan masuk</small></p>
              <div className="ms-foot">
                <span className="ad-tag">+{fmt(data.reviews30)} dalam 30 hari</span>
                {data.responseRate !== null && <span className="ad-muted">{fmt(data.responseRate)}% sudah ditanggapi</span>}
              </div>
            </div>

            <div className="ad-card ms-card">
              <div className="ms-card-head">
                <div><span className="ms-eyebrow">Objek kelolaan</span><h3>Destinasi Saya</h3></div>
                <span className="ms-icon orange"><MapPinned size={18} /></span>
              </div>
              <p className="ms-value">{fmt(data.destinations)}<small> destinasi</small></p>
              <div className="ms-foot">
                <span className="ad-muted ms-names">
                  {data.destinationNames.join(', ')}
                  {data.destinations > data.destinationNames.length && `, +${fmt(data.destinations - data.destinationNames.length)} lainnya`}
                </span>
              </div>
            </div>
          </section>

          <section className="ad-card ms-trend">
            <div className="ms-trend-head">
              <div>
                <h3>Tren Rating 6 Bulan Terakhir <span className="ad-tag">{range}</span></h3>
                <p className="ad-muted">
                  Rata-rata rating per bulan dari wisatawan
                  {data.avgRating !== null && <>, dibanding rata-rata keseluruhan {dec(data.avgRating, 2)}</>}.
                </p>
              </div>
              <div className="ms-legend" aria-hidden="true">
                <span><i style={{ background: C_MONTH }} /> Rating bulanan</span>
                {data.avgRating !== null && <span><i className="dash" style={{ borderColor: C_AVG }} /> Rata-rata keseluruhan</span>}
              </div>
            </div>
            {hasTrend ? (
              <RatingTrend months={months} average={data.avgRating} />
            ) : (
              <p className="ad-empty-inline">Belum ada rating dalam 6 bulan terakhir.</p>
            )}
          </section>

          <section className="ad-card">
            <div className="ad-card-head">
              <h3>Ulasan Terbaru <span className="ad-tag">{fmt(data.latestReviews.length)} ulasan terkini</span></h3>
              <Link to="/pengelola/ulasan" className="ad-link">Lihat semua {fmt(data.reviews)} ulasan <ArrowRight size={14} /></Link>
            </div>
            {data.latestReviews.length === 0 ? (
              <p className="ad-empty-inline">Belum ada ulasan untuk destinasi Anda.</p>
            ) : (
              <ul className="ms-reviews">
                {data.latestReviews.map((r) => (
                  <li key={r.id}>
                    <span className="mr-avatar" aria-hidden="true">{initials(r.user_name)}</span>
                    <div className="ms-rev-body">
                      <div className="ms-rev-top">
                        <strong>{r.user_name}</strong>
                        <span className="ad-tag"><MapPin size={11} /> {r.destination_name}</span>
                        <span className="ms-rev-date ad-muted">{fmtDate(r.created_at)}</span>
                      </div>
                      {r.score > 0 && <span className="ms-rev-score"><Stars score={r.score} /> <b>{dec(r.score)}</b></span>}
                      <p className="ad-clamp">{r.title ? <b>{r.title} · </b> : null}{r.content}</p>
                    </div>
                    {data.repliesEnabled && (
                      r.replied ? (
                        <span className="ad-tag green ms-rev-status"><CheckCircle2 size={12} /> Sudah dibalas</span>
                      ) : (
                        <Link to="/pengelola/ulasan?status=pending" className="ad-btn accent sm ms-rev-status">
                          <CornerDownRight size={13} /> Balas Ulasan
                        </Link>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
