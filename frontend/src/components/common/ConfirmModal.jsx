import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// Modal konfirmasi untuk aksi destruktif.
// children: isi tambahan (mis. kotak centang) di antara pesan dan tombol.
// tone: 'danger' (hapus) atau 'primary' (perubahan penting yang bukan penghapusan)
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Hapus',
  tone = 'danger',
  busy = false,
  onConfirm,
  onClose,
  children,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="ad-overlay" onClick={() => !busy && onClose()}>
      <div
        className="ad-modal sm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="ad-modal-x" onClick={onClose} disabled={busy} aria-label="Tutup">
          <X size={16} />
        </button>
        <div className="ad-confirm-head">
          <span className={`ad-confirm-icon ${tone}`}><AlertTriangle size={20} /></span>
          <div>
            <h3 id="confirm-title">{title}</h3>
            <div id="confirm-message" className="ad-confirm-msg">{message}</div>
          </div>
        </div>
        {children}
        <div className="ad-modal-actions">
          <button ref={cancelRef} type="button" className="ad-btn soft" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="button" className={`ad-btn ${tone}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
