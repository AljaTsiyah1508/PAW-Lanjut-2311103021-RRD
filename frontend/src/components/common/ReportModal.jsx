import { useEffect, useRef, useState } from 'react';
import { Flag, Send, X } from 'lucide-react';
import api from '../../api/axios';

const REASONS = [
  { key: 'spam', label: 'Spam / promosi', hint: 'Iklan, tautan mencurigakan, atau ulasan berulang' },
  { key: 'sara', label: 'SARA / ujaran kebencian', hint: 'Menyerang suku, agama, ras, atau golongan' },
  { key: 'kasar', label: 'Kata kasar / tidak pantas', hint: 'Bahasa kasar, pornografi, atau pelecehan' },
  { key: 'palsu', label: 'Ulasan palsu / menyesatkan', hint: 'Tidak sesuai kenyataan atau bukan pengalaman asli' },
  { key: 'lainnya', label: 'Lainnya', hint: 'Jelaskan di catatan' },
];

// Laporkan ulasan ke admin (moderasi SRS 3.18). Dipakai wisatawan & pengelola. Gaya: .pf-modal (ui.css)
export default function ReportModal({ review, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const firstRef = useRef(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sending, onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason) return setError('Pilih alasan laporan.');
    if (reason === 'lainnya' && !note.trim()) return setError('Jelaskan alasan laporan di catatan.');
    setError('');
    setSending(true);
    try {
      const res = await api.post(`/reviews/${review.id}/report`, { reason, note: note.trim() });
      onDone(res.data.message, review.id);
    } catch (err) {
      // 409 = sudah pernah melaporkan → anggap selesai
      if (err.response?.status === 409) return onDone(err.response.data.message, review.id);
      setError(err.response?.data?.message || 'Gagal mengirim laporan.');
      setSending(false);
    }
  };

  return (
    <div className="pf-overlay" onClick={() => !sending && onClose()}>
      <form className="pf-modal" role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <button type="button" className="pf-modal-x" onClick={onClose} disabled={sending} aria-label="Tutup"><X size={16} /></button>
        <div className="pf-modal-head">
          <span className="pf-modal-icon"><Flag size={22} /></span>
          <div>
            <h3 id="report-title">Laporkan ulasan</h3>
            <p>
              Ulasan dari <b>{review.user_name}</b> akan ditinjau admin. Identitas Anda tidak ditampilkan kepada
              penulis ulasan.
            </p>
          </div>
        </div>

        {error && <div className="alert" style={{ marginTop: 16 }}>{error}</div>}

        <fieldset className="pf-radio-list">
          <legend>Alasan laporan</legend>
          {REASONS.map((r, i) => (
            <label key={r.key} className={reason === r.key ? 'on' : ''}>
              <input
                ref={i === 0 ? firstRef : undefined}
                type="radio"
                name="report-reason"
                value={r.key}
                checked={reason === r.key}
                onChange={() => setReason(r.key)}
                disabled={sending}
              />
              <span>
                <strong>{r.label}</strong>
                <small>{r.hint}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="pf-note">
          Catatan untuk admin {reason === 'lainnya' ? '(wajib)' : '(opsional)'}
          <textarea rows={3} maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} disabled={sending} placeholder="Contoh: ulasan berisi tautan judi online" />
          <small>{note.length} / 255</small>
        </label>

        <div className="pf-modal-actions">
          <button type="button" className="pf-btn soft" onClick={onClose} disabled={sending}>Batal</button>
          <button type="submit" className="pf-btn orange" disabled={sending}>
            <Send size={15} /> {sending ? 'Mengirim...' : 'Kirim Laporan'}
          </button>
        </div>
      </form>
    </div>
  );
}
