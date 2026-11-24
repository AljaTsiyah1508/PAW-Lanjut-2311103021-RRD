import { Link, useLocation } from 'react-router-dom';
import { PenSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { imgUrl, initials } from '../../utils/helpers';
import NotificationBell from './NotificationBell';
import '../../styles/navextra.css';

export default function Navbar() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const writeActive = pathname.includes('/tulis-review');
  const homeActive = pathname === '/';
  const recoActive = pathname.startsWith('/rekomendasi');
  const profileActive = pathname.startsWith('/profil');
  const exploreActive =
    pathname.startsWith('/jelajah') || (pathname.startsWith('/destinasi') && !writeActive);

  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <nav className="site-nav-links">
          <Link to="/" className={`nav-link ${homeActive ? 'active' : ''}`}>Beranda</Link>
          <Link to="/jelajah" className={`nav-link ${exploreActive ? 'active' : ''}`}>Jelajah Destinasi</Link>
          <Link to="/rekomendasi" className={`nav-link ${recoActive ? 'active' : ''}`}>Rekomendasi</Link>
        </nav>

        <div className="site-nav-right">
          <Link to="/tulis-review" className={`nav-write ${writeActive ? 'active' : ''}`}>
            <PenSquare size={15} /> Tulis Review
          </Link>

          {user ? (
            <>
              <NotificationBell />

              {/* Klik langsung membuka halaman profil */}
              <Link to="/profil" className={`nav-user-btn ${profileActive ? 'active' : ''}`}>
                {user.avatar ? (
                  <img className="avatar" src={imgUrl(user.avatar)} alt="" />
                ) : (
                  <span className="avatar">{initials(user.name)}</span>
                )}
                <span className="nav-user-name">{user.name}</span>
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link">Masuk</Link>
              <Link to="/register" className="nav-cta">Daftar</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}