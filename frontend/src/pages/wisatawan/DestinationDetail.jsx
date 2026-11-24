import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Star, MapPin, Clock, Ticket, Sun, Bookmark, Share2, PenSquare, Compass,
  ThumbsUp, ExternalLink, ChevronDown, Camera, Flag,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/wisatawan/Navbar';
import Footer from '../../components/wisatawan/Footer';
import ReportModal from '../../components/common/ReportModal';
import { imgUrl, initials, monthYear, timeAgo } from '../../utils/helpers';
import { priceInfo, hoursInfo } from '../../utils/estimates';
import '../../styles/home.css';
import '../../styles/detail.css';
import '../../styles/photos.css';

const Stars = ({ value, size = 14 }) => (
  <span className="stars">
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} size={size} fill={i <= Math.round(value) ? 'currentColor' : 'none'} />
    ))}
  </span>
);

export default function DestinationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(5);
  // Pesan dari halaman sebelumnya (mis. "Ulasan dihapus")
  const [toast, setToast] = useState(() => location.state?.toast || '');

  useEffect(() => {
    if (!location.state?.toast) return undefined;
    // Bersihkan state supaya toast tidak muncul lagi saat halaman di-refresh
    navigate(location.pathname, { replace: true, state: null });
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(
    () =>
      api
        .get(`/destinations/${id}`)
        .then((r) => { setData(r.data); setError(''); })
        .catch((e) =>
          setError(e.response?.status === 404 ? 'Destinasi tidak ditemukan.' : 'Gagal memuat data.')
        ),
    [id]
  );

  useEffect(() => { window.scrollTo(0, 0); setVisible(5); }, [id]);
  useEffect(() => { load(); }, [load, user?.id]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  // Galeri atas: foto cover + galeri resmi saja (1, 3, atau 5 foto). Foto dari ulasan
  // pengunjung tampil di ulasannya masing-masing. Cover dari galeri tidak diulang.
  const images = useMemo(() => {
    if (!data) return [];
    const list = [...new Set([imgUrl(data.destination.cover_image), ...(data.gallery || []).map((p) => imgUrl(p))].filter(Boolean))];
    return list.slice(0, 5); // tata letak tersedia untuk 1 sampai 5 foto
  }, [data]);

  const toggleFavorite = async () => {
    if (!user) return navigate('/login');
    try {
      const res = await api.post(`/destinations/${id}/favorite`);
      setData((d) => ({ ...d, isFavorite: res.data.favorite }));
      showToast(res.data.favorite ? 'Disimpan ke favorit' : 'Dihapus dari favorit');
    } catch {
      showToast('Gagal menyimpan');
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Tautan disalin');
    } catch {
      showToast('Salin tautan dari address bar');
    }
  };

  // Fitur laporan aktif? (tombol "Laporkan" disembunyikan bila belum)
  const [reportsOn, setReportsOn] = useState(false);
  const [reportOf, setReportOf] = useState(null);
  useEffect(() => {
    api.get('/reports/status').then((r) => setReportsOn(r.data.enabled)).catch(() => {});
  }, []);

  const toggleHelpful = async (reviewId) => {
    if (!user) return navigate('/login');
    try {
      const res = await api.post(`/reviews/${reviewId}/helpful`);
      setData((d) => ({
        ...d,
        reviews: d.reviews.map((x) =>
          x.id === reviewId ? { ...x, liked: res.data.liked, helpful_count: res.data.total } : x
        ),
      }));
    } catch {
      /* abaikan */
    }
  };

  const goWrite = (rating) =>
    navigate(`/destinasi/${id}/tulis-review${rating ? `?rating=${rating}` : ''}`);

  if (error) {
    return (
      <div className="home">
        <Navbar />
        <main className="dt">
          <div className="alert">{error}</div>
          <p><Link to="/jelajah" className="dt-link">← Kembali ke Jelajah</Link></p>
        </main>
      </div>
    );
  }
  if (!data) {
    return <div className="home"><Navbar /><p className="muted-center">Memuat...</p></div>;
  }

  const { destination: d, distribution, reviews } = data;
  const price = priceInfo(d);
  const hours = hoursInfo(d);
  const lat = Number(d.latitude);
  const lon = Number(d.longitude);
  const hasCoord = d.latitude != null && d.longitude != null && !Number.isNaN(lat) && !Number.isNaN(lon);
  const mapSrc = hasCoord
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.04}%2C${lat - 0.025}%2C${lon + 0.04}%2C${lat + 0.025}&layer=mapnik&marker=${lat}%2C${lon}`
    : null;
  const gmaps = hasCoord
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.name} ${d.location}`)}`;

  const totalRating = d.rating_count;
  const myReviewExists = !!data.myReview;

  return (
    <div className="home">
      <Navbar />

      <main className="dt">
        <Link to="/jelajah" className="dt-crumb">Jelajah Destinasi / <b>{d.name}</b></Link>

        {/* ---------- Header ---------- */}
        <header className="dt-head">
          <div>
            <div className="dt-badges">
              <span className="dt-badge"><Compass size={12} /> {d.category}</span>
              {d.open_hours && <span className="dt-badge blue"><Clock size={12} /> Buka: {d.open_hours}</span>}
              {d.highlights && <span className="dt-badge blue">{d.highlights}</span>}
            </div>
            <h1>{d.name}</h1>
            <div className="dt-meta">
              <span className="score">
                <Star size={16} fill="currentColor" />
                {totalRating > 0 ? (
                  <><strong>{d.avg_rating}</strong> / 5.0 <span>({d.review_count} ulasan, {totalRating} rating)</span></>
                ) : (
                  <span>Belum ada rating</span>
                )}
              </span>
              <span className="loc"><MapPin size={14} /> {d.location}</span>
            </div>
          </div>

          <div className="dt-actions">
            <button className={`dt-btn ${data.isFavorite ? 'on' : ''}`} onClick={toggleFavorite}>
              <Bookmark size={15} fill={data.isFavorite ? 'currentColor' : 'none'} /> {data.isFavorite ? 'Tersimpan' : 'Simpan'}
            </button>
            <button className="dt-btn" onClick={share}><Share2 size={15} /> Bagikan</button>
          </div>
        </header>

        {/* ---------- Galeri ---------- */}
        <div className={`dt-gallery n${images.length}`}>
          {images.length === 0 ? (
            <div className="dt-shot ph" />
          ) : (
            images.map((src, i) => (
              <div key={i} className="dt-shot" style={{ backgroundImage: `url("${src}")` }}>
                {i === 0 && /wikimedia.org/i.test(d.cover_image || '') && <span className="dt-credit"><Camera size={11} /> Foto: Wikimedia Commons</span>}
              </div>
            ))
          )}
        </div>

        {/* ---------- Tentang ---------- */}
        <section className="dt-sec">
          <h2><Compass size={22} /> Tentang Destinasi</h2>
          <p className="dt-desc">{d.description || 'Belum ada deskripsi untuk destinasi ini.'}</p>

          <div className="dt-infos">
            <div className="dt-info">
              <Sun size={20} color="#d97706" />
              <div>
                <strong>Waktu Terbaik Berkunjung</strong>
                {d.best_time ? `${d.best_time}.` : 'Belum ada informasi waktu terbaik untuk destinasi ini.'}
              </div>
            </div>
            <div className="dt-info warm">
              <Ticket size={20} color="#b45309" />
              <div>
                <strong>Tiket &amp; Jam Buka</strong>
                Tiket: {price.text}{price.estimate && <span className="dt-est">Perkiraan</span>}.{' '}
                Jam buka: {hours.text}{hours.estimate && <span className="dt-est">Perkiraan</span>}.
                {(price.estimate || hours.estimate) && (
                  <small className="dt-est-note">Perkiraan berdasarkan tempat sejenis. Pastikan ke pengelola sebelum berangkat.</small>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Lokasi ---------- */}
        <section className="dt-sec">
          <div className="dt-card">
            <div className="dt-maphead">
              <div>
                <small className="eyebrow">PANDUAN TRANSPORTASI</small>
                <h2 style={{ marginTop: 4 }}>Lokasi &amp; Rute Menuju Lokasi</h2>
              </div>
              <a className="dt-link" href={gmaps} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Buka di Google Maps
              </a>
            </div>

            <div className="dt-map">
              {mapSrc ? (
                <iframe title="Peta lokasi" src={mapSrc} loading="lazy" />
              ) : (
                <div className="dt-map-empty">Koordinat belum tersedia untuk destinasi ini.</div>
              )}
            </div>
            <p className="dt-coord">
              <MapPin size={13} /> {d.address || d.location}
              {hasCoord && <> • Koordinat: {lat.toFixed(5)}, {lon.toFixed(5)}</>}
              {hasCoord && (
                <> • <a className="dt-link" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`} target="_blank" rel="noreferrer">Peta lebih besar</a></>
              )}
            </p>
          </div>
        </section>

        {/* ---------- Ulasan ---------- */}
        <section className="dt-sec">
          <div className="dt-revhead">
            <div>
              <h2>Ulasan Wisatawan <span className="dt-count">{d.review_count} Review</span></h2>
              <p className="dt-sub">Ulasan asli dari penjelajah yang telah mengunjungi {d.name}.</p>
            </div>
          </div>

          <div className="dt-summary">
            <div className="dt-score-box">
              <b>{totalRating > 0 ? d.avg_rating : '-'}</b>
              <Stars value={d.avg_rating} size={18} />
              <small>
                {totalRating > 0 ? `Berdasarkan ${totalRating} rating` : 'Belum ada rating'}
              </small>
            </div>
            <div className="dt-bars">
              {[5, 4, 3, 2, 1].map((n) => {
                const count = distribution[n] || 0;
                const pct = totalRating ? (count / totalRating) * 100 : 0;
                return (
                  <div className="row" key={n}>
                    <span>{n} Bintang</span>
                    <div className="dt-bar"><i style={{ width: `${pct}%` }} /></div>
                    <span className="pct">{Math.round(pct)}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ---------- Pernah berkunjung? (satu-satunya jalan ke halaman tulis review) ---------- */}
          <div className="dt-cta">
            <div>
              <small className="eyebrow">KONTRIBUSI KOMUNITAS</small>
              <h3>Pernah Berkunjung ke {d.name}?</h3>
              <p>Bantu jutaan penjelajah lain dengan membagikan ulasan jujur dan foto petualanganmu.</p>
              <div className="dt-rate">
                <span>Beri Rating:</span>
                <span className="dt-rate-stars">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button key={i} type="button" aria-label={`${i} bintang`} onClick={() => goWrite(i)}>
                      <Star size={26} fill={i <= data.myRating ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </span>
              </div>
            </div>
            <button className="dt-btn primary big" onClick={() => goWrite()}>
              <PenSquare size={16} /> {myReviewExists ? 'Ubah Review Saya' : 'Tulis Review Sekarang'}
            </button>
          </div>

          {/* ---------- Daftar ulasan ---------- */}
          {reviews.length === 0 ? (
            <p className="muted-center">Belum ada ulasan. Jadilah yang pertama menulis!</p>
          ) : (
            <div className="dt-reviews">
              {reviews.slice(0, visible).map((r) => (
                <article key={r.id} className="dt-review">
                  <span className="avatar big">{initials(r.user_name)}</span>
                  <div className="dt-review-body">
                    <div className="dt-review-top">
                      <div>
                        <strong>{r.user_name}</strong>
                        <small>
                          {r.user_review_count} Ulasan Terdaftar • Kunjungan: {monthYear(r.visit_date || r.created_at)}
                        </small>
                      </div>
                      <div className="dt-review-right">
                        {r.score > 0 && <Stars value={r.score} />}
                        <small>{timeAgo(r.created_at)}</small>
                      </div>
                    </div>

                    {r.title && <h4>{r.title}</h4>}
                    <p>{r.content}</p>

                    {r.photos.length > 0 && (
                      <div className="dt-review-photos">
                        {r.photos.map((p) => (
                          <a key={p} href={imgUrl(p)} target="_blank" rel="noreferrer">
                            <img src={imgUrl(p)} alt="" loading="lazy" />
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Tanggapan resmi pengelola destinasi */}
                    {r.reply && (
                      <div className="dt-reply">
                        <div className="dt-reply-head">
                          <strong>Tanggapan Pengelola {d.name}</strong>
                          <small>{timeAgo(r.reply.updated_at || r.reply.created_at)}</small>
                        </div>
                        <p>{r.reply.content}</p>
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <button className={`helpful ${r.liked ? 'on' : ''}`} onClick={() => toggleHelpful(r.id)}>
                        <ThumbsUp size={14} /> Membantu ({r.helpful_count})
                      </button>
                      {/* Laporkan ulasan yang melanggar (bukan ulasan sendiri) */}
                      {reportsOn && !r.mine && (
                        <button
                          type="button"
                          className="rv-report"
                          disabled={r.reported}
                          onClick={() => (user ? setReportOf(r) : navigate('/login', { state: { from: `/destinasi/${id}` } }))}
                          title={r.reported ? 'Anda sudah melaporkan ulasan ini' : 'Laporkan ulasan yang melanggar'}
                        >
                          <Flag size={13} /> {r.reported ? 'Dilaporkan' : 'Laporkan'}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {visible < reviews.length && (
            <div className="center">
              <button className="btn-soft dt-more" onClick={() => setVisible((v) => v + 5)}>
                Tampilkan Lebih Banyak Ulasan ({reviews.length - visible} lainnya) <ChevronDown size={14} />
              </button>
            </div>
          )}
        </section>
      </main>

      {reportOf && (
        <ReportModal
          review={reportOf}
          onClose={() => setReportOf(null)}
          onDone={(msg, reviewId) => {
            setReportOf(null);
            setData((d) => ({ ...d, reviews: d.reviews.map((x) => (x.id === reviewId ? { ...x, reported: true } : x)) }));
            showToast(msg);
          }}
        />
      )}

      {toast && <div className="dt-toast">{toast}</div>}
      <Footer />
    </div>
  );
}