import { Link } from 'react-router-dom';
import { Building2, ShieldPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { partnerLink } from '../../utils/helpers';

export default function PartnerBanner() {
  const { user } = useAuth();
  // Pengelola ke portal mitra, admin ke Kelola Destinasi, selain itu ke pendaftaran mitra
  const claimTo = partnerLink(user);

  return (
    <section className="pb">
      <div className="pb-text">
        <span className="pb-eyebrow">
          <Building2 size={13} /> KOLABORASI PENGELOLA OBJEK WISATA
        </span>
        <h2>Destinasi Anda Belum Terdaftar di NusantaraReview?</h2>
        <p>
          Daftarkan tempat wisata atau cagar budaya Anda untuk mengelola informasinya sendiri,
          memantau rating, dan menanggapi ulasan wisatawan secara resmi.
        </p>
      </div>

      <div className="pb-actions">
        <Link to={claimTo} className="pb-btn">
          <ShieldPlus size={16} /> Klaim / Daftarkan Destinasi
        </Link>
      </div>
    </section>
  );
}