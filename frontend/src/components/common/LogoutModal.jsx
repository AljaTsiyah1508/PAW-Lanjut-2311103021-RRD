import { useEffect, useRef } from 'react';
import { LogOut, Lock, Power, X } from 'lucide-react';
import { imgUrl, initials } from '../../utils/helpers';

// Konfirmasi keluar akun (SRS 3.23) — satu tampilan untuk wisatawan, pengelola, dan admin.
// Gaya: .pf-overlay/.pf-modal di styles/ui.css
export default function LogoutModal({ open, user, onClose, onConfirm, description }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !user) return null;
  const avatar = imgUrl(user.avatar);

  return (
    <div className="pf-overlay" onClick={onClose}>
      <div className="pf-modal" role="dialog" aria-modal="true" aria-labelledby="logout-title" onClick={(e) => e.stopPropagation()}>
        <button className="pf-modal-x" onClick={onClose} aria-label="Tutup"><X size={16} /></button>
        <div className="pf-modal-head">
          <span className="pf-modal-icon"><LogOut size={22} /></span>
          <div>
            <h3 id="logout-title">Konfirmasi Keluar Akun</h3>
            <p>
              {description ||
                'Apakah Anda yakin ingin keluar dari akun NusantaraReview? Anda harus masuk kembali untuk melanjutkan.'}
            </p>
          </div>
        </div>
        <div className="pf-modal-user">
          {avatar ? (
            <img className="pf-modal-avatar" src={avatar} alt="" />
          ) : (
            <span className="pf-modal-avatar">{initials(user.name)}</span>
          )}
          <div>
            <strong>{user.name}</strong>
            <small>{user.email} • Sesi Terakhir Aktif</small>
          </div>
          <Lock size={16} />
        </div>
        <div className="pf-modal-actions">
          <button ref={cancelRef} className="pf-btn soft" onClick={onClose}>Batal / Tetap Masuk</button>
          <button className="pf-btn orange" onClick={onConfirm}><Power size={15} /> Ya, Keluar Akun</button>
        </div>
      </div>
    </div>
  );
}
