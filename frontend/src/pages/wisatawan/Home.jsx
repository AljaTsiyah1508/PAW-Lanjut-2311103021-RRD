import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MapPin, Search, Star, Users, Compass, TrendingUp, Sparkles, ArrowRight, PenSquare,
  Waves, Mountain, Trees, Landmark, Utensils, Ticket, Church, ChevronRight,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/wisatawan/Navbar';
import Footer from '../../components/wisatawan/Footer';
import DestinationCard from '../../components/wisatawan/DestinationCard';
import ReviewCard from '../../components/wisatawan/ReviewCard';
import '../../styles/home.css';

const CATEGORY_ICONS = {
  Pantai: Waves,
  Gunung: Mountain,
  'Wisata Alam': Trees,
  'Wisata Budaya': Landmark,
  'Wisata Kuliner': Utensils,
  'Taman Hiburan': Ticket,
  'Wisata Religi': Church,
};

const TRENDS = ['NusaPenida', 'BromoSunrise', 'DanauKelimutu', 'TanaToraja', 'BandaNeira', 'DerawanIsland'];

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [home, setHome] = useState(null);
  const [recs, setRecs] = useState({ personalized: false, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState({ q: '', category: '', min_rating: '' });

  useEffect(() => {
    Promise.all([api.get('/home'), api.get('/recommendations')])
      .then(([h, r]) => {
        setHome(h.data);
        setRecs(r.data);
        setError('');
      })
      .catch(() => setError('Gagal memuat data. Pastikan backend sudah berjalan.'))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (search.q) params.set('q', search.q);
    if (search.category) params.set('category', search.category);
    if (search.min_rating) params.set('min_rating', search.min_rating);
    navigate(`/jelajah?${params.toString()}`);
  };

  const handleHelpful = async (reviewId) => {
    if (!user) return navigate('/login');
    try {
      const { data } = await api.post(`/reviews/${reviewId}/helpful`);
      setHome((h) => ({
        ...h,
        latestReviews: h.latestReviews.map((r) =>
          r.id === reviewId ? { ...r, liked: data.liked, helpful_count: data.total } : r
        ),
      }));
    } catch {
      /* abaikan */
    }
  };

  const fmt = (n) => Number(n || 0).toLocaleString('id-ID');

  return (
    <div className="home">
      <Navbar />

      {/* ---------- HERO + PENCARIAN (satu layar) ---------- */}
      <section className="landing">
        <div className="landing-inner">
          <span className="hero-pill">
            <Compass size={12} /> Eksplorasi Resmi Nusantara • {fmt(home?.stats.destinations)} Destinasi
          </span>

          <h1>Temukan &amp; Ulas Keindahan Tersembunyi di Indonesia</h1>
          <p className="landing-text">
            Jelajahi ribuan destinasi dengan rekomendasi jujur, panduan tiket akurat,
            dan rating terverifikasi dari sesama traveler.
          </p>

          <div className="hero-stats">
            <span><Compass size={14} /> {fmt(home?.categories.length)} Kategori</span>
            <span><Star size={14} /> {fmt(home?.stats.reviews)} Ulasan Terkumpul</span>
            <span><Users size={14} /> {fmt(home?.stats.contributors)} Kontributor Aktif</span>
          </div>

          <form className="landing-search" onSubmit={handleSearch}>
            <div className="search-grid">
              <div className="search-field">
                <label><MapPin size={12} /> Mau ke mana?</label>
                <input
                  placeholder="Labuan Bajo, Flores"
                  value={search.q}
                  onChange={(e) => setSearch({ ...search, q: e.target.value })}
                />
              </div>
              <div className="search-field">
                <label>Kategori Wisata</label>
                <select value={search.category} onChange={(e) => setSearch({ ...search, category: e.target.value })}>
                  <option value="">Semua Kategori</option>
                  {home?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="search-field">
                <label><Star size={12} /> Nilai Minimal</label>
                <select value={search.min_rating} onChange={(e) => setSearch({ ...search, min_rating: e.target.value })}>
                  <option value="">Semua Nilai</option>
                  <option value="3.5">3.5+</option>
                  <option value="4">4.0+</option>
                  <option value="4.5">4.5+ (Luar Biasa)</option>
                </select>
              </div>
              <button type="submit" className="btn-search">Cari Destinasi <Search size={15} /></button>
            </div>
            <div className="trend-row">
              <span><TrendingUp size={12} /> Tren Pencarian:</span>
              {TRENDS.map((t) => (
                <button type="button" key={t} className="trend" onClick={() => setSearch({ ...search, q: t })}>#{t}</button>
              ))}
            </div>
          </form>
        </div>
      </section>

      <main className="home-main">
        {error && <div className="alert" style={{ marginTop: 24 }}>{error}</div>}
        {loading && <p className="muted-center">Memuat...</p>}

        {/* ---------- KATEGORI ---------- */}
        {home && (
          <section className="section">
            <div className="section-head">
              <div>
                <small className="eyebrow">RAGAM PENGALAMAN</small>
                <h2>Kategori Destinasi Favorit</h2>
              </div>
              <Link to="/jelajah" className="see-all">Lihat Semua ({home.categories.length}) <ArrowRight size={14} /></Link>
            </div>
            <div className="cat-grid">
              {home.categories.slice(0, 6).map((c) => {
                const Icon = CATEGORY_ICONS[c.name] || Star;
                return (
                  <Link key={c.id} to={`/jelajah?category=${c.id}`} className="cat-item">
                    <span className="cat-icon"><Icon size={22} /></span>
                    <strong>{c.name}</strong>
                    <small>{c.total} Destinasi</small>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ---------- REKOMENDASI ---------- */}
        {home && (
          <section className="section">
            <div className="reco-banner">
              <span className="hero-pill"><Sparkles size={12} /> Rekomendasi Pintar</span>
              <h2>{user ? `Untuk Anda, ${user.name}` : 'Destinasi Terpopuler'}</h2>
              <p>
                {recs.personalized
                  ? 'Dikurasi berdasarkan rating dan ulasan yang pernah Anda berikan.'
                  : user
                    ? 'Beri rating pada beberapa destinasi supaya rekomendasi makin sesuai selera Anda.'
                    : 'Destinasi dengan rating terbaik dari komunitas. Masuk untuk mendapat rekomendasi yang dipersonalisasi.'}
              </p>
            </div>

            {recs.items.length === 0 ? (
              <p className="muted-center">Belum ada destinasi untuk direkomendasikan.</p>
            ) : (
              <div className="dest-grid">
                {recs.items.map((item) => <DestinationCard key={item.id} item={item} />)}
              </div>
            )}
          </section>
        )}

        {/* ---------- CTA ---------- */}
        <section className="section">
          <div className="cta-banner">
            <h2>Punya Pengalaman Seru di Destinasi Wisata Terakhir Anda?</h2>
            <p>Bantu sesama wisatawan dengan menuliskan ulasan objektif, membagikan foto asli lokasi, dan memberi panduan tips biaya riil.</p>
            <div className="cta-actions">
              <Link to="/tulis-review" className="btn-orange"><PenSquare size={15} /> Tulis Review Sekarang</Link>
            </div>
          </div>
        </section>

        {/* ---------- ULASAN TERBARU ---------- */}
        {home && (
          <section className="section latest">
            <div className="section-head">
              <div>
                <small className="eyebrow">AKTIVITAS TERKINI</small>
                <h2>Ulasan Terbaru</h2>
              </div>
              <span className="live"><i /> Real-time update</span>
            </div>

            {home.latestReviews.length === 0 ? (
              <p className="muted-center">Belum ada ulasan. Jadilah yang pertama menulis!</p>
            ) : (
              <div className="review-grid">
                {home.latestReviews.map((r) => (
                  <ReviewCard key={r.id} review={r} onHelpful={handleHelpful} />
                ))}
              </div>
            )}

            <div className="center">
              <Link to="/jelajah" className="btn-soft">Jelajahi Semua Destinasi <ChevronRight size={14} /></Link>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}