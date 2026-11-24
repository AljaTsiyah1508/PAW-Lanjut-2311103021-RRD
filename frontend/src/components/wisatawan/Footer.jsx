import { Camera, Globe, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <p>Platform ulasan dan kurasi destinasi terpercaya nusantara. Menyuarakan cerita autentik penjelajah dari Sabang hingga Merauke.</p>
          <div className="footer-icons">
            <span><Camera size={14} /></span>
            <span><Globe size={14} /></span>
            <span><Mail size={14} /></span>
          </div>
        </div>
        <div>
          <h4>Destinasi Populer</h4>
          <a>Labuan Bajo &amp; Pulau Komodo</a>
          <a>Ubud &amp; Kintamani, Bali</a>
          <a>Raja Ampat, Papua Barat</a>
          <a>Tana Toraja, Sulawesi Selatan</a>
          <a>Taman Nasional Bromo Tengger</a>
        </div>
        <div>
          <h4>Pengelola Destinasi</h4>
          <a>Klaim Halaman Wisata</a>
          <a>Pedoman Ulasan Mitra</a>
          <a>Promosikan Daya Tarik Wisata</a>
          <a>Lencana Verifikasi Resmi</a>
          <a>Statistik Pengunjung</a>
        </div>
        <div>
          <h4>Bantuan &amp; Komunitas</h4>
          <a>Pusat Bantuan Penjelajah</a>
          <a>Pedoman Komunitas</a>
          <a>Kebijakan Keamanan &amp; Privasi</a>
          <a>Laporkan Ulasan Palsu</a>
          <a>Hubungi Tim Ekspedisi</a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2025 Nusantara Review. Data destinasi: Wikipedia (CC BY-SA).</span>
        <span className="footer-legal"><a>Syarat &amp; Ketentuan</a><a>Kebijakan Privasi</a><a>Peta Situs</a></span>
      </div>
    </footer>
  );
}