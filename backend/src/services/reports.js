// Laporan ulasan (tabel review_reports, lihat backend/sql/reports.sql).
// Toleran: bila tabel belum dibuat, fitur laporan dianggap nonaktif dan
// query lain tidak ikut gagal. Status dicek ulang tiap 60 detik sampai aktif.
const db = require("../config/db");

const REASONS = {
  spam: "Spam / promosi",
  sara: "SARA / ujaran kebencian",
  kasar: "Kata kasar / tidak pantas",
  palsu: "Ulasan palsu / menyesatkan",
  lainnya: "Lainnya",
};

let enabled = false;
let checkedAt = 0;

async function isEnabled() {
  if (enabled) return true;
  if (Date.now() - checkedAt < 60 * 1000) return false;
  checkedAt = Date.now();
  try {
    const [rows] = await db.query(
      `SELECT 1 FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'review_reports'`,
    );
    enabled = rows.length > 0;
  } catch {
    enabled = false;
  }
  return enabled;
}

// Jumlah laporan terbuka (0 bila fitur nonaktif)
async function openCount() {
  if (!(await isEnabled())) return 0;
  const [[r]] = await db.query(
    "SELECT COUNT(DISTINCT review_id) AS n FROM review_reports WHERE status = 'open'",
  );
  return Number(r.n);
}

// Ringkasan laporan terbuka per ulasan: { [review_id]: { count, reasons: [...], notes: [...] } }
async function openByReview(reviewIds) {
  const out = {};
  if (!reviewIds.length || !(await isEnabled())) return out;
  const [rows] = await db.query(
    `SELECT review_id, reason, note FROM review_reports
     WHERE status = 'open' AND review_id IN (?) ORDER BY created_at DESC`,
    [reviewIds],
  );
  rows.forEach((r) => {
    const o = (out[r.review_id] ||= { count: 0, reasons: {}, notes: [] });
    o.count += 1;
    o.reasons[r.reason] = (o.reasons[r.reason] || 0) + 1;
    if (r.note && o.notes.length < 3) o.notes.push(r.note);
  });
  Object.values(out).forEach((o) => {
    o.reasons = Object.entries(o.reasons)
      .sort((a, b) => b[1] - a[1])
      .map(([key, n]) => ({ key, label: REASONS[key] || key, count: n }));
  });
  return out;
}

module.exports = { REASONS, isEnabled, openCount, openByReview };
