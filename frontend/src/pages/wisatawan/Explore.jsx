import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, ChevronLeft, ChevronRight, Compass, LayoutGrid, TrendingUp, Users,
  Waves, Mountain, Trees, Landmark, Utensils, Ticket, Church, Star,
} from 'lucide-react';
import api from '../../api/axios';
import Navbar from '../../components/wisatawan/Navbar';
import Footer from '../../components/wisatawan/Footer';
import PlaceCard from '../../components/wisatawan/PlaceCard';
import PartnerBanner from '../../components/wisatawan/PartnerBanner';
import LatestReviews from '../../components/wisatawan/LatestReviews';
import '../../styles/home.css';
import '../../styles/explore.css';

const CATEGORY_ICONS = {
  Pantai: Waves,
  Gunung: Mountain,
  'Wisata Alam': Trees,
  'Wisata Budaya': Landmark,
  'Wisata Kuliner': Utensils,
  'Taman Hiburan': Ticket,
  'Wisata Religi': Church,
};

const QUICK = ['Pantai', 'Gunung', 'Candi', 'Air Terjun', 'Museum', 'Taman Nasional'];

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [data, setData] = useState({ items: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const qParam = params.get('q') || '';
  const category = params.get('category') || '';
  const minRating = params.get('min_rating') || '';
  const sort = params.get('sort') || 'popular';
  const page = Number(params.get('page')) || 1;

  const [q, setQ] = useState(qParam);

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data)).catch(() => {});
    api.get('/home').then((r) => setStats(r.data.stats)).catch(() => {});
  }, []);

  useEffect(() => {
    setQ(qParam);
  }, [qParam]);

  useEffect(() => {
    setLoading(true);
    api
      .get('/destinations', { params: { q: qParam, category, min_rating: minRating, sort, page, limit: 12 } })
      .then((r) => { setData(r.data); setError(''); })
      .catch(() => setError('Gagal memuat destinasi. Pastikan backend berjalan.'))
      .finally(() => setLoading(false));
  }, [qParam, category, minRating, sort, page]);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries({ page: 1, ...changes }).forEach(([k, v]) => {
      if (v) next.set(k, v);
      else next.delete(k);
    });
    setParams(next);
  };

  const goPage = (p) => {
    update({ page: p });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalAll = categories.reduce((n, c) => n + Number(c.total), 0);
  const activeCats = categories.filter((c) => Number(c.total) > 0);
  const fmt = (n) => Number(n || 0).toLocaleString('id-ID');

  return (
    <div className="home">
      <Navbar />

      {/* ---------- HERO: ukuran sama dengan beranda, foto jelajah.jpg ---------- */}
      <section className="landing landing-explore">
        <div className="landing-inner">
          <span className="hero-pill">
            <Compass size={12} /> {fmt(totalAll)} destinasi di seluruh Indonesia
          </span>

          <h1>Jelajah Destinasi</h1>
          <p className="landing-text">
            Temukan pantai, gunung, candi, museum, dan tempat wisata terbaik.
            Baca ulasan jujur dari sesama traveler.
          </p>

          <div className="hero-stats">
            <span><Compass size={14} /> {fmt(activeCats.length)} Kategori</span>
            <span><Star size={14} /> {fmt(stats?.reviews)} Ulasan Terkumpul</span>
            <span><Users size={14} /> {fmt(stats?.contributors)} Kontributor Aktif</span>
          </div>

          <div className="explore-card">
            <form
              className="explore-search"
              onSubmit={(e) => { e.preventDefault(); update({ q: q.trim() }); }}
            >
              <input placeholder="Cari nama atau lokasi..." value={q} onChange={(e) => setQ(e.target.value)} />
              <select value={minRating} onChange={(e) => update({ min_rating: e.target.value })}>
                <option value="">Semua Nilai</option>
                <option value="3">3.0+</option>
                <option value="4">4.0+</option>
                <option value="4.5">4.5+ (Luar Biasa)</option>
              </select>
              <select value={sort} onChange={(e) => update({ sort: e.target.value })}>
                <option value="popular">Terpopuler</option>
                <option value="rating">Rating tertinggi</option>
                <option value="newest">Terbaru</option>
                <option value="name">Nama A-Z</option>
              </select>
              <button type="submit"><Search size={15} /> Cari</button>
            </form>

            <div className="trend-row">
              <span><TrendingUp size={12} /> Pencarian populer:</span>
              {QUICK.map((t) => (
                <button type="button" key={t} className="trend" onClick={() => update({ q: t })}>#{t.replace(/\s/g, '')}</button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <main className="wrap">
        {/* ---------- Kartu kategori ---------- */}
        <section className="section" style={{ marginTop: 8 }}>
          <div className="section-head">
            <div>
              <small className="eyebrow">RAGAM PENGALAMAN</small>
              <h2>Pilih Kategori</h2>
            </div>
          </div>
          <div className="cat-grid">
            <button type="button" className={`cat-item ${!category ? 'on' : ''}`} onClick={() => update({ category: '' })}>
              <span className="cat-icon"><LayoutGrid size={22} /></span>
              <strong>Semua</strong>
              <small>{fmt(totalAll)} Destinasi</small>
            </button>
            {activeCats.map((c) => {
              const Icon = CATEGORY_ICONS[c.name] || Star;
              return (
                <button
                  type="button" key={c.id}
                  className={`cat-item ${String(c.id) === category ? 'on' : ''}`}
                  onClick={() => update({ category: String(c.id) })}
                >
                  <span className="cat-icon"><Icon size={22} /></span>
                  <strong>{c.name}</strong>
                  <small>{c.total} Destinasi</small>
                </button>
              );
            })}
          </div>
        </section>

        {/* ---------- Hasil ---------- */}
        {error && <div className="alert" style={{ marginTop: 16 }}>{error}</div>}

        <p className="result-info">
          {loading ? 'Memuat...' : `${fmt(data.total)} destinasi ditemukan`}
        </p>

        {!loading && data.items.length === 0 && !error && (
          <p className="muted-center">Tidak ada destinasi yang cocok. Coba ubah filter.</p>
        )}

        <div className="place-grid">
          {data.items.map((item) => <PlaceCard key={item.id} item={item} />)}
        </div>

        {data.totalPages > 1 && (
          <div className="pager">
            <button disabled={page <= 1} onClick={() => goPage(page - 1)}>
              <ChevronLeft size={16} /> Sebelumnya
            </button>
            <span>Halaman {data.page} dari {data.totalPages}</span>
            <button disabled={page >= data.totalPages} onClick={() => goPage(page + 1)}>
              Berikutnya <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ---------- Sebelum footer ---------- */}
        <PartnerBanner />
        <LatestReviews />
      </main>

      <Footer />
    </div>
  );
}