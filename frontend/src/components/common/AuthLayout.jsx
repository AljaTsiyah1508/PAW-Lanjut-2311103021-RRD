import { ShieldCheck, Globe, Copyright } from 'lucide-react';

export default function AuthLayout({ image, children }) {
  return (
    <div className="auth-split">
      <div className="auth-visual" style={{ backgroundImage: `url(${image}), linear-gradient(160deg, #0f766e, #134e4a)` }} />
      <div className="auth-panel">
        <div className="auth-content">{children}</div>
        <footer className="auth-footer">
          <span><ShieldCheck size={12} /> Enkripsi 256-bit TLS</span>
          <span><Globe size={12} /> Pesona Indonesia Terpadu</span>
          <span><Copyright size={12} /> 2025 Nusantara Review</span>
        </footer>
      </div>
    </div>
  );
}