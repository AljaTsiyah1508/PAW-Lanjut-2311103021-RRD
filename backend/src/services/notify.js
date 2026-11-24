const db = require("../config/db");

const cut = (s) => String(s).slice(0, 255);

// Satu notifikasi untuk satu user. ref_key + user_id unik, jadi kejadian yang sama tidak terkirim dua kali.
exports.notify = async (userId, type, message, link, refKey) => {
  try {
    await db.query(
      "INSERT IGNORE INTO notifications (user_id, type, message, link, ref_key) VALUES (?, ?, ?, ?, ?)",
      [userId, type, cut(message), link || null, refKey],
    );
  } catch (err) {
    console.error("NOTIFY ERROR:", err.message); // gagal notifikasi tidak boleh menggagalkan aksi utama
  }
};

// Ulasan baru: kirim ke semua user yang menyimpan destinasi itu (kecuali penulisnya)
exports.notifyWishlist = async (
  destinationId,
  authorId,
  message,
  link,
  refKey,
) => {
  try {
    await db.query(
      `INSERT IGNORE INTO notifications (user_id, type, message, link, ref_key)
       SELECT f.user_id, 'wishlist_review', ?, ?, ?
       FROM favorites f
       WHERE f.destination_id = ? AND f.user_id <> ?`,
      [cut(message), link || null, refKey, destinationId, authorId],
    );
  } catch (err) {
    console.error("NOTIFY WISHLIST ERROR:", err.message);
  }
};
