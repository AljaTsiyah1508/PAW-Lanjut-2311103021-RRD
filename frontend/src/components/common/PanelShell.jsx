import { useState } from 'react';
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { Compass, Settings, LogOut, Home, CalendarDays } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ToastProvider } from './Toast';
import LogoutModal from './LogoutModal';
import PanelSearch from './PanelSearch';
import { imgUrl, initials } from '../../utils/helpers';
import '../../styles/admin.css';

const today = () =>
  new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

// Kerangka panel bersama admin & pengelola: sidebar (identitas di atas), top bar, konten.
// menu: [{ to, label, icon, end, badge }]
// accountTo: halaman akun di dalam panel (/admin/akun atau /pengelola/akun)
// showSiteLink: tampilkan tautan "Ke Beranda" (admin & pengelola = false, panel murni)
export default function PanelShell({
  portalLabel,
  roleLabel,
  menu,
  homeTo,
  accountTo,
  showSiteLink = true,
  searchSources,
  searchPlaceholder,
  logoutDescription,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmOut, setConfirmOut] = useState(false);

  // SRS 3.23: konfirmasi dulu, lalu tampilkan halaman login
  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <ToastProvider>
      <div className="ad-shell">
        <aside className="ad-side">
          <Link to={homeTo} className="ad-brand">
            <span className="ad-brand-mark"><Compass size={20} /></span>
            <span>
              <strong>NusantaraReview</strong>
              <small>{portalLabel}</small>
            </span>
          </Link>

          <span className="ad-nav-label">Navigasi Utama</span>
          <nav className="ad-menu" aria-label={`Menu ${portalLabel}`}>
            {menu.map(({ to, label, icon: Icon, end, badge }) => (
              <NavLink key={to} to={to} end={end} title={label} aria-label={label} className={({ isActive }) => `ad-menu-link${isActive ? ' active' : ''}`}>
                <Icon size={17} />
                <span>{label}</span>
                {badge > 0 && <b className="ad-menu-badge" aria-label={`${badge} perlu ditinjau`}>{badge > 99 ? '99+' : badge}</b>}
              </NavLink>
            ))}
          </nav>

          {/* Identitas akun yang sedang masuk (bawah sidebar) */}
          <div className="ad-usercard">
            <div className="ad-me">
              {user.avatar ? (
                <img className="ad-avatar" src={imgUrl(user.avatar)} alt="" />
              ) : (
                <span className="ad-avatar">{initials(user.name)}</span>
              )}
              <span className="ad-me-text">
                <strong>{user.name}</strong>
                <small>{roleLabel}</small>
              </span>
              <Link to={accountTo} className="ad-icon-link" title="Pengaturan akun" aria-label="Pengaturan akun">
                <Settings size={16} />
              </Link>
            </div>
            <div className="ad-usercard-foot">
              <button type="button" className="ad-logout" onClick={() => setConfirmOut(true)}>
                <LogOut size={14} /> Keluar Portal
              </button>
              {showSiteLink && <Link to="/" className="ad-home-link"><Home size={13} /> Ke Beranda</Link>}
            </div>
          </div>
        </aside>

        <div className="ad-body">
          <header className="ad-topbar">
            <PanelSearch sources={searchSources} placeholder={searchPlaceholder} />
            <span className="ad-topbar-date"><CalendarDays size={15} /> {today()}</span>
            <Link to={accountTo} className="ad-topbar-avatar" title="Pengaturan akun" aria-label="Pengaturan akun">
              {user.avatar ? <img src={imgUrl(user.avatar)} alt="" /> : initials(user.name)}
            </Link>
          </header>
          <main className="ad-main">
            <Outlet />
          </main>
        </div>

        <LogoutModal
          open={confirmOut}
          user={user}
          onClose={() => setConfirmOut(false)}
          onConfirm={doLogout}
          description={logoutDescription}
        />
      </div>
    </ToastProvider>
  );
}
