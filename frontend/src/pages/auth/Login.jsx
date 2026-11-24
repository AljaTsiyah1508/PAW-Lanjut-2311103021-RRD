import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AtSign, Lock, Eye, EyeOff, ArrowRight, Building2, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import AuthLayout from '../../components/common/AuthLayout';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from; // halaman yang tadi dituju sebelum diminta login
  const justRegistered = location.state?.registered; // datang dari halaman registrasi

  const [form, setForm] = useState({ email: location.state?.email || '', password: '' });
  const [remember, setRemember] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(form.email, form.password);
      // SRS 3.2: arahkan ke dashboard sesuai role. Admin selalu ke panel admin.
      const home = { admin: '/admin', pengelola: '/pengelola' }[user.role] || '/';
      const target = user.role === 'admin' ? (from?.startsWith('/admin') ? from : home) : from || home;
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal login');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout image="/images/login.jpg">
      <h1 className="auth-title">Selamat Datang Kembali 👋</h1>
      <p className="auth-sub">
        Masuk ke akun Anda untuk membagikan ulasan dan menjelajahi surga nusantara.
      </p>

      <div className="auth-tabs">
        <Link to="/login" className="tab active">Masuk</Link>
        <Link to="/register" className="tab">Daftar Akun Baru</Link>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        {error && <div className="alert">{error}</div>}
        {justRegistered && !error && (
          <div className="alert success" role="status">Akun berhasil dibuat. Silakan masuk dengan kata sandi Anda.</div>
        )}

        <div className="field">
          <label htmlFor="login-id">Email atau Username</label>
          <div className="input-wrap">
            <AtSign size={18} />
            <input
              id="login-id" type="text" name="email" placeholder="contoh@email.com atau username"
              autoComplete="username" value={form.email} onChange={handleChange} required
            />
          </div>
        </div>

        <div className="field">
          <label>Kata Sandi</label>
          <div className="input-wrap">
            <Lock size={18} />
            <input
              type={showPw ? 'text' : 'password'} name="password" placeholder="Minimal 8 karakter"
              value={form.password} onChange={handleChange} required
            />
            <button type="button" className="icon-btn" onClick={() => setShowPw(!showPw)} aria-label="Tampilkan password">
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="row-between">
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Ingat saya selama 30 hari
          </label>
        </div>

        <button type="submit" className="btn-primary orange" disabled={submitting}>
          {submitting ? 'Memproses...' : <>Masuk Sekarang <ArrowRight size={18} /></>}
        </button>

        <Link to="/register?role=pengelola" className="partner-card">
          <Building2 size={20} />
          <div>
            <strong>Pengelola Destinasi Wisata?</strong>
            <small>Kelola profil resmi &amp; tanggapi traveler</small>
          </div>
          <span className="partner-link">Portal Mitra <ChevronRight size={14} /></span>
        </Link>
      </form>
    </AuthLayout>
  );
}