import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ThumbsUp, Bookmark, Sparkles, CheckCheck, MessageSquareReply } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { timeAgo } from '../../utils/helpers';
import '../../styles/notif.css';

const TYPES = {
  helpful: { icon: ThumbsUp, cls: 'green' },
  wishlist_review: { icon: Bookmark, cls: 'blue' },
  welcome: { icon: Sparkles, cls: 'orange' },
  review_reply: { icon: MessageSquareReply, cls: 'green' },
};

const POLL_MS = 60000;

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const boxRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    api
      .get('/notifications')
      .then((r) => {
        setItems(r.data.items);
        setUnread(r.data.unread);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Ambil saat masuk, lalu cek ulang tiap 60 detik dan saat tab kembali aktif
  useEffect(() => {
    if (!user) return undefined;
    load();
    const timer = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tutup panel: klik di luar atau tekan Esc
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) load();
    setOpen((v) => !v);
  };

  const openItem = (n) => {
    if (!n.is_read) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnread((c) => Math.max(0, c - 1));
      api.put(`/notifications/${n.id}/read`).catch(() => {});
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const readAll = () => {
    setItems((list) => list.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
    api.put('/notifications/read-all').catch(() => {});
  };

  return (
    <div className="nb" ref={boxRef}>
      <button
        className="nav-bell"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        aria-expanded={open}
      >
        <Bell size={18} />
        {unread > 0 && <span className="nb-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="nb-panel" role="dialog" aria-label="Notifikasi">
          <div className="nb-head">
            <strong>
              Notifikasi {unread > 0 && <span className="nb-chip">{unread} baru</span>}
            </strong>
            {unread > 0 && (
              <button className="nb-readall" onClick={readAll}>
                <CheckCheck size={14} /> Tandai semua dibaca
              </button>
            )}
          </div>

          <div className="nb-list">
            {!loaded ? (
              <p className="nb-empty">Memuat...</p>
            ) : items.length === 0 ? (
              <p className="nb-empty">Belum ada notifikasi.</p>
            ) : (
              items.map((n) => {
                const t = TYPES[n.type] || TYPES.welcome;
                const Icon = t.icon;
                return (
                  <button
                    key={n.id}
                    className={`nb-item ${n.is_read ? '' : 'unread'}`}
                    onClick={() => openItem(n)}
                  >
                    <span className={`nb-icon ${t.cls}`}><Icon size={16} /></span>
                    <span className="nb-text">
                      <span>{n.message}</span>
                      <small>{timeAgo(n.created_at)}</small>
                    </span>
                    {!n.is_read && <i className="nb-dot" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}