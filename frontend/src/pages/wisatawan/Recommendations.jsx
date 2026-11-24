import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles, Heart, Star, MapPin, TrendingUp, Gem, Award, RefreshCw, SlidersHorizontal,
  ChevronRight, ArrowRight, PenSquare, Flame, Target,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/wisatawan/Navbar';
import Footer from '../../components/wisatawan/Footer';
import { imgUrl, initials } from '../../utils/helpers';
import '../../styles/home.css';
import '../../styles/detail.css';
import '../../styles/recommend.css';

const cut = (s = '', n = 110) => (s.length > n ? s.slice(0, n).trim() + '…' : s);
const priceText = (p) => (p ? `Rp ${Number(p).toLocaleString('id-ID')}` : 'Info belum ada');
const ratingText = (d) => (d.rating_count > 0 ? d.avg_rating.toFixed(2) : 'Baru');
const quoteText = (d) => (d.quote ? `“${cut(d.quote.content)}”` : cut(d.description));
const joinList = (arr) =>
  arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} & ${arr[arr.length - 1]}`;

/* ---------------- Kartu-kartu ---------------- */
function PickCard({ d, fav, onFav }) {
  const cover = imgUrl(d.cover_image);
  return (
    <article className="rc-card">
      <div className="rc-photo tall" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
        <span className="rc-badge green"><Target size={12} /> {d.match}% Cocok</span>
        <button className={`rc-heart ${fav ? 'on' : ''}`} onClick={() => onFav(d.id)} aria-label="Simpan">
          <Heart size={16} fill={fav ? 'currentColor' : 'none'} />
        </button>
        <div className="rc-photo-foot">
          <span className="rc-rate"><Star size={14} fill="currentColor" /> <b>{ratingText(d)}</b>
            {d.rating_count > 0 && <em>({d.rating_count} rating)</em>}
          </span>
          <span><MapPin size={12} /> {d.location}</span>
        </div>
      </div>
      <div className="rc-body">
        <div className="rc-tags">
          <span className="rc-tag">{d.category}</span>
          {d.highlights && <span className="rc-tag blue">{d.highlights}</span>}
        </div>
        <h3>{d.name}</h3>
        <p className="rc-quote">{quoteText(d)}</p>
        <div className="rc-foot">
          <div className="rc-price"><small>Mulai dari</small><b>{priceText(d.price)}</b></div>
          <Link to={`/destinasi/${d.id}`} className="rc-btn">Lihat Detail</Link>
        </div>
      </div>
    </article>
  );
}

function TopCard({ d }) {
  const cover = imgUrl(d.cover_image);
  const pct = d.rating_count > 0 ? (d.avg_rating / 5) * 100 : 0;
  return (
    <Link to={`/destinasi/${d.id}`} className="rc-card link">
      <div className="rc-photo" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
        <span className="rc-badge dark"><Star size={12} fill="currentColor" /> {ratingText(d)}</span>
        {d.highlights && <span className="rc-badge green bottom">{d.highlights}</span>}
      </div>
      <div className="rc-body">
        <small className="rc-loc"><MapPin size={12} /> {d.location}</small>
        <h3>{d.name}</h3>
        <p className="rc-desc">{cut(d.description, 95)}</p>
        <div className="rc-meter">
          <div className="rc-meter-top">
            <span>Rating komunitas</span>
            <b>{d.rating_count > 0 ? `${d.avg_rating.toFixed(1)} / 5.0` : '-'}</b>
          </div>
          <div className="rc-bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="rc-foot slim">
          <small>{d.rating_count} rating</small>
          <span className="rc-link">Lihat detail</span>
        </div>
      </div>
    </Link>
  );
}

function TrendCard({ d }) {
  const cover = imgUrl(d.cover_image);
  const hot = d.recent_activity > 0;
  return (
    <Link to={`/destinasi/${d.id}`} className="rc-card link">
      <div className="rc-photo" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
        <span className="rc-badge orange"><Flame size={12} /> {hot ? `${d.recent_activity} aktivitas 30 hari` : 'Populer'}</span>
        <span className="rc-badge dark bottom right"><Heart size={11} /> {d.want_count} ingin ke sana</span>
      </div>
      <div className="rc-body">
        <div className="rc-row">
          <small className="rc-loc"><MapPin size={12} /> {d.location}</small>
          <span className="rc-rate dark"><Star size={12} fill="currentColor" /> {ratingText(d)}</span>
        </div>
        <h3>{d.name}</h3>
        <p className="rc-desc">{quoteText(d)}</p>
        <div className="rc-foot slim">
          <small>{d.recent_reviews} ulasan baru</small>
          <span className="rc-link">Eksplor Tren <ChevronRight size={13} /></span>
        </div>
      </div>
    </Link>
  );
}

function GemCard({ d }) {
  const cover = imgUrl(d.cover_image);
  return (
    <Link to={`/destinasi/${d.id}`} className="rc-card link white">
      <div className="rc-photo short" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
        {d.highlights && <span className="rc-badge light bottom">{d.highlights}</span>}
      </div>
      <div className="rc-body">
        <div className="rc-row">
          <small className="rc-loc">{d.location}</small>
          <span className="rc-rate dark"><Star size={12} fill="currentColor" /> {ratingText(d)}</span>
        </div>
        <h3>{d.name}</h3>
        <p className="rc-desc">{cut(d.description, 100)}</p>
        <div className="rc-foot slim">
          <small>{d.category}</small>
          <span className="rc-link">Lihat Panduan <ArrowRight size={13} /></span>
        </div>
      </div>
    </Link>
  );
}

/* ---------------- Halaman ---------------- */
const TABS = [
  { key: 'all', label: 'Semua Rekomendasi', icon: Sparkles },
  { key: 'pref', label: 'Sesuai Minatmu', icon: Target },
  { key: 'top', label: 'Rating Tertinggi', icon: Award },
  { key: 'trend', label: 'Tren Populer', icon: TrendingUp },
  { key: 'gems', label: 'Hidden Gems', icon: Gem },
];

export default function Recommendations() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [cat, setCat] = useState('all');
  const [favs, setFavs] = useState(new Set());
  const [toast, setToast] = useState('');

  const load = useCallback(
    () =>
      api
        .get('/recommendations/page')
        .then((r) => {
          setData(r.data);
          setFavs(new Set(r.data.forYou.items.filter((i) => i.is_favorite).map((i) => i.id)));
          setError('');
        })
        .catch(() => setError('Gagal memuat rekomendasi. Pastikan backend berjalan.')),
    []
  );

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => { load(); }, [load, user?.id]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  const toggleFav = async (id) => {
    if (!user) return navigate('/login', { state: { from: '/rekomendasi' } });
    try {
      const res = await api.post(`/destinations/${id}/favorite`);
      setFavs((prev) => {
        const next = new Set(prev);
        if (res.data.favorite) next.add(id); else next.delete(id);
        return next;
      });
      showToast(res.data.favorite ? 'Disimpan ke favorit' : 'Dihapus dari favorit');
    } catch {
      showToast('Gagal menyimpan');
    }
  };

  const total = useMemo(() => {
    if (!data) return 0;
    const ids = new Set([
      ...data.forYou.items, ...data.topRated.all, ...data.trending, ...data.hidden,
    ].map((i) => i.id));
    return ids.size;
  }, [data]);

  const show = (key) => tab === 'all' || tab === key;
  const topList = data ? (cat === 'all' ? data.topRated.all : data.topRated.by_category[cat] || []) : [];

  return (
    <div className="home">
      <Navbar />

      {/* ---------- HERO: ukuran sama dengan beranda & jelajah, foto rekomendasi.jpg ---------- */}
      <section className="landing landing-reco">
        <div className="landing-inner">
          <h1>Rekomendasi Destinasi Pilihan untuk Anda</h1>
          <p className="landing-text">
            Rekomendasi kami dikurasi dari ulasan dan rating pengguna, popularitas destinasi,
            serta riwayat petualangan Anda.
          </p>

          {/* Kartu putih solid (seperti kartu pencarian di Jelajah) */}
          <div className="rc-panel">
            <div className="rc-person">
              <span className="avatar xl">{user ? initials(user.name) : '?'}</span>
              <div className="rc-person-text">
                {user ? (
                  <>
                    <strong>
                      Personalisasi untuk {user.name}
                      <span className="rc-chip">{data ? data.profile.rated_count : 0} rating diberikan</span>
                    </strong>
                    <small>
                      {data?.profile.personalized
                        ? <>Minat Aktif: <b>{joinList(data.profile.interests)}</b></>
                        : 'Beri rating 4 ke atas pada beberapa destinasi supaya rekomendasi sesuai seleramu.'}
                    </small>
                  </>
                ) : (
                  <>
                    <strong>Rekomendasi belum dipersonalisasi</strong>
                    <small>Masuk dan beri rating untuk mendapat rekomendasi sesuai seleramu.</small>
                  </>
                )}
              </div>
              <div className="rc-person-actions">
                {user ? (
                  <Link to="/jelajah" className="rc-ghost"><SlidersHorizontal size={14} /> Tambah Rating</Link>
                ) : (
                  <Link to="/login" state={{ from: '/rekomendasi' }} className="rc-ghost">Masuk</Link>
                )}
                <button className="rc-icon" onClick={load} aria-label="Muat ulang"><RefreshCw size={15} /></button>
              </div>
            </div>

            <div className="rc-tabs">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button key={key} className={`rc-tab ${tab === key ? 'on' : ''}`} onClick={() => setTab(key)}>
                  <Icon size={14} /> {label}
                  {key === 'all' && data && <span className="rc-count">{total}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <main className="rc-main">
        {error && <div className="alert">{error}</div>}
        {!data && !error && <p className="muted-center">Memuat rekomendasi...</p>}

        {data && (
          <>
            {/* ---------- 1. Sesuai preferensi ---------- */}
            {show('pref') && (
              <section className="rc-sec">
                <div className="rc-head">
                  <div>
                    <span className="rc-pill"><Target size={12} /> {data.profile.personalized ? 'Smart Match' : 'Populer'}</span>
                    <h2>{data.profile.personalized ? 'Sesuai Preferensi Wisata Anda' : 'Destinasi Terpopuler untuk Anda'}</h2>
                    <p>
                      {data.profile.personalized
                        ? `Dikurasi dari rating dan ulasan positif Anda, dengan minat pada ${joinList(data.profile.interests)}.`
                        : 'Pilihan destinasi dengan skor tertinggi dari komunitas. Beri rating untuk menyesuaikannya dengan seleramu.'}
                    </p>
                  </div>
                  {data.forYou.similar_category_id && (
                    <Link to={`/jelajah?category=${data.forYou.similar_category_id}`} className="rc-more">
                      Lihat {data.forYou.similar_count} Destinasi Sejenis <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
                <div className="rc-grid three">
                  {data.forYou.items.map((d) => (
                    <PickCard key={d.id} d={d} fav={favs.has(d.id)} onFav={toggleFav} />
                  ))}
                </div>
              </section>
            )}

            {/* ---------- 2. Rating tertinggi ---------- */}
            {show('top') && (
              <section className="rc-sec">
                <div className="rc-head">
                  <div>
                    <span className="rc-pill orange"><Award size={12} /> Kredibilitas Tertinggi Komunitas</span>
                    <h2>Rating Tertinggi Nusantara</h2>
                    <p>Destinasi dengan skor kepuasan traveler tertinggi. Yang belum punya rating diurutkan menurut popularitas.</p>
                  </div>
                  <div className="rc-chips">
                    <button className={`rc-cat ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>Semua Kategori</button>
                    {data.categories.map((c) => (
                      <button key={c.id} className={`rc-cat ${String(cat) === String(c.id) ? 'on' : ''}`} onClick={() => setCat(c.id)}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
                {topList.length === 0 ? (
                  <p className="muted-center">Belum ada destinasi di kategori ini.</p>
                ) : (
                  <div className="rc-grid four">{topList.map((d) => <TopCard key={d.id} d={d} />)}</div>
                )}
              </section>
            )}

            {/* ---------- 3. Sedang ramai ---------- */}
            {show('trend') && (
              <section className="rc-sec">
                <div className="rc-head">
                  <div>
                    <span className="rc-pill orange"><TrendingUp size={12} /> Lonjakan Penelusuran Tertinggi Bulan Ini</span>
                    <h2>Sedang Ramai Diperbincangkan</h2>
                  </div>
                  <span className="rc-live"><i /> Pembaruan Real-Time Komunitas</span>
                </div>
                <div className="rc-grid three">{data.trending.map((d) => <TrendCard key={d.id} d={d} />)}</div>
              </section>
            )}

            {/* ---------- 4. Hidden gems ---------- */}
            {show('gems') && data.hidden.length > 0 && (
              <section className="rc-sec">
                <div className="rc-gems">
                  <div className="rc-head">
                    <div>
                      <span className="rc-pill"><Gem size={12} /> Eksklusif &amp; Asri</span>
                      <h2>Permata Tersembunyi (Hidden Gems)</h2>
                      <p>Eksplorasi destinasi yang jarang diketahui wisatawan massal namun layak dikunjungi. Ketenangan sejati tanpa keramaian.</p>
                    </div>
                  </div>
                  <div className="rc-grid three">{data.hidden.map((d) => <GemCard key={d.id} d={d} />)}</div>
                </div>
              </section>
            )}
          </>
        )}

        {/* ---------- CTA ---------- */}
        <section className="rc-sec">
          <div className="rc-cta">
            <div className="rc-cta-text">
              <span className="hero-pill">Komunitas Traveler Nusantara</span>
              <h2>Punya Rekomendasi Tempat Menakjubkan yang Belum Ada di Daftar?</h2>
              <p>
                Suarakan pengalaman asli Anda. Bantu penjelajah lain menemukan keindahan pelosok negeri
                dengan menulis ulasan objektif pertama Anda.
              </p>
            </div>
            <div className="rc-cta-actions">
              <Link to="/tulis-review" className="btn-orange"><PenSquare size={15} /> Tulis Ulasan Destinasi Baru</Link>
            </div>
          </div>
        </section>
      </main>

      {toast && <div className="dt-toast">{toast}</div>}
      <Footer />
    </div>
  );
}