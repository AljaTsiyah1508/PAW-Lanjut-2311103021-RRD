import { useEffect, useRef, useState } from 'react';
import { X, Save, Eye, EyeOff } from 'lucide-react';
import api from '../../api/axios';
import { errorMessage } from '../../context/toast';

const ROLES = [
  { value: 'wisatawan', label: 'Wisatawan' },
  { value: 'pengelola', label: 'Pengelola Destinasi' },
  { value: 'admin', label: 'Admin' },
];

// Cek ringan di browser; validasi utama tetap di backend
function validate(f, isEdit) {
  if (f.name.trim().length < 2) return 'Nama minimal 2 karakter';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return 'Format email tidak valid';
  if (f.username.trim() && !/^@?[a-z0-9_]{3,30}$/.test(f.username.trim().toLowerCase()))
    return 'Username 3 sampai 30 karakter: huruf kecil, angka, dan garis bawah';
  if (!isEdit && f.password.length < 8) return 'Kata sandi minimal 8 karakter';
  if (isEdit && f.password && f.password.length < 8) return 'Kata sandi baru minimal 8 karakter';
  return '';
}

// user = null → tambah akun (SRS 3.19); selain itu edit akun (SRS 3.20)
export default function UserFormModal({ user, isSelf, onClose, onSaved }) {
  const isEdit = Boolean(user);
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    username: user?.username || '',
    role: user?.role || 'wisatawan',
    password: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const firstRef = useRef(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const msg = validate(form, isEdit);
    if (msg) return setError(msg);
    setError('');
    setSaving(true);
    try {
      const body = { ...form, name: form.name.trim(), email: form.email.trim(), username: form.username.trim() };
      const res = isEdit
        ? await api.put(`/admin/users/${user.id}`, body)
        : await api.post('/admin/users', body);
      onSaved(isEdit ? res.data.message : `Akun ${body.name} ditambahkan`);
    } catch (err) {
      setError(errorMessage(err, 'Gagal menyimpan akun'));
      setSaving(false);
    }
  };

  return (
    <div className="ad-overlay" onClick={() => !saving && onClose()}>
      <form
        className="ad-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-form-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        noValidate
      >
        <button type="button" className="ad-modal-x" onClick={onClose} disabled={saving} aria-label="Tutup">
          <X size={16} />
        </button>
        <h3 id="user-form-title">{isEdit ? 'Edit akun' : 'Tambah akun'}</h3>
        <p className="ad-muted" style={{ margin: 0 }}>
          {isEdit ? `Mengubah data akun ${user.name}.` : 'Akun baru bisa langsung dipakai untuk login.'} Kolom bertanda * wajib diisi.
        </p>

        <div className="ad-form">
          {error && <div className="ad-form-error" role="alert">{error}</div>}

          <div className="ad-field">
            <label htmlFor="uf-name">Nama lengkap <span className="req">*</span></label>
            <input id="uf-name" ref={firstRef} className="ad-input" maxLength={100} value={form.name} onChange={set('name')} />
          </div>
          <div className="ad-field">
            <label htmlFor="uf-email">Email <span className="req">*</span></label>
            <input id="uf-email" type="email" className="ad-input" maxLength={100} value={form.email} onChange={set('email')} autoComplete="off" />
          </div>
          <div className="ad-field">
            <label htmlFor="uf-username">Username</label>
            <input id="uf-username" className="ad-input" maxLength={31} placeholder="opsional" value={form.username} onChange={set('username')} autoComplete="off" />
            <small>Bisa dipakai untuk login dan profil publik.</small>
          </div>
          <div className="ad-field">
            <label htmlFor="uf-role">Role <span className="req">*</span></label>
            <select
              id="uf-role"
              className="ad-select"
              value={form.role}
              onChange={set('role')}
              disabled={isSelf}
              title={isSelf ? 'Kamu tidak bisa mengubah role akunmu sendiri' : undefined}
            >
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {isSelf && <small>Role akunmu sendiri tidak bisa diubah.</small>}
          </div>
          <div className="ad-field full">
            <label htmlFor="uf-password">
              {isEdit ? 'Atur ulang kata sandi' : <>Kata sandi <span className="req">*</span></>}
            </label>
            <div className="ad-cover-row">
              <input
                id="uf-password"
                type={showPw ? 'text' : 'password'}
                className="ad-input"
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
                placeholder={isEdit ? 'Kosongkan bila tidak diubah' : 'Minimal 8 karakter'}
              />
              <button type="button" className="ad-icon-btn" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <small>
              {isEdit
                ? 'Isi hanya bila pengguna lupa kata sandi. Sampaikan kata sandi baru secara langsung kepada pemilik akun.'
                : 'Sampaikan kata sandi ini secara langsung kepada pemilik akun; minta mereka menggantinya di menu Profil.'}
            </small>
          </div>
        </div>

        <div className="ad-modal-actions">
          <button type="button" className="ad-btn soft" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="ad-btn accent" disabled={saving}>
            <Save size={15} /> {saving ? 'Menyimpan...' : isEdit ? 'Simpan perubahan' : 'Tambah akun'}
          </button>
        </div>
      </form>
    </div>
  );
}
