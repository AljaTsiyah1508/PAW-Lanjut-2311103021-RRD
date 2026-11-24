import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, MapPin, PenSquare, Star, TrendingUp, Bookmark, Plus, Compass, Users,
  Waves, Mountain, Trees, Landmark, Utensils, Ticket, Church,
} from 'lucide-react';
import api from '../../api/axios';
import Navbar from '../../components/wisatawan/Navbar';
import Footer from '../../components/wisatawan/Footer';
import { imgUrl, partnerLink } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
import '../../styles/home.css';
import '../../styles/choose.css';

const CATEGORY_ICONS = {
  Pantai: Waves,
  Gunung: Mountain,
  'Wisata Alam': Trees,
  'Wisata Budaya': Landmark,
  'Wisata Kuliner': Utensils,
  'Taman Hiburan': Ticket,
  'Wisata Religi': Church,
};

const fmt = (n) => Number(n || 0).toLocaleString('id-ID');

/* Kartu destinasi: bintang cepat + tombol Tulis Ulasan */
function PickCard({ d, badge }) {
  const navigate = useNavigate();
  const [hover, setHover] = useState(0);
  const cover = imgUrl(d.cover_image);
  const shown = hover || d.my_rating || 0;

  const go = (rating) =>
    navigate(`/destinasi/${d.id}/tulis-review${rating ? `?rating=${rating}` : ''}`);

  return (
    <article className="wh-card">
      <div className="wh-photo" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
        <span className="wh-tag">{d.category}</span>
        {badge && (
          <span className={`wh-badge ${badge.kind}`}>
            {badge.kind === 'wish' && <Bookmark size={11} />} {badge.text}
          </span>
        )}
      </div>

      <div className="wh-body">
        <h3>{d.name}</h3>
        <small className="wh-loc"><MapPin size={12} /> {d.location}</small>

        <div className="wh-rate">
          <span className="wh-rate-label">Beri skor pengalaman Anda:</span>
          <div className="wh-rate-row">
            <span className="wh-stars" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i} type="button" aria-label={`${i} bintang`}
                  onMouseEnter={() => setHover(i)} onClick={() => go(i)}
                >
                  <Star size={22} fill={i <= shown ? 'currentColor' : 'none'} />
                </button>
              ))}
            </span>
            <button type="button" className="wh-write" onClick={() => go()}>Tulis Ulasan</button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function ChooseDestination() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [suggest, setSuggest] = useState(null);
  const [cats, setCats] = useState([]);
  const [stats, setStats] = useState(null);
  const [popular, setPopular] = useState([]);
  const [results, setResults] = useState({ items: [], total: 0 });
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const term = q.trim();

  useEffect(() => {
    window.scrollTo(0, 0);
    api.get('/review-suggestions').then((r) => setSuggest(r.data.items)).catch(() => setSuggest([]));
    api.get('/categories').then((r) => setCats(r.data)).catch(() => {});
    api.get('/home').then((r) => setStats(r.data.stats)).catch(() => {});
    api
      .get('/destinations', { params: { sort: 'popular', limit: 5 } })
      .then((r) => setPopular(r.data.items.map((i) => i.name)))
      .catch(() => {});
  }, []);

  // Cari otomatis setelah berhenti mengetik (300 ms)
  useEffect(() => {
    if (!term) {
      setResults({ items: [], total: 0 });
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .get('/destinations', { params: { q: term, sort: 'popular', limit: 12 } })
        .then((r) => {
          if (cancelled) return;
          setResults({ items: r.data.items, total: r.data.total });
          setError('');
        })
        .catch(() => !cancelled && setError('Gagal mencari destinasi. Pastikan backend berjalan.'))
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  const submit = (e) => {
    e.preventDefault();
    if (term) document.getElementById('wh-results')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Pengelola ke portal mitra, admin ke Kelola Destinasi, selain itu ke pendaftaran mitra
  const claimTo = partnerLink(user);
  const activeCats = cats.filter((c) => Number(c.total) > 0);

  return (
    <div className="home">
      <Navbar />

      {/* ---------- HERO: identik dengan beranda / jelajah / rekomendasi ---------- */}
      <section className="landing landing-write">
        <div className="landing-inner">
          <span className="hero-pill"><Compass size={12} /> Kontribusi Komunitas</span>

          <h1>Destinasi Mana yang Ingin Anda Ulas Hari Ini?</h1>
          <p className="landing-text">
            Ulasan jujur, rating objektif, dan foto autentik Anda membantu jutaan penjelajah
            nusantara merencanakan petualangan terbaik dengan aman dan bertanggung jawab.
          </p>

          <div className="hero-stats">
            <span><Compass size={14} /> {fmt(activeCats.length)} Kategori</span>
            <span><Star size={14} /> {fmt(stats?.reviews)} Ulasan Terkumpul</span>
            <span><Users size={14} /> {fmt(stats?.contributors)} Kontributor Aktif</span>
          </div>

          <div className="wh-panel">
            <form className="wh-search" onSubmit={submit}>
              <input
                placeholder="Cari nama pantai, candi, pulau, gunung, atau kota..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button type="submit"><Search size={15} /> Cari Destinasi</button>
            </form>

            {popular.length > 0 && (
              <div className="trend-row">
                <span><TrendingUp size={12} /> Populer dicari:</span>
                {popular.map((name) => (
                  <button type="button" key={name} className="trend" onClick={() => setQ(name)}>{name}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <main className="wh-main">
        {error && <div className="alert">{error}</div>}

        {/* ---------- Hasil pencarian ---------- */}
        {term ? (
          <section className="wh-sec" id="wh-results">
            <h2>Hasil pencarian</h2>
            <p className="wh-sub">
              {searching ? 'Mencari...' : `${fmt(results.total)} destinasi cocok dengan “${term}”`}
            </p>
            {!searching && results.items.length === 0 && !error && (
              <p className="muted-center">Destinasi tidak ditemukan. Coba kata kunci lain.</p>
            )}
            <div className="wh-grid">
              {results.items.map((d) => <PickCard key={d.id} d={d} />)}
            </div>
          </section>
        ) : (
          <section className="wh-sec">
            <h2><PenSquare size={20} /> Pernah Berkunjung ke Sini? Beri Rating Cepat</h2>
            <p className="wh-sub">Berdasarkan wishlist Anda dan destinasi populer yang belum Anda ulas.</p>
            {suggest === null ? (
              <p className="muted-center">Memuat...</p>
            ) : suggest.length === 0 ? (
              <p className="muted-center">Belum ada saran. Cari destinasi di atas untuk mulai menulis.</p>
            ) : (
              <div className="wh-grid two">
                {suggest.map((d) => (
                  <PickCard
                    key={d.id}
                    d={d}
                    badge={
                      d.source === 'wishlist'
                        ? { kind: 'wish', text: 'Di Wishlist Anda' }
                        : { kind: 'pop', text: 'Populer' }
                    }
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ---------- Kategori ---------- */}
        {activeCats.length > 0 && (
          <section className="wh-sec">
            <h2>Telusuri Berdasarkan Kategori Wisata</h2>
            <p className="wh-sub">Pilih kelompok objek wisata untuk menemukan tempat yang pernah Anda singgahi.</p>
            <div className="wh-cats">
              {activeCats.map((c) => {
                const Icon = CATEGORY_ICONS[c.name] || Star;
                return (
                  <Link key={c.id} to={`/jelajah?category=${c.id}`} className="wh-cat">
                    <span className="wh-cat-icon"><Icon size={22} /></span>
                    <strong>{c.name}</strong>
                    <small>{fmt(c.total)} Destinasi</small>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ---------- Banner ---------- */}
        <section className="wh-sec">
          <div className="wh-banner">
            <span className="wh-banner-icon"><MapPin size={22} /></span>
            <div className="wh-banner-text">
              <h3>Destinasi yang Anda Kunjungi Belum Terdaftar?</h3>
              <p>
                Bantu sesama penjelajah dengan mendaftarkan air terjun, pantai rahasia, atau objek wisata
                baru ke sistem kurasi NusantaraReview.
              </p>
            </div>
            <Link to={claimTo} className="wh-banner-btn"><Plus size={15} /> Daftarkan Destinasi Baru</Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}