// Perkiraan harga tiket & jam buka untuk destinasi yang datanya belum diisi.
// Dihitung saat ditampilkan (TIDAK disimpan ke database), selalu diberi label "Perkiraan".
// Begitu pengelola/admin mengisi data resmi, perkiraan otomatis tidak dipakai lagi.
// Angka mengikuti kisaran umum tempat sejenis di Indonesia (data resmi yang ada: museum
// rata-rata Rp5.000, Borobudur Rp30.000, dsb.).
import { rupiah } from './helpers';

// [jenis (highlights)], harga {full, short}, jam buka
const RULES = [
  [['Masjid', 'Gereja', 'Klenteng / Kuil'], { full: 'Gratis (donasi sukarela)', short: 'Gratis' }, 'Setiap hari, menyesuaikan jam ibadah'],
  [['Museum'], { full: 'Rp5.000–Rp20.000', short: 'Rp5rb–20rb' }, 'Sel–Min 08.00–15.00 (Senin tutup)'],
  [['Istana / Keraton'], { full: 'Rp10.000–Rp25.000', short: 'Rp10rb–25rb' }, 'Setiap hari 08.00–14.00'],
  [['Candi / Pura', 'Candi / Vihara', 'Situs arkeologi', 'Benteng'], { full: 'Rp5.000–Rp50.000', short: 'Rp5rb–50rb' }, 'Setiap hari 07.00–17.00'],
  [['Pantai'], { full: 'Rp5.000–Rp15.000 (retribusi & parkir)', short: 'Rp5rb–15rb' }, 'Buka 24 jam (lebih aman siang hari)'],
  [['Pulau'], { full: 'Biaya kapal/penyeberangan bervariasi', short: 'Biaya kapal' }, 'Mengikuti jadwal kapal penyeberangan'],
  [['Gunung', 'Gunung berapi', 'Bukit'], { full: 'Rp10.000–Rp50.000 (tiket pendakian)', short: 'Rp10rb–50rb' }, 'Pendakian dibuka pagi; cek status gunung'],
  [['Danau', 'Air terjun', 'Gua', 'Pemandian air panas'], { full: 'Rp5.000–Rp25.000', short: 'Rp5rb–25rb' }, 'Setiap hari 07.00–17.00'],
  [['Taman nasional'], { full: 'Tiket kawasan konservasi mulai ±Rp5.000', short: 'Mulai Rp5rb' }, 'Setiap hari 08.00–16.00'],
  [['Kebun binatang', 'Taman hiburan'], { full: 'Rp25.000–Rp100.000', short: 'Rp25rb–100rb' }, 'Setiap hari 08.00–17.00'],
];

// Cadangan per kategori bila jenisnya tidak dikenal
const BY_CATEGORY = {
  Pantai: 'Pantai',
  Gunung: 'Gunung',
  'Wisata Alam': 'Danau',
  'Wisata Budaya': 'Candi / Pura',
  'Wisata Religi': 'Masjid',
  'Taman Hiburan': 'Taman hiburan',
};

function ruleFor(d) {
  const find = (type) => RULES.find(([types]) => types.includes(type));
  return find(d.highlights) || find(BY_CATEGORY[d.category]) || null;
}

// { text, estimate } untuk harga; short = versi ringkas untuk kartu
export function priceInfo(d, { short = false } = {}) {
  if (d.price !== null && d.price !== undefined) return { text: rupiah(d.price), estimate: false };
  const r = ruleFor(d);
  if (!r) return { text: 'Belum ada info', estimate: false };
  return { text: short ? r[1].short : r[1].full, estimate: true };
}

// { text, estimate } untuk jam buka
export function hoursInfo(d) {
  if (d.open_hours) return { text: d.open_hours, estimate: false };
  const r = ruleFor(d);
  if (!r) return { text: 'Belum ada info', estimate: false };
  return { text: r[2], estimate: true };
}

// Teks ringkas untuk chip kartu: kisaran perkiraan diberi tanda "±"
export function priceChip(d) {
  const p = priceInfo(d, { short: true });
  return p.estimate && p.text.startsWith('Rp') ? `±${p.text}` : p.text;
}
