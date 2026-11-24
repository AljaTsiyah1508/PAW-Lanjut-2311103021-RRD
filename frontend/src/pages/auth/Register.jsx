import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { User, Mail, Phone, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import AuthLayout from '../../components/common/AuthLayout';

const LEVELS = [
  { label: 'Terlalu pendek', cls: 'weak' },
  { label: 'Lemah', cls: 'weak' },
  { label: 'Cukup', cls: 'mid' },
  { label: 'Baik', cls: 'good' },
  { label: 'Kuat (Sesuai Standar Keamanan)', cls: 'strong' },
];

function getStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return pw.length < 8 ? Math.min(score, 1) : score;
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const role = params.get('role') === 'pengelola' ? 'pengelola' : 'wisatawan';

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [agree, setAgree] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const strength = useMemo(() => getStrength(form.password), [form.password]);
  const level = LEVELS[strength];

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handlePhone = (e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password.length < 8) return setError('Kata sandi minimal 8 karakter');
    if (form.password !== form.confirm) return setError('Konfirmasi kata sandi tidak sama');
    if (!agree) return setError('Anda harus menyetujui Syarat & Ketentuan');

    setSubmitting(true);
    try {
      const phone = form.phone ? '+62' + form.phone.replace(/^0+/, '') : null;
      await register({ name: form.name, email: form.email, password: form.password, phone, role });
      navigate('/login', { replace: true, state: { registered: true, email: form.email } });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal registrasi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout image="/images/register.jpg">
      <h1 className="auth-title">
        {role === 'pengelola' ? 'Daftar Mitra Pengelola 🏝️' : 'Mulai Petualangan 🚀'}
      </h1>
      <p className="auth-sub">
        {role === 'pengelola'
          ? 'Buat akun pengelola untuk mengelola profil destinasi dan menanggapi ulasan traveler.'
          : 'Buat akun gratis dan bergabung dengan komunitas penjelajah nusantara terbesar di Indonesia.'}
      </p>

      <form onSubmit={handleSubmit} className="auth-form">
        {error && <div className="alert">{error}</div>}

        <div className="field">
          <div className="label-row"><label>Nama Lengkap</label><small>Sesuai KTP / Paspor</small></div>
          <div className="input-wrap">
            <User size={18} />
            <input name="name" placeholder="e.g. Bagus Pratama" value={form.name} onChange={handleChange} required />
          </div>
        </div>

        <div className="field">
          <label>Alamat Email Aktif</label>
          <div className="input-wrap">
            <Mail size={18} />
            <input type="email" name="email" placeholder="nama@domain.com" value={form.email} onChange={handleChange} required />
          </div>
        </div>

        <div className="field">
          <label>Nomor WhatsApp / Ponsel</label>
          <div className="input-wrap">
            <Phone size={18} />
            <span className="prefix">+62</span>
            <input inputMode="numeric" placeholder="812 3456 7890" value={form.phone} onChange={handlePhone} />
          </div>
        </div>

        <div className="field">
          <label>Kata Sandi</label>
          <div className="input-wrap">
            <Lock size={18} />
            <input
              type={showPw ? 'text' : 'password'} name="password" placeholder="Minimal 8 karakter unik"
              value={form.password} onChange={handleChange} required
            />
            <button type="button" className="icon-btn" onClick={() => setShowPw(!showPw)} aria-label="Tampilkan password">
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className="strength">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={i <= strength ? `bar on ${level.cls}` : 'bar'} />
            ))}
          </div>
          <div className="row-between">
            <small className={`strength-label ${level.cls}`}>{form.password ? level.label : ''}</small>
            <small className="muted">Gunakan simbol &amp; angka</small>
          </div>
        </div>

        <div className="field">
          <label>Konfirmasi Kata Sandi</label>
          <div className="input-wrap">
            <ShieldCheck size={18} />
            <input
              type={showPw ? 'text' : 'password'} name="confirm" placeholder="Ulangi kata sandi Anda"
              value={form.confirm} onChange={handleChange} required
            />
          </div>
        </div>

        <label className="check terms">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            Saya menyetujui <a href="#" onClick={(e) => e.preventDefault()}>Syarat &amp; Ketentuan</a> serta{' '}
            <a href="#" onClick={(e) => e.preventDefault()}>Kebijakan Privasi</a> Nusantara Review.
          </span>
        </label>

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Memproses...' : 'Buat Akun'}
        </button>

        <p className="hint">
          Sudah punya akun? <Link to="/login" className="strong-link">Masuk di sini</Link>
        </p>
      </form>
    </AuthLayout>
  );
}