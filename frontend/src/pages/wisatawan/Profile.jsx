import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Camera, MapPin, CalendarDays, Share2, LogOut, MessageSquare, ThumbsUp, Bookmark,
  ShieldCheck, Trash2, Lock, Save, Check, AtSign, User, Phone, Mail, Waves, Mountain,
  Leaf, Utensils, Home as HomeIcon, Image as ImageIcon,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/wisatawan/Navbar';
import Footer from '../../components/wisatawan/Footer';
import ProfileReviews from '../../components/wisatawan/ProfileReviews';
import LogoutModal from '../../components/common/LogoutModal';
import { imgUrl, initials, monthYear } from '../../utils/helpers';
import '../../styles/home.css';
import '../../styles/detail.css';
import '../../styles/profile.css';

const OK_IMG = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const EMPTY_FORM = { name: '', username: '', bio: '', phone: '', city: '', interests: [] };
const EMPTY_PW = { current_password: '', new_password: '', confirm: '' };

const INTEREST_ICONS = {
  'Wisata Bahari & Snorkeling': Waves,
  'Gunung & Kawah Api': Mountain,
  'Fotografi Lanskap': Camera,
  'Ekowisata Konservasi': Leaf,
  'Kuliner Otentik Nusantara': Utensils,
  'Desa Wisata & Budaya': HomeIcon,
};

const fmt = (n) => Number(n || 0).toLocaleString('id-ID');

export default function Profile() {
  const { logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ reviews: 0, photos: 0, helped: 0, wishlist: 0 });
  const [options, setOptions] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [reviews, setReviews] = useState(null);
  const [wishlist, setWishlist] = useState(null);
  const [pw, setPw] = useState(EMPTY_PW);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [pwError, setPwError] = useState('');
  const [emailForm, setEmailForm] = useState({ email: '', current_password: '' });
  const [emailError, setEmailError] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [toast, setToast] = useState('');

  const avatarRef = useRef(null);
  const coverRef = useRef(null);

  const TABS = [
    { key: 'biodata', label: 'Edit Biodata & Akun', icon: User },
    { key: 'ulasan', label: `Riwayat Ulasan Saya (${stats.reviews})`, icon: MessageSquare },
    { key: 'wishlist', label: `Koleksi & Wishlist (${stats.wishlist})`, icon: Bookmark },
    { key: 'keamanan', label: 'Keamanan', icon: ShieldCheck },
  ];
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'biodata';

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2400);
  };

  const fillForm = (p) =>
    setForm({
      name: p.name || '',
      username: p.username || '',
      bio: p.bio || '',
      phone: p.phone || '',
      city: p.city || '',
      interests: p.interests || [],
    });

  useEffect(() => {
    window.scrollTo(0, 0);
    api
      .get('/profile')
      .then((r) => {
        setProfile(r.data.profile);
        setStats(r.data.stats);
        setOptions(r.data.interestOptions);
        fillForm(r.data.profile);
      })
      .catch(() => setError('Gagal memuat profil. Pastikan backend berjalan.'));
  }, []);

  // Muat riwayat ulasan / wishlist saat tab dibuka
  useEffect(() => {
    if (tab === 'ulasan' && reviews === null) {
      api.get('/profile/reviews').then((r) => setReviews(r.data.items)).catch(() => setReviews([]));
    }
    if (tab === 'wishlist' && wishlist === null) {
      api.get('/profile/wishlist').then((r) => setWishlist(r.data.items)).catch(() => setWishlist([]));
    }
  }, [tab, reviews, wishlist]);

  const setTab = (key) => setParams({ tab: key }, { replace: true });

  /* ---------- Simpan biodata ---------- */
  const toggleInterest = (name) =>
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(name) ? f.interests.filter((i) => i !== name) : [...f.interests, name],
    }));

  const save = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const { data } = await api.put('/profile', form);
      setProfile(data.profile);
      fillForm(data.profile);
      refresh();
      showToast('Perubahan disimpan');
    } catch (err) {
      setFormError(err.response?.data?.message || 'Gagal menyimpan perubahan');
    } finally {
      setSaving(false);
    }
  };

  /* ---------- Unggah foto profil / sampul ---------- */
  const upload = async (kind, file) => {
    if (!file) return;
    const maxMB = kind === 'avatar' ? 4 : 6;
    if (!OK_IMG.includes(file.type)) return showToast('Gunakan file JPG, PNG, WEBP, atau GIF');
    if (file.size > maxMB * 1024 * 1024) return showToast(`Ukuran maksimal ${maxMB} MB`);

    const fd = new FormData();
    fd.append(kind, file);
    try {
      const { data } = await api.post(`/profile/${kind}`, fd);
      setProfile((p) => ({ ...p, [kind]: data[kind] }));
      if (kind === 'avatar') refresh();
      showToast(kind === 'avatar' ? 'Foto profil diperbarui' : 'Foto sampul diperbarui');
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal mengunggah gambar');
    }
  };

  const removeAvatar = async () => {
    if (!profile.avatar || !window.confirm('Hapus foto profil?')) return;
    try {
      await api.delete('/profile/avatar');
      setProfile((p) => ({ ...p, avatar: null }));
      refresh();
      showToast('Foto profil dihapus');
    } catch {
      showToast('Gagal menghapus foto');
    }
  };

  /* ---------- Bagikan profil ---------- */
  const share = async () => {
    if (!profile.username) {
      setTab('biodata');
      return showToast('Isi username dulu supaya profil bisa dibagikan');
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pengguna/${profile.username}`);
      showToast('Tautan profil disalin');
    } catch {
      showToast('Gagal menyalin tautan');
    }
  };

  /* ---------- Wishlist ---------- */
  const removeWish = async (id) => {
    try {
      await api.post(`/destinations/${id}/favorite`);
      setWishlist((list) => list.filter((d) => d.id !== id));
      setStats((s) => ({ ...s, wishlist: Math.max(0, s.wishlist - 1) }));
    } catch {
      showToast('Gagal menghapus dari wishlist');
    }
  };

  /* ---------- Ganti email (SRS 3.22) ---------- */
  const changeEmail = async (e) => {
    e.preventDefault();
    setEmailError('');
    const email = emailForm.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setEmailError('Format email tidak valid');
    setEmailSaving(true);
    try {
      const { data } = await api.put('/profile/email', { email, current_password: emailForm.current_password });
      setProfile((p) => ({ ...p, email: data.email }));
      setEmailForm({ email: '', current_password: '' });
      refresh();
      showToast('Email diperbarui');
    } catch (err) {
      setEmailError(err.response?.data?.message || 'Gagal mengganti email');
    } finally {
      setEmailSaving(false);
    }
  };

  /* ---------- Ganti kata sandi ---------- */
  const changePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (pw.new_password.length < 8) return setPwError('Kata sandi baru minimal 8 karakter');
    if (pw.new_password !== pw.confirm) return setPwError('Konfirmasi kata sandi tidak sama');
    try {
      await api.put('/profile/password', {
        current_password: pw.current_password,
        new_password: pw.new_password,
      });
      setPw(EMPTY_PW);
      showToast('Kata sandi diperbarui');
    } catch (err) {
      setPwError(err.response?.data?.message || 'Gagal mengganti kata sandi');
    }
  };

  // SRS 3.23: setelah logout tampilkan halaman login
  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  if (!profile) {
    return (
      <div className="home">
        <Navbar />
        <main className="pf pf-pad">
          {error ? <div className="alert">{error}</div> : <p className="muted-center">Memuat...</p>}
        </main>
      </div>
    );
  }

  const cover = imgUrl(profile.cover);
  const avatar = imgUrl(profile.avatar);
  const bioLen = form.bio.length;

  return (
    <div className="home">
      <Navbar />

      {/* ---------- Sampul selebar layar ---------- */}
      <div className="pf-cover" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
        <div className="pf-cover-inner">
          <button className="pf-cover-btn" onClick={() => coverRef.current?.click()}>
            <Camera size={14} /> Ganti Foto Sampul
          </button>
        </div>
      </div>

      <main className="pf">
        <input
          ref={coverRef} type="file" hidden accept={OK_IMG.join(',')}
          onChange={(e) => { upload('cover', e.target.files[0]); e.target.value = ''; }}
        />
        <input
          ref={avatarRef} type="file" hidden accept={OK_IMG.join(',')}
          onChange={(e) => { upload('avatar', e.target.files[0]); e.target.value = ''; }}
        />

        {/* ---------- Kartu identitas ---------- */}
        <section className="pf-card">
          <div className="pf-avatar-wrap">
            {avatar ? (
              <img className="pf-avatar" src={avatar} alt="" />
            ) : (
              <span className="pf-avatar">{initials(profile.name)}</span>
            )}
            <button
              className="pf-avatar-btn" onClick={() => avatarRef.current?.click()}
              aria-label="Ganti foto profil" title="Ganti foto profil (JPG, PNG, WebP, maks. 4 MB)"
            >
              <Camera size={16} />
            </button>
            {profile.avatar && (
              <button
                className="pf-avatar-btn del" onClick={removeAvatar}
                aria-label="Hapus foto profil" title="Hapus foto profil"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="pf-id">
            <h1>{profile.name}</h1>
            <div className="pf-meta">
              {profile.username && <span className="pf-user">@{profile.username}</span>}
              {profile.city && <span><MapPin size={13} /> {profile.city}</span>}
              <span><CalendarDays size={13} /> Bergabung {monthYear(profile.created_at)}</span>
            </div>
            {profile.bio && <p className="pf-bio">{profile.bio}</p>}
          </div>

          <div className="pf-actions">
            <button className="pf-btn soft" onClick={share}><Share2 size={15} /> Bagikan Profil</button>
            <button className="pf-btn danger" onClick={() => setConfirmOut(true)}><LogOut size={15} /> Keluar Akun</button>
          </div>
        </section>

        {/* ---------- Statistik ---------- */}
        <div className="pf-stats">
          <div className="pf-stat">
            <span className="pf-stat-icon"><MessageSquare size={22} /></span>
            <div><b>{fmt(stats.reviews)}</b><small>Ulasan Ditulis</small></div>
          </div>
          <div className="pf-stat">
            <span className="pf-stat-icon"><ImageIcon size={22} /></span>
            <div><b>{fmt(stats.photos)}</b><small>Foto Terunggah</small></div>
          </div>
          <div className="pf-stat">
            <span className="pf-stat-icon warm"><ThumbsUp size={22} /></span>
            <div><b>{fmt(stats.helped)}</b><small>Traveler Terbantu</small></div>
          </div>
        </div>

        {/* ---------- Tab ---------- */}
        <div className="pf-tabs">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} className={`pf-tab ${tab === key ? 'on' : ''}`} onClick={() => setTab(key)}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {/* ================= TAB: BIODATA ================= */}
        {tab === 'biodata' && (
          <form className="pf-panel" onSubmit={save}>
            <div className="pf-panel-head">
              <div>
                <h2>Informasi Pribadi &amp; Profil Publik</h2>
                <p>Lengkapi data agar sesama penjelajah nusantara dapat lebih mengenal sudut pandang Anda.</p>
              </div>
            </div>

            {formError && <div className="alert">{formError}</div>}

            <div className="pf-grid2">
              <div className="pf-field">
                <label>Nama Lengkap</label>
                <div className="pf-input">
                  <User size={16} />
                  <input
                    value={form.name} maxLength={100} required
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
              </div>
              <div className="pf-field">
                <label>Username Publik</label>
                <div className="pf-input">
                  <AtSign size={16} />
                  <input
                    value={form.username} maxLength={30} placeholder="contoh: baguspratama"
                    onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                  />
                </div>
              </div>
            </div>

            <div className="pf-field">
              <div className="pf-label-row">
                <label>Bio Singkat Penjelajah</label>
                <small>{bioLen} / 300 Karakter</small>
              </div>
              <div className="pf-input area">
                <textarea
                  rows={3} maxLength={300} value={form.bio}
                  placeholder="Ceritakan gaya berwisatamu secara singkat..."
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                />
              </div>
            </div>

            <div className="pf-grid2">
              <div className="pf-field">
                <div className="pf-label-row">
                  <label>Alamat Surel</label>
                  <button type="button" className="link-sm" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }} onClick={() => setTab('keamanan')}>
                    Ubah di tab Keamanan
                  </button>
                </div>
                <div className="pf-input locked">
                  <Mail size={16} />
                  <input value={profile.email} readOnly />
                </div>
              </div>
              <div className="pf-field">
                <label>Nomor WhatsApp / Ponsel</label>
                <div className="pf-input">
                  <Phone size={16} />
                  <input
                    value={form.phone} placeholder="+62 812-3456-7890" maxLength={20}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="pf-field">
              <label>Kota Domisili Utama</label>
              <div className="pf-input">
                <MapPin size={16} />
                <input
                  value={form.city} maxLength={100} placeholder="Contoh: Purwokerto, Jawa Tengah"
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
            </div>

            <div className="pf-field">
              <label>Minat &amp; Gaya Berwisata Favorit</label>
              <small className="pf-hint">Pilih topik yang Anda kuasai untuk ditampilkan di profil.</small>
              <div className="pf-chips">
                {options.map((name) => {
                  const Icon = INTEREST_ICONS[name] || Check;
                  const on = form.interests.includes(name);
                  return (
                    <button
                      type="button" key={name}
                      className={`pf-chip ${on ? 'on' : ''}`}
                      onClick={() => toggleInterest(name)}
                    >
                      <Icon size={14} /> {name} {on && <Check size={13} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pf-form-actions">
              <button type="button" className="pf-btn soft" onClick={() => { fillForm(profile); setFormError(''); }}>
                Batalkan
              </button>
              <button type="submit" className="pf-btn orange" disabled={saving}>
                <Save size={15} /> {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        )}

        {/* ================= TAB: ULASAN ================= */}
        {tab === 'ulasan' && (
          <section className="pf-panel">
            <div className="pf-panel-head">
              <div>
                <h2>Riwayat Ulasan Saya</h2>
                <p>Semua ulasan yang pernah Anda tulis. Klik “Ubah” untuk memperbarui.</p>
              </div>
            </div>
            {reviews === null ? (
              <p className="muted-center">Memuat...</p>
            ) : (
              <ProfileReviews
                items={reviews}
                editable
                emptyText="Anda belum menulis ulasan. Mulai dari menu Tulis Review."
              />
            )}
          </section>
        )}

        {/* ================= TAB: WISHLIST ================= */}
        {tab === 'wishlist' && (
          <section className="pf-panel">
            <div className="pf-panel-head">
              <div>
                <h2>Koleksi &amp; Wishlist</h2>
                <p>Destinasi yang Anda simpan dari halaman detail.</p>
              </div>
            </div>
            {wishlist === null ? (
              <p className="muted-center">Memuat...</p>
            ) : wishlist.length === 0 ? (
              <p className="muted-center">
                Wishlist masih kosong. Klik “Simpan” di halaman detail destinasi untuk menambahkannya.
              </p>
            ) : (
              <div className="pf-wish">
                {wishlist.map((d) => {
                  const c = imgUrl(d.cover_image);
                  return (
                    <article key={d.id} className="pf-wish-card">
                      <Link
                        to={`/destinasi/${d.id}`} className="pf-wish-photo"
                        style={c ? { backgroundImage: `url("${c}")` } : undefined}
                      >
                        <span className="wh-tag">{d.category}</span>
                      </Link>
                      <div className="pf-wish-body">
                        <Link to={`/destinasi/${d.id}`}><h3>{d.name}</h3></Link>
                        <small><MapPin size={12} /> {d.location}</small>
                        <div className="pf-wish-actions">
                          <Link to={`/destinasi/${d.id}/tulis-review`} className="pf-btn green sm">Tulis Ulasan</Link>
                          <button className="pf-btn soft sm" onClick={() => removeWish(d.id)}>Hapus</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ================= TAB: KEAMANAN ================= */}
        {tab === 'keamanan' && (
          <>
          <form className="pf-panel" onSubmit={changeEmail} style={{ marginBottom: 20 }}>
            <div className="pf-panel-head">
              <div>
                <h2>Ganti Email</h2>
                <p>Email dipakai untuk masuk. Email sekarang: <b>{profile.email}</b></p>
              </div>
            </div>

            {emailError && <div className="alert">{emailError}</div>}

            <div className="pf-field narrow">
              <label htmlFor="new-email">Email baru</label>
              <div className="pf-input">
                <Mail size={16} />
                <input
                  id="new-email" type="email" required maxLength={100} autoComplete="email"
                  value={emailForm.email} placeholder="nama@email.com"
                  onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })}
                />
              </div>
            </div>
            <div className="pf-field narrow">
              <label htmlFor="email-pw">Kata sandi saat ini</label>
              <div className="pf-input">
                <Lock size={16} />
                <input
                  id="email-pw" type="password" required autoComplete="current-password"
                  value={emailForm.current_password}
                  onChange={(e) => setEmailForm({ ...emailForm, current_password: e.target.value })}
                />
              </div>
              <small className="pf-hint">Untuk memastikan perubahan dilakukan oleh pemilik akun.</small>
            </div>

            <div className="pf-form-actions left">
              <button type="submit" className="pf-btn orange" disabled={emailSaving}>
                <Save size={15} /> {emailSaving ? 'Menyimpan...' : 'Perbarui Email'}
              </button>
            </div>
          </form>

          <form className="pf-panel" onSubmit={changePassword}>
            <div className="pf-panel-head">
              <div>
                <h2>Ganti Kata Sandi</h2>
                <p>Gunakan kata sandi minimal 8 karakter yang tidak dipakai di akun lain.</p>
              </div>
            </div>

            {pwError && <div className="alert">{pwError}</div>}

            <div className="pf-field narrow">
              <label>Kata sandi saat ini</label>
              <div className="pf-input">
                <Lock size={16} />
                <input
                  type="password" required value={pw.current_password} autoComplete="current-password"
                  onChange={(e) => setPw({ ...pw, current_password: e.target.value })}
                />
              </div>
            </div>
            <div className="pf-field narrow">
              <label>Kata sandi baru</label>
              <div className="pf-input">
                <Lock size={16} />
                <input
                  type="password" required minLength={8} value={pw.new_password} autoComplete="new-password"
                  onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
                />
              </div>
            </div>
            <div className="pf-field narrow">
              <label>Ulangi kata sandi baru</label>
              <div className="pf-input">
                <Lock size={16} />
                <input
                  type="password" required value={pw.confirm} autoComplete="new-password"
                  onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                />
              </div>
            </div>

            <div className="pf-form-actions left">
              <button type="submit" className="pf-btn orange"><Save size={15} /> Perbarui Kata Sandi</button>
            </div>
          </form>
          </>
        )}
      </main>

      {/* ---------- Popup konfirmasi keluar ---------- */}
      <LogoutModal
        open={confirmOut}
        user={profile}
        onClose={() => setConfirmOut(false)}
        onConfirm={doLogout}
        description="Apakah Anda yakin ingin keluar dari akun NusantaraReview? Anda harus masuk kembali untuk menulis ulasan baru atau mengakses rekomendasi terpersonalisasi."
      />

      {toast && <div className="dt-toast">{toast}</div>}
      <Footer />
    </div>
  );
}