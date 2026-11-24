import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  MapPin, CalendarDays, MessageSquare, ThumbsUp, Check, Waves, Mountain, Camera, Leaf,
  Utensils, Home as HomeIcon, Image as ImageIcon,
} from 'lucide-react';
import api from '../../api/axios';
import Navbar from '../../components/wisatawan/Navbar';
import Footer from '../../components/wisatawan/Footer';
import ProfileReviews from '../../components/wisatawan/ProfileReviews';
import { imgUrl, initials, monthYear } from '../../utils/helpers';
import '../../styles/home.css';
import '../../styles/profile.css';

const INTEREST_ICONS = {
  'Wisata Bahari & Snorkeling': Waves,
  'Gunung & Kawah Api': Mountain,
  'Fotografi Lanskap': Camera,
  'Ekowisata Konservasi': Leaf,
  'Kuliner Otentik Nusantara': Utensils,
  'Desa Wisata & Budaya': HomeIcon,
};

export default function PublicProfile() {
  const { username } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
    setData(null);
    setError('');
    api
      .get(`/users/${username}`)
      .then((r) => setData(r.data))
      .catch((e) =>
        setError(e.response?.status === 404 ? 'Profil tidak ditemukan.' : 'Gagal memuat profil.')
      );
  }, [username]);

  if (error) {
    return (
      <div className="home">
        <Navbar />
        <main className="pf pf-pad">
          <div className="alert">{error}</div>
          <p><Link to="/" className="dt-link">← Kembali ke beranda</Link></p>
        </main>
      </div>
    );
  }
  if (!data) return <div className="home"><Navbar /><p className="muted-center">Memuat...</p></div>;

  const { profile, stats, reviews } = data;
  const cover = imgUrl(profile.cover);
  const avatar = imgUrl(profile.avatar);

  return (
    <div className="home">
      <Navbar />

      <div className="pf-cover" style={cover ? { backgroundImage: `url("${cover}")` } : undefined} />

      <main className="pf">
        <section className="pf-card">
          <div className="pf-avatar-wrap">
            {avatar ? (
              <img className="pf-avatar" src={avatar} alt="" />
            ) : (
              <span className="pf-avatar">{initials(profile.name)}</span>
            )}
          </div>
          <div className="pf-id">
            <h1>{profile.name}</h1>
            <div className="pf-meta">
              <span className="pf-user">@{profile.username}</span>
              {profile.city && <span><MapPin size={13} /> {profile.city}</span>}
              <span><CalendarDays size={13} /> Bergabung {monthYear(profile.created_at)}</span>
            </div>
            {profile.bio && <p className="pf-bio">{profile.bio}</p>}
            {profile.interests.length > 0 && (
              <div className="pf-chips static">
                {profile.interests.map((name) => {
                  const Icon = INTEREST_ICONS[name] || Check;
                  return <span key={name} className="pf-chip on"><Icon size={14} /> {name}</span>;
                })}
              </div>
            )}
          </div>
        </section>

        <div className="pf-stats">
          <div className="pf-stat">
            <span className="pf-stat-icon"><MessageSquare size={22} /></span>
            <div><b>{stats.reviews}</b><small>Ulasan Ditulis</small></div>
          </div>
          <div className="pf-stat">
            <span className="pf-stat-icon"><ImageIcon size={22} /></span>
            <div><b>{stats.photos}</b><small>Foto Terunggah</small></div>
          </div>
          <div className="pf-stat">
            <span className="pf-stat-icon warm"><ThumbsUp size={22} /></span>
            <div><b>{stats.helped}</b><small>Traveler Terbantu</small></div>
          </div>
        </div>

        <section className="pf-panel">
          <div className="pf-panel-head">
            <div>
              <h2>Ulasan oleh {profile.name}</h2>
              <p>Pengalaman yang dibagikan di NusantaraReview.</p>
            </div>
          </div>
          <ProfileReviews items={reviews} emptyText="Belum ada ulasan." />
        </section>
      </main>

      <Footer />
    </div>
  );
}