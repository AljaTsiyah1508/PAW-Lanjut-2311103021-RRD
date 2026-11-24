import { useEffect, useState } from 'react';
import { Save, UserCog } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useToast, errorMessage } from '../../context/toast';
import { PageHead } from '../../components/common/PanelUI';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// SRS 3.22 untuk peran panel (admin & pengelola): kelola akun sendiri di dalam panel,
// karena kedua peran ini tidak memakai situs publik. desc: teks keterangan di kepala halaman.
export default function AccountSettings({ desc }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [info, setInfo] = useState({ name: '', username: '' });
  const [infoErr, setInfoErr] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);

  const [mail, setMail] = useState({ email: '', current_password: '' });
  const [mailErr, setMailErr] = useState('');
  const [savingMail, setSavingMail] = useState(false);

  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwErr, setPwErr] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    api
      .get('/profile')
      .then((r) => {
        setProfile(r.data.profile);
        setInfo({ name: r.data.profile.name || '', username: r.data.profile.username || '' });
      })
      .catch((err) => setLoadError(errorMessage(err, 'Gagal memuat akun')));
  }, []);

  const saveInfo = async (e) => {
    e.preventDefault();
    setInfoErr('');
    if (info.name.trim().length < 2) return setInfoErr('Nama minimal 2 karakter');
    setSavingInfo(true);
    try {
      // PUT /profile mengganti semua kolom biodata, jadi kolom lain dikirim ulang apa adanya
      const { data } = await api.put('/profile', {
        name: info.name,
        username: info.username,
        bio: profile.bio || '',
        city: profile.city || '',
        phone: profile.phone || '',
        interests: profile.interests || [],
      });
      setProfile(data.profile);
      refresh();
      toast.success('Data akun diperbarui');
    } catch (err) {
      setInfoErr(errorMessage(err, 'Gagal menyimpan'));
    } finally {
      setSavingInfo(false);
    }
  };

  const saveMail = async (e) => {
    e.preventDefault();
    setMailErr('');
    if (!EMAIL_RE.test(mail.email.trim())) return setMailErr('Format email tidak valid');
    setSavingMail(true);
    try {
      const { data } = await api.put('/profile/email', { email: mail.email.trim(), current_password: mail.current_password });
      setProfile((p) => ({ ...p, email: data.email }));
      setMail({ email: '', current_password: '' });
      refresh();
      toast.success('Email diperbarui');
    } catch (err) {
      setMailErr(errorMessage(err, 'Gagal mengganti email'));
    } finally {
      setSavingMail(false);
    }
  };

  const savePw = async (e) => {
    e.preventDefault();
    setPwErr('');
    if (pw.new_password.length < 8) return setPwErr('Kata sandi baru minimal 8 karakter');
    if (pw.new_password !== pw.confirm) return setPwErr('Konfirmasi kata sandi tidak sama');
    setSavingPw(true);
    try {
      await api.put('/profile/password', { current_password: pw.current_password, new_password: pw.new_password });
      setPw({ current_password: '', new_password: '', confirm: '' });
      toast.success('Kata sandi diperbarui');
    } catch (err) {
      setPwErr(errorMessage(err, 'Gagal mengganti kata sandi'));
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Pengaturan akun"
        icon={UserCog}
        title="Akun Saya"
        desc={desc}
      />

      {loadError ? (
        <div className="ad-state error" role="alert"><strong>Akun tidak bisa dimuat</strong><p>{loadError}</p></div>
      ) : !profile ? (
        <div className="ad-card ad-skel" style={{ height: 260 }} />
      ) : (
        <div className="ad-account">
          <form className="ad-card" onSubmit={saveInfo} noValidate>
            <div className="ad-card-head"><h3>Data akun</h3></div>
            <div className="ad-form">
              {infoErr && <div className="ad-form-error" role="alert">{infoErr}</div>}
              <div className="ad-field full">
                <label htmlFor="acc-name">Nama lengkap</label>
                <input id="acc-name" className="ad-input" maxLength={100} value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} />
              </div>
              <div className="ad-field full">
                <label htmlFor="acc-username">Username</label>
                <input id="acc-username" className="ad-input" maxLength={31} placeholder="opsional, bisa dipakai untuk login" value={info.username} onChange={(e) => setInfo({ ...info, username: e.target.value })} />
              </div>
            </div>
            <div className="ad-modal-actions">
              <button type="submit" className="ad-btn accent" disabled={savingInfo}><Save size={15} /> {savingInfo ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
            </div>
          </form>

          <form className="ad-card" onSubmit={saveMail} noValidate>
            <div className="ad-card-head"><h3>Ganti email</h3></div>
            <p className="ad-muted" style={{ margin: 0 }}>Email sekarang: <b>{profile.email}</b></p>
            <div className="ad-form">
              {mailErr && <div className="ad-form-error" role="alert">{mailErr}</div>}
              <div className="ad-field full">
                <label htmlFor="acc-email">Email baru</label>
                <input id="acc-email" type="email" className="ad-input" maxLength={100} autoComplete="email" value={mail.email} onChange={(e) => setMail({ ...mail, email: e.target.value })} />
              </div>
              <div className="ad-field full">
                <label htmlFor="acc-email-pw">Kata sandi saat ini</label>
                <input id="acc-email-pw" type="password" className="ad-input" autoComplete="current-password" value={mail.current_password} onChange={(e) => setMail({ ...mail, current_password: e.target.value })} />
              </div>
            </div>
            <div className="ad-modal-actions">
              <button type="submit" className="ad-btn accent" disabled={savingMail}><Save size={15} /> {savingMail ? 'Menyimpan...' : 'Perbarui Email'}</button>
            </div>
          </form>

          <form className="ad-card" onSubmit={savePw} noValidate>
            <div className="ad-card-head"><h3>Ganti kata sandi</h3></div>
            <div className="ad-form">
              {pwErr && <div className="ad-form-error" role="alert">{pwErr}</div>}
              <div className="ad-field full">
                <label htmlFor="acc-pw-old">Kata sandi saat ini</label>
                <input id="acc-pw-old" type="password" className="ad-input" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
              </div>
              <div className="ad-field">
                <label htmlFor="acc-pw-new">Kata sandi baru</label>
                <input id="acc-pw-new" type="password" className="ad-input" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
              </div>
              <div className="ad-field">
                <label htmlFor="acc-pw-confirm">Ulangi kata sandi baru</label>
                <input id="acc-pw-confirm" type="password" className="ad-input" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
              </div>
            </div>
            <div className="ad-modal-actions">
              <button type="submit" className="ad-btn accent" disabled={savingPw}><Save size={15} /> {savingPw ? 'Menyimpan...' : 'Perbarui Kata Sandi'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
