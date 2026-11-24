// Tanggapan resmi pengelola (tabel review_replies, lihat backend/sql/replies.sql).
// Toleran: bila tabel belum dibuat, fitur tanggapan dianggap nonaktif dan
// query lain tidak ikut gagal. Status dicek ulang tiap 60 detik sampai aktif.
const db = require("../config/db");

let enabled = false;
let checkedAt = 0;

async function isEnabled() {
  if (enabled) return true;
  if (Date.now() - checkedAt < 60 * 1000) return false;
  checkedAt = Date.now();
  try {
    const [rows] = await db.query(
      `SELECT 1 FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'review_replies'`,
    );
    enabled = rows.length > 0;
  } catch {
    enabled = false;
  }
  return enabled;
}

// Tanggapan per ulasan: { [review_id]: { content, created_at, updated_at } }
async function byReview(reviewIds) {
  const out = {};
  if (!reviewIds.length || !(await isEnabled())) return out;
  const [rows] = await db.query(
    "SELECT review_id, content, created_at, updated_at FROM review_replies WHERE review_id IN (?)",
    [reviewIds],
  );
  rows.forEach((r) => {
    out[r.review_id] = { content: r.content, created_at: r.created_at, updated_at: r.updated_at };
  });
  return out;
}

module.exports = { isEnabled, byReview };
